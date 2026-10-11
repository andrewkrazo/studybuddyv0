// Turns uploaded course files into text sections that remember where they came
// from (PDF page, slide number, document heading), so the Class AI can cite them.
import { unzipSync, strFromU8 } from "fflate";

export const DOCUMENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8"
};

export const IMAGE_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp"
};

const LEGACY_HINTS = {
  ppt: "Old .ppt files aren't supported. Save the slides as .pptx or PDF and upload that.",
  doc: "Old .doc files aren't supported. Save the document as .docx or PDF and upload that.",
  key: "Keynote files aren't supported. Export the slides as PDF or .pptx and upload that.",
  zip: "Zip files aren't supported. Upload the files inside it one by one."
};

const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024;
const MAX_PDF_PAGES = 1000;

export class UnsupportedFileError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedFileError";
  }
}

export function fileExtension(filename = "") {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

function startsWith(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

// Decide what a file really is from its bytes, using the extension only to
// tell apart formats that share a container (docx/pptx are both zip files).
export function detectDocumentType(bytes, filename) {
  const ext = fileExtension(filename);
  if (LEGACY_HINTS[ext]) throw new UnsupportedFileError(LEGACY_HINTS[ext]);

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) { // PK zip
    if (ext === "docx" || ext === "pptx") return ext;
    throw new UnsupportedFileError("This looks like a zip-based file. Upload PDF, DOCX, PPTX, TXT or MD files.");
  }
  if (ext === "txt" || ext === "md") {
    if (bytes.includes(0)) throw new UnsupportedFileError("This text file contains binary data.");
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new UnsupportedFileError("Text files must be UTF-8 encoded.");
    }
    return ext;
  }
  throw new UnsupportedFileError("Unsupported file type. Upload PDF, DOCX, PPTX, TXT or MD files.");
}

export function detectImageType(bytes) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) return "webp";
  throw new UnsupportedFileError("Cover images must be PNG, JPG or WEBP.");
}

// Returns { sections: [{ location, text }], pageCount }.
// location is { page } for PDFs, { slide, notes? } for slides, { section, part } otherwise.
export async function extractSections(bytes, type) {
  if (type === "pdf") return extractPdf(bytes);
  if (type === "pptx") return extractPptx(bytes);
  if (type === "docx") return extractDocx(bytes);
  if (type === "txt" || type === "md") return extractPlainText(strFromU8(bytes), type);
  throw new UnsupportedFileError(`No extractor for ${type}.`);
}

async function extractPdf(bytes) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  // unpdf may transfer the buffer to a worker, so give it a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new UnsupportedFileError(`PDFs are limited to ${MAX_PDF_PAGES} pages.`);
  }
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  return {
    pageCount: totalPages,
    sections: text.map((pageText, index) => ({ location: { page: index + 1 }, text: pageText }))
  };
}

function unzipEntries(bytes, wanted) {
  let total = 0;
  const entries = unzipSync(bytes, {
    filter(file) {
      if (!wanted(file.name)) return false;
      total += file.originalSize;
      if (total > MAX_UNZIPPED_BYTES) throw new UnsupportedFileError("This file is too large once unpacked.");
      return true;
    }
  });
  return Object.fromEntries(Object.entries(entries).map(([name, data]) => [name, strFromU8(data)]));
}

const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

export function decodeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    if (entity[0] !== "#") return XML_ENTITIES[entity.toLowerCase()] ?? match;
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : match;
  });
}

// Paragraph-aware text from DrawingML (<a:p>/<a:t>), used by slides and notes.
function drawingText(xml) {
  return [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)]
    .map(([paragraph]) => decodeXml([...paragraph.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join("")).trim())
    .filter(Boolean)
    .join("\n");
}

function relTargets(relsXml = "") {
  const targets = {};
  for (const [, attrs] of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    const type = /\bType="([^"]+)"/.exec(attrs)?.[1] ?? "";
    if (id && target) targets[id] = { target, type };
  }
  return targets;
}

function resolvePath(baseDir, target) {
  const parts = `${baseDir}/${target}`.split("/");
  const out = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part && part !== ".") out.push(part);
  }
  return out.join("/");
}

function extractPptx(bytes) {
  const files = unzipEntries(bytes, (name) =>
    name === "ppt/presentation.xml" ||
    name === "ppt/_rels/presentation.xml.rels" ||
    /^ppt\/slides\/(_rels\/)?slide\d+\.xml(\.rels)?$/.test(name) ||
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)
  );
  if (!files["ppt/presentation.xml"]) throw new UnsupportedFileError("This .pptx file is missing its slide list.");

  // Slide order comes from presentation.xml, not from file names.
  const rels = relTargets(files["ppt/_rels/presentation.xml.rels"]);
  const order = [...files["ppt/presentation.xml"].matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)]
    .map(([, relId]) => rels[relId] && resolvePath("ppt", rels[relId].target))
    .filter(Boolean);

  const sections = [];
  order.forEach((slidePath, index) => {
    const slide = index + 1;
    const slideText = files[slidePath] ? drawingText(files[slidePath]) : "";
    if (slideText) sections.push({ location: { slide }, text: slideText });

    const slideRelsPath = slidePath.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels");
    const notesRel = Object.values(relTargets(files[slideRelsPath])).find((rel) => rel.type.endsWith("/notesSlide"));
    const notesXml = notesRel && files[resolvePath("ppt/slides", notesRel.target)];
    if (notesXml) {
      // Notes pages repeat the slide number as a placeholder; drop bare numbers.
      const notesText = drawingText(notesXml).split("\n").filter((line) => !/^\d+$/.test(line)).join("\n").trim();
      if (notesText) sections.push({ location: { slide, notes: true }, text: notesText });
    }
  });
  return { pageCount: order.length, sections };
}

function extractDocx(bytes) {
  const files = unzipEntries(bytes, (name) => name === "word/document.xml");
  const xml = files["word/document.xml"];
  if (!xml) throw new UnsupportedFileError("This .docx file has no document body.");

  const sections = [];
  let current = { heading: null, lines: [] };
  const flush = () => {
    if (current.lines.length) {
      sections.push({ location: { section: current.heading, part: sections.length + 1 }, text: current.lines.join("\n") });
    }
  };

  for (const [paragraph] of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(paragraph)?.[1] ?? "";
    // Only text runs count; tabs and line breaks become runs so the XML's own
    // formatting whitespace never leaks into the text.
    const runs = paragraph
      .replace(/<w:tab\b[^>]*\/>/g, "<w:t>\t</w:t>")
      .replace(/<w:(?:br|cr)\b[^>]*\/>/g, "<w:t>\n</w:t>");
    const text = decodeXml([...runs.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("")).trim();
    if (!text) continue;
    if (/^(Heading\d|Title)$/i.test(style)) {
      flush();
      current = { heading: text, lines: [] };
    } else {
      current.lines.push(text);
    }
  }
  flush();
  return { pageCount: null, sections };
}

function extractPlainText(text, type) {
  const sections = [];
  let current = { heading: null, lines: [] };
  const flush = () => {
    const body = current.lines.join("\n").trim();
    if (body) sections.push({ location: { section: current.heading, part: sections.length + 1 }, text: body });
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = type === "md" ? /^#{1,6}\s+(.+?)\s*#*$/.exec(line) : null;
    if (heading) {
      flush();
      current = { heading: heading[1], lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  flush();
  return { pageCount: null, sections };
}
