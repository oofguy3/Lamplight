#!/usr/bin/env python3
"""Builds small sample documents in every format Lamplight opens (no third-party modules)."""
import os, zipfile, textwrap
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fixtures")
os.makedirs(OUT, exist_ok=True)

PARAS = [
  "The lamp hums quietly as she turns the page. “One more chapter,” she tells herself, “just one more.”",
  "Outside, the unexpected rain had started again, and the street lights made the puddles glitter like spilled coins.",
  "He asked, “Are you coming?” She did not answer; the misunderstanding between them was older than the house.",
  "Nobody could have predicted the extraordinary consequences of that small, deliberate decision.",
  "The children ran ahead, laughing, while the old dog followed at its own unhurried pace.",
  "Photosynthesis converts light energy into chemical energy that the plant stores in sugars.",
  "It was, she thought, a remarkably uncomfortable chair for a room that was otherwise so kind.",
  "“Wait!” he shouted. But the train, indifferent and punctual, had already begun to move.",
]
def chapter(n, k=6):
    body = []
    for i in range(k):
        body.append(PARAS[(n * 3 + i) % len(PARAS)] + " " + PARAS[(n * 5 + i * 2) % len(PARAS)])
    return body

# ---- TXT ----
with open(os.path.join(OUT, "sample.txt"), "w", encoding="utf-8") as f:
    for c in range(4):
        f.write("Chapter %d\n\n" % (c + 1))
        for p in chapter(c): f.write(p + "\n\n")

# ---- Markdown ----
with open(os.path.join(OUT, "sample.md"), "w", encoding="utf-8") as f:
    f.write("# The Lamp\n\nA short *sample* book for **Lamplight**.\n\n")
    for c in range(4):
        f.write("## Chapter %d\n\n" % (c + 1))
        for p in chapter(c): f.write(p + "\n\n")
        if c == 1: f.write("> A quoted line, set apart.\n\n- one\n- two\n- three\n\n")

# ---- HTML (a 'saved web page' with junk to strip) ----
html_body = "".join("<h2>Chapter %d</h2>%s" % (c + 1, "".join("<p>%s</p>" % p for p in chapter(c))) for c in range(4))
with open(os.path.join(OUT, "sample.html"), "w", encoding="utf-8") as f:
    f.write("""<!doctype html><html><head><meta charset="utf-8"><title>The Lamp</title>
<style>body{color:red}</style><script>alert(1)</script></head><body>
<nav><a href="#">Home</a> <a href="#">Menu</a></nav>
<div class="cookie-banner">We use cookies</div>
<article><h1>The Lamp</h1>%s</article>
<div class="share-bar">Share on Bumble</div><footer>Footer junk</footer>
</body></html>""" % html_body)

# ---- EPUB ----
def xhtml(title, paras):
    return ('<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>%s</title></head>'
            '<body><h1 id="t">%s</h1>%s</body></html>') % (title, title, "".join("<p>%s</p>" % p for p in paras))
