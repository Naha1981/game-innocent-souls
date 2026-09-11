# NahaKids Game Factory

A NahaLabs prototype for turning a child-approved photo into a personalised mini-game experience.

## Current demo

The first vertical slice is intentionally browser-first so it can be demonstrated at a creche without a game-engine installation:

`child name + photo + guardian/teacher consent → adventure selection → playable-preview state`

The photo is processed locally in the browser in this prototype; it is not uploaded to a server.

## Product direction

Production pipeline:

`Consent → temporary photo intake → character generation → sprite/animation atlas → reusable game template → web game → QR/share link → automatic photo deletion`

`aldegad/sprite-gen` is the asset-generation foundation we identified earlier. It is not copied into this application repository; we will integrate its workflow behind the character-generation service when the backend is added.

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
