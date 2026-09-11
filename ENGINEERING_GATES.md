# NahaKids Engineering Gates

NahaKids is developed under an evidence-first control loop. A feature is not considered complete because the code was written or a local screen looked correct.

## Gate 0 — Product contract

Every change must state the user outcome, the business rule, failure mode and kill criteria before implementation.

## Gate 1 — Architecture

Keep boundaries explicit:

`Parent/Creche UI -> Next.js application/API -> Neon persistence + PayFast -> generation contract/worker`

The browser never becomes the source of truth for payment, paid-game access, or durable game records.

## Gate 2 — Deterministic tests

Every core rule must have an executable test. Current gates include:

- production file/import contract checks;
- theme/gameplay invariants;
- Next.js production build;
- sprite worker tests.

## Gate 3 — Runtime smoke

Before a deployment is called green, exercise the real critical path against the deployed build. A manual UI inspection is evidence, not a substitute for the smoke path.

Critical path:

`choose theme -> upload temporary photo -> consent -> generation contract -> playable asset -> payment initiation -> verified paid record -> private game -> QR/share`

## Gate 4 — Deployment verification

Verify the exact commit deployed, the build version and critical health endpoints. Do not accept a stale deployment or a redeploy of an old SHA as evidence for a newer change.

## Gate 5 — Security/privacy

Reject biometric identification and identity matching. Temporary source photos must have bounded retention. Paid access is server-authorized. Payment state is verified by the payment provider callback, not by the browser.

## Gate 6 — Release decision

Release only when the evidence is:

- FACT — directly observed by an automated check or authoritative system;
- INFERENCE — supported by multiple checks;
- ASSUMPTION — deliberately stated and not treated as verified;
- UNKNOWN — still unverified.

No fake success states. A failed gate blocks release until fixed or explicitly waived with an owner and expiry.
