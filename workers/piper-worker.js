/* lamplight — fast natural voices (Piper, en_US-libritts_r-medium) off the main thread.
   A module worker, made only once the reader picks the engine or presses download. It imports the ONNX runtime
   and the espeak-ng phonemizer from vendor/piper/ (the runtime's .mjs/.wasm pair from vendor/kokoro/, shared with
   the Kokoro worker; all from this origin, never a CDN), fetches the voice (one 78 MB model, 904 speakers) and
   its config from huggingface.co into Cache Storage "piper-voices" — looked at first, so it works offline once
   downloaded — and speaks one piece of text at a time, in the order asked. Same messages as kokoro-worker.js:
   In:  { type: "load" }
          → { type: "progress", status, file, loaded, total, progress }… then { type: "ready", voices: [], speakers, threads, isolated }
        { type: "generate", id, text, voice (a speaker id, "0"…"903"), speed? }
          → { type: "audio", id, sampleRate, samples (Float32Array, transferred), ms } or { type: "error", id, message }
        { type: "cancel" }
          → everything queued is dropped, and so is the result of the piece being made (it cannot be cut short) */
import * as ort from "../vendor/piper/ort.min.mjs";
import { phonemize } from "../vendor/piper/phonemizer.js";

const BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts_r/medium/";
const MODEL = "en_US-libritts_r-medium.onnx", CONFIG = MODEL + ".json";
const CACHE = "piper-voices";
const THREADS = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
const SENTENCE_GAP = 0.2;     /* seconds of silence between two sentences of one piece, as Piper puts them */

/* the runtime's .mjs/.wasm from this origin (the pair vendor/kokoro/ already holds) */
ort.env.wasm.wasmPaths = new URL("../vendor/kokoro/", import.meta.url).href;
ort.env.wasm.numThreads = THREADS;

let loading = null, session = null, cfg = null, queue = [], busy = false, gen = 0;

function message(err) { return (err && err.message) || String(err); }
function progress(file, status, loaded, total) {
  self.postMessage({ type: "progress", status, file, loaded, total, progress: total ? loaded * 100 / total : 0 });
}

/* a file from Cache Storage, else from huggingface.co: streamed into the cache with its progress, then read back */
async function file(name) {
  const url = BASE + name;
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (_) { /* no Cache Storage: fetched each time */ }
  const hit = cache ? await cache.match(url).catch(() => null) : null;
  if (hit) {
    const buf = await hit.arrayBuffer();
    progress(name, "done", buf.byteLength, buf.byteLength);
    return buf;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("couldn’t download " + name + " (" + res.status + ")");
  const total = +res.headers.get("content-length") || 0, reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) {
    const buf = await res.arrayBuffer();
    progress(name, "done", buf.byteLength, buf.byteLength);
    if (cache) await cache.put(url, new Response(buf.slice(0), { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(buf.byteLength) } })).catch(() => {});
    return buf;
  }
  let loaded = 0, last = 0;
  progress(name, "progress", 0, total);
  const stream = new ReadableStream({
    async pull(ctl) {
      const { done, value } = await reader.read();
      if (done) { ctl.close(); return; }
      loaded += value.byteLength;
      if (Date.now() - last > 200) { last = Date.now(); progress(name, "progress", loaded, total); }
      ctl.enqueue(value);
    },
    cancel(why) { return reader.cancel(why); }
  });
  const headers = { "Content-Type": "application/octet-stream" };
  if (total) headers["Content-Length"] = String(total);
  let buf;
  if (cache) {
    /* a download cut short errors the stream, so nothing half-made is kept */
    await cache.put(url, new Response(stream, { headers }));
    const kept = await cache.match(url);
    if (!kept || (total && loaded < total)) { await cache.delete(url).catch(() => {}); throw new Error("the download of " + name + " was cut short"); }
    buf = await kept.arrayBuffer();
  } else {
    buf = await new Response(stream).arrayBuffer();
  }
  progress(name, "done", buf.byteLength, buf.byteLength);
  return buf;
}

function load() {
  if (loading) return loading;
  loading = (async () => {
    cfg = JSON.parse(new TextDecoder().decode(await file(CONFIG)));
    const model = await file(MODEL);
    session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ["wasm"] });
    await phonemize("a", "en-us");      /* espeak-ng starts up now rather than on the first sentence */
    return session;
  })().catch((err) => { loading = null; session = null; throw err; });
  return loading;
}

/* ---- text → phonemes → ids. espeak-ng drops punctuation, and the voice reads its pauses and its questions off it,
   so the text is cut at , . ; : ! ? — … (a decimal point, a thousands comma and an abbreviation's full stop are not
   cuts), each piece is turned into phonemes and the mark is put back after it; a sentence is one run of the model ---- */
