/**
 * Shared year-grouping logic used by any dropdown that needs to show its
 * full history organized into per-year sections instead of being
 * filtered down to a single year — e.g. the Work Report "Projects"
 * dropdown, and the Owner's Hours Dashboard "Client" / "Project"
 * dropdowns.
 *
 * Centralizing this here (rather than re-implementing it per page) keeps
 * the grouping/sorting behavior identical everywhere it's used.
 */

/** A single (year, name) pairing, e.g. one row of a "grouped-by-year" API response. */
export interface YearGroupedOption {
  year: string;
  name: string;
}

/** One year's worth of names, ready to render as a labeled section in a dropdown. */
export interface YearGroup {
  year: string;
  items: string[];
}

/**
 * Groups a flat list of (year, name) pairs into year-labeled sections,
 * newest year first, with names sorted alphabetically within each year
 * and de-duplicated.
 */
export const groupByYear = (options: YearGroupedOption[]): YearGroup[] => {
  const byYear = new Map<string, Set<string>>();
  for (const { year, name } of options) {
    const y = year || "Unassigned";
    const n = name?.trim();
    if (!n) continue;
    if (!byYear.has(y)) byYear.set(y, new Set());
    byYear.get(y)!.add(n);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .map(([year, items]) => ({
      year,
      items: [...items].sort((a, b) => a.localeCompare(b)),
    }));
};
