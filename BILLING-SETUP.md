# Index Membership / Stripe Setup

Index supports four membership tiers:

Basic: $0/month — 50 saved study sets, 50 saved notes
Gold: $4.99/month — 250 saved study sets, 250 saved notes
Platinum: $7.49/month — 500 saved study sets, 350 saved notes
Diamond: $9.99/month — 1,000 saved study sets, 500 saved notes

Diamond is displayed as BEST VALUE in the Index membership UI.

## Stripe security model

Index does not collect or store card numbers. Paid checkout is created server-side and redirects customers to Stripe Checkout. Stripe handles payment details and recurring billing.

Webhook endpoint:
  https://indexv2.jzld.onrender.com/api/billing/webhook

Webhook requests are accepted only when Stripe's signature is valid.

## Render environment variables

Add these variables to the Render service environment:
  PUBLIC_BASE_URL=https://indexv2.jzld.onrender.com
  STRIPE_SECRET_KEY=...
  STRIPE_WEBHOOK_SECRET=...
  STRIPE_GOLD_PRICE_ID=...
  STRIPE_PLATINUM_PRICE_ID=...
  STRIPE_DIAMOND_PRICE_ID=...

Never put STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET in public/index.html, GitHub source, or client-side JavaScript.

## Stripe products and prices

Create three recurring monthly prices in the authorized Stripe account:
  Gold: $4.99 USD / month
  Platinum: $7.49 USD / month
  Diamond: $9.99 USD / month
Use the resulting Stripe Price IDs as STRIPE_GOLD_PRICE_ID, STRIPE_PLATINUM_PRICE_ID, and STRIPE_DIAMOND_PRICE_ID.

## Webhook events handled

  checkout.session.completed
  customer.subscription.created
  customer.subscription.updated
  customer.subscription.deleted
  invoice.payment_failed

Paid access is derived from verified server-side membership state; browser storage cannot promote an account to Gold, Platinum, or Diamond.

## User flow

1. Sign in and open the Membership tab.
2. Choose Gold, Platinum, or Diamond.
3. Index creates a Stripe Checkout Session on the server.
4. Payment is completed on Stripe's hosted checkout page.
5. Stripe sends a signed webhook to Index.
6. Index saves the verified membership tier.
7. The user returns to Index and sees the updated plan.

## Account-owner requirement

For users under 18, Stripe's current terms require an adult representative before the account can accept payments and transfer funds. The live payment setup must therefore be completed by an authorized adult account owner.

Use Stripe test mode for initial testing before enabling live payments.