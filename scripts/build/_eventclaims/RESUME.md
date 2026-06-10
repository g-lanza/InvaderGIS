# Event-Claim Decomposition — Resume State

**Goal:** Decompose all 2,094 eligible event narratives into atomic, sourced, falsifiable
`claim` records (Track B of Priority-2 population, Competitive Audit §4B). User authorized
the FULL run with the ~1.5–3M-token cost in view (§11 checkpoint passed). Multi-session.

## How to resume (next session / next turn)

1. Recompute remaining worklist:
   ```bash
   cd Medieval-Systems/InvaderGIS   # (or repo root)
   node -e 'const fs=require("fs");const work=require("./scripts/build/_eventclaims/worklist.json");const done=new Set(fs.readdirSync("data/claims").filter(f=>/_c01\.json$/.test(f)).map(f=>f.replace(/^claim_/,"").replace(/_c01\.json$/,"")));const remaining=work.filter(id=>!done.has(id));fs.writeFileSync("scripts/build/_eventclaims/remaining.json",JSON.stringify(remaining));console.log("done:",work.length-remaining.length,"remaining:",remaining.length)'
   ```
2. Pull the next N narratives (set N to taste, ~15):
   ```bash
   node -e 'const fs=require("fs");const rem=require("./scripts/build/_eventclaims/remaining.json");const b=rem.slice(0,15).map(id=>{const e=JSON.parse(fs.readFileSync("data/events/"+id+".json","utf8"));return {id,year:e.year,entity:e.entity,summary:e.summary}});fs.writeFileSync("scripts/build/_eventclaims/_next_narratives.json",JSON.stringify(b,null,2));b.forEach(e=>console.log("\n["+e.id+"] y"+e.year+" entity="+e.entity+"\n"+e.summary))'
   ```
3. READ those narratives. Hand-extract atomic claims into `batch-NNN.json` (shape below).
   Rules: one falsifiable assertion per claim; subject_ids MUST be real entity ids; DROP
   sub-assertions whose subject isn't an entity in our set (no fabrication). Citations are
   inherited automatically by the writer from the event's provenance (resolved → sources_used,
   missing → unresolved_sources).
4. Write: `node scripts/build/write-event-claims.mjs scripts/build/_eventclaims/batch-NNN.json --write`
5. Every ~10 batches: `npm run typecheck` and `node scripts/build/bake-manifests.mjs`.

## Batch file shape
```json
[ { "derived_from": "<event_id>",
    "claims": [ { "statement": "one falsifiable assertion.", "subject_ids": ["real_entity_id"] } ] } ]
```

## Realness invariants (the writer enforces; you uphold during extraction)
- Subject ids validated against data/entities/ — unknown → rejected.
- Provenance inherited from the event; resolved vs unresolved source ids split.
- An event with NO resolving source → all its claims rejected (no dead-link citations).
- Reversible: each --write run emits data/_audit/write-event-claims-<ts>.json; --revert deletes exactly those.
- Idempotent/resumable: existing claim_<id>_cNN.json files are skipped.

## Progress log
- batch-001: 3 events → 9 claims (proof)
- batch-002: 15 events → 37 claims
- batch-003: 15 events → 30 claims
- batch-004: 15 events → 33 claims
- batch-005: 15 events → 31 claims
- batch-006: 15 events → 29 claims
- batch-007: 15 events → 32 claims
- batch-008: 15 events → 29 claims
- batch-009: 15 events → 27 claims
- batch-010: 15 events → 29 claims
- batch-011: 15 events → 27 claims
- batch-012: 15 events → 30 claims
- batch-013: 15 events → 27 claims
- batch-014: 15 events → 30 claims
- (append each batch here: batch-NNN: <events> events → <claims> claims)

## Totals checkpoint (2026-06-03, waves 3-5 via file-writing fleet)
- events done: 948 (45%) | TOTAL claims: 2,962 | typecheck green, baked
- REMAINING: 1,146 events (~8 waves). Next wave dir = wave6. Method: subagents WRITE own out-N.json.
- All reversible: data/_audit/write-event-claims-*.json
