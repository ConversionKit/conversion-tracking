# Tool coverage: what ships, what is planned, what to do otherwise

Contents: how to use this · shipped detectors · setup each detector needs · universal patterns · planned · the five install shapes · when nothing here fits

**Never tell someone their tool is unsupported.** Every conversion moment falls into one
of the install shapes below, and the universal patterns below cover the long tail. If a named
detector does not exist yet, identify the shape and use the matching pattern.

## Shipped, with a tested snippet and an importable GTM recipe

Build a merged container for any of these against any destination:

```
python3 scripts/build_recipe.py --tool <slug> --send <google-ads|ga4|meta|linkedin|tiktok|microsoft> [ids] -o import-me.json
```

| Slug | Tool | Moment | dataLayer event |
|---|---|---|---|
| `activecampaign` | ActiveCampaign | form submission | `activecampaign_form_submitted` |
| `acuity-scheduling` | Acuity Scheduling | booking made | `acuity_appointment_scheduled` |
| `avada-forms` | Avada Forms | form submission | `avada_forms_submitted` |
| `beaver-builder` | Beaver Builder | form submission | `beaver_builder_form_submitted` |
| `cal-com` | Cal.com | booking made | `calcom_booking_successful` |
| `calendly` | Calendly | meeting booked | `calendly_event_scheduled` |
| `capsule-forms` | Capsule Web Forms | form submission | `capsule_form_submitted` |
| `clickfunnels` | ClickFunnels | form submission | `clickfunnels_form_submitted` |
| `close-forms` | Close Forms | form submission | `close_form_submitted` |
| `contact-form-7` | Contact Form 7 | form submission | `contact_form_7_submitted` |
| `copper-forms` | Copper Web Forms | form submission | `copper_form_submitted` |
| `divi-forms` | Divi Forms | form submission | `divi_form_submitted` |
| `duda` | Duda | form submission | `duda_form_submitted` |
| `elementor-forms` | Elementor Forms | form submission | `elementor_form_submitted` |
| `fillout-forms` | Fillout Forms | form submission | `fillout_form_submitted` |
| `fluent-forms` | Fluent Forms | form submission | `fluent_forms_submitted` |
| `formidable-forms` | Formidable Forms | form submission | `formidable_forms_submitted` |
| `forminator` | Forminator | form submission | `forminator_form_submitted` |
| `formsite` | Formsite | form submission | `formsite_form_submitted` |
| `framer-forms` | Framer Forms | form submission | `framer_form_submitted` |
| `freshsales-forms` | Freshsales Forms | form submission | `freshsales_form_submitted` |
| `gravity-forms` | Gravity Forms | form submission | `gravity_form_submitted` |
| `happyforms` | HappyForms | form submission | `happyforms_form_submitted` |
| `highlevel-forms` | HighLevel Forms | form submission | `highlevel_form_submitted` |
| `hubspot-forms` | HubSpot Forms | form submission | `hubspot_form_submitted` |
| `hubspot-meetings` | HubSpot Meetings | meeting booked | `hubspot_meeting_booked` |
| `insightly-forms` | Insightly Web Forms | form submission | `insightly_form_submitted` |
| `instapage` | Instapage | form submission | `instapage_form_submitted` |
| `jotform` | Jotform | form submission | `jotform_form_submitted` |
| `kit` | Kit | form submission | `kit_form_submitted` |
| `getleadforms` | LeadCapture.io | form submission | `getleadforms_form_submitted` |
| `mailchimp` | Mailchimp | form submission | `mailchimp_form_submitted` |
| `netlify` | Netlify | form submission | `netlify_form_submitted` |
| `ninja-forms` | Ninja Forms | form submission | `ninja_forms_submitted` |
| `optinmonster` | OptinMonster | form submission | `optinmonster_form_submitted` |
| `paperform` | Paperform | form submission | `paperform_form_submitted` |
| `pipedrive-forms` | Pipedrive Web Forms | form submission | `pipedrive_form_submitted` |
| `salesforce-forms` | Salesforce Web-to-Lead | form submission | `salesforce_form_submitted` |
| `squarespace-forms` | Squarespace Forms | form submission | `squarespace_form_submitted` |
| `tally` | Tally | form submission | `tally_form_submitted` |
| `typeform` | Typeform | form submission | `typeform_form_submitted` |
| `unbounce` | Unbounce | form submission | `unbounce_form_submitted` |
| `webflow-forms` | Webflow Forms | form submission | `webflow_form_submitted` |
| `wix-scheduling` | Wix Bookings | booking made | `wix_appointment_scheduled` |
| `wix-forms` | Wix Forms | form submission | `wix_form_submitted` |
| `wpforms` | WPForms | form submission | `wpforms_form_submitted` |
| `ws-form` | WS Form | form submission | `ws_form_submitted` |
| `zoho-bookings` | Zoho Bookings | booking made | `zoho_bookings_appointment_scheduled` |
| `zoho-crm-forms` | Zoho CRM Web Forms | form submission | `zoho_crm_form_submitted` |

