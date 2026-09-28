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
| `piper/ort.min.mjs` | [ONNX Runtime](https://onnxruntime.ai/) (onnxruntime-web, `dist/ort.min.mjs`) | 1.22.0-dev.20250409-89f8206ba4 | MIT (`kokoro/ORT-LICENSE`) |
| `piper/phonemizer.js` | [phonemizer.js](https://github.com/xenova/phonemizer.js) (`dist/phonemizer.js`), which includes [eSpeak NG](https://github.com/espeak-ng/espeak-ng) compiled to WebAssembly with its language data | 1.2.1 | Apache-2.0 (`piper/PHONEMIZER-LICENSE`); eSpeak NG: GPL-3.0-or-later |

Each file's own licence header is preserved at the top of the file (`piper/phonemizer.js` came without one; a two-line header naming both licences was added). Only the parser a document needs is loaded (see `need()` in `app.js`).

The Best natural voices are [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by hexgrad, Apache-2.0, in the ONNX build [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) (quantised, `q8`). The model and its voice files are not in this repository: the browser fetches them from huggingface.co when the reader presses *Download natural voices*, and keeps them in Cache Storage (`transformers-cache`, `kokoro-voices`). `kokoro/kokoro.web.js` is kokoro-js's `dist/kokoro.web.js` with one change at its end: the exported `env` is the Transformers.js env itself (so `workers/kokoro-worker.js` can set the thread count and the caching switches) with kokoro-js's `wasmPaths` accessor kept on it. The ONNX Runtime files are the `.jsep` WebAssembly build that bundle loads; they are fetched from this origin instead of the jsDelivr CDN.

The Fast natural voices are the [Piper](https://github.com/rhasspy/piper) voice `en_US-libritts_r-medium` from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) (the repository is MIT-licensed; per its [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/libritts_r/medium/MODEL_CARD) the voice has 904 speakers, was fine-tuned from Piper's English lessac medium voice on train-clean-360, and its dataset is [LibriTTS-R](http://www.openslr.org/141/), CC BY 4.0). The model and its config are not in this repository: `workers/piper-worker.js` fetches them from huggingface.co when the reader presses *Download natural voices* (or first reads with *Fast*) and keeps them in Cache Storage (`piper-voices`). `piper/ort.min.mjs` is onnxruntime-web's `dist/ort.min.mjs` with its source-map comment removed; it loads the `.jsep` WebAssembly pair already in `kokoro/`, so the two engines share one runtime. `piper/phonemizer.js` turns text into IPA phonemes with eSpeak NG (GPL-3.0-or-later, source at https://github.com/espeak-ng/espeak-ng); it is loaded only by the Piper worker.
