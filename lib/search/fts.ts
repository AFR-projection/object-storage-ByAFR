import { sql, type SQL } from "drizzle-orm";
import { files } from "@/lib/db/schema";

/**
 * Full-text search helpers over files.search_vector.
 *
 * We build a PREFIX tsquery so partial words match: typing "tat" finds "tattoo",
 * "inv rep" finds "invoice report", etc. Each whitespace-separated term becomes a
 * `term:*` prefix lexeme, all AND-ed together.
 *
 * Injection-safe: the raw query is passed as a bound parameter and never
 * concatenated into SQL. Inside Postgres we lowercase, split on whitespace, and
 * strip every non-alphanumeric character (POSIX `[^[:alnum:]]`) from each token
 * before handing it to `to_tsquery` — so tsquery operators the user might type
 * (`:& | ! ( )`) can't reach the parser and cause errors. POSIX classes are used
 * instead of `\w`/`\s` because backslash escapes are swallowed by Postgres string
 * literals.
 *
 * The 'simple' config matches the generated column in the schema (language-
 * agnostic, no stemming) which suits filenames + mixed-language content.
 */

const TS_CONFIG = "simple";

/** True when the query has at least one non-whitespace character. */
export function hasSearchTerms(q: string | undefined | null): q is string {
  return !!q && q.trim().length > 0;
}

/**
 * Builds `to_tsquery('simple', 'a:* & b:* …')` from free-text input, entirely
 * inside SQL so the user string stays a bound parameter. Returns a tsquery
 * expression usable by both the match (`@@`) and rank (`ts_rank`) helpers.
 *
 * If every token strips down to empty (e.g. the query is all punctuation), the
 * inner aggregate is NULL → `@@ NULL` is NULL → no rows match, which is the
 * desired "nothing found" behaviour.
 */
function prefixTsQuery(q: string): SQL {
  return sql`to_tsquery(${TS_CONFIG}, (
    SELECT string_agg(t || ':*', ' & ')
    FROM (
      SELECT regexp_replace(word, '[^[:alnum:]]', '', 'g') AS t
      FROM unnest(regexp_split_to_array(lower(trim(${q})), '[[:space:]]+')) AS word
    ) tokens
    WHERE t <> ''
  ))`;
}

/**
 * A `tsvector @@ to_tsquery(...)` prefix-match condition for the WHERE clause.
 */
export function ftsMatch(q: string): SQL {
  return sql`${files.searchVector} @@ ${prefixTsQuery(q)}`;
}

/**
 * Relevance score (ts_rank) for ORDER BY. Higher = more relevant.
 * Pair with ftsMatch so only matching rows are ranked.
 */
export function ftsRank(q: string): SQL<number> {
  return sql<number>`ts_rank(${files.searchVector}, ${prefixTsQuery(q)})`;
}