**Detection confidence.** Most of these fire on the tool's own success event or on a
confirmed success state the tool shows the visitor. That is as exact as the browser gets,
but it is still what the page showed, not what the tool's database kept: honeypot and spam
submissions that the tool answers normally can count. Three groups are weaker, and the user
should hear which group their tool is in when precision matters:

- **Inferred from the submit.** `framer-forms` and the older-forms path in `wix-forms` fire
  on a submit that was not cancelled and passed constraint validation, and the new Wix forms
  set to redirect fire when the page is left with a valid form and no visible error. A
  server error or a spam rejection still counts. `jotform` arms on a submit attempt and fires on the browser's
  `formdata` event, which is raised only when a submission's data is actually built, at most
  once per form.
- **Return counting.** `salesforce-forms`, `zoho-crm-forms`, `capsule-forms` and
  `insightly-forms` post the form away to the CRM, which sends the visitor back. The
  detector counts the first different page on the same site within 60 seconds of the
  submit. The CRM gives the browser no refusal signal, so a lead it refused (duplicate rule,
  failed CAPTCHA) that still returns the visitor is counted. Say so plainly.
- **Redirect arrival.** `formsite`, `netlify` and plain `mailchimp` embeds count the arrival
  on a page of the user's site that the tool redirects to after a success; `zoho-bookings`
  counts that page loading inside the booking frame. `pipedrive-forms` is stronger: it
  counts Pipedrive's own redirect confirmation message. All of them need the redirect
  configured (below), or they count nothing.

Some tools also count moments that are not yet a firm conversion. Cal.com bookings that
need host confirmation or payment fire with `booking_status` `PENDING`; Acuity fires for
package, gift certificate and subscription purchases as well as appointments (filter on
`acuity_type`); Wix Bookings services set to manual approval count at the request; Mailchimp
double opt-in counts when the signup is accepted, before the confirmation email is clicked.


## Setup each detector needs

Every tool needs the snippet or recipe on the page that carries the form. The tools below
also need something configured, or cover only some of the tool's embed types and modes.
Read the row before handing a detector over, because a mode it does not cover usually
counts nothing at all, with no error. Where a form redirects after success, the dataLayer
push lands just before the page leaves, so the destination tag must send in time (a tag
using `sendBeacon` or `keepalive` survives the navigation). "Live-tested" names what was exercised on the real tool;
other options of the same tool may work but are unverified, so say so. "Not covered" means
this detector does not handle it, not that it cannot be tracked another way.

