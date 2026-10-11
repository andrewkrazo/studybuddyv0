// Splits extracted sections into retrieval-sized passages. A passage never
// spans two pages/slides/sections, so every passage has one exact citation.

const DEFAULT_MAX_CHARS = 1200;

export function citationFor(filename, location = {}) {
  if (location.page) return `${filename}, p. ${location.page}`;
  if (location.slide) return `${filename}, slide ${location.slide}${location.notes ? " (speaker notes)" : ""}`;
  if (location.section) return `${filename}, “${location.section}”`;
  if (location.part) return `${filename}, part ${location.part}`;
  return filename;
}

function cleanParagraph(text) {
  return text.replace(/[ \t\f\v]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function splitLong(paragraph, maxChars) {
  if (paragraph.length <= maxChars) return [paragraph];
  const pieces = [];
  let current = "";
  for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
    if (sentence.length > maxChars) {
      if (current) pieces.push(current);
      current = "";
      for (let i = 0; i < sentence.length; i += maxChars) pieces.push(sentence.slice(i, i + maxChars));
      continue;
    }
    if (current && current.length + 1 + sentence.length > maxChars) {
      pieces.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

export function chunkSections(sections, { filename, maxChars = DEFAULT_MAX_CHARS } = {}) {
  const passages = [];
  for (const section of sections) {
    const paragraphs = cleanParagraph(section.text ?? "")
      .split(/\n{2,}|\n(?=[-•*\d])/)
      .flatMap((paragraph) => splitLong(paragraph.replace(/\n/g, " ").trim(), maxChars))
      .filter(Boolean);

    let current = "";
    const push = () => {
      if (!current) return;
      passages.push({
        ordinal: passages.length,
        text: current,
        location: section.location,
        citation: citationFor(filename, section.location)
      });
      current = "";
    };
    for (const paragraph of paragraphs) {
      if (current && current.length + 2 + paragraph.length > maxChars) push();
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
    push();
  }
  return passages;
}

export function totalTextLength(sections) {
  return sections.reduce((sum, section) => sum + (section.text ?? "").replace(/\s+/g, "").length, 0);
}
