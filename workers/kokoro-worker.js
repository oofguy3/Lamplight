/* lamplight — natural voices (Kokoro-82M) off the main thread.
   A module worker, made only once the reader picks the engine or presses download. It imports
   kokoro-js and the ONNX runtime from vendor/kokoro/ (this origin, never a CDN), fetches the model
   from huggingface.co — the browser keeps it in Cache Storage: "transformers-cache" for the model,
   "kokoro-voices" for the voice files — and speaks one piece of text at a time, in the order asked.
   In:  { type: "load" }
          → { type: "progress", status, file, loaded, total, progress }… then { type: "ready", voices: [names], threads }
        { type: "generate", id, text, voice, speed? }
          → { type: "audio", id, sampleRate, samples (Float32Array, transferred), ms } or { type: "error", id, message }
        { type: "cancel" }
          → everything queued is dropped, and so is the result of the piece being made (it cannot be cut short) */
import { KokoroTTS, env } from "../vendor/kokoro/kokoro.web.js";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const THREADS = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;

/* the runtime's .mjs/.wasm from this origin; the model from huggingface.co, cached by the browser */
env.wasmPaths = new URL("../vendor/kokoro/", import.meta.url).href;
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
const onnx = env.backends && env.backends.onnx;
if (onnx && onnx.wasm) onnx.wasm.numThreads = THREADS;

let loading = null, tts = null, queue = [], busy = false, gen = 0;

function load() {
  if (loading) return loading;
  loading = KokoroTTS.from_pretrained(MODEL, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (p) => {
      if (!p || !p.file) return;
      self.postMessage({ type: "progress", status: p.status || "", file: p.file, loaded: p.loaded || 0, total: p.total || 0, progress: p.progress || 0 });
    }
  }).then((t) => { tts = t; return t; }, (err) => { loading = null; throw err; });
  return loading;
}

function message(err) { return (err && err.message) || String(err); }

async function make(job) {
  const t = await load();
  const t0 = Date.now();
  const out = await t.generate(job.text, { voice: job.voice || "af_heart", speed: job.speed || 1 });
  let samples = out && out.audio;
  /* a fresh, whole buffer, so it can be handed over rather than copied */
  if (!(samples instanceof Float32Array)) samples = new Float32Array(samples || 0);
  else if (samples.byteOffset !== 0 || samples.byteLength !== samples.buffer.byteLength || !(samples.buffer instanceof ArrayBuffer)) samples = new Float32Array(samples);
  return { samples, sampleRate: (out && out.sampling_rate) || 24000, ms: Date.now() - t0 };
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
    load().then((t) => {
      self.postMessage({ type: "ready", voices: Object.keys((t && t.voices) || {}), threads: THREADS, isolated: !!self.crossOriginIsolated });
    }, (err) => {
      self.postMessage({ type: "error", id: null, message: message(err) });
    });
  } else if (m.type === "generate") {
    queue.push({ id: m.id, text: String(m.text || ""), voice: m.voice, speed: m.speed, gen });
    pump();
  } else if (m.type === "cancel") {
    queue = [];
    gen++;
  } else if (m.type === "warm") {
    /* fetch the voice files now, into the same cache and under the same keys kokoro-js uses, so
       every voice works offline after "Download" rather than only the ones already heard */
    warm(Array.isArray(m.voices) ? m.voices : []).then(
      (n) => self.postMessage({ type: "warmed", n }),
      (err) => self.postMessage({ type: "warmed", n: 0, message: message(err) })
    );
  }
};

async function warm(names) {
  const base = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/";
  let cache = null, n = 0;
  try { cache = await caches.open("kokoro-voices"); } catch (_) { return 0; }
  for (const name of names) {
    const url = base + name + ".bin";
    try {
      if (await cache.match(url)) { n++; continue; }
      const r = await fetch(url);
      if (!r.ok) continue;
      await cache.put(url, r);
      n++;
    } catch (_) { /* offline or refused: the voice is fetched on first use instead */ }
  }
  return n;
}
