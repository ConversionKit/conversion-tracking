# Converly server SDK (`@converly/sdk-node`)

Contents: when this is the right path · the two halves · install · the result union as a diagnostic table · the silent failure · limits

For conversions **only the backend knows about**. A SaaS signup, an account created, a
trial started, a lead a custom API received. There is no browser event to detect, so
loader-only detection cannot work and no GTM recipe in this repo applies.

**Not for ecommerce purchases.** Those route to Tracklution or Stape regardless of how the
store was built, including bespoke checkouts. See `server-side-options.md`.

If the conversion *is* visible in the browser, use the loader's automatic detection or a
snippet from `snippets/` instead. This package is more work, so only reach for it when the
moment genuinely lives server-side.

## The two halves, which is the whole design

A server-only conversion has no click ID. The gclid landed in the browser; your backend
never saw it. The SDK closes that gap in two parts:

1. **Browser half.** The Converly loader writes a short-lived `cnv_signup_correlation`
   cookie holding a random token, and snapshots the click IDs, Meta cookies, IP and user
   agent against it. This only happens on a page marked as a conversion surface.
2. **Server half.** Your code reads that cookie, calls `completeSignup`, and Converly pairs
   the two, firing at full match quality.

**Both halves are required.** This is a two-part install, in the same family as the Pardot
pattern in `tool-coverage.md`, not a server-only drop-in.

## Install

```sh
npm install @converly/sdk-node
```

Node 18+ for global `fetch`. Zero runtime dependencies. TypeScript types ship with it and
are the real documentation.

**Mark the conversion surface in the browser**, or the correlation cookie never exists:

```html
<form data-converly-signup-intent>...</form>
```

There is a JS equivalent for SPA route changes and SSO buttons where no form element exists.

**Three values from the dashboard:** `siteKey`, `triggerKey`, and `webhookSecret`.

The `webhookSecret` is a real secret. It signs every request, is environment-specific, and
must never reach the browser. Have the user put it in their own environment variables. Do
not ask them to paste it into a chat, and do not write it into a file yourself.

## The result union is your diagnostic table

`completeSignup` returns a discriminated union rather than throwing. Switch on it. Each
variant is a distinct diagnosis, which makes this the fastest debugging surface Converly has.

| Result | Means | What to do |
|---|---|---|
| `Promoted` | Fired with the browser half attached. Full match quality | Nothing. This is success |
| `PromotedUncorrelated` | Fired, but with **no browser half**. No click ID, so the ad platform cannot attribute it | **Treat as a failure even though it says promoted.** See below |
| `AwaitingBrowserHalf` | Server call arrived before the browser snapshot | Usually transient. Persistent means the browser half is not firing |
| `NoMatchingFlows` | No published flow matches this `triggerKey` | Check the key against the dashboard, and check the flow is published |
| `NoPromotion` | Matched a flow, but it did not promote | Check the flow's conditions |
| `SkippedUncorrelated` | Deliberately skipped for having no correlation token | Expected if you opted into skipping. Otherwise fix the browser half |
| `Unknown` | Unrecognised response | Log it and check the package is current |

`completeSignup` never throws into your handler. A Converly outage degrades to "conversion
not fired", it does not break the signup. The `Converly*Error` classes exist for
configuration and validation problems you should catch during development.

## The silent failure to check for first

**Someone installs the SDK, skips the browser half, and every call returns
`PromotedUncorrelated`.** Conversions appear in Converly. Logs look healthy. Nothing
attributes to any campaign, because there is no click ID attached to any of it.

This is the single most likely way an SDK integration goes wrong, and it looks like success
from every angle. When auditing an SDK integration, check this before anything else:

1. Ask what `completeSignup` returns in production, or have them log the result variant.
2. A steady stream of `PromotedUncorrelated` means the browser half is missing. Check the
   loader is installed on the marketing site **and** that the conversion surface carries
   `data-converly-signup-intent` or the JS equivalent.
3. A mix of `Promoted` and `PromotedUncorrelated` is normal. Some traffic genuinely arrives
   without a prior browser session, for example a signup completed on a different device.

## Limits worth stating up front

- **The method is called `completeSignup` but reports any conversion.** Historical naming.
  For a lead use it identically with a `customer_event_id` like `lead_${submission.id}`.
  Do not conclude the package is signup-only.
- **The loader still has to be on the marketing site**, not just the app. The click lands on
  the marketing page, so that is where the signals are captured.
- **Node only.** Other backends call the webhook endpoint directly, signing an HMAC-SHA256
  over the exact request bytes. The SDK's job is that signing plus the retry behaviour, both
  of which are reimplementable.
- **`customer_event_id` is how deduplication works.** Make it stable and unique per
  conversion. A reused value suppresses later real conversions as duplicates; a random one
  per call defeats deduplication entirely.
