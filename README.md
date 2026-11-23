# Token Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/flytosky777/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/flytosky777/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)


A token launch radar for make.fun's `token-radar-01` bounty ($1,325).
It reads a sealed snapshot of every protocol DefiLlama tracks, finds the
ones that record no token, ranks them by an implied value worked out from
the snapshot's own figures, and shows a reader how to farm each one.

## The model

```
implied value = TVL × category multiple × growth multiplier × maturity multiplier
```

- **Category multiple** — for each category, the median market-cap-to-TVL
  ratio of its live-token protocols, shrunk toward the market-wide median
  with a prior of 5 protocols, so a thin category cannot decide a ranking
  on its own. The multiples are fitted on the snapshot itself; no protocol
  name is ever special-cased.
- **Growth multiplier** — 1 + (seven-day TVL change, clamped to −50%…+100%) × 0.4.
- **Maturity multiplier** — 0.75 + 0.25 × (days listed, capped at 1,095) ÷ 1,095.

The board ranks all 198 rankable pre-token protocols: the 40 on the
snapshot's watchlist, plus 158 more the watchlist leaves out. Every row
carries a six-step farm plan with costs and times. The 24 largest
live-token protocols are shown separately, as the market the model is
fitted on — never ranked as if they were still to come.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

`main.ts` (Node 22, standard library only) writes `board.json`,
`data.js`, `dashboard/` and `screenshots/` to the output directory, and
`dossier.json` — the summary the judge reads — with the vendored
`vendor/makefun-board.ts` library. Open `out/dashboard/index.html` in a
browser; it renders with no network.

Three addresses, one page — the three screenshots:

- board: `dashboard/index.html`
- a protocol's detail view: `dashboard/index.html#/protocol/<slug>`
- a filtered view: `dashboard/index.html#/filter/category=Dexs`

## What it does not claim

The implied value is this entry's own claim, worked out from the
snapshot's figures. It is not a prediction that a token will be issued,
or when. "Records no token" means DefiLlama's record carries no market
cap, CoinGecko id or symbol — a fact about the record, not proof the
protocol has no token.
