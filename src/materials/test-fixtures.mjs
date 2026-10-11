// Builds small but real PDF / PPTX / DOCX files in memory for tests.
import { strToU8, zipSync } from "fflate";

export function makePdf(pageTexts) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>"];
  const kids = pageTexts.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageTexts.length} >>`);
  const fontId = 3 + pageTexts.length * 2;
  pageTexts.forEach((text, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
    const escaped = text.replace(/[\\()]/g, (c) => `\\${c}`);
    const stream = text ? `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET` : "";
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

const xmlEscape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const drawing = (paragraphs) => paragraphs.map((p) => `<a:p><a:r><a:t>${xmlEscape(p)}</a:t></a:r></a:p>`).join("");

// slides: [{ text: [...paragraphs], notes?: [...paragraphs] }] in presentation order.
// Files are numbered in reverse to prove order comes from presentation.xml.
export function makePptx(slides) {
  const files = {};
  const n = slides.length;
  const ids = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("");
  files["ppt/presentation.xml"] = strToU8(`<?xml version="1.0"?><p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst>${ids}</p:sldIdLst></p:presentation>`);
  files["ppt/_rels/presentation.xml.rels"] = strToU8(`<?xml version="1.0"?><Relationships>${slides.map((_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas/slide" Target="slides/slide${n - i}.xml"/>`).join("")}</Relationships>`);
  slides.forEach((slide, i) => {
    const fileNo = n - i;
    files[`ppt/slides/slide${fileNo}.xml`] = strToU8(`<p:sld xmlns:a="a"><p:txBody>${drawing(slide.text)}</p:txBody></p:sld>`);
    if (slide.notes) {
      files[`ppt/slides/_rels/slide${fileNo}.xml.rels`] = strToU8(`<Relationships><Relationship Id="rId9" Type="http://schemas/notesSlide" Target="../notesSlides/notesSlide${fileNo}.xml"/></Relationships>`);
      files[`ppt/notesSlides/notesSlide${fileNo}.xml`] = strToU8(`<p:notes xmlns:a="a">${drawing([...slide.notes, String(i + 1)])}</p:notes>`);
    }
  });
  return zipSync(files);
}

// blocks: [{ heading } | { text }]
export function makeDocx(blocks) {
  const body = blocks.map((block) => block.heading
    ? `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${xmlEscape(block.heading)}</w:t></w:r></w:p>`
    : `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(block.text)}</w:t></w:r></w:p>`).join("\n");
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(`<?xml version="1.0"?><w:document xmlns:w="w"><w:body>\n${body}\n</w:body></w:document>`)
  });
}

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
