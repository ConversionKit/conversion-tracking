# Form Mechanics & Remote Diagnosis - Technical Reference

Literal, grep-able strings for auditing lead-gen conversion tracking from (A) form mechanics, (B) static page source, (C) headless browser, (D) codebase.

**Fix assets.** When a finding in this file names a missing or wrong detection hook, the fix usually already exists in this repo. Tested listeners for 18 tools live in `../snippets/` (paste-in JS) and `../recipes/gtm/detect/` (importable GTM containers), both pushing the canonical dataLayer event names listed in `../recipes/gtm/event-map.json` (for example `gravity_form_submitted`, `typeform_form_submitted`, `calendly_event_scheduled`). Diagnose against those exact names, fix by installing those exact assets.

## A. FORM SUBMISSION MECHANICS

### A.1 The four fundamental patterns

| Pattern | What happens | Why tracking breaks | Correct hook |
|---|---|---|---|
| Classic POST + redirect | server 302s to /thank-you | Works IF tags exist on thank-you page; risks: direct-reachable thank-you (false conversions), missing tags there, redirect losing params | Pageview trigger on thank-you URL |
| AJAX/fetch + inline success | JS intercepts, URL never changes | No pageview → destination-page tracking counts ZERO silently. #1 failure mode | dataLayer push in success callback; Element Visibility on success message; platform events |
| Third-party iframe embed | form on vendor's domain in iframe | Parent GTM blind to iframe internals; iframe can't read parent cookies; tracking inside attributes to vendor domain | postMessage listener for vendor events; vendor redirect to first-party thank-you; vendor webhook → server-side |
| Redirect to external processor | Stripe Checkout, Calendly full-page, formspree.io, formsubmit.co, Netlify Forms | Conversion completes on uncontrolled domain | Processor's redirect-after-success back to first-party /thank-you; else webhook → server-side APIs |

Stacking complications: multi-step forms (only final step converts; step events mistaken for submits; attribution scripts running only on step 1); popup/modal forms (not in DOM at load - delegated listeners or Element Visibility with "observe DOM changes"); full-page-reload confirmations with no URL change (default WPForms/Gravity non-AJAX - only hook is the confirmation div).

### A.2 Per-platform catalog (literal strings)

**Typeform** - iframe. Embed: `embed.typeform.com/next/embed.js`; attrs `data-tf-live=`, `data-tf-widget=`; iframe src `form.typeform.com/to/<id>`. Parent receives message events from origin `https://form.typeform.com` with `event.data.type === "form-submit"` (also "form-started", "form-screen-changed"), payload has `formId`. Embed SDK: `onSubmit` callback with {formId, responseId}. Alternative: Ending screen redirect to first-party thank-you.

**Calendly** - iframe. Script `assets.calendly.com/assets/external/widget.js`; `<div class="calendly-inline-widget" data-url=...>`. Parent messages where `e.data.event` starts with `"calendly."`: profile_page_viewed, event_type_viewed, date_and_time_selected, **event_scheduled** (the conversion). Payload has event.uri + invitee.uri only - NO email (enhanced conversions need invitee API or prefill capture). Beware: date_and_time_selected ≠ booked.

**HubSpot Forms** - TWO variants, check BOTH:
- Legacy v2: `js.hsforms.net/forms/embed/v2.js` + `hbspt.forms.create({portalId, formId})`; renders INLINE mostly. Window message events: `event.data.type === 'hsFormCallback'`, `event.data.eventName` ∈ onFormReady | onFormSubmit | **onFormSubmitted** (use this, post-success) | onFormFailedValidation; `event.data.id` = form GUID.
- New v4: `js.hsforms.net/forms/embed/<portalId>.js` + `<div class="hs-form-frame" data-form-id=...>`; renders in IFRAME. Real DOM events on window: `hs-form-event:on-ready`, **`hs-form-event:on-submission:success`**, `:failed`, `:on-interaction:navigate`; `event.detail.formId`; helper `window.HubSpotFormsV4` (has getConversionId()).
- Note: `js.hs-scripts.com/<portalId>.js` is the general HubSpot tracking script - presence ≠ ad conversion tracking.

**Jotform** - iframe (`form.jotform.com/<id>` or script `form.jotform.com/jsform/<id>`). Posts message to parent on submit; the Thank You → redirect setting breaks out of the iframe, navigates TOP window to your URL, and can append field values + unique {id} param - redirect is the most robust method. Tags pasted inside the Jotform builder fire on jotform.com's domain (wrong context).

