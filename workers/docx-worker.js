/* lamplight — DOCX conversion off the main thread.
   Receives { buf: ArrayBuffer } and answers { html } or { error }. */
importScripts("../vendor/mammoth.min.js");

self.onmessage = function (e) {
  var buf = e.data && e.data.buf;
  if (!buf) { self.postMessage({ error: "no data" }); return; }
  try {
    mammoth.convertToHtml({ arrayBuffer: buf }).then(function (res) {
      self.postMessage({ html: res.value, messages: (res.messages || []).map(function (m) { return m.message; }) });
    }, function (err) {
      self.postMessage({ error: err && err.message ? err.message : String(err) });
    });
  } catch (err) {
    self.postMessage({ error: err && err.message ? err.message : String(err) });
  }
};
