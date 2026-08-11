# Google Ads Conversion Tracking Failure Modes - Diagnostic Reference (Lead-Gen Focus)

Compiled August 2026 from Google Ads Help documentation, practitioner blogs (Analytics Mania, Adalysis, Adnan Agic, PPC Land, Cometly, TagFly, Elevar, ConversionTracking.io), and community threads.

**Fix assets.** From-zero setup steps live in `setup-google-ads.md`. Missing or wrong triggers are usually fixed by this repo's tested assets: `../snippets/`, `../recipes/gtm/`, merged and ID-injected by `../scripts/build_recipe.py`.

## Part 1: Diagnostic Surfaces (check these first, in this order)

### 1.1 Conversion action status - Goals > Conversions > Summary

The "Status" column per conversion action is the single highest-value diagnostic signal:

| Status | Meaning | Implication |
|---|---|---|
| **Unverified** | Google has never seen the tag fire for this action. Normal for a few hours (up to 48h) after setup; if it persists for days, the tag was never installed, has the wrong ID/label, or fires on a page nobody visits | Broken setup - tag never fired once |
| **Recording conversions** | Tag seen and conversions recorded in last 7 days | Healthy |
| **No recent conversions** | Tag IS detected, but zero conversions in last 7 days | Tag works; either no conversions actually happened, low volume, or the event snippet page is unreachable. Not necessarily broken |
| **Tag inactive** / **Inactive** | Google no longer sees the tag AND no conversions in 7 days. UI shows last-detected date and last-conversion date | Tag was removed/broken on a specific date - correlate with site redesigns, GTM publishes, plugin updates |
| **Needs attention** | Active but has errors (commonly enhanced-conversions data problems) | Partially working; open Diagnostics |
| **Removed** | Conversion action deleted/disabled in the account | Re-enable the action |

The **last detected date** on Tag inactive dates the breakage - ask "what changed on the site/GTM/plugins on that date?"

### 1.2 Built-in Troubleshoot flow / Tag Assistant
Hovering an "Unverified"/"Tag inactive"/"Needs attention" status shows a **Troubleshoot** link that launches Google Tag Assistant (tagassistant.google.com).

### 1.3 Diagnostics tab (enhanced conversions)
Goals > Summary > Diagnostics: grades Excellent / Good / Needs attention / No recent data / Urgent, plus alerts (missing user_data fields, formatting errors, low match rate).

### 1.4 Auto-tagging setting
Admin > Account settings > Auto-tagging - must be ON for gclid attribution and any offline/CRM import.

### 1.5 Other account-level surfaces
- "Maintain your Google tag" - surfaces "Website redirects are losing click data" warning
- Conversion action settings: count (One/Every), click-through window (default 30d), attribution model, Primary/Secondary
- Segment > Conversions > Conversion action on campaign tables - reveals WHICH action generated the numbers (catches double counting)
- "by conv. time" columns - conversions are otherwise reported against click date, not conversion date

## Part 2: Tag anatomy