**Contact Form 7 (WP)** - always AJAX. Bubbling DOM events on document (plain addEventListener works): **`wpcf7mailsent`** (success - use this), wpcf7submit, wpcf7invalid, wpcf7spam, wpcf7mailfailed. `event.detail` includes contactFormId, inputs (name/value array - usable for enhanced conversions).

**Gravity Forms (WP)** - Confirmation types: Text (default), Page, Redirect. WITH AJAX embed: jQuery event **`gform_confirmation_loaded`** on document (formId arg) - jQuery-triggered, NOT catchable via addEventListener. Multi-page: gform_page_loaded. WITHOUT AJAX + Text confirmation: full reload to same URL - no event, no new pageview; only hook is `.gform_confirmation_message` / `#gform_confirmation_wrapper_<id>` via Element Visibility. Redirect confirmation → classic pattern.

**WPForms (WP)** - default non-AJAX POST + reload, same-URL confirmation `.wpforms-confirmation-container-full`; optional AJAX fires jQuery **`wpformsAjaxSubmitSuccess`**. Confirmation types: Message / Show Page / Go to URL.

**Elementor Pro Forms (WP)** - AJAX; jQuery-triggered **`submit_success`** on document - `jQuery(document).on('submit_success', fn)`; vanilla addEventListener will NOT catch it (common audit finding). evt.target.id identifies form. Popup forms injected on open - document-level delegation still catches. Optional Redirect action → classic.

**Webflow** - native forms `<form data-name=...>` in `.w-form`; AJAX submit; success hides form, reveals sibling **`div.w-form-done`**; failure `.w-form-fail`. NO dataLayer event, NO URL change by default. Hooks: Element Visibility on .w-form-done, custom listener, or redirect setting.

**Framer** - React forms, inline success swap, no navigation, no built-in GTM event. Track via custom listener/element observation or redirect. Framer can auto-capture UTM/GCLID into form fields (built-in feature).

**Squarespace** - AJAX + inline message default; options: redirect URL, or "Post-Submit HTML" field that injects and executes code only after successful submit (a de facto conversion hook; plan-gated Business+).

**Wix** - AJAX + inline success; tracking via Wix's own dashboard integrations (auto-fires form-submit conversion) or Velo `wixWindow.trackEvent`; raw GTM DOM listeners unreliable in Wix's framework. "Wix + manually pasted pixel" = high risk of no submit event.

## B. STATIC DETECTION SIGNATURES (grep fetched HTML + inline JS)

| Technology | Grep for | Notes |
|---|---|---|
| gtag.js | `googletagmanager.com/gtag/js?id=` ; `gtag('config'` ; `window.dataLayer` | `G-` GA4 only, `AW-` Google Ads. Cookies: _ga, _gcl_au, _gcl_aw |
| Google Ads conversion | `AW-` ; `gtag('event', 'conversion'` ; `'send_to': 'AW-` | AW- config with NO send_to event anywhere = remarketing only; conversion may exist only in GTM |
| GTM | `GTM-` ; `googletagmanager.com/gtm.js?id=` ; noscript `ns.html?id=` | GTM present ≠ conversion tag present (see B.2) |
| Meta Pixel | `connect.facebook.net/en_US/fbevents.js` ; `fbq('init'` ; `fbq('track'` ; `facebook.com/tr?id=` | Only Lead/custom events = conversions; bare PageView isn't. Cookies _fbp, _fbc |
| TikTok | `analytics.tiktok.com/i18n/pixel/events.js` ; `ttq.load(` ; `ttq.track(` | Cookie _ttp |
| LinkedIn | `_linkedin_partner_id` ; `snap.licdn.com/li.lms-analytics/insight.min.js` ; `px.ads.linkedin.com/collect?pid=` | Cookie li_fat_id |
| Microsoft UET | `bat.bing.com/bat.js` ; `window.uetq` ; `UET({ti:` | Cookies _uetsid, _uetvid |
| Cookiebot | `consent.cookiebot.com/uc.js` ; `data-cbid=` | CMPs may block tags pre-consent |
| OneTrust | `cdn.cookielaw.org` ; `otSDKStub.js` ; `OptanonWrapper` | Cookie OptanonConsent |
| CookieYes | `cdn-cookieyes.com/client_data/` | |
| Other CMPs | `app.usercentrics.eu` ; `cmp.osano.com` ; `app.termly.io/embed` ; `complianz` ; `klaro` | |
| Consent Mode | `gtag('consent', 'default'` ; `'ad_storage'` | denied default + no CMP wiring = silent loss |
| sGTM / Stape | `gtm.js`/`/gtag/js` loaded from NON-Google domain (subdomains like load., sgtm., ss., data., track., metrics.); `server_container_url` ; `transport_url` ; custom loader = own-domain script with randomized path | Runtime cookie FPID = strong sGTM signal; GA hits to `<subdomain>/g/collect` |
| Form embeds | `embed.typeform.com` ; `form.typeform.com/to/` ; `assets.calendly.com` ; `calendly-inline-widget` ; `js.hsforms.net/forms/embed/` ; `hbspt.forms.create` ; `hs-form-frame` ; `form.jotform.com` | Embed present + only pageview tags = likely broken |
| WP form plugins | `wp-content/plugins/contact-form-7/` ; `wpcf7` ; `gform_wrapper` ; `wpforms-` ; `elementor-form` | Tells you which §A event to expect |
| Other analytics | `cdn.segment.com` ; `plausible.io/js` ; `posthog` ; `static.hotjar.com` ; `clarity.ms/tag` | Context |
| Attribution capture | hidden inputs named `utm_source`/`gclid` in forms; `attributer`; converly snippet | Attribution-capture attempt |