epub = os.path.join(OUT, "sample.epub")
with zipfile.ZipFile(epub, "w") as z:
    z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
    z.writestr("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    manifest, spine, nav, ncx = [], [], [], []
    for c in range(4):
        fn = "chap%d.xhtml" % (c + 1)
        z.writestr("OEBPS/" + fn, xhtml("Chapter %d" % (c + 1), chapter(c)), compress_type=zipfile.ZIP_DEFLATED)
        manifest.append('<item id="c%d" href="%s" media-type="application/xhtml+xml"/>' % (c, fn))
        spine.append('<itemref idref="c%d"/>' % c)
        nav.append('<li><a href="%s">Chapter %d</a></li>' % (fn, c + 1))
        ncx.append('<navPoint id="n%d" playOrder="%d"><navLabel><text>Chapter %d</text></navLabel><content src="%s"/></navPoint>' % (c, c + 1, c + 1, fn))
    z.writestr("OEBPS/nav.xhtml", '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>%s</ol></nav></body></html>' % "".join(nav))
    z.writestr("OEBPS/toc.ncx", '<?xml version="1.0" encoding="utf-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head/><docTitle><text>The Lamp</text></docTitle><navMap>%s</navMap></ncx>' % "".join(ncx))
    z.writestr("OEBPS/content.opf", '<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:lamplight-sample</dc:identifier><dc:title>The Lamp</dc:title><dc:creator>A. Reader</dc:creator><dc:language>en</dc:language></metadata><manifest>%s<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx">%s</spine></package>' % ("".join(manifest), "".join(spine)))

# ---- DOCX ----
def para(text, style=None):
    ppr = '<w:pPr><w:pStyle w:val="%s"/></w:pPr>' % style if style else ''
    return '<w:p>%s<w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p>' % (ppr, text.replace("&", "&amp;").replace("<", "&lt;"))
docx = os.path.join(OUT, "sample.docx")
with zipfile.ZipFile(docx, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
    z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr("word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
    z.writestr("word/styles.xml", '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>')
    body = para("The Lamp", "Heading1")
    for c in range(4):
        body += para("Chapter %d" % (c + 1), "Heading2") + "".join(para(p) for p in chapter(c))
    z.writestr("word/document.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>%s</w:body></w:document>' % body)

# ---- PDF (hand-built, 5 pages of Helvetica text, with an outline) ----
def pdf_escape(s):
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
pages = []
for c in range(5):
    lines = ["Chapter %d" % (c + 1), ""]
    for p in chapter(c, 4):
        lines += textwrap.wrap(p.replace("“", '"').replace("”", '"').replace("’", "'"), 70) + [""]
    content = "BT /F1 12 Tf 60 740 Td 16 TL " + " ".join("(%s) Tj T*" % pdf_escape(l) for l in lines) + " ET"
    pages.append(content)
objs = []
def add(s): objs.append(s); return len(objs)
font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
page_ids, content_ids = [], []
pages_id = len(objs) + 1 + 2 * len(pages)  # reserve
for content in pages:
    cid = add("<< /Length %d >>\nstream\n%s\nendstream" % (len(content.encode("latin-1")), content))
    pid = add("<< /Type /Page /Parent %d 0 R /MediaBox [0 0 612 792] /Contents %d 0 R /Resources << /Font << /F1 %d 0 R >> >> >>" % (pages_id, cid, font))
    page_ids.append(pid)
assert add("<< /Type /Pages /Kids [%s] /Count %d >>" % (" ".join("%d 0 R" % p for p in page_ids), len(page_ids))) == pages_id
outline_id = len(objs) + 1
items_start = outline_id + 1
n = len(page_ids)
add("<< /Type /Outlines /First %d 0 R /Last %d 0 R /Count %d >>" % (items_start, items_start + n - 1, n))
for i, pid in enumerate(page_ids):
    me = items_start + i
    s = "<< /Title (Chapter %d) /Parent %d 0 R /Dest [%d 0 R /XYZ 0 792 0]" % (i + 1, outline_id, pid)
    if i > 0: s += " /Prev %d 0 R" % (me - 1)
    if i < n - 1: s += " /Next %d 0 R" % (me + 1)
    add(s + " >>")
catalog = add("<< /Type /Catalog /Pages %d 0 R /Outlines %d 0 R /PageMode /UseOutlines >>" % (pages_id, outline_id))
out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
offsets = []
for i, o in enumerate(objs):
    offsets.append(len(out))
    out += ("%d 0 obj\n%s\nendobj\n" % (i + 1, o)).encode("latin-1")
xref = len(out)
out += ("xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)).encode()
for off in offsets: out += ("%010d 00000 n \n" % off).encode()
out += ("trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, catalog, xref)).encode()
with open(os.path.join(OUT, "sample.pdf"), "wb") as f: f.write(out)
print("fixtures written to", OUT, sorted(os.listdir(OUT)))
