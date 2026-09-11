# NahaKids Game Factory

A NahaLabs product for turning a child-approved photo into a personalised mini-game experience.

## Launch offer

**Turn your child into their own game — R499.**

Hero package: personalised character, animations, adventure environment, playable mini-game and shareable QR/game link.

### NahaKids journey

`R499 First Game → Child Journey → R100 Chapters`

After a first game, a parent can add one-off story chapters such as a new age, outfit, sport, adventure, birthday edition, school milestone or seasonal episode for **R100**.

## Council-governed engineering

This repository uses the **Council of High Intelligence** as the decision framework for consequential product, architecture, safety and shipping choices. The project override is stored in `.council.yaml`.

Council source: `0xNyk/council-of-high-intelligence`.

For this product, the default product panel is **Torvalds + Machiavelli + Alan Watts**: ship practical software, understand the real customer incentives, and challenge whether we are solving the right problem.

## Production pipeline

`Guardian/educator consent → temporary photo intake → secure worker → character generation → sprite/animation atlas → reusable game template → web game → QR/share link → automatic source-photo deletion`

The application uses an explicit worker contract and does not report successful AI generation unless a real configured worker responds successfully.

`aldegad/sprite-gen` is the identified asset-generation foundation. It is not copied into this repository. Its canonical pipeline is `prepare → gen → extract → compose → QA`, producing transparent sprite frames and a runtime atlas/manifest.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Payment

Payfast is the checkout provider. Current packages:

- **R199 Mini** — 1 child, simple character and mini-game.
- **R499 Hero** — personalised character, animations, environment and mini-game.
- **R999 Family** — up to 4 children and expanded family experience.
- **R100 Chapter** — one additional playable chapter in a Child Journey.

Payment confirmation is server-side: the browser return page never marks an order as paid. The Payfast ITN must verify the payment before the persistent game is unlocked.

## Safety and privacy

- Guardian/authorised educator consent is required before production processing.
- No facial recognition, biometric identification or identity matching.
- Source child photos are temporary production inputs and should be deleted after generation/delivery according to the configured retention policy.
- The generated character is a stylised game asset, not an identity system.
- Parent-owned Child Journeys should use unguessable access tokens until full account authentication is introduced.
- A new photo is explicitly supplied for each new chapter; the system must never infer or identify a child from an old photo.
- Never place child photos inside JSON job manifests or logs.