### B.1 What static fetch CANNOT tell you
1. Whether events actually fire on submit (wiring, races, JS errors)
2. Whether consent banner blocks tags for unconsented users
3. What's inside GTM - until you fetch the container (B.2)
4. Tags injected server-side per page (fetch /thank-you variants too)
5. Server-side conversions (CAPI, offline uploads) - invisible; look for sGTM signals or ask for codebase

### B.2 Reading the GTM container WITHOUT account access
The container is a public JS file: fetch `https://www.googletagmanager.com/gtm.js?id=GTM-XXXXXXX`. It embeds `{"resource":{"macros":[...], "tags":[...], "predicates":[...], "rules":[...]}}` - the full config. Greps:
- `"function":"__awct"` → Google Ads conversion tag EXISTS; nearby `vtp_conversionId`/`vtp_conversionLabel` = exact AW-id/label
- `__gaawe` GA4 event tag; `__gaawc`/`__googtag` config; `__sp` Ads remarketing; `__flc` Floodlight; `__html` Custom HTML (pixel/CAPI glue); `__cvt_` custom templates (Facebook/TikTok/Stape)
- Triggers: `__fsl` form submit listener; `__cl`/`__lcl` clicks; `__evl` element visibility; `__hl` history change (SPA)
- Predicates: `"arg1":"gtm.formSubmit"`, custom event names like `"arg1":"typeform_submit"` - exactly which dataLayer event the conversion tag waits for; then verify the page actually pushes it
- **A missing `__awct` has THREE causes, and only one of them is "no tag".** GTM drops a tag
  from the published container when it is paused, and also when a required field is empty:
  an Ads conversion tag with a blank conversion label is absent from `gtm.js` entirely
  rather than present and broken (verified). So the honest reading of no `__awct` is *no
  conversion tag is live*, which could be no tag, a paused tag, or a tag with an empty
  required field. Distinguishing them needs the API.

- **Paused tags are invisible here, and `__paused` is a trap.** GTM omits a paused tag from the published container entirely rather than flagging it. Verified on two otherwise identical containers: the live one carries `__awct`, its conversion ID and its label; the paused one carries none of the three.
  **Do not read `__paused:1` as evidence.** It appears in every container as part of GTM's internal tag-type registry, next to `__tl`, `__tg` and `__ytl`. It says a tag type exists in GTM, not that this container has a paused tag. An agent under test reached the right answer by misreading exactly this, which is luck rather than diagnosis and will produce a confident wrong answer on the next container.
  When a user believes a tag exists and you cannot find one, say no tag is **live**, name paused as a likely cause, and confirm through the API (`gtm-mcp.md`). Never present it as something you observed in `gtm.js`.
- Grep whole file for `AW-`, `conversionLabel`, pixel IDs. Nothing matching = container has NO conversion tags regardless of what the page promises.

### B.3 How existing detectors work
Wappalyzer/BuiltWith: regex DB over script srcs, HTML, JS globals, cookies. Tag Assistant: instruments live page, shows fired tags + hit params. Meta Pixel Helper: checks fbq state + observed /tr requests. Headless equivalent: watch network + evaluate `fbq.getState()`.

