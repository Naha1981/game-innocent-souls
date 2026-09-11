# NahaKids Game Factory

A NahaLabs prototype for turning a child-approved photo into a personalised mini-game experience.

## Council-governed engineering

This repository uses the **Council of High Intelligence** as the decision framework for consequential product, architecture, safety and shipping choices. The project override is stored in `.council.yaml`.

Council source: `0xNyk/council-of-high-intelligence`.

For this product, the default product panel is **Torvalds + Machiavelli + Alan Watts**: ship practical software, understand the real customer incentives, and challenge whether we are solving the right problem.

## Current demo

The first vertical slice is intentionally browser-first so it can be demonstrated at a creche without a game-engine installation:

`child name + photo + guardian/teacher consent → adventure selection → playable-preview state`

The photo is processed locally in the browser in this prototype; it is not uploaded to a server.

## Product direction

Production pipeline:

`Consent → temporary photo intake → character generation → sprite/animation atlas → reusable game template → web game → QR/share link → automatic photo deletion`

`aldegad/sprite-gen` is the asset-generation foundation identified for this product. It is not copied into this application repository; its workflow will sit behind the character-generation service.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Safety principles

- Guardian/authorised educator consent before production processing.
- No facial recognition or biometric identification.
- Child photos should be temporary and deleted after production delivery.
- The generated character should be a stylised game asset, not an identity system.
- Production storage and retention rules must be explicit and auditable.
- Never claim that an AI generation step happened when the prototype is using a placeholder.
