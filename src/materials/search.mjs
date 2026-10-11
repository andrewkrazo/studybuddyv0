// Query handling shared by both search backends. Student questions are natural
// language ("how did my teacher explain osmosis?"), so terms are OR-ed and
// ranked rather than all required.

const STOP_WORDS = new Set([
  "a", "about", "after", "again", "also", "am", "an", "and", "any", "are", "as", "at", "be", "because",
  "been", "before", "being", "between", "both", "but", "by", "can", "class", "could", "course", "did",
  "do", "does", "doing", "during", "each", "explain", "explained", "for", "from", "had", "has", "have",
  "he", "her", "here", "his", "how", "i", "if", "in", "into", "is", "it", "its", "lecture", "like", "me",
  "mean", "more", "most", "my", "no", "not", "of", "on", "or", "our", "out", "please", "professor",
  "said", "say", "she", "should", "so", "some", "teacher", "tell", "than", "that", "the", "their",
  "them", "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "up",
  "us", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "why", "will",
  "with", "would", "you", "your"
]);

const MAX_TERMS = 24;

export function queryTerms(query = "") {
  const seen = new Set();
  for (const word of String(query).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g) ?? []) {
    if (word.length < 2 || STOP_WORDS.has(word)) continue;
    seen.add(word);
    if (seen.size >= MAX_TERMS) break;
  }
  return [...seen];
}

// Light suffix stripping so "cells"/"cell" and "dividing"/"divide" meet.
export function stem(word) {
  return word
    .replace(/(ies)$/, "y")
    .replace(/(ing|edly|ed|es|ly|s)$/, "")
    .replace(/e$/, "");
}

function tokens(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stem);
}

// In-memory ranking (tests and local dev without Postgres): term frequency
// with diminishing returns, weighted by how rare the term is in this course.
export function rankSegments(segments, query, { limit = 8 } = {}) {
  const terms = queryTerms(query).map(stem).filter(Boolean);
  if (!terms.length || !segments.length) return [];
  // Citations carry the file name and section heading, which often name the topic.
  const tokenized = segments.map((segment) => tokens(`${segment.citation ?? ""} ${segment.text}`));
  const idf = Object.fromEntries(terms.map((term) => {
    const containing = tokenized.filter((words) => words.includes(term)).length;
    return [term, Math.log(1 + segments.length / (1 + containing))];
  }));
  return segments
    .map((segment, index) => {
      const words = tokenized[index];
      let score = 0;
      for (const term of terms) {
        const count = words.filter((word) => word === term).length;
        if (count) score += idf[term] * (count / (count + 1.2));
      }
      return { segment, score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ segment, score }) => ({ ...segment, score: Number(score.toFixed(4)) }));
}

// Postgres to_tsquery input: sanitized terms joined with OR.
export function toTsQuery(query) {
  return queryTerms(query).join(" | ");
}