### 2.1 Google tag (gtag.js)
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'AW-XXXXXXXXXX');
</script>
```
IDs: `AW-` Google Ads, `G-` GA4, `GTM-` container, `DC-` Floodlight. A page with only `G-`/`GTM-` can still work if Ads conversions run through GTM - check container contents before declaring missing.

### 2.2 Event snippet
```html
gtag('event', 'conversion', {'send_to': 'AW-XXXXXXXXXX/AbCdEfGhIj0123456789', 'value': 0.0, 'currency': 'USD'});
```
`send_to` = `AW-CONVERSION_ID/CONVERSION_LABEL`. Google offers "page load" (thank-you page) or "click" (`gtag_report_conversion(url)`) variants.

### 2.3 GTM pattern
`GTM-XXXXXXX` snippet in head + noscript iframe. Inside: a Google Ads Conversion Tracking tag (ID + Label) plus a Conversion Linker tag on All Pages.

### 2.4 Network requests that prove a conversion fired
- Classic ping: `googleadservices.com/pagead/conversion/{ID}/?...label={LABEL}`
- Consent-aware paths: `google.com/pagead/1p-conversion/...` and `.../ccm/collect`
- `gcs` param encodes consent (`G111` granted, `G100` denied); `gcd` = Consent Mode v2 state. `gcs=G100` on the ping = conversion modeled at best, not recorded.

### 2.5 gclid lifecycle
1. Auto-tagging appends `?gclid=` at click time (iOS/privacy contexts use `gbraid`/`wbraid`)
2. gclid must survive every redirect to the tagged page
3. Google tag / Conversion Linker stores it in first-party cookies: `_gcl_aw` (gclid), `_gcl_gb` (wbraid/gbraid), `_gcl_dc` (dclid). Linker must fire on ALL pages, before conversion tags.
4. Event snippet reads the cookie and sends it with the ping
5. Google keeps gclid 90 days; offline imports referencing older clicks fail. Conversion must land inside the action's click window (default 30d).

Chain test: visit `landingpage?gclid=TEST123` → confirm survives redirects → check cookies for `_gcl_aw` containing TEST123 → submit form → look for conversion ping in Network.

## Part 3: Failure catalog

### Category A - Tag missing or never firing
- **A1. Tag never installed / wrong pages** (VERY COMMON): status stuck Unverified; spend with zero conversions ever. Check landing AND thank-you page source for `AW-`/`GTM-`.
- **A2. Tag removed during redesign/migration/theme or plugin update** (VERY COMMON): was Recording, now Tag inactive; conversions flatline on a date. Correlate last-detected date with deploys.
- **A3. GTM changes never published** (VERY COMMON): tags exist only in an unpublished workspace draft. Check GTM Versions.
- **A4. Wrong Conversion ID or Label** (COMMON): GTM Preview shows tag firing, Ads records nothing. Compare GTM values against the action's Tag setup character-for-character.
- **A5. Tag from the wrong account / MCC confusion** (OCCASIONAL, agency-specific): conversions land in a previous agency's account, or MCC cross-account tracking conflicts. Compare on-page AW- ID with the account's conversion tracking ID.
- **A6. Performance/caching layers blocking the tag** (OCCASIONAL): Cloudflare Rocket Loader/APO, WP Rocket JS-delay, CSP blocks. Console errors; no request to googletagmanager.com.

### Category B - Tag fires but the conversion moment is missed (heart of lead-gen audits)
- **B1. GTM Form Submission trigger doesn't fire** (VERY COMMON): AJAX forms without standard submit events, misconfigured validation/conditions, broken dataLayer. Fix: thank-you pageview, Element Visibility on success message, platform callback, or dataLayer push.
- **B2. Form in a cross-origin iframe** (VERY COMMON): Typeform, Calendly, HubSpot, Jotform. Parent GTM can't see submissions; iframe can't see parent's `_gcl_aw`. Fix: postMessage listeners, provider redirect to first-party thank-you, or capture gclid to hidden field + server-side import.
- **B3. Conversion fires on a page that redirects before ping completes** (COMMON): browser kills the request in flight. Fix: thank-you page firing or gtag_report_conversion callback.
- **B4. Thank-you page URL changed / trigger mismatch** (VERY COMMON): trigger matches `/thank-you`, page became `/thanks`; trailing-slash or query-string breaking "equals" conditions.
- **B5. No thank-you page at all, inline success message** (COMMON): Element Visibility trigger or provider callback needed.
- **B6. Overcounting: wrong page / per-pageview / double implementation** (COMMON): snippet on every page; thank-you reload recounts (Count=Every); hardcoded gtag AND GTM tag both firing; website tag AND imported GA4 key event both Primary.

### Category C - Click ID / attribution chain broken
- **C1. Auto-tagging disabled** (COMMON): tag verified, conversions near zero; no gclid in landing URLs; GA4 shows Ads traffic as organic.
- **C2. gclid stripped by redirects** (VERY COMMON, invisible): http→https, non-www→www, trailing slash, geo redirects, shorteners. Test: `curl -IL "https://landingpage?gclid=TEST123"` and watch each hop. Fix: final URLs in ads, or forward query strings (Apache QSA, Nginx `$is_args$args`).
- **C3. Conversion Linker missing** (COMMON in GTM setups): no `_gcl_aw` cookie; heavy undercount especially Safari.
- **C4. Cross-domain journey** (COMMON): `_gcl_aw` scoped to first domain. Fix: Linker cross-domain linking or pass gclid in URL.
- **C5. gclid mutated** (RARE): CMS/scripts lowercase or truncate the gclid - Google treats as different ID.
- **C6. No ad click in the test path** (COMMON false alarm): website conversions only count after an ad click. Direct test submissions never appear in Ads.

### Category D - Consent & privacy
- **D1. Consent Mode misconfigured** (VERY COMMON in EEA/UK): conversions drop 30-90% after CMP install; CMP never flips ad_storage/ad_user_data to granted. Confirm: Tag Assistant Consent tab; `gcs=G100` persisting after accept. Since March 2024 Google requires ad_user_data/ad_personalization for EEA; July 2025 enforcement disabled non-compliant setups.
- **D2. Consent denied traffic + modeling gaps**: denied conversions dropped or modeled; Ads and GA4 model independently. URL passthrough (`url_passthrough: true`) partially recovers.
- **D3. Ad blockers / ITP baseline loss** (ALWAYS PRESENT): ~10-30% never track client-side. Mitigate with enhanced conversions / server-side.

### Category E - Account configuration
- **E1. Action set to Secondary** (VERY COMMON confusion): only counts in "All conversions", not "Conversions"; doesn't drive Smart Bidding. Inverse: two Primaries for same event = double counting.
- **E2. Conversion window too short / lag misread** (COMMON): conversions back-dated to click date; recent days fill in retroactively; processing hours to 72h (gbraid/wbraid); GA4 imports +1-2 days. Don't judge the last 3 days.
- **E3. Count Every vs One** (COMMON): leads should be One.
- **E4. Campaign-level goal exclusions**: campaign uses custom goals excluding the action.

### Category F - GA4-imported conversions
- **F1. GA4 key event not imported** (VERY COMMON): not marked Key event, never imported, accounts not linked, or data-sharing disabled. Import only counts forward.
- **F2. GA4 vs Ads numbers "don't match"** (CONSTANT, not a bug): click-date vs event-date, double counting when both Primary, different attribution models, Ads counts view-through/cross-device, separate consent modeling, lag, timezone. 10-30% divergence is normal. Pick ONE source of truth per action; demote the other to Secondary.

### Category G - Offline / CRM imports & enhanced conversions
- **G1. Upload errors**: "identifiers too old" (gclid 90d), "click too recent" (wait ~6h), "invalid conversion time" (timezone bugs), "unknown click" (malformed gclid, Excel mangling, wrong account, auto-tagging off at click time), "conversion action not found" (must be source Import from clicks), unhashed/badly formatted user data (lowercase emails, E.164 phones, SHA-256).
- **G2. gclid never captured into the CRM** (VERY COMMON root failure): no hidden field, or reads URL only (lost on multi-page journeys - read from `_gcl_aw` cookie), multi-step forms dropping it.
- **G3. Enhanced conversions (web) not providing user_data** (COMMON): EC enabled but no user_data mapping; broken CSS selectors; format errors. Verify Tag Assistant shows hashed `em`/`pn` on the ping.
- **G4. Enhanced conversions for leads misconfigured** (COMMON): tag must capture hashed email/phone at submit; upload same normalized identifiers later; failure points: terms not accepted, wrong action source, non-normalized uploads.
- **G5. Lead form assets (Google-hosted)**: conversions counted natively; leads sit in Ads 30 days unless webhook/CRM integration delivers them. Website tags irrelevant to these.

### Category H - Phone-call conversions
Google forwarding number or website call conversions (number swap). Failures: number hardcoded as image/formatted differently so swap fails; call trackers (CallRail) replacing after Google's snippet; minimum call length filters.

## Part 4: Ranked prevalence
1. Tag/trigger never fires for the real form flow (B1/B2/B4)
2. Tag removed or GTM unpublished after site changes (A2/A3)
3. Secondary vs Primary / column misreading (E1)
4. Consent Mode misconfiguration post-CMP (D1)
5. gclid chain broken (C1-C3)
6. Wrong ID/label or wrong account (A4/A5)
7. GA4-import confusion and mismatch panic (F1/F2)
8. Timing misreads (E2)
9. Duplicate counting (B6)
10. Offline/EC import failures (G1-G4) - lower volume, highest per-case complexity

## Part 5: Suggested audit order
1. Account surface first: statuses + last-detected dates; Primary/Secondary; counts; windows; auto-tagging; campaign goals; Diagnostics; segment by action
2. Date correlation: flatline date vs deploys/GTM versions/CMP installs
3. Page source: AW-/GTM- on landing + thank-you pages; duplicates; consent defaults
4. Live walk: `?gclid=TEST` → redirect survival → `_gcl_aw` → submit → conversion ping + gcs value; Tag Assistant
5. Attribution back-end: GA4 link/import; CRM gclid capture; upload errors; EC diagnostics
6. Only then conclude "tracking is fine, the campaign just isn't converting"

Key sources: support.google.com/google-ads (answers 7548399, 15629968, 13321563, 11956168, 15713840, 10989978), analyticsmania.com (28 reasons; form triggers; conversion linker), adalysis.com top-10 mistakes, adnanagic.com gclid redirects, ppc.land consent mode v2 enforcement, nicelookingdata.com GA4 vs Ads, conversiontracking.io iframes, cometly.com, tagfly.io, freak.marketing inactive tags, playhouse.digital gclid hidden field, pemavor.com offline imports.