const MARK = /[,.;:!?…—–]/;
const ABBREV = /(?:^|[^A-Za-z])(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Capt|Lt|Sgt|Col|Gen|Rev|Mt|vs|[A-Z])$/;
function clean(text) {
  return String(text || "")
    .replace(/[‘’ʼ](?=\p{L})/gu, (m, i, s) => (/\p{L}/u.test(s.charAt(i - 1)) ? "'" : ""))   /* don’t → don't */
    .replace(/(^|[^\p{L}])'|'(?=[^\p{L}]|$)/gu, "$1")                                                       /* 'quoted' → quoted */
    .replace(/["“”„‟«»‹›‘’()[\]{}<>*_~#|\\/]/g, " ")                                                          /* quote marks, brackets */
    .replace(/\s*-{2,}\s*/g, " — ").replace(/\s+-\s+/g, " — ")                                                /* -- and a spaced hyphen: a dash */
    .replace(/\s+/g, " ").trim();
}
/* [{ text, mark }]: the mark closing each piece ("" for the last when the text ends without one) */
function pieces(text) {
  const s = clean(text), out = [];
  let cur = "", i = 0;
  while (i < s.length) {
    const ch = s.charAt(i);
    if (!MARK.test(ch) || ((ch === "." || ch === ",") && /\d/.test(s.charAt(i - 1)) && /\d/.test(s.charAt(i + 1))) || (ch === "." && ABBREV.test(cur))) {
      cur += ch; i++; continue;
    }
    let run = "";
    while (i < s.length && MARK.test(s.charAt(i))) run += s.charAt(i++);
    const mark = /\?/.test(run) ? "?" : /!/.test(run) ? "!" : /[.…]/.test(run) ? "." : /;/.test(run) ? ";" : /:/.test(run) ? ":" : ",";
    out.push({ text: cur.trim(), mark });
    cur = "";
  }
  if (cur.trim()) out.push({ text: cur.trim(), mark: "" });
  return out;
}
/* the phonemes of each sentence: "ðə lˈæmp, ænd ʃiː stˈʊd ðɛɹ." */
async function sentences(text) {
  const out = [];
  let cur = "";
  for (const p of pieces(text)) {
    if (/[\p{L}\p{N}]/u.test(p.text)) {
      const lines = await phonemize(p.text, "en-us");
      const ph = lines.join(" ").replace(/\([a-z]{2,3}(?:-[a-z0-9]+)?\)/gi, "").replace(/\s+/g, " ").trim();   /* no language-switch flags */
      if (ph) cur += ph + p.mark + " ";
    }
    if (/[.!?]/.test(p.mark) && cur.trim()) { out.push(cur.trim()); cur = ""; }
  }
  if (cur.trim()) out.push(/[.!?,;:]$/.test(cur.trim()) ? cur.trim() : cur.trim() + ".");
  return out;
}
/* ^ _ (phoneme _)* $ from the config's map; a symbol the voice does not know is skipped */
function ids(ph) {
  const map = cfg.phoneme_id_map, out = [...map["^"], ...map["_"]];
  for (const ch of ph) if (map[ch]) out.push(...map[ch], ...map["_"]);
  out.push(...map["$"]);
  return out;
}

async function run(x, sid, speed) {
  const inf = cfg.inference || {};
  const feeds = {
    input: new ort.Tensor("int64", BigInt64Array.from(x, (n) => BigInt(n)), [1, x.length]),
    input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(x.length)]), [1]),
    scales: new ort.Tensor("float32", Float32Array.from([inf.noise_scale ?? 0.667, (inf.length_scale ?? 1) / (speed > 0 ? speed : 1), inf.noise_w ?? 0.8]), [3])
  };
  if (session.inputNames.includes("sid")) feeds.sid = new ort.Tensor("int64", BigInt64Array.from([BigInt(sid)]), [1]);
  const out = await session.run(feeds);
  return out[session.outputNames[0]].data;
}

async function make(job) {
  await load();
  const t0 = Date.now(), rate = (cfg.audio && cfg.audio.sample_rate) || 22050, n = cfg.num_speakers || 1;
  let sid = parseInt(job.voice, 10);
  if (!(sid >= 0 && sid < n)) sid = 0;
  const parts = [], gap = Math.round(SENTENCE_GAP * rate);
  for (const ph of await sentences(job.text)) {
    const x = ids(ph);
    if (x.length <= 3) continue;
    if (parts.length) parts.push(new Float32Array(gap));
    parts.push(await run(x, sid, job.speed));
  }
  /* nothing to say (a row of stars): a moment of silence, so reading moves on */
  if (!parts.length) parts.push(new Float32Array(Math.round(0.1 * rate)));
  /* a fresh, whole buffer, so it can be handed over rather than copied */
  let len = 0;
  for (const p of parts) len += p.length;
  const samples = new Float32Array(len);
  let o = 0;
  for (const p of parts) { samples.set(p, o); o += p.length; }
  return { samples, sampleRate: rate, ms: Date.now() - t0 };
}

async function pump() {
  if (busy || !queue.length) return;
  busy = true;
  const job = queue.shift();
  try {
    const r = await make(job);
    if (job.gen === gen) self.postMessage({ type: "audio", id: job.id, sampleRate: r.sampleRate, samples: r.samples, ms: r.ms }, [r.samples.buffer]);
  } catch (err) {
    if (job.gen === gen) self.postMessage({ type: "error", id: job.id, message: message(err) });
  }
  busy = false;
  pump();
}

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.type === "load") {
    load().then(() => {
      self.postMessage({ type: "ready", voices: [], speakers: (cfg && cfg.num_speakers) || 0, threads: THREADS, isolated: !!self.crossOriginIsolated });
    }, (err) => {
      self.postMessage({ type: "error", id: null, message: message(err) });
    });
  } else if (m.type === "generate") {
    queue.push({ id: m.id, text: String(m.text || ""), voice: m.voice, speed: m.speed, gen });
    pump();
  } else if (m.type === "cancel") {
    queue = [];
    gen++;
  }
};
