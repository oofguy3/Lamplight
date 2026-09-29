/* lamplight — the Dutch ↔ English pack: Firefox Translations (Bergamot) off the main thread.
   A module worker, made by translate.js the first time the pack is downloaded or asked to translate, and ended
   when it has been idle a while or the other direction is wanted: a loaded model holds about 0.5 GB of
   WebAssembly memory that is only given back when the worker goes.
   Runtime: vendor/bergamot/bergamot-translator-worker.{js,wasm} (@browsermt/bergamot-translator 0.4.9, MPL-2.0;
   needs WebAssembly SIMD). Models: Mozilla's released nl→en and en→nl "base-memory" models and their shared
   vocabulary (MPL-2.0), stored gzipped under models/bergamot/ and inflated here. No lexical shortlist: it
   garbled names and short exclamations for a little more speed. All five files come from this origin and are
   kept in Cache Storage "bergamot-models" (sw.js keeps that cache across releases and sends these paths straight
   to the network), so once downloaded the pack works offline.
   In:  { type: "download" }
          → { type: "progress", loaded, total }… then { type: "downloaded", bytes } or { type: "error", op: "download", message }
        { type: "translate", id, pair ("nlen" | "ennl"), text }      one paragraph at a time; one direction per worker
          → { type: "result", id, text, ms } or { type: "error", id, message, fatal }
             fatal: the pack cannot run here (no SIMD, out of memory, a file missing) — the caller stops using it */
"use strict";

const ROOT = new URL("../", self.location.href);
const CACHE = "bergamot-models";
const FILES = {
  js:    { path: "vendor/bergamot/bergamot-translator-worker.js", bytes: 80758, type: "text/javascript" },
  wasm:  { path: "vendor/bergamot/bergamot-translator-worker.wasm", bytes: 5174294, type: "application/wasm" },
  vocab: { path: "models/bergamot/vocab.nlen.spm.gz", bytes: 410222, type: "application/gzip" },
  nlen:  { path: "models/bergamot/nlen/model.nlen.intgemm.alphas.bin.gz", bytes: 22647743, type: "application/gzip" },
  ennl:  { path: "models/bergamot/ennl/model.ennl.intgemm.alphas.bin.gz", bytes: 23386633, type: "application/gzip" }
};
const ORDER = ["js", "wasm", "vocab", "nlen", "ennl"];
/* what TranslationModel is given: greedy search, int8 weights, one paragraph per call */
const CONFIG = [
  "beam-size: 1", "normalize: 1.0", "word-penalty: 0", "cpu-threads: 0", "gemm-precision: int8shiftAlphaAll",
  "skip-cost: true", "alignment: soft", "quiet: true", "quiet-translation: true", "max-length-break: 128",
  "mini-batch-words: 1024", "workspace: 128", "max-length-factor: 2.0"
].join("\n") + "\n";
/* the smallest module with a v128 instruction: validates only where WebAssembly SIMD is there */
const SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

let M = null, runtime = null, service = null, dead = "";
let model = null, modelPair = "", loading = null;

class Fatal extends Error {}
const url = (key) => new URL(FILES[key].path, ROOT).href;
const message = (err) => (err && err.message) || String(err);

