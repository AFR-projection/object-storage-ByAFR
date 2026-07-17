import { sql, type SQL } from "drizzle-orm";
import { files } from "@/lib/db/schema";

/**
 * Full-text search helpers over files.search_vector.
 *
 * User input is passed to Postgres's `websearch_to_tsquery`, which safely parses
 * web-style syntax (quoted "exact phrases", -excluded terms, OR) and never lets
 * the raw string reach SQL — so there is no injection surface here.
 *
 * We use the 'simple' text search config (matches the generated column in the
 * schema) so search is language-agnostic: no stemming, exact token matching,
 * which suits filenames and mixed-language content better than 'english'.
 */

const TS_CONFIG = "simple";

/** True when the query has at least one non-whitespace character. */
export function hasSearchTerms(q: string | undefined | null): q is string {
  return !!q && q.trim().length > 0;
}

/**
 * A `tsvector @@ websearch_to_tsquery(...)` match condition for the WHERE clause.
 * Returns null when the query is empty (caller should skip FTS filtering).
 */
export function ftsMatch(q: string): SQL {
  return sql`${files.searchVector} @@ websearch_to_tsquery(${TS_CONFIG}, ${q})`;
}

/**
 * Relevance score (ts_rank) for ORDER BY. Higher = more relevant.
 * Pair with ftsMatch so only matching rows are ranked.
 */
export function ftsRank(q: string): SQL<number> {
  return sql<number>`ts_rank(${files.searchVector}, websearch_to_tsquery(${TS_CONFIG}, ${q}))`;
}
