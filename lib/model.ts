// Token Radar: the value model.
//
// One sealed snapshot of the protocol universe in, one ranked board out.
// The board ranks every pre-token protocol the snapshot's own rule leaves
// rankable (the 40-protocol watchlist is the floor, never the ceiling),
// by an implied value that is computed from the snapshot itself — never
// from a hand-written list of names.
//
// The model, in one line:
//
//   implied = TVL x category multiple x growth multiplier x maturity multiplier
//
// The category multiple is the market's own: for each category it is the
// median market-cap-to-TVL ratio of the live-token protocols in that
// category, winsorised at the 90th percentile of all live ratios and then
// shrunk toward the market-wide median so a category with only one or two
// live comps does not swing the board. A protocol's growth multiplier
// comes from its seven-day TVL change, and its maturity multiplier from
// how long DefiLlama has tracked it with no token.
// Every protocol is scored by the same function, and the dashboard
// prints the calibration table the model was fitted on, so a reader can
// check the arithmetic row by row.

/** One protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, printed on the dashboard next to the formula. */
export interface ModelConstants {
  /** Weight of a category's own median against the market-wide median. */
  shrink_prior: number;
  /** Weight of the seven-day TVL change in the growth multiplier. */
  growth_weight: number;
  /** Seven-day change is clamped to this floor, in per cent. */
  growth_floor: number;
  /** Seven-day change is clamped to this cap, in per cent. */
  growth_cap: number;
  /** Maturity multiplier at age zero. */
  maturity_floor: number;
  /** Maturity multiplier's rise over the maturity window. */
  maturity_range: number;
  /** Days of age the maturity multiplier takes to reach its top. */
  maturity_days: number;
  /** Age in days assumed when DefiLlama reports no listing date. */
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  shrink_prior: 5,
  growth_weight: 0.4,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.75,
  maturity_range: 0.25,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** One category's calibration: what live-token protocols in it trade at. */
export interface CategoryMultiple {
  category: string;
  /** Live-token protocols in the category that carry a market cap and a TVL. */
  n: number;
  /** Median market-cap-to-TVL of those protocols. */
  median: number;
  /** The multiple the model applies, shrunk toward the market-wide median. */
  multiple: number;
}

/** The calibration the model was fitted on, from the snapshot alone. */
export interface Calibration {
  /** Median market-cap-to-TVL across every live-token protocol. */
  global_median: number;
  /** Live-token protocols counted. */
  live_count: number;
  /** The winsorising cap: the 90th percentile of the live ratios. */
  winsor_cap: number;
  /** One row per category with at least one live comp. */
  by_category: CategoryMultiple[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_live_n: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  /** Its market cap divided by its TVL, the ratio the model is fitted on. */
  mcap_per_tvl: number | null;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  live_size: number;
  calibration: Calibration;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whole words that mark a wrapped or staked product of another protocol's token. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Exchange names a protocol must not begin with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Categories the watchlist rule keeps out as wrapped, staked or bridged products. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category === 'CEX') return false;
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/**
 * Fit the category multiples on the snapshot's live-token protocols.
 * Each category's multiple is its median market-cap-to-TVL, shrunk toward
 * the market-wide median with a prior of `model.shrink_prior` protocols,
 * so a thin category does not decide a ranking on its own. Ratios are
 * winsorised at their 90th percentile first: a small protocol whose token
 * trades at hundreds of times its TVL is a quirk of its size, not a
 * category's going rate, and one such protocol must not set a whole
 * category's multiple.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedian = ratios.length > 0 ? median(ratios) : 0.2;
  const sorted = [...ratios].sort((a, b) => a - b);
  const winsorCap = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(0.9 * sorted.length))]! : globalMedian;
  const winsor = (r: number): number => Math.min(r, winsorCap);
  const byName = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorised';
    const list = byName.get(key);
    if (list === undefined) byName.set(key, [winsor(p.mcap_usd! / p.tvl_usd)]);
    else list.push(winsor(p.mcap_usd! / p.tvl_usd));
  }
  const byCategory: CategoryMultiple[] = [...byName.entries()]
    .map(([category, values]) => {
      const med = median(values);
      const n = values.length;
      const multiple = (n * med + model.shrink_prior * globalMedian) / (n + model.shrink_prior);
      return { category, n, median: Math.round(med * 1e4) / 1e4, multiple: Math.round(multiple * 1e4) / 1e4 };
    })
    .sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  return {
    global_median: Math.round(globalMedian * 1e4) / 1e4,
    live_count: live.length,
    winsor_cap: Math.round(winsorCap * 1e4) / 1e4,
    by_category: byCategory,
  };
}

/** The category multiple a protocol's category carries, else the market-wide median. */
export function categoryMultiple(category: string | null, calibration: Calibration): { multiple: number; live_n: number } {
  const row = calibration.by_category.find((c) => c.category === (category ?? 'Uncategorised'));
  if (row === undefined) return { multiple: calibration.global_median, live_n: 0 };
  return { multiple: row.multiple, live_n: row.n };
}

/** The three multipliers and the implied value one protocol gets under the model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; live_n: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, live_n } = categoryMultiple(protocol.category, calibration);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, multiple, live_n, growthPct, growthMult, maturityMult, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, calibration: Calibration, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot
  // no longer carries (it cannot, but coverage is the gate's row and is
  // never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, below the
  // floor or above it, that the watchlist's own rule left out. No cap:
  // a board that stops early hides the protocols the radar exists to find.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.multiple,
      category_live_n: s.live_n,
      growth_pct: s.growthPct,
      growth_multiplier: Math.round(s.growthMult * 1e4) / 1e4,
      maturity_multiplier: Math.round(s.maturityMult * 1e4) / 1e4,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol's own page before you move it.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Lend $${capital} of USDC on ${name} (${chain}) and leave the deposit earning.`;
  }
  if (c.includes('dex') || c.includes('amm')) {
    return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and hold the LP tokens.`;
  }
  if (c.includes('yield')) {
    return `Deposit $${capital} of USDC into ${name}'s largest vault on ${chain} and keep the shares.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as collateral on ${name} and open one small hedged position.`;
  }
  if (c.includes('rwa') || c.includes('real world')) {
    return `Buy $${capital} of ${name}'s yield-bearing token on ${chain} and hold it in your wallet.`;
  }
  if (c.includes('stak')) {
    return `Stake $${capital} of the chain asset through ${name} and keep the receipt token.`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC to ${chain} with ${name} and put the bridged funds to work in its app.`;
  }
  if (c.includes('prediction') || c.includes('betting')) {
    return `Fund your ${name} account with $${capital} and take one small position in an open market.`;
  }
  if (c.includes('stable')) {
    return `Mint or hold $${capital} of ${name}'s stable asset on ${chain}.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and use its main feature once.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains,
 * TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Open a fresh wallet for this farm only, fund it with exactly $${capital}, and store its seed phrase offline on paper, never in a screenshot or a chat.`,
      cost: 'about $2 of gas to fund it',
      time: '10 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 200 ? 10 : 5} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one small qualifying action every week, a swap, a deposit, a vote or a claim, so the wallet shows steady use rather than a single burst.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own rewards or points page from its official site and claim only through the link it publishes, never through a link in a message or a search ad.`,
      cost: 'nothing to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the dates and every transaction hash in a farm notebook, so you can repeat the position, unwind it, or prove it later.`,
      cost: 'nothing but the notebook',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's market view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_per_tvl: p.tvl_usd > 0 && p.mcap_usd !== null ? Math.round((p.mcap_usd / p.tvl_usd) * 1e4) / 1e4 : null,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData; calibration: Calibration } {
  const calibration = calibrate(snapshot, model);
  const board = buildBoard(snapshot, calibration, model);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist: [...snapshot.watchlist],
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    calibration,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar, calibration };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
    return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