| Slug | What the user must do, and what is not covered |
|---|---|
| `activecampaign` | Inline thank-you messages and redirects. A form inside a custom iframe that redirects the whole window, or a thank-you box erased instantly, counts zero. In Safari before 26.2 and older Firefox, a redirect is inferred from a clean reply followed by navigation within 4 seconds |
| `acuity-scheduling` | Two parts. Paste `snippets/acuity-scheduling-acuity-field.html` into Acuity (Integrations, Custom Conversion Tracking) after putting the site's address in `SITES`, exactly as the browser shows it on the page carrying the scheduler (`www` matters); a wrong address fails silently. Bookings on Acuity's own scheduling page are not counted. To count appointments only, add a trigger condition on `acuity_type` equals `appointment`. `appointment_type` is the business's own service name: if it names a health service, do not forward it to ad platforms |
| `avada-forms` | Forms using Avada's default AJAX submit. Post and Send to URL forms are not covered; multi-step forms, file uploads and off-canvas forms are untested |
| `beaver-builder` | The classic Contact Form module, live-tested. Other Beaver Builder form modules are untested |
| `cal-com` | Cal.com cloud embeds and plain Cal.com iframes. Self-hosted Cal.com is not covered. Reschedules do not count. Bookings awaiting host confirmation or payment fire with `booking_status` `PENDING`; filter on `ACCEPTED` to count only confirmed ones |
| `calendly` | Needs Calendly's real `widget.js` embed. A raw Calendly iframe sends the page nothing and counts zero |
| `capsule-forms`, `insightly-forms` | A native form on the site, submitted in the same tab, returning to a different page on the same HTTPS site: in Capsule set the hidden `COMPLETE_URL`, in Insightly choose Display a page on my website. The tools' own thank-you pages never return, so they count zero. The detector must run on the form page and the return page. Return counting (above). Capsule: a verify step that keeps the visitor away for more than 60 seconds is not counted (seen live) |
| `clickfunnels` | ClickFunnels 2.0 opt-in steps; live-tested on a pop-up opt-in step with name and email. Classic 1.0, custom domains, External Page and Custom HTML steps, embedded ClickFunnels pages and purchases are not covered |
| `close-forms` | Single-step inline embeds. Hosted pages, iframe embeds and multi-step forms are not covered |
| `contact-form-7` | AJAX submission, Contact Form 7's normal mode. Legacy non-AJAX setups cannot be tracked by any page listener |
| `copper-forms` | Copper's floating contact widget only. Iframe embeds and Copper-hosted pages are not covered |
| `divi-forms` | AJAX submission. Divi's native (non-AJAX) submission is not covered |
| `elementor-forms` | The Elementor Pro Form widget |
| `fillout-forms`, `paperform` | Embeds on the site. Fillout's standard embed and Paperform's inline and pop-up embeds (and an inline redirect form) were live-tested; Fillout's pop-up, slider, full-screen and multi-page embeds and Paperform's full-screen, multi-page and guided forms were not. Hosted share pages and custom tool domains are not covered, nor Fillout redirecting forms, payment blocks and scheduling blocks |
| `forminator` | AJAX submission. Forms set to a page-reload confirmation are not covered |
| `formsite` | Set the Success Page to Redirect to a page on the site with `?formsite_form=<short key>`, and run the detector there. Formsite's own thank-you message is not covered |
| `freshsales-forms` | The classic inline form with a custom success message. Redirects, hosted forms and iframes are not covered |
| `getleadforms` | LeadCapture.io's Form only embed. The full funnel frame embed sends the page no success signal |
| `gravity-forms` | AJAX submission with a text confirmation. Page-reload and redirect confirmations navigate away before any signal and are not covered; switch the form to AJAX |
| `happyforms` | The default AJAX success message, live-tested. Redirect and multi-page setups are untested |
| `highlevel-forms` | HighLevel forms and surveys embedded on the site. White-label domains and bookings are not covered |
| `hubspot-forms` | The listener must load before the form succeeds; earlier successes are missed. EU-hosted, multi-step and CTA pop-up forms are not live-verified |
| `hubspot-meetings` | Personal inline meeting embeds on `meetings.hubspot.com`. Regional and custom domains, group, round-robin and paid meetings are not covered |
| `instapage` | reCAPTCHA pages and AMP are not covered |
| `jotform` | The full source-code embed only. Jotform's iframe and JavaScript embeds send the page no signal; switching the embed type makes the form trackable |
| `kit` | The inline JavaScript embed was live-tested; the full HTML embed, modal, slide-in and sticky bar were not. If Kit sends the visitor to a separate spam-check page, the signup is missed. Hosted Kit landing pages are not covered |
| `mailchimp` | Classic embeds, live-tested. Plain embeds need the return link set to the user's own page with `?converly=mailchimp`, same tab; that path is checked offline only. Pop-up forms and hosted signup pages are not covered |
| `netlify` | A custom thank-you page set as the form's `action`, same tab, with the detector on both pages. Netlify's default success page is not covered. Submissions Netlify files as spam still reach the thank-you page and count (seen live) |
| `optinmonster` | Popup campaigns with name and email were tested. Other campaign types use the same mechanism but are untested |
| `pipedrive-forms` | Set the form's after-submit option to redirect to an HTTPS page on the same site, and use the standard embed (no `id` attribute on its container) on an HTTPS page. The standard single-form embed was live-tested, with spam protection off. Pipedrive's default inline thank-you mode is not covered |
| `salesforce-forms` | A Web-to-Lead form on the site whose return URL is a different HTTPS page on the same site, with the detector on all pages. Return counting (above). The form page's path is sent as `form_id`, so it must not contain personal details. Forms with Salesforce's reCAPTCHA are unverified. Pardot is a different product and is not covered |
| `squarespace-forms` | Form blocks, including ones that redirect. Lightbox forms, 7.0 legacy forms, newsletter blocks and commerce and member forms are not covered |
| `typeform`, `tally` | Embeds on the site. Tally's pop-up and full-page embeds and multi-page Tally forms are untested. A visitor who completes the form on the tool's own hosted link is not on the site, so nothing counts |
| `unbounce` | Smart Builder pages, with GTM added through Script Manager in the Head. Dialog and redirect confirmations were live-tested; lightboxes were checked offline only. Classic builder pages, standalone pop-ups and sticky bars are not covered |
| `webflow-forms` | Forms that show Webflow's inline success message. Forms set to redirect to a thank-you page do not fire; use `thank-you-page` for those |
| `wix-scheduling` | The listener must already be on the Thank You page: Wix reports the booking 3 to 13 seconds after it loads, and a visitor who leaves sooner is not counted. Services set to manual approval count at the request, before the business accepts |
| `ws-form` | AJAX forms on a site that loads jQuery. WS Form without jQuery, and custom non-AJAX form actions, are not covered |
| `zoho-bookings` | Australian data centre (`zohobookings.com.au`) inline and button embeds, on a paid plan with Show your own confirmation page set to a page on the same site and Pass booking details on. That page must allow being shown inside a frame; keep it a bare page. Other data centres are not covered |
| `zoho-crm-forms` | The Source Code web form, whose return URL is a different HTTPS path on the same site, with the detector on all pages. Return counting (above). Only the Australian data centre was live-tested; other regions were checked offline. This is Zoho CRM, not Zoho Forms |

