# Formulate Pro — Project Memory

Tablet formulation calculator for nutraceutical manufacturing. Used by operators making products and by client companies requesting them. Next.js 14 App Router + TypeScript, rebuilt from an HTML prototype to add real reactive state and AI-assisted verification.

## Source of Truth

- `formulate-pro-engine/` (moved into `lib/calc-engine/`) is the tested calculation engine. Do not rewrite its math logic without explicit instruction. Passing test suite, 47 tests at last check across `lib/calc-engine/tests/`, `lib/arithmetic.test.ts`, and `lib/aiVerification.test.ts` (`npm test`) — run before and after any change that touches calculation or AI-verification code.
- `reference/prototype.html` shows the original intended visual design/layout only. It is not a source of truth for math or data flow.
- `app/api/ai/verify/route.ts` is a thin Next.js handler only — Next.js route files may only export route handlers, so it can't hold business logic. The actual model↔tool conversation loop, system prompt, and integrity gate live in `lib/aiVerification.ts`; the calculator tool's expression evaluator (real deterministic arithmetic, no `eval`) lives in `lib/arithmetic.ts`. Edit those, not `route.ts`, for verification logic changes.

## Domain Rules — Ingredient Architecture

- A formulation is a list of ingredients. Exactly one ingredient has role `"active"`. Exactly one ingredient has role `"calculatedByDifference"` (the filler — defaults to Emdex). All other ingredients carry fixed percentages.
- The architecture must support any number of ingredients, not just the original 4-ingredient default. Real production formulations (e.g. RR77-PB9) use 5+ ingredients.
- Fresh-batch mode vs. regrind mode use different math — this distinction caused a real production-blocking bug once already:
  - **Regrind mode:** raw material potency percentage = the active ingredient's percentage of the blend directly.
  - **Fresh-batch mode:** blend percentage must be derived from potency + target mg/tablet + target tablet weight. It is NOT the same as raw potency percentage. Any change to fresh-batch calculation must be validated against a known-correct production sheet before being trusted.
- Known-good validation case (RR77-PB9, default 5-ingredient formulation — PVPP XL 5%, Magnesium stearate 2%, EZTAB 10% — at potency 76.4%, target 60mg/tablet, target weight 0.69g, 10,887 tablets): 855.00g active, 5,379.98g Emdex, 375.60g PVPP XL, 150.24g Magnesium stearate, 751.20g EZTAB, total 7,512.03g. Verified directly against `calculateFreshBatch` on 2026-07-13 and matches `lib/calc-engine/tests/calcEngine.test.ts`. (An earlier version of this note had different Emdex/PVPP XL/Magnesium stearate figures — those were wrong, presumably transcribed from a formulation with different excipient percentages; corrected here.) Use this to sanity-check any engine changes.
- Regrind mode has a real-formulation validation pass still pending (waiting on a colleague's regrind sheet) — treat regrind math as less battle-tested than fresh-batch until that lands.
- Regrind mode supports multiple lots per run (`RegrindLot[]` in `lib/calc-engine/types.ts`): each lot has its own potency, pressed weight, and powder weight; `calculateRegrind` blends `activeInOldPowderG` as the sum of each lot's `weightG × effectivePotency`, divided by the operator-entered `regroundPowderG` (which stays authoritative for all downstream math — the lot-weight sum only drives a mismatch warning, never overrides it). Single-lot behavior is proven byte-for-byte identical to the pre-multi-lot formula by regression tests in `calcEngine.test.ts` against the original golden fixtures. This blended math is new and, like single-lot regrind above, has not yet been validated against a real (ideally multi-lot) production sheet — added 2026-07-14, still pending that validation.

## AI Verification Layer — Integrity Rules

- AI math verification must never perform arithmetic in free-form token generation. It must go through a genuine tool-use round-trip: TypeScript computes the actual numbers server-side, feeds results back to the model, and only then can the model conclude "confirmed" or "discrepancy."
- There is an integrity gate that rejects any AI response containing a reported number that doesn't trace back to an actual tool output. Don't loosen or bypass this gate for convenience.
- Verification UX is two-tier: sub-threshold floating-point noise auto-confirms; real discrepancies require explicit human "Reviewed, proceeding" acknowledgment, logged to an audit trail, with save blocked until acknowledged.

## Secrets & Environment

- Anthropic API key lives in `.env.local`, which is gitignored (`.env*.local` pattern) — confirmed not tracked. `.env` (DATABASE_URL only, not a secret) was previously tracked in git despite not matching the old gitignore pattern; it's now untracked and `.env` was added to `.gitignore`. Verify this is actually the case before committing — don't assume.
- Persistence is Prisma + SQLite (not Supabase). Revisit this only if the project needs true multi-device/remote access (e.g. client companies submitting requests remotely) — don't migrate prematurely.

## Working Style / Process

- Commit after each verified milestone, not in large batches — e.g. engine move, UI wiring, persistence layer, each Phase 4 sub-piece (verification round-trip, integrity gate) as separate commits. This project has already had two real bugs (fresh-batch math, false-positive AI verification) where clean commit history would have made isolating the cause easier.
- Validate against real production data before trusting new output — don't rely on unit tests alone for anything touching the calc engine.
- Test both happy paths and failure modes manually before considering a feature done.
- The app has not yet been used for real production batches — treat that as the bar for "done," not just passing tests.

## Outstanding Items (update as these close out)

- [x] Save confirmation banner — no visual feedback currently on save (done: "Run saved" toast added)
- [ ] CSV batch import UI — backend endpoint exists at `/api/batch-history/import`, no frontend yet
- [ ] Regrind mode validation pass — pending a real regrind formulation sheet, now ideally multi-lot since multi-lot blending shipped 2026-07-14
- [ ] Phase 4 remainder: recommendation engine, excipient suggestions layer — not yet started

## Environment Notes

Project lives at `~/Documents/formulate-pro` (moved from home directory to resolve macOS TCC permission blocking). Claude has Documents folder access granted, not Full Disk Access — keep it that way; deny unrelated permission prompts (Music, Photos, Contacts, etc.).
