# Vendored libraries

| File | Project | Version | Licence |
|------|---------|---------|---------|
| `pdf.min.js`, `pdf.worker.min.js` | [pdf.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Apache-2.0 |
| `mammoth.min.js` | [mammoth.js](https://github.com/mwilliamson/mammoth.js) | 1.6.0 | BSD-2-Clause |
| `marked.min.js` | [marked](https://marked.js.org/) | 9.1.6 | MIT |
| `purify.min.js` | [DOMPurify](https://github.com/cure53/DOMPurify) | 3.0.8 | Apache-2.0 / MPL-2.0 |
| `jszip.min.js` | [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | MIT or GPLv3 |

Each file's own licence header is preserved at the top of the file. Only the parser a document needs is loaded (see `need()` in `app.js`).
