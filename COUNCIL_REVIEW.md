# Council Review — NahaKids v0.1 launch architecture

This review applies the project decision protocol used for hardened production systems. It is a structured Council-style review, not a claim that external model providers were queried.

## Independent positions

### Linus / systems integrity

Do not hide integration defects behind UI work. The previous Vercel failure was an architecture/configuration discovery failure: the deployed SHA was stale and `@/*` resolution was not contract-tested. The repository must carry executable checks for those assumptions.

### Feynman / falsifiability

A successful browser screenshot proves very little. Each important claim needs a test that can fail for the real reason. The CI gate therefore executes contract checks, game-rule tests and production builds across Node versions.

### Socrates / assumptions

Question the unverified parts: real sprite provider availability, PayFast callback reachability, Neon production schema, and temporary photo deletion. These remain release gates rather than silently assumed capabilities.

### Machiavelli / commercial reality

Do not expand Child Journey, subscriptions or a large account system before proving the R499 hero transaction. The first commercial objective is reliable delivery of one paid game and a shareable result.

### Alan Watts / complexity control

Do not turn an R499 neighborhood product into an over-engineered platform. Add infrastructure only when an observed failure or a measurable product need demands it.

### Torvalds / engineering discipline

Prefer small, reviewable commits and deterministic interfaces. Generation is a contract boundary, not a place for ad-hoc coupling between the UI and provider implementation.

## Decision

1. Keep Next.js + Neon + PayFast as the current core architecture.
2. Keep the Python sprite worker as an implementation behind a stable generation contract; do not deploy another platform until testing proves Vercel insufficient.
3. Make CI the first line of defense: contract -> unit -> build -> worker.
4. Add browser smoke only after the deterministic gates are green, using explicit DOM polling and failure diagnostics rather than arbitrary sleep-based assertions.
5. Recreate Vercel only after GitHub main is green; deployment must be tied to the exact current SHA and verified after deployment.
6. Treat payment verification, paid-game authorization and privacy deletion as security invariants.

## Kill criteria

Stop feature development and fix the gate if any of these occur:

- production builds differ from CI;
- deployed SHA differs from the intended main SHA;
- payment can create a paid game without verified ITN/callback state;
- an unpaid game is publicly retrievable;
- a source photo survives past its retention boundary;
- generation returns an asset that is not playable under the runtime manifest;
- tests pass by relying on arbitrary sleeps or fake success fixtures.

## Next engineering target

Build the real end-to-end browser smoke harness around the current public flow, with deterministic network interception for the generation boundary and real verification of checkout/payment state transitions. Then recreate Vercel from the now-protected `main` branch.