## Universal patterns

These are not fallbacks of last resort. Two of them are the correct primary answer for
whole categories of business.

| Slug | Covers | Notes |
|---|---|---|
| `phone-click` | Click on a `tel:` link | **The most under-tracked conversion there is.** For a plumber, a dentist, a roofer or a lawyer, the conversion *is* the phone call and no form exists. Counts intent, not answered calls; use a call tracking number if you need answered-call accuracy |
| `thank-you-page` | Arrival on a confirmation page | Edit the path list at the top. Handles single-page apps by watching history changes, which matters because a React or Next site changes URL without a pageview and a thank-you page trigger silently counts zero |
| `generic-ajax-form` | Inline success after an AJAX submit | The long tail of unknown form tools. Refuses to fire on submit alone: it waits for a success signal and bails if a visible validation error appears. Weaker than a named detector, so always prefer one when it exists |
| `file-download` | Click on a document or media link | Price lists, brochures, spec sheets. GA4 already collects this natively; use it when you need the signal in Google Ads or Meta, which do not |

## No free snippet yet

**"No snippet" does not mean "cannot be tracked", and the difference matters.** Most of the
tools below are already supported natively as Converly triggers, and several are supported
by their own platform's native integration. What is missing is only *this repo's free
browser-side detector*.

So when one of these comes up: offer the paid path if the routing calls for it, and for the
free path identify the install shape below and use the matching universal pattern. Never
report the absence of a snippet as the absence of an option.

