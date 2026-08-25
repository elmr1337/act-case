/**
 * Storyteq geeft (voor zover discovery uitwees) geen thumbnails terug. In
 * plaats van een grijs vlak geven we elke template een eigen, altijd gelijke
 * kleurcombinatie op basis van zijn id — zodat de grid herkenbaar blijft.
 */
const PAIRS: Array<[string, string]> = [
  ["oklch(0.72 0.15 275)", "oklch(0.84 0.11 215)"],
  ["oklch(0.76 0.14 68)", "oklch(0.85 0.10 110)"],
  ["oklch(0.70 0.15 340)", "oklch(0.83 0.11 25)"],
  ["oklch(0.71 0.13 175)", "oklch(0.85 0.10 140)"],
  ["oklch(0.69 0.16 300)", "oklch(0.82 0.12 330)"],
  ["oklch(0.74 0.13 240)", "oklch(0.86 0.09 190)"],
];

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function placeholderGradient(seed: string) {
  const [from, to] = PAIRS[hash(seed) % PAIRS.length];
  const angle = 120 + (hash(seed + "a") % 120);
  return `linear-gradient(${angle}deg, ${from}, ${to})`;
}

/** "Zomeractie 2026" → "ZA" */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
