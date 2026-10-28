import type { Faq, Product } from "./db.js";

// Words that carry no meaning for matching, including common Pidgin fillers.
const STOPWORDS = new Set(
  (
    "a an the is are was were be do does did i you we they he she it my your our of to in on for and or with at by from " +
    "what when where how which who can could will would please abeg dey de na una wey o oh sir ma madam this that " +
    "there any have has get much many am me us"
  ).split(" "),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => w.replace(/(ing|es|s)$/, "")); // crude stemming; overlap() also matches on shared prefixes
}

/** Similarity between two token lists, tolerant of small spelling differences via shared prefixes. */
function overlap(query: string[], target: string[]): number {
  if (query.length === 0 || target.length === 0) return 0;
  let hits = 0;
  for (const q of query) {
    if (target.some((t) => t === q || (q.length >= 4 && t.length >= 4 && (t.startsWith(q.slice(0, 5)) || q.startsWith(t.slice(0, 5)))))) {
      hits++;
    }
  }
  return hits / query.length;
}

export interface FaqMatch extends Faq {
  score: number;
}

/** Best FAQ matches for a caller's question. Answers and questions both count, questions more. */
export function searchFaqs(faqs: Faq[], question: string, limit = 3, minScore = 0.34): FaqMatch[] {
  const q = tokenize(question);
  return faqs
    .map((f) => ({
      ...f,
      // Free-form notes have no question, so they are matched on their text alone.
      score: f.question ? Math.max(overlap(q, tokenize(f.question)), 0.7 * overlap(q, tokenize(f.answer))) : overlap(q, tokenize(f.answer)),
    }))
    .filter((f) => f.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Find the product a caller most likely means ("two plates of jollof" -> "Jollof Rice"). */
export function matchProduct(products: Product[], spoken: string): Product | null {
  const q = tokenize(spoken);
  let best: Product | null = null;
  let bestScore = 0;
  for (const p of products) {
    const score = overlap(tokenize(p.name), q);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

export const formatNaira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