/* ---- files: from the cache, else from this origin into the cache ---- */
async function openCache() {
  try { return await caches.open(CACHE); } catch (_) { return null; }
}
async function fetchInto(cache, key, onBytes) {
  const f = FILES[key], res = await fetch(url(key), { cache: "no-cache" });
  if (!res.ok) throw new Error("couldn’t download " + f.path.split("/").pop() + " (" + res.status + ")");
  let got = 0;
  const counted = res.body.pipeThrough(new TransformStream({
    transform(chunk, ctl) { got += chunk.byteLength; if (onBytes) onBytes(chunk.byteLength); ctl.enqueue(chunk); }
  }));
  const kept = new Response(counted, { headers: { "Content-Type": f.type } });
  if (!cache) return new Uint8Array(await kept.arrayBuffer());
  /* a download cut short errors the stream, so nothing half-made is kept */
  await cache.put(url(key), kept);
  if (got < f.bytes * 0.5) { await cache.delete(url(key)).catch(() => {}); throw new Error("the download of " + f.path.split("/").pop() + " was cut short"); }
  return null;
}
async function bytesOf(key) {
  const cache = await openCache();
  const hit = cache ? await cache.match(url(key)).catch(() => null) : null;
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const direct = await fetchInto(cache, key, null);
  if (direct) return direct;
  const again = await cache.match(url(key));
  if (!again) throw new Fatal("the Dutch ↔ English pack is incomplete — download it again");
  return new Uint8Array(await again.arrayBuffer());
}
/* the models are stored as Mozilla ships them, gzipped; a server that already inflated one is fine too */
async function inflated(key) {
  const raw = await bytesOf(key);
  if (!(raw[0] === 0x1f && raw[1] === 0x8b)) return raw;
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function download() {
  const cache = await openCache();
  if (!cache) throw new Error("this browser can’t keep the pack (no Cache Storage)");
  const total = ORDER.reduce((a, k) => a + FILES[k].bytes, 0);
  let loaded = 0, last = 0;
  const tell = (force) => {
    const now = Date.now();
    if (force || now - last > 200) { last = now; self.postMessage({ type: "progress", loaded: Math.min(loaded, total), total }); }
  };
  tell(true);
  for (const key of ORDER) {
    const hit = await cache.match(url(key)).catch(() => null);
    if (hit) { loaded += FILES[key].bytes; tell(true); continue; }
    const before = loaded;
    await fetchInto(cache, key, (n) => { loaded += n; tell(false); });
    loaded = before + FILES[key].bytes;
    tell(true);
  }
  return total;
}

/* ---- the runtime: the emscripten glue, run with our Module (it is a classic script, so it is fetched and run
   with Function, the way importScripts would), and the wasm with its int8 matrix routines wired to the
   module's own fallbacks ---- */
function initRuntime() {
  if (runtime) return runtime;
  runtime = (async () => {
    if (!(typeof WebAssembly === "object" && WebAssembly.validate(SIMD))) throw new Fatal("this browser can’t run the pack (it needs WebAssembly SIMD)");
    if (typeof DecompressionStream !== "function") throw new Fatal("this browser can’t unpack the pack (no DecompressionStream)");
    const [js, wasm] = await Promise.all([bytesOf("js"), bytesOf("wasm")]);
    const Module = { print() {}, printErr() {} };
    const GEMM = {
      int8_prepare_a: "int8PrepareAFallback",
      int8_prepare_b: "int8PrepareBFallback",
      int8_prepare_b_from_transposed: "int8PrepareBFromTransposedFallback",
      int8_prepare_b_from_quantized_transposed: "int8PrepareBFromQuantizedTransposedFallback",
      int8_prepare_bias: "int8PrepareBiasFallback",
      int8_multiply_and_add_bias: "int8MultiplyAndAddBiasFallback",
      int8_select_columns_of_b: "int8SelectColumnsOfBFallback"
    };
    const gemm = {};
    for (const k in GEMM) gemm[k] = (...a) => Module.asm[GEMM[k]](...a);
    await new Promise((resolve, reject) => {
      Module.onAbort = (what) => { dead = String(what || "aborted"); reject(new Fatal("the pack stopped: " + dead)); };
      Module.instantiateWasm = (info, accept) => {
        WebAssembly.instantiate(wasm, Object.assign({}, info, { wasm_gemm: gemm })).then((r) => accept(r.instance), reject);
        return {};
      };
      Module.onRuntimeInitialized = resolve;
      new Function("Module", new TextDecoder().decode(js) + "\n;return Module;")(Module);
    });
    M = Module;
    service = new M.BlockingService({ cacheSize: 0 });
    return M;
  })();
  runtime.catch(() => { runtime = null; });
  return runtime;
}
function aligned(bytes, align) {
  const m = new M.AlignedMemory(bytes.byteLength, align);
  m.getByteArrayView().set(bytes);
  return m;
}
function load(pair) {
  if (model && modelPair === pair) return Promise.resolve(model);
  if (modelPair && modelPair !== pair) return Promise.reject(new Error("one direction per worker"));
  if (loading) return loading;
  if (!FILES[pair]) return Promise.reject(new Fatal("no model for " + pair));
  modelPair = pair;
  loading = (async () => {
    await initRuntime();
    const [weights, vocab] = await Promise.all([inflated(pair), inflated("vocab")]);
    const vocabs = new M.AlignedMemoryList();
    vocabs.push_back(aligned(vocab, 64));
    model = new M.TranslationModel(CONFIG, aligned(weights, 256), null, vocabs, null);   /* null: no shortlist */
    return model;
  })();
  loading.catch(() => { loading = null; modelPair = ""; model = null; });
  return loading;
}

/* English honorifics: "Mr. Bennet" came out as "meneer. Bennet" or "Mijnheer de heer Bennet"; without the full
   stop the model writes "meneer Bennet", "mevrouw Long". Only the text given to the model changes. */
function prep(text, pair) {
  return pair === "ennl" ? text.replace(/\b(Mr|Mrs|Ms|Messrs|Dr|St)\.(?=\s+[A-Z])/g, "$1") : text;
}
/* the nl→en model repeats a bare one- or two-word sentence ("Nee." → "No. No. No."): one copy is kept */
function tidy(src, out) {
  if (src.trim().split(/\s+/).length > 2) return out;
  const m = /^(.+?[.!?])(?:\s+\1)+$/.exec(out.trim());
  return m ? m[1] : out;
}
function translateOne(text, pair) {
  const input = new M.VectorString(), opts = new M.VectorResponseOptions();
  try {
    input.push_back(prep(text, pair));
    opts.push_back({ qualityScores: false, alignment: false, html: false });
    const res = service.translate(model, input, opts);
    try { return tidy(text, res.get(0).getTranslatedText()); } finally { res.delete(); }
  } finally { input.delete(); opts.delete(); }
}

/* one message at a time, in the order they came */
let chain = Promise.resolve();
self.onmessage = (e) => {
  const m = e.data || {};
  chain = chain.then(() => handle(m)).catch(() => {});
};
async function handle(m) {
  if (m.type === "download") {
    try { self.postMessage({ type: "downloaded", bytes: await download() }); }
    catch (err) { self.postMessage({ type: "error", op: "download", message: message(err) }); }
    return;
  }
  if (m.type !== "translate") return;
  try {
    if (dead) throw new Fatal("the pack stopped: " + dead);
    await load(m.pair);
    const t0 = performance.now();
    const text = String(m.text || "");
    const out = text.trim() ? translateOne(text, m.pair) : text;
    self.postMessage({ type: "result", id: m.id, text: out, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    const msg = message(err);
    /* memory that could not grow, an abort inside the module, or a runtime that cannot start: not worth retrying */
    const fatal = err instanceof Fatal || !!dead || err instanceof RangeError || /memory|OOM|abort|SIMD|incomplete|CompileError|LinkError/i.test(msg);
    self.postMessage({ type: "error", id: m.id, message: msg, fatal });
  }
}
