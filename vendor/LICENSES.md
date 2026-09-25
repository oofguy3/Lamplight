# Vendored libraries

| File | Project | Version | Licence |
|------|---------|---------|---------|
| `pdf.min.js`, `pdf.worker.min.js` | [pdf.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Apache-2.0 |
| `mammoth.min.js` | [mammoth.js](https://github.com/mwilliamson/mammoth.js) | 1.6.0 | BSD-2-Clause |
| `marked.min.js` | [marked](https://marked.js.org/) | 9.1.6 | MIT |
| `purify.min.js` | [DOMPurify](https://github.com/cure53/DOMPurify) | 3.0.8 | Apache-2.0 / MPL-2.0 |
| `jszip.min.js` | [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | MIT or GPLv3 |
| `kokoro/kokoro.web.js` | [kokoro-js](https://github.com/hexgrad/kokoro) (bundles [Transformers.js](https://github.com/huggingface/transformers.js) 3.5.1, Apache-2.0) | 1.2.1 | Apache-2.0 (`kokoro/LICENSE`) |
| `kokoro/ort-wasm-simd-threaded.jsep.mjs`, `kokoro/ort-wasm-simd-threaded.jsep.wasm` | [ONNX Runtime](https://onnxruntime.ai/) (onnxruntime-web) | 1.22.0-dev.20250409-89f8206ba4 | MIT (`kokoro/ORT-LICENSE`) |

Each file's own licence header is preserved at the top of the file. Only the parser a document needs is loaded (see `need()` in `app.js`).

The natural voices are [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by hexgrad, Apache-2.0, in the ONNX build [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) (quantised, `q8`). The model and its voice files are not in this repository: the browser fetches them from huggingface.co when the reader presses *Download natural voices*, and keeps them in Cache Storage (`transformers-cache`, `kokoro-voices`). `kokoro/kokoro.web.js` is kokoro-js's `dist/kokoro.web.js` with one change at its end: the exported `env` is the Transformers.js env itself (so `workers/kokoro-worker.js` can set the thread count and the caching switches) with kokoro-js's `wasmPaths` accessor kept on it. The ONNX Runtime files are the `.jsep` WebAssembly build that bundle loads; they are fetched from this origin instead of the jsDelivr CDN.
