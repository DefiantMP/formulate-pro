# Formulate Pro — Calc Engine (Phase 1)

Standalone, framework-free TypeScript port of the prototype's fresh-batch and
regrind math. No UI, no DB, no AI — just the deterministic calculations,
generalized to a configurable ingredient list instead of 4 hardcoded fields.

## Files

- `src/types.ts` — ingredient/formulation/result types
- `src/defaultFormulation.ts` — the default 4-ingredient setup (7-OH, Emdex, PVPP XL, MagSter)
- `src/calcEngine.ts` — `calculateFreshBatch`, `calculateRegrind`, `generateVarianceTable`
- `src/sopGenerator.ts` — SOP step generation, ingredient-name-driven instead of hardcoded strings
- `tests/calcEngine.test.ts` — 23 tests proving byte-parity against the prototype's actual output
- `golden-gen.js` / `golden-values.json` — the exact original prototype logic, run standalone, used to generate the reference values the tests check against

## Run it

```
npm install
npm test        # runs the 23 parity tests
npm run build    # strict TS compile check
```

## Design notes

- Exactly one ingredient must have `role: 'active'`, and exactly one must have
  `calculatedByDifference: true` (that's Emdex today — the filler that absorbs
  whatever % of the blend the other ingredients don't use). The engine throws
  a clear error if either rule is violated, rather than silently computing
  wrong grams.
- Regrind math intentionally does NOT touch lubricant/disintegrant — those are
  assumed already homogeneously present in the reground powder, same as the
  original. `alreadyPresentIngredientNames` drives the SOP warning text.
- Known gap preserved from the prototype (not fixed here, flagged for the
  Phase 4 AI verification layer): in fresh-batch mode, `targetActiveMgPerTablet`
  is stored and displayed but never cross-checked against the potency/blend
  math. The active ingredient's % of blend and the target mg/tablet are
  independent inputs today.

## Next (Phase 2)

Wire this into a Next.js UI with React state driving the inputs, replacing
the prototype's manual DOM writes.