**Shape 1, page listener** (14): AWeber, Klaviyo, Marketo, Leadpages, Formstack, Zoho Forms,
HelloBar, ConvertBox, Thrive Leads, Chili Piper, Intercom, Crisp, Tawk.to, Drift.

**Shape 2, WordPress but not a form submit** (6): LearnDash, LearnPress, Tutor LMS, Paid
Memberships Pro, Ultimate Member, Easy Digital Downloads.

**Shape 3, two-part install** (1): Pardot.

**Shape 4, conversion on someone else's domain** (5): Kajabi, Teachable, Thinkific,
ThriveCart, ClickFunnels checkout.

## The install shapes

Work out which one applies, then act.

**Routing note before the shapes.** These describe the FREE browser-side path only. Most of
the membership and course platforms below are supported Converly triggers today, and for a
lead-gen moment going to an ad platform the Fitting rule still applies. Work out the shape
for the free option; do not let it replace the recommendation.

**Shape 1. A page listener works.** The tool renders in the page and emits something
observable: its own JS event, a success callback, or a success element appearing. Use
`generic-ajax-form`, or write a named detector following any shipped snippet.

**Shape 2. Same domain, but the moment is not a form submit.** An enrolment, a membership
signup, a course completion. There is usually no submit event to hook. Use
`thank-you-page` against the post-enrolment URL, or a platform hook if one exists.

**Shape 3. Half the code has to go inside the vendor's own tool.** Classic Pardot forms
are iframes served from a Salesforce domain, so nothing on the parent page can see inside
them. The fix is code pasted into the vendor's own thank-you or completion field that
messages out to the parent page, plus a listener that catches it. Walk the user through
the vendor screen; there is no snippet-only answer.

**Shape 3b. The moment only the backend knows.** A SaaS signup, an account created, a
lead an API received. No browser event exists at all, so nothing in `snippets/` applies and
no GTM recipe can help. The backend has to report it, and the click ID has to be carried
across from the browser session separately. See `converly-sdk.md`. Ecommerce purchases are
excluded from this and route to the ecommerce options (`ecommerce-platforms.md`) however
the store was built.

**Shape 4. The conversion happens on a domain the user does not own.** Kajabi, Teachable,
Thinkific, ThriveCart, hosted checkouts. Several provide a checkout tracking code field,
so a pixel can fire. **What cannot cross is the click ID**, because it lives in a cookie
on the user's own domain and is unreadable from the vendor's. The sale records with no
click attached, so the ad platform cannot attribute it.

Be straight about this. It is not a configuration mistake and no snippet fixes it. The
options are cross-domain linking where the vendor supports it, or server-side capture that
carries the identifier server to server (`server-side-options.md`). This is the strongest
genuine case for server-side tracking in the whole repo, so it is also the one where the
recommendation must be most carefully earned rather than assumed.

## When nothing here fits

1. **Ask what happens after submit.** Redirect to a new URL, inline message, or nothing
   visible? That answer alone picks the shape.
2. **Look at the page.** `references/form-mechanics-detection.md` §A covers the four
   submit patterns and how to tell them apart.
3. **Check whether the platform already does it.** Shopify's and HubSpot's native
   integrations (`server-side-options.md`) come first where they cover the destination.
   Lead with them, and offer the other options as the runner-up for what they miss.
4. **Only then** reach for `generic-ajax-form` or `thank-you-page`.

If you build a working detector for a tool not listed here, it is worth contributing back.
