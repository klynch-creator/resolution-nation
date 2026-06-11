# Star Store Positioning Brief

**Audience:** internal — engineering, marketing, legal, app store submission, DPA negotiation.
**Decision owner:** Kaelan.
**Status:** locked. Update only with sign-off from product and legal.

## The decision

Stars are an **earned in-product reward**, never a purchasable currency. The Star Store sells **digital, in-product items only**, exchangeable only for stars. There is **no path to spend real money inside the kid-facing experience**, ever.

This positioning is the safest path through:

1. Apple Kids Category review (Guideline 1.3, no in-app purchases of consumables aimed at kids without parental gating).
2. Google Play Designed for Families program (no real-money transactions inside content rated for kids without parental controls).
3. School district concerns about anything that looks like a kid spending money in class.
4. State and federal consumer-protection scrutiny of "loot box" mechanics in apps used by children.

## How to talk about it

Wherever stars or the Star Store are described — App Store metadata, marketing site, ToS, DPA, sales decks — use this language:

### Approved phrasings

- "Stars are earned by completing learning activities."
- "The Star Store offers in-product items that students can collect by spending the stars they've earned."
- "Stars and store items have no cash value and cannot be purchased or exchanged for money."
- "There are no in-app purchases. There is no real money in Resolution Nation."

### Phrasings to avoid

- "Buy" (use "redeem" or "collect").
- "Currency" (use "stars" or "in-product reward").
- "Loot box," "pack opening," "gacha" — even if mechanically similar, the language is poisonous in a kids' context.
- "Premium store," "VIP," "subscribe to unlock items."
- "Trade with friends for real value."

## Engineering rules

- The Star Store is implemented as digital items only. No SKU is tied to any external payment processor.
- `star_transactions` has no `payment_method`, `purchase_id`, `currency`, or any field that could imply real-money exchange. (The migration 002 `spend_stars` RPC enforces this — stars only.)
- The `award_stars` RPC accepts only `'earned'` and `'bonus'` types. Bonus is gated to teachers awarding within their pods. Earned is gated to completion of a roadmap step the user owns.
- Gift sending is allowed but capped (see Phase 2 task RN-43) and visible to teachers in classroom contexts.

## App store form answers

### Apple Privacy Nutrition Labels — Purchases / Currency

- "Does your app contain in-app purchases?" → **No.**
- "Does your app use third-party advertising?" → **No.**
- Do not declare any purchase or currency data type.

### Apple Kids Category — Section 1.3

- Confirm: "No external links, no purchase opportunities, no advertising other than what Apple permits in the Kids Category."

### Google Play Data Safety

- Under "Financial info" — do not collect or share.
- Under "User-generated content" — gift messages are user-generated; declare as collected with appropriate moderation language.

## DPA language

In the data-collected schedule attached to every school DPA:

> Resolution Nation does not collect financial information. The "Star Store" is an in-product, non-monetary reward system. Stars and items have no cash value, cannot be purchased, and cannot be transferred outside the Service.

## Marketing site language

Hero / landing page (already deployed; current language is compatible):

- "Earn stars for completing goals and redeem them in the Star Store." ✓

Anywhere that adds emphasis around stars or items must include the no-money disclaimer in the same paragraph or visibly nearby.

## What changes this decision

The only path to changing this stance is a deliberate product, legal, and compliance review. Not a fundraising round, not a competitor's feature, not a teacher request. The risk profile of introducing real money into a kid-facing app is large enough that the decision has to be re-opened formally if it's ever revisited.

If real money is ever introduced (for example, parents purchasing premium content for their child outside the kid-facing experience), it must:

1. Live entirely in a separate parent-only surface (not visible to the child).
2. Be gated behind a real parental gate.
3. Be declared in App Store / Play Store metadata.
4. Be reviewed by attorney and disclosed in updated DPAs to existing customers.

Until that review happens: stars are earned, the Star Store is points-only, period.
