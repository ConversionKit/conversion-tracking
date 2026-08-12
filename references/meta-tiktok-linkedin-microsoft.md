# Meta, LinkedIn, TikTok, Microsoft Ads - Conversion Tracking Failure Reference (Lead-Gen)

Compiled August 2026. Frequency: VERY COMMON / COMMON / OCCASIONAL / RARE.

**Fix assets.** From-zero setup steps live in `setup-meta.md` and `setup-other-platforms.md`. Detection-layer fixes live in `../snippets/` and `../recipes/gtm/`; CAPI-class fixes are compared in `server-side-options.md`.

## 1. META

**Reading the Diagnostics tab.** Meta surfaces problems here that neither Overview nor Test
Events will show. Two behaviours worth knowing before interpreting what a user reports:

- **Issues age out of view.** If Meta does not re-detect an issue the next day it moves from
  **Active** to **Previously detected**. So "the diagnostics tab is clean" does not mean the
  problem is fixed, it may mean it simply was not seen again yet. Ask them to check
  Previously detected too.
- **Deduplication fails on formatting, not just on missing IDs.** The browser sending
  `ord-123` while the server sends `ord_123` is a mismatch, and so is a case difference. The
  symptom is doubled conversions with both sources apparently configured correctly, which
  reads as an implementation success right up until the numbers are wrong.

### Pixel anatomy
- Script src: `connect.facebook.net/en_US/fbevents.js`
- Init: `fbq('init', '<15-16 digit id>')`; advanced matching adds `{em:..., ph:...}` second arg
- Events: `fbq('track', 'Lead')` standard; `fbq('trackCustom', 'X')`; dedup-ready adds 4th arg `{eventID: '...'}`
- Noscript: `facebook.com/tr?id=<pixel>&ev=PageView&noscript=1`
- Ground truth: 2xx request to `facebook.com/tr/?id=<pixel>&ev=<event>`
- Console: `typeof fbq === 'function'`

### Click ID lifecycle
- `?fbclid=` appended to every ad click → pixel writes first-party cookie `_fbc` = `fb.1.<timestampMs>.<fbclid>` (90d nominal). Only created if pixel loads on the landing page with fbclid present.
- `_fbp` = browser ID cookie, set on first visit (90d).
- Chain breakers: Safari ITP caps JS cookies to 7 days, and 24 HOURS on URLs carrying known tracking params like fbclid; ad blockers strip fbclid; redirect chains drop query params; consent banners blocking the pixel on landing = no _fbc ever.
- Lost _fbc = conversion arrives unattributed → shows as organic; ROAS underreports.

