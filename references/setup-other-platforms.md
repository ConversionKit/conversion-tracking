# LinkedIn, Microsoft, and TikTok Ads Lead Tracking Setup (From Zero)

Contents:
1. Before you start (applies to all 3)
2. LinkedIn Ads (Insight Tag and conversion rules)
3. Microsoft Ads (UET tag and conversion goals)
4. TikTok Ads (pixel and form events)
5. Verification and common failures

Before you start. You usually cannot log into the user's ad accounts, so account steps are guided. Give exact clicks and ask what they see. Website and GTM steps you can do yourself with access. Conversion moments come from this repo's detection snippets, which push canonical dataLayer events at the true submission moment. The names live in recipes/gtm/event-map.json and snippets/README.md (for example, Typeform pushes typeform_form_submitted). And set expectations once, up front. Even a perfect browser-side setup loses roughly 10 to 30% of conversions to ad blockers, Safari cookie limits, and consent denial. See references/discrepancies-environment.md.

## LinkedIn Ads

LinkedIn is mid-rollout on menu names. Newer accounts show Data in the left menu, older accounts show Analyze. If the user cannot find a screen under one, have them check the other.

**Step 1 - Create the Insight Tag**
- Goal. Generate the sitewide tag and its Partner ID.
- Do this. In Campaign Manager, ask the user to click Data in the left menu, then Signals Manager, scroll to the Sources catalog section, and click Insight Tag (older accounts use Analyze, then Insight Tag). Then they choose "I will use a tag manager" to get the Partner ID, or "I will install the tag myself" to get the full code. Ask them to paste back the Partner ID or code.
- Expect to see. A short numeric Partner ID, or a code block containing _linkedin_partner_id.
- On error. If neither Data nor Analyze shows the option, the user's Campaign Manager role is too limited (needs Account Manager or higher). If a tag already exists, reuse it. Only 1 Insight Tag may run per page.

**Step 2 - Install the tag**
- Goal. Load the Insight Tag on every page.
- Do this. With GTM, create a new tag using the LinkedIn Insight community template (or a Custom HTML tag with the full code), enter the Partner ID, set the trigger to All Pages, then Submit and Publish. Without GTM, paste the full code into the site's global footer, just before the closing body tag, on every page.
- Expect to see. The Network tab on any page shows requests to snap.licdn.com and px.ads.linkedin.com/collect.
- On error. Installed only on the landing page means retargeting and page-based conversions silently miss everything else, so it must be sitewide. If the requests never appear, a consent banner or content blocker is stopping snap.licdn.com.

**Step 3 - Create the conversion rule**
- Goal. Tell LinkedIn what counts as a lead.
- Do this. Ask the user to click Analyze, then Conversion tracking (some accounts show this under Data or Measurement), then Create conversion. Name it, pick Lead as the type, and choose how it is detected. Prefer an event-specific conversion, or a page-load rule matching the thank-you page URL. If a URL rule, choose "contains" on a stable path fragment like /thank-you. Do not use Exact match. LinkedIn appends its own parameters (including li_fat_id) to landing URLs, and exact-match rules break on them.
- Expect to see. The new rule listed in Conversion tracking.
- On error. Exact-match rules record nothing even when everything else works, which is the top LinkedIn-specific failure. And "contains /thank-you" also matches sub-pages, so check for overlapping rules that double count.

**Step 4 - Associate the rule with campaigns**
- Goal. Make conversions actually record. This is the critical LinkedIn gotcha.
- Do this. In the creation flow's final step, tick the campaigns the conversion applies to before clicking Create. For existing rules, open the conversion and edit its associated campaigns.
- Expect to see. The conversion's row shows 1 or more associated campaigns.
- On error. A rule with no campaign association records nothing, forever, with no warning. Whenever LinkedIn shows 0 conversions, check association first.

Testing reality. Only a real ad click can produce a LinkedIn conversion. Ad previews, direct visits, and test submissions never count. Test with a real ad click in an incognito window and allow up to 24 hours for it to appear.

## Microsoft Ads

**Step 1 - Get the UET tag**
- Goal. Find the tag ID and code.
- Do this. Ask the user to click Conversions in the left menu, then UET tag (older layouts use Tools, then Conversion tracking). New accounts usually have a tag auto-created. In the Action column they click View tag to see the code, and paste back the tag ID.
- Expect to see. A numeric tag ID and a code block referencing bat.bing.com/bat.js.
- On error. No tag listed means click Create UET tag and name it after the site. Multiple tags means confirm which one the account's goals use, and install only that one.

**Step 2 - Install the tag**
- Goal. Load UET on every page, including the thank-you page.
- Do this. With GTM, create a tag with the built-in Microsoft Advertising Universal Event Tracking template, enter the tag ID, trigger on All Pages, Submit and Publish. Without GTM, paste the code into the site's global head.
- Expect to see. The Network tab shows bat.bing.com/bat.js loading and a beacon to bat.bing.com/action/0.
- On error. Tag only on landing pages misses the thank-you page, so destination goals never fire. Theme or plugin updates silently removing the tag is common, so recheck after site changes.

