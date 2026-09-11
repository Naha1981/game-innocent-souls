# NahaKids launch checklist

## Sell tomorrow

Offer: **Turn your child into their own game — R499.**

Hero package includes a personalised character, animations, an adventure, a playable mini-game and a shareable game/QR link after verified payment.

### Sales script

> Hi 👋 I’m testing something new in Soweto: we turn a child’s photo into their own little game. They choose Street Football, Superhero, Speed Racer or Space Explorer. The first game is R499. Want to see a demo?

## Production truth

The app is ready for real customer generation only when a real sprite-generation worker is configured and reachable. Never sell a fake generation result as production AI generation.

## Required production configuration

- `DATABASE_URL`
- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_PASSPHRASE`
- `PAYFAST_SANDBOX=false` for production payments
- `NEXT_PUBLIC_APP_URL` set to the actual public domain
- `SPRITE_GEN_WORKER_URL`
- `SPRITE_GEN_WORKER_SECRET`

Run the Drizzle migrations against the production Neon database before accepting payments.

## First sales target

Do not wait for subscriptions or a full parent account system. Close the first 3–5 R499 games manually, learn what parents love, then expand the Child Journey and R100 chapter system.
