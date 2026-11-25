/**
 * Translate the API's `NO_SAFE_ROUTE` reasons (HERE notice titles) into driver words
 * (BR-31 §5.2). Titles are generic and may change wording, so they are matched by keyword,
 * de-duplicated by kind, ordered by priority, and capped at three rows.
 *
 * Driver copy never comes from translating a HERE title at runtime: every string is from
 * the table below.
 */
export type ReasonKind =
  | 'hazmat'
  | 'tunnel'
  | 'height'
  | 'weight'
  | 'length'
  | 'width'
  | 'closure'
  | 'zone'
  | 'unknown-vehicle'
  | 'unknown';

interface Rule {
  kind: ReasonKind;
  keywords: string[];
  text: string;
}

/** In priority order (§5.2). */
const RULES: Rule[] = [
  { kind: 'hazmat', keywords: ['hazardous', 'hazmat', 'dangerous goods'], text: "Your hazmat load isn't allowed on a road you'd need to use" },
  { kind: 'tunnel', keywords: ['tunnel'], text: 'A tunnel on the way is closed to your load' },
  { kind: 'height', keywords: ['height', 'clearance', 'bridge'], text: 'A bridge or overpass is too low for your truck' },
  { kind: 'weight', keywords: ['weight', 'axle'], text: 'A road on the way has a weight limit below your truck' },
  { kind: 'length', keywords: ['length'], text: "A road on the way doesn't allow trucks your length" },
  { kind: 'width', keywords: ['width'], text: 'A road on the way is too narrow for your truck' },
  { kind: 'closure', keywords: ['blocked', 'closed', 'closure'], text: "A road you'd need is closed" },
  { kind: 'zone', keywords: ['zone', 'environmental', 'restricted area'], text: 'The destination is in an area closed to your truck' },
  {
    kind: 'unknown-vehicle',
    keywords: ['vehicle restriction'],
    text: "A road on every route has a limit your truck doesn't meet (height, weight, length, or hazmat).",
  },
];

const UNKNOWN: Rule = { kind: 'unknown', keywords: [], text: "We couldn't find a road your truck is allowed on." };
const HAZMAT_MAYBE: ReasonRow = { kind: 'hazmat', text: 'Your hazmat load may be the reason.' };
const MAX_ROWS = 3;

export interface ReasonRow {
  kind: ReasonKind;
  text: string;
}

export interface MappedReasons {
  rows: ReasonRow[];
  /** Rows beyond the first three ("+N more"). */
  more: number;
  /** Reason strings no rule matched (titles only, never location): for `route_reason_unmapped`. */
  unmapped: string[];
}

export function mapReasons(reasons: readonly string[], profileHasHazmat: boolean): MappedReasons {
  const kinds = new Set<ReasonKind>();
  const unmapped: string[] = [];
  for (const reason of reasons) {
    const lower = reason.toLowerCase();
    const rule = RULES.find((r) => r.keywords.some((k) => lower.includes(k)));
    if (rule) kinds.add(rule.kind);
    else unmapped.push(reason);
  }
  const matched = [...RULES, UNKNOWN].filter((r) => kinds.has(r.kind));
  let rows: ReasonRow[] = matched.map(({ kind, text }) => ({ kind, text }));
  if (rows.length === 0) rows = [{ kind: UNKNOWN.kind, text: UNKNOWN.text }];

  // Only generic rows and a hazmat profile: hazmat is the most frequent hidden cause.
  const onlyGeneric = rows.every((r) => r.kind === 'unknown' || r.kind === 'unknown-vehicle');
  if (onlyGeneric && profileHasHazmat) rows = [...rows, HAZMAT_MAYBE];

  return { rows: rows.slice(0, MAX_ROWS), more: Math.max(0, rows.length - MAX_ROWS), unmapped };
}
