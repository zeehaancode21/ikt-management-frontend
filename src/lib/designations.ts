// src/lib/designations.ts
// Designation = the job function shown as a tile/filter on the roster.
// It is derived from the free-text Role Name, and is tolerant of typos:
// "Chekcer", "Modeller", "Desginer", "Estimater", "Senior Editer" all land
// in the right tile.

export const DESIGN_EST = "Designer & Estimator";
export const DESIGNATION_ORDER = ["Editor", "Modeler", "Checker", DESIGN_EST, "IT"];
export const NO_DESIGNATION = "__none__";

// canonical tile -> correctly spelled words that belong to it
const WORDS: Record<string, string[]> = {
  Editor: ["editor"],
  Modeler: ["modeler", "modeller"],
  Checker: ["checker"],
  [DESIGN_EST]: ["designer", "estimator"],
};
// prefixes that catch short / half-typed forms ("model", "check", "design", "estimat")
const STEMS: [string, string][] = [
  ["edit", "Editor"],
  ["model", "Modeler"],
  ["check", "Checker"],
  ["design", DESIGN_EST],
  ["estimat", DESIGN_EST],
];

// Levenshtein distance (small strings only).
const distance = (a: string, b: string): number => {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
};

export const designationOf = (em: { roleName?: string | null }): string => {
  const name = em.roleName?.trim();
  if (!name) return NO_DESIGNATION;
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean);

  for (const w of words) {
    if (w === "it") return "IT";
    for (const [stem, tile] of STEMS) if (w.startsWith(stem)) return tile;
    if (w.length < 5) continue; // too short to fuzzy-match safely
    const tolerance = w.length >= 6 ? 2 : 1;
    for (const [tile, list] of Object.entries(WORDS)) {
      if (list.some((k) => distance(w, k) <= tolerance)) return tile;
    }
  }
  return name; // custom designation -> its own tile
};