**Step 3 - Create a conversion goal**
- Goal. Make anything count at all. The number 1 Microsoft failure is a UET tag installed with no goal, and nothing counts until a goal exists.
- Do this. Ask the user to click Conversions, then Conversion goals, then Create. Choose Website as the type, then either a Destination URL goal (thank-you page) or an Event goal. For URL goals, use "Contains" with a short stable fragment like /thank-you, never Equals, since trailing slashes, https variants, and appended parameters all break exact matches. For Event goals, the action and category values are case-sensitive and must match the uetq.push call exactly.
- Expect to see. The goal listed with Tag status Unverified at first.
- On error. Goal created but stuck Unverified for days means the tag never fired once (revisit Step 2). "No recent conversions" with a working tag usually means the URL rule does not match the real thank-you URL, so compare character for character.

**Step 4 - Fire the lead moment and verify**
- Goal. Send the conversion event and prove the install.
- Do this. For a destination goal, nothing more is needed if the form redirects to the thank-you page. Otherwise, fire a custom event on the canonical dataLayer event from recipes/gtm/event-map.json via a GTM Custom HTML tag containing window.uetq = window.uetq || []; uetq.push('event', 'submit_lead_form', {}); and create a matching Event goal with that exact action string. Then install the UET Tag Helper Chrome extension, load the site, and turn it on.
- Expect to see. UET Tag Helper reports "This UET tag is set up correctly", and a test submission shows the custom event in the helper plus a bat.bing.com/action/0 request.
- On error. Helper is real-time but the goal status UI lags up to 24 hours, so do not panic at a lagging dashboard when the helper is green. Event fires but the goal stays at 0 usually means a case mismatch between the push and the goal.

## TikTok Ads

**Step 1 - Create the pixel**
- Goal. Create the web data source and get the pixel ID.
- Do this. Ask the user to open TikTok Ads Manager, go to Tools, then Events Manager. Click Connect Data Source, select Web, enter the website URL, and pick Manual Setup (not a partner integration). They create and name the pixel, then paste back the pixel ID and code.
- Expect to see. A pixel listed in Events Manager with its ID and an install code block referencing analytics.tiktok.com.
- On error. Choosing a partner integration flow when the site's platform is not listed dead-ends. Back out and use Manual Setup. A pixel that already exists should be reused, not duplicated.

**Step 2 - Install the base code**
- Goal. Load the pixel sitewide, early in the page.
- Do this. With GTM, use the official TikTok Pixel template from the community gallery with the pixel ID, trigger on All Pages, Submit and Publish. Without GTM, paste the code high in the site's global head.
- Expect to see. The Network tab shows analytics.tiktok.com loading on every page.
- On error. TikTok flags "code not installed in header" when the script loads late, and queued events get dropped. Move it up in the head. No requests at all points to a consent banner or blocker.

**Step 3 - Fire the form event**
- Goal. Report the lead moment. TikTok's standard web event for a form submission is SubmitForm. Use CompleteRegistration for account signups instead. There is no plain "Lead" event in TikTok's current standard web event list.
- Do this. In GTM, create a Custom Event trigger for the canonical dataLayer event from recipes/gtm/event-map.json, and attach a Custom HTML tag containing a script with ttq.track('SubmitForm');. Without GTM, use the same dataLayer watcher pattern shown in references/setup-meta.md Step 7, calling ttq.track('SubmitForm') instead of fbq.
- Expect to see. On a test submission, a request to analytics.tiktok.com carrying the SubmitForm event.
- On error. Event name typos or old names silently record nothing, so copy SubmitForm exactly. If the tag fires but nothing reaches TikTok, the base code loaded after the event fired.

**Step 4 - Test it**
- Goal. Confirm events arrive in TikTok.
- Do this. Ask the user to open Events Manager, select the pixel, and use the Test Events feature while they load the site and submit a test entry. The TikTok Pixel Helper Chrome extension gives a page-level readout, and the Diagnostics tab surfaces install warnings.
- Expect to see. Pageview on load, then SubmitForm once per submission, with no Diagnostics warnings.
- On error. Events show in Pixel Helper but not in Events Manager usually means a wrong pixel ID. Duplicate SubmitForm rows mean 2 installs of the event tag.

Lead quality note. TikTok strongly pushes pairing the pixel with its Events API for lead campaigns, and that is a server-side job with tokens and hashing, not a paste-in snippet. When the user wants it, route through references/server-side-options.md.

## Verification

All observable, per platform:

- LinkedIn. The Insight Tag shows as active in Signals Manager after real traffic (allow up to 24 hours). The conversion rule lists associated campaigns. A real ad click followed by a test submission appears in Campaign Manager within 24 hours.
- Microsoft. UET Tag Helper shows green on every key page. A submission produces a bat.bing.com/action/0 request. The goal's status moves from Unverified to Recording after the first real conversion.
- TikTok. Test Events shows exactly 1 SubmitForm per submission, Pixel Helper reports the correct pixel ID, and Diagnostics shows no header or coverage warnings.

## Common failures

When a check fails or numbers look wrong later, diagnose against the per-platform failure catalogs in references/meta-tiktok-linkedin-microsoft.md (LinkedIn L1 to L8, Microsoft B1 to B9, TikTok T1 to T10, plus the cross-platform cheatsheet).
