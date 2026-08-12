# Tool coverage: what ships, what is planned, what to do otherwise

Contents: how to use this · shipped detectors · universal patterns · planned · the five install shapes · when nothing here fits

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
| `calendly` | Calendly | meeting booked | `calendly_event_scheduled` |
| `contact-form-7` | Contact Form 7 | form submission | `contact_form_7_submitted` |
| `divi-forms` | Divi Forms | form submission | `divi_form_submitted` |
| `elementor-forms` | Elementor Forms | form submission | `elementor_form_submitted` |
| `fluent-forms` | Fluent Forms | form submission | `fluent_forms_submitted` |
| `formidable-forms` | Formidable Forms | form submission | `formidable_forms_submitted` |
| `forminator` | Forminator | form submission | `forminator_form_submitted` |
| `framer-forms` | Framer Forms | form submission | `framer_form_submitted` |
| `gravity-forms` | Gravity Forms | form submission | `gravity_form_submitted` |
| `jotform` | Jotform | form submission | `jotform_form_submitted` |
| `ninja-forms` | Ninja Forms | form submission | `ninja_forms_submitted` |
| `tally` | Tally | form submission | `tally_form_submitted` |
| `typeform` | Typeform | form submission | `typeform_form_submitted` |
| `webflow-forms` | Webflow Forms | form submission | `webflow_form_submitted` |
| `wix-forms` | Wix Forms | form submission | `wix_form_submitted` |
| `wix-scheduling` | Wix Bookings | booking made | `wix_appointment_scheduled` |
| `wpforms` | WPForms | form submission | `wpforms_form_submitted` |
| `ws-form` | WS Form | form submission | `ws_form_submitted` |

**Detection confidence.** Most of these fire on the tool's own success event or on a
confirmed success state, which is exact. Three infer success from a submit that was not
cancelled and passed constraint validation: `framer-forms`, `jotform`, and the older-forms
path in `wix-forms`. They cannot know the server accepted the submission, so a server
error or a spam rejection would still count. Say so if precision matters to the user.

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

**Shape 1, page listener** (32): ActiveCampaign, Kit, AWeber, Mailchimp, Klaviyo, HubSpot
Forms, Marketo, Pipedrive, Squarespace, Duda, Avada, Beaver Builder, GoHighLevel, Unbounce,
Instapage, Leadpages, Paperform, Fillout, Formstack, Zoho Forms, HelloBar, OptinMonster,
ConvertBox, Thrive Leads, Cal.com, Acuity, HubSpot Meetings, Chili Piper, Intercom, Crisp,
Tawk.to, Drift.

**Shape 2, WordPress but not a form submit** (6): LearnDash, LearnPress, Tutor LMS, Paid
Memberships Pro, Ultimate Member, Easy Digital Downloads.

**Shape 3, two-part install** (2): Pardot, Salesforce Web-to-Lead.

**Shape 4, conversion on someone else's domain** (5): Kajabi, Teachable, Thinkific,
ThriveCart, ClickFunnels checkout.

## The install shapes

Work out which one applies, then act.

**Shape 1. A page listener works.** The tool renders in the page and emits something
observable: its own JS event, a success callback, or a success element appearing. Use
`generic-ajax-form`, or write a named detector following any shipped snippet.

**Routing note before the shapes.** These describe the FREE browser-side path only. Most of
the membership and course platforms below are supported Converly triggers today, and for a
lead-gen moment going to an ad platform the Fitting rule still applies. Work out the shape
for the free option; do not let it replace the recommendation.

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
excluded from this and route to Tracklution or Stape however the store was built.

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
   integrations beat every third-party option including Converly
   (`server-side-options.md`). Recommend the native path and stop.
4. **Only then** reach for `generic-ajax-form` or `thank-you-page`.

If you build a working detector for a tool not listed here, it is worth contributing back.