## C. DYNAMIC CHECKS (headless browser / Playwright)

Page-load pass - record requests, match:

| Vendor | Hit signature |
|---|---|
| GA4 | `google-analytics.com/g/collect`, `analytics.google.com/g/collect`, `region1.google-analytics.com/g/collect` (v=2&tid=G-...&en=<event>) - or /g/collect on first-party sGTM domain |
| Google Ads | `googleads.g.doubleclick.net/pagead/viewthroughconversion/<id>/`, `googleadservices.com/pagead/conversion/<id>/`, `google.com/pagead/1p-conversion/` |
| Meta | `facebook.com/tr` (id=<pixel>&ev=<event>; ev=Lead on submit) |
| TikTok | `analytics.tiktok.com/api/v2/pixel` |
| LinkedIn | `px.ads.linkedin.com/collect?pid=` |
| Microsoft | `bat.bing.com/action/0?ti=` |

Checks:
1. **Consent gating**: load with no interaction - which hits fire pre-consent? Inspect gcs=/gcd=. Re-run after accepting CMP.
2. **Runtime state**: `window.dataLayer` dump, `typeof google_tag_manager`, `fbq.getState()`, `typeof ttq`, `window.uetq`, `window.HubSpotFormsV4`.
3. **Submit simulation** (staging/test data, flagged as test): attach §A listeners first (message events, wpcf7mailsent, jQuery hooks for submit_success/gform_confirmation_loaded), fill + submit, assert: (a) dataLayer event pushed, (b) conversion-class network request fired, (c) success UX classified (URL change vs inline swap). Diff window.dataLayer before/after.
4. **Thank-you direct visit**: load /thank-you directly - do conversion tags fire on bare load? (false-conversion risk)
5. **postMessage sniff**: inject `window.addEventListener('message', m => log(m.origin, m.data))` before interacting with embeds.

## D. CODEBASE GREP LIST

Presence:
```
grep -rn "gtag("  "GTM-"  "googletagmanager"  "dataLayer"  "fbq("  "ttq\."  "_linkedin_partner_id\|licdn"  "uetq\|bat.bing"
grep -rn "@next/third-parties\|GoogleTagManager\|GoogleAnalytics\|sendGTMEvent\|sendGAEvent"
grep -rn "react-gtm-module\|react-ga4\|nextjs-google-analytics"
grep -rn "analytics.track\|segment\|posthog.capture\|plausible("
```
Conversion wiring (the usually-missing part):
```
grep -rn "send_to"
grep -rn "'event', 'conversion'\|\"event\", \"conversion\""
grep -rn "generate_lead\|form_submit\|formSubmit"
grep -rn "onSubmit\|handleSubmit"   # then READ each handler:
#   does the success branch (after await fetch) contain gtag/fbq/dataLayer.push?
#   red flag: fetch('/api/contact') → setSubmitted(true) with no tracking call
grep -rn "router.push\|redirect(" -- **/contact* **/form*
```
SPA failure modes: GA4/GTM loaded once, no history-change tracking; next/script wrong strategy; tags in one layout only; thank-you client-side-navigated so initial-load Page View trigger never fires.

Server-side:
```
grep -rn "graph.facebook.com"                                   # Meta CAPI
grep -rn "google-analytics.com/mp/collect\|api_secret"          # GA4 Measurement Protocol
grep -rn "googleads\|ConversionUploadService\|ClickConversion"  # Ads offline conversions
grep -rn "gclid\|wbraid\|gbraid\|fbclid\|msclkid\|li_fat_id"    # click-id capture
grep -rn "utm_source" -- **/*form*                              # hidden-field capture
```
Cross-check: dataLayer event names pushed in code must EXACTLY match predicate strings in the fetched gtm.js container - mismatch (`formSubmitted` in code vs `form_submit` in GTM) = complete silent failure.

Key sources: contactform7.com/dom-events; docs.gravityforms.com gform_confirmation_loaded; developer.calendly.com parent-window notifications; typeform.com/developers/embed/callbacks; developers.hubspot.com global form events (v4) + legacydocs (v2); developers.google.com/tag-platform/devguides/existing; simoahava.com container snippet internals; conversiontracking.io Jotform/Typeform/iframe guides; analyticsmania.com per-platform GTM guides; trackingchef.com bulletproof form tracking series; dumbdata.co listeners; converly.io Webflow forms; freak.marketing Squarespace; framer.com UTM/Ads IDs help; stape.io custom loader docs; wappalyzer source.