### Failure modes
- **M1. Base code missing/not loading** (VERY COMMON): no activity in Events Manager. Check DOM for `fbq`/`connect.facebook.net`; Network for `/tr`.
- **M2. Wrong pixel ID / wrong Business Manager** (COMMON): pixel fires into someone else's dataset (old agency). Compare `/tr?id=` against Events Manager > Data Sources.
- **M3. CMP blocking the pixel** (VERY COMMON EU/UK): works when you test (you accepted), production volume a fraction of traffic. Test incognito without accepting.
- **M4. Lead event never fires on submit** (VERY COMMON, the #1 lead-gen failure): (a) only base code installed, no Lead call; (b) fires on click but page redirects before /tr completes; (c) iframe embeds - submission happens on third-party domain; (d) GTM trigger tied to changed CSS selector; (e) SPA/multi-step, thank-you is a route change.
- **M5. New custom events "Blocked by Meta"** (OCCASIONAL): first-seen custom event names parked as blocked until owner approves. Events Manager > Settings > Manage Event Blocking. ~20 min to activate after unblocking.
- **M6. Duplicate events** (VERY COMMON): two installs (theme+GTM+plugin); click AND thank-you both firing; Pixel + CAPI without matching event_id. Meta dedups on event_name + event_id ONLY. Case mismatch ("lead" vs "Lead"), regenerated IDs, reused IDs all break dedup. Healthy pair shows one row marked "Deduplicated" in Test Events.
- **M7. CAPI arrives but low Event Match Quality** (VERY COMMON): EMQ 1-10; drivers in order: hashed email, hashed phone (E.164), fbc, fbp, IP+UA, name/zip, external_id. PII must be SHA-256 after normalization (lowercase, trimmed). Missing phone or unforwarded _fbp/_fbc tanks it. Check event card > View Details; allow 24-48h after changes.
- **M8. CAPI plumbing failures** (COMMON): expired token, wrong dataset ID, event_time >7 days old rejected, missing action_source, no user_data at all. Use Test Events with test_event_code.
- **M9. Pixel Helper warnings**: "did not load" = fbevents.js blocked; "activated multiple times" = duplicate; "took too long" = lost on redirect; "new domain sending data" = hijacked pixel (fix with Traffic Permissions).
- **M10. Browser/device attrition** (STRUCTURAL): 20-40% below form backend; iOS worst. The core CAPI argument.
- **M11. iOS14/AEM legacy** (mostly resolved): 8-event prioritization + domain verification requirements REMOVED late 2023. Residual: modeled/delayed iOS conversions.
- **M12. Custom event not selectable in Ads Manager** (OCCASIONAL): custom names need a custom conversion wrapper to optimize on. Prefer standard `Lead` event.

### Meta CAPI requirements
Dataset ID + access token (Events Manager > Settings), POST to `graph.facebook.com/v*/{dataset_id}/events`. Needs event_name, event_time (≤7d), action_source, event_id (dedup), user_data with ≥1 identifier (email/phone SHA-256 lowercased/trimmed; fbp/fbc/IP/UA raw). SMB difficulty: server code or paid intermediary, event_id coordination, hashing rules, token management, dedup verification.

### Test tooling
Test Events (browser + server via test_event_code, shows dedup status), Meta Pixel Helper extension, Events Manager Diagnostics tab.

## 2. LINKEDIN

### Insight Tag anatomy
- `_linkedin_partner_id = "1234567"` variable; script `snap.licdn.com/li.lms-analytics/insight.min.js`
- Noscript: `px.ads.linkedin.com/collect/?pid=<id>&fmt=gif`
- Event conversions: `window.lintrk('track', { conversion_id: 12345678 })`
- Console: `window._linkedin_data_partner_ids`, `typeof window.lintrk`

### Click ID
- `li_fat_id` appended with Enhanced Conversion Tracking enabled (default on new tags); stored in first-party cookie `li_fat_id`, 30 days. CAPI idType: LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID - strongest match key besides hashed email.
- Browser matching otherwise depends on logged-in LinkedIn session (third-party cookies) - degrades badly with cookie blocking; non-member traffic never matches.

### Failure modes
- **L1. Tag not installed/verified** (VERY COMMON)
- **L2. Wrong partner ID or conversion_id mismatch** (COMMON)
- **L3. Conversion rule URL-matching misconfiguration** (VERY COMMON, top LinkedIn-specific cause): "Exact" breaks on appended params INCLUDING LinkedIn's own li_fat_id; "Starts with" + protocol breaks on http/https; the tag can REORDER URL parameters. Use "contains" on stable path fragments.
- **L4. Conversion not attached to a campaign** (COMMON, LinkedIn-specific): unassociated conversion rules record NOTHING.
- **L5. Member-match dependency & testing pitfalls** (COMMON false alarm): ad preview clicks never convert; testing while logged into advertiser account suppressed; 2-24h lag. Test via real ad click in incognito; wait 24h.
- **L6. Double-counting via overlapping URL rules** (OCCASIONAL): "contains /thank-you" also matches sub-pages.
- **L7. CSP / ad blocker / duplicate tags** (COMMON): CSP must allow snap.licdn.com + px.ads.linkedin.com; only ONE Insight Tag per page.
- **L8. SPA route changes untracked** (COMMON): call `window.lintrk('track')` on route changes.

### LinkedIn CAPI
Direct API path: non-expiring token from Campaign Manager > Signals Manager > Direct API (SMB-viable). Developer Portal path needs approved app + review (slow). Identifiers: SHA-256 email or li_fat_id. B2B reality: personal-vs-work email mismatch caps match rates. No official browser test extension - use Campaign Manager status + network checks.

## 3. TIKTOK

### Pixel anatomy
- Global `ttq`; script `analytics.tiktok.com/i18n/pixel/events.js`
- `ttq.load('<id>')`, `ttq.page()`, `ttq.track('SubmitForm'|'Lead'|'Contact')`
- Advanced matching: `ttq.identify({email, phone_number})`

### Click ID
- `ttclid` → first-party `ttclid` cookie. `_ttp` browser ID. TikTok pixel cookies expire 13 months. ttclid strongest Events API match signal, _ttp second. Same strip risks as fbclid.

### Failure modes
- **T1. Base code missing / wrong ID** (VERY COMMON)
- **T2. "Code not installed in header"** (COMMON): loads too late, queued events dropped
- **T3. Lead fires at wrong moment / missing params** (COMMON): redirect race, GTM selector issues
- **T4. "First-party cookies not found"** (OCCASIONAL): disabled in pixel settings
- **T5. Advanced Matching format errors** (COMMON): email lowercase, phone E.164, else silently useless
- **T6. Consent/ad-blocker suppression** (VERY COMMON): 15-30% loss typical
- **T7. Dedup misconfigured Pixel vs Events API** (COMMON): dedup on event_id + name within 48h window
- **T8. Events API auth/payload failures** (COMMON): expired token, malformed timestamps, unhashed PII
- **T9. SPA navigation untracked** (COMMON): call ttq.page() on route changes
- **T10. Legacy/misspelled event names** (OCCASIONAL)

### Events API
Pixel code + self-serve access token (easier than LinkedIn). event_id mirrored with pixel; email SHA-256 lowercased; phone SHA-256 E.164; raw IP+UA; ttclid from URL/cookie. Test tooling: TikTok Pixel Helper extension, Test Events tab, Diagnostics tab.

## 4. MICROSOFT ADS (UET)

### UET anatomy
- Script `bat.bing.com/bat.js`; global queue `window.uetq`; tag ID `{ti:"XXXXXXXX"}`
- Custom events: `window.uetq.push('event', 'action', {event_category, event_label, event_value})`
- Beacons: `bat.bing.com/action/0?ti=...`

### Click ID
- MSCLKID auto-tagging on by default (Settings > Account level options); `msclkid=` → first-party cookie `_uetmsclkid` (~90d); `_uetsid` session, `_uetvid` visitor (13mo). Strip risks: redirects, cross-domain (must be manually carried).

### Failure modes
- **B1. "UET installed = conversions tracked" fallacy** (VERY COMMON, the #1 Microsoft failure): UET only records raw activity; NOTHING counts until a conversion goal is created.
- **B2. Destination-URL goal never matches** (VERY COMMON): trailing slashes, http/https, case, .html, appended params. Use "contains".
- **B3. Goal status decoder**: Unverified (no activity yet, wait 24h) / Tag inactive (no hits 24h) / InactiveDueToTagUnavailable (permission change) / No recent conversions (rule not matching) / Recording. UI lags up to 24h; UET Tag Helper is real-time.
- **B4. Event goal case sensitivity** (COMMON): action/category/label matching is case-sensitive.
- **B5. Tag only on landing pages / removed by theme update** (COMMON): must be site-wide incl. thank-you.
- **B6. GTM misconfiguration** (COMMON)
- **B7. Consent Mode gap** (VERY COMMON since May 2025, widely missed): Microsoft requires consent signals since May 5 2025; basic mode denied conversions are LOST ENTIRELY (no modeling, unlike Google). Advanced Consent Mode opt-in since Feb 2026. GTM users can inherit Google Consent Mode via the UET tag's "Consent settings" toggle - must be explicitly enabled.
- **B8. Duplicate UET tags** (OCCASIONAL)
- **B9. Copying goals from Google without adjustment** (OCCASIONAL): imported campaigns don't import working tracking.

### Server-side
No SMB-level web CAPI equivalent. Paths: offline conversion imports via msclkid captured to CRM, or UET enhanced conversions with hashed email/phone. Failure: msclkid never captured in hidden field or auto-tagging off. Test: UET Tag Helper extension (green/yellow/red), bat.bing.com/action/0 requests, goal Tracking Status.

## 5. CROSS-PLATFORM CHEATSHEET

| | Meta | LinkedIn | TikTok | Microsoft |
|---|---|---|---|---|
| Script host | connect.facebook.net | snap.licdn.com | analytics.tiktok.com | bat.bing.com |
| Beacon | facebook.com/tr | px.ads.linkedin.com/collect | analytics.tiktok.com | bat.bing.com/action/0 |
| Global | fbq | lintrk, _linkedin_data_partner_ids | ttq | uetq |
| Click ID → cookie | fbclid → _fbc (90d; ITP 24h/7d) | li_fat_id → li_fat_id (30d) | ttclid → ttclid (13mo) | msclkid → _uetmsclkid (~90d) |
| Browser ID | _fbp (90d) | member cookies (3rd party) | _ttp (13mo) | _uetvid (13mo) |
| Dedup key | event_name + event_id | URL-rule scoping | event_id + name, 48h | goal-level |
| Server-side | CAPI (token, hashed em/ph, event_id) | CAPI (Direct API token, email/li_fat_id) | Events API (token, em/ph, ttclid) | Offline imports via msclkid |
| Test tool | Test Events + Pixel Helper | Campaign Manager status only | Test Events + Pixel Helper | UET Tag Helper |

Universal checks every audit: consent banner (accept vs decline test); ad-blocker attrition ~15-30%; redirect-before-beacon race; iframe embeds; SPA routes; thank-you missing base tag; duplicate installs; wrong account/ID; URL-rule mismatches; testing hygiene (incognito, real ad clicks, 24h lags).

Key sources: trackingplan.com meta pixel; watsspace.com dedup; niblin.com EMQ; ego-digital.io _fbc; measureschool.com; jonloomer.com AEM; bluefroganalytics.com LinkedIn; jacobfilipp.com LinkedIn; b2linked.com ep38; learn.microsoft.com LinkedIn CAPI + click IDs; benly.ai TikTok; admanage.ai TikTok helper; ads.tiktok.com cookies; conversios.io UET; mbadv.agency Microsoft UET; help.ads.microsoft.com.
