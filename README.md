# Formulate Pro

A tablet formulation calculator for nutraceutical manufacturing, used by operators making products and by client companies requesting them.

## The problem

Nutraceutical tablet manufacturing runs on a recurring calculation: given an active ingredient's potency, a target dose per tablet, a target tablet weight, and a batch size, figure out exactly how many grams of each raw material, active ingredient, filler, disintegrant, lubricant, and any other excipients, go into the batch.

That calculation has two different modes with different math:

- **Fresh-batch mode**, the blend percentage of the active ingredient has to be *derived* from potency, target mg/tablet, and target tablet weight. It is not the same number as raw potency.
- **Regrind mode**, reworking an existing reground powder, where the active ingredient's potency percentage *is* directly its percentage of the blend.

Conflating these two, or getting the arithmetic wrong under time pressure, produces a batch sheet with the wrong weights, a production-blocking error, and in this domain, one with real cost and safety implications. This project exists because that mistake has already happened once, on paper, before this tool existed.

Formulate Pro replaces the manual spreadsheet/prototype workflow with a reactive web app that:

- Handles an arbitrary number of ingredients per formulation (not just a fixed 4-ingredient template), with one active ingredient and one filler ("calculated by difference") ingredient per formulation, enforced by the calculation engine.
- Keeps fresh-batch and regrind math as distinct, explicitly tested code paths rather than one formula patched to handle both.
- Runs every batch calculation through a second, independent AI-assisted verification pass before a batch sheet is trusted. See below.
- Generates the SOP (standard operating procedure) text for a batch alongside the numbers, so the weigh sheet and the instructions come from the same source of truth.
- Persists run history so past batches can be reviewed or reused instead of re-derived from scratch.

## AI verification, and why it's structured the way it is

Handing raw ingredient weights to an LLM and asking "does this look right?" isn't good enough. Language models are not reliable at arithmetic, and a plausible-sounding wrong answer is worse than no check at all.

Instead, verification here is a genuine tool-use round trip: the actual numbers are computed server-side in TypeScript, the model is given tool access to *that same deterministic calculator* (not free-form generation) to independently re-derive the result, and only a response that traces back to real tool output can be reported as "confirmed." An integrity gate rejects any AI response containing a number that doesn't trace back to an actual tool call. Minor floating-point noise auto-confirms; real discrepancies block save until a human explicitly reviews and acknowledges them, with that acknowledgment logged.

## Stack

Next.js 14 (App Router) + TypeScript, Prisma + SQLite for persistence, Vitest for the calculation engine and verification logic test suites, Anthropic API for the verification layer.

## Status

Actively developed, not yet used for real production batches. See `CLAUDE.md` for the current state of validated vs. pending calculation modes, and outstanding work.

## Development

```
npm install
npm run dev      # start the app
npm test         # run the calc engine + AI verification test suite
```

Requires an Anthropic API key in `.env.local` for the AI verification layer to function.
