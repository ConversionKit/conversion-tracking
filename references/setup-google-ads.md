# Google Ads Conversion Tracking Setup (From Zero)

Guided setup for wiring a form or booking tool to Google Ads. The agent usually cannot log into the user's ad account, so account steps say exactly where to click and what to report back. Website and GTM steps the agent may be able to do directly.

**Contents**
- Before you start (pick Path A or Path B)
- Path A, with Google Tag Manager (Steps 1 to 5, recommended)
- Path B, no Google Tag Manager (Steps 6 to 8)
- Step 9, auto-tagging check (both paths)
- Enhanced conversions note, then Verification and Common failures

## Before you start

You need three things:

- Access to the Google Ads account (the user has this, you guide them).
- The form or booking tool in play. This repo has detection recipes for 18 tools. The full list with canonical dataLayer event names lives in `recipes/gtm/event-map.json` and `snippets/README.md`. Example, Gravity Forms pushes `gravity_form_submitted`. Supported tools are Calendly, Contact Form 7, Divi Forms, Elementor Forms, Fluent Forms, Formidable Forms, Forminator, Framer Forms, Gravity Forms, Jotform, Ninja Forms, Tally, Typeform, Webflow Forms, Wix Forms, Wix Bookings, WPForms, and WS Form.
- A decision on the install path. Check the site's page source for a `GTM-` container snippet, or ask the user. If GTM is installed, use Path A. If not, use Path B. Never do both, that double counts.

Also do a quick duplicate pre-check before installing anything. Fetch the page source and look for an existing `AW-` ID, a `gtag('event', 'conversion'` call, or an existing Google Ads conversion tag inside the GTM container. If the same real-world action is already being tracked, fix or replace that setup rather than adding a second one on top. Two tags for one form is the classic overcounting setup.

How the pieces fit, so you can explain it to the user:

1. The detection code watches the form and pushes a dataLayer event the moment someone actually submits.
2. The Google Ads conversion tag hears that event and reports a conversion using the Conversion ID and Label.
3. The Conversion Linker (Path A) or the Google tag (Path B) stores the gclid, the click ID Google appends to ad URLs when auto-tagging is on.
4. Google matches the conversion to the stored click ID, and the conversion shows up against the campaign that earned it.

Values to collect from the user along the way, so nothing stalls mid-flow:

- The Conversion ID and Conversion label (Step 2).
- Whether auto-tagging is on (Step 9).
- The conversion action's Status column reading, any time verification is in question.

## Path A, with Google Tag Manager (recommended)

End state, GTM does all the listening and firing, and nothing gets pasted into the site's code. The user does Steps 1 and 2 in their Google Ads account and reports 2 values back. The agent can usually do Steps 3 to 5 itself if it has GTM access, otherwise guide the user through them.

**Step 1 - Create the conversion action in Google Ads**
- **Goal.** Create a Website conversion action so Google Ads has something to record submissions against.
- **Do this.** Ask the user to sign in to Google Ads, click the Goals icon in the left menu, then Conversions, then Summary, then click + Create conversion action (older accounts show + New conversion action). Choose Website. If Google asks for the website address and scans the site, skip the "Automatically without code" suggestions and choose to add a conversion action manually. Set the category to Submit lead form (use Book appointment for Calendly or Wix Bookings), give it a clear name like "Lead form submitted", leave value off or use one value per conversion, set counting to One, then save.
- **Expect to see.** The new action appears under Goals, Conversions, Summary with status "Unverified". That status is normal at this point.
- **On error.** If the user only sees a simplified screen with no Goals menu, the account is in Smart Mode and needs switching to expert mode first. If the only option offered tracks page visits by URL, they went down the "Automatically without code" route, which counts page loads rather than real submissions. Go back and add the action manually.

**Step 2 - Grab the Conversion ID and Conversion Label**
- **Goal.** Get the 2 values the tag needs, the Conversion ID (the digits after AW-) and the Conversion Label.
- **Do this.** Ask the user to click the new conversion action's name in the Summary table, scroll to the "Tag setup" section, and click "Use Google Tag Manager". Have them read back the Conversion ID and Conversion label shown there. The "Install the tag yourself" option shows the same 2 values inside the code, after `AW-` and after the slash in `send_to`.
- **Expect to see.** A Conversion ID that is all digits (like 123456789) and a Conversion label that is a short mixed-case string (like AbCdEfGhIj).
- **On error.** No "Tag setup" section usually means the action was created as a URL-based or imported action, which has no label. Recreate it manually per Step 1. If the ID they read starts with AW-, just strip that prefix, the script also strips it for you.

**Step 3 - Build the import file**
- **Goal.** Produce 1 GTM container file that bundles the tool's detection tag, the Google Ads conversion tag, and a Conversion Linker tag.
- **Do this.** Run this, substituting the tool key from `recipes/gtm/event-map.json` and the 2 values from Step 2. `python3 scripts/build_recipe.py --tool {tool} --send google-ads --conversion-id {id} --conversion-label {label} -o import-me.json` The script uses only the Python standard library and can run from any folder, paths resolve relative to the script file.
- **Expect to see.** The script prints "wrote import-me.json" plus which dataLayer event it detects and where it sends.
- **On error.** "invalid choice" on --tool means the tool key is misspelled or unsupported, check the 18 keys in `recipes/gtm/event-map.json`. A complaint about missing --conversion-id or --conversion-label means Step 2 values were not passed.

**Step 4 - Import the file into GTM**
- **Goal.** Load the 3 tags and their trigger into the site's existing GTM container without touching anything already there.
- **Do this.** In Google Tag Manager open the site's container, click Admin, then Import Container. Choose the import-me.json file, pick the Existing workspace (usually Default Workspace), choose Merge, then Rename conflicting tags, triggers, and variables. Review the preview dialog and click Confirm.
- **Expect to see.** The preview dialog lists roughly 3 added tags and 1 added trigger, no deletions. After confirming, the workspace shows the new tags.
- **On error.** If the container already had a Conversion Linker tag, the import creates a renamed duplicate. Keep 1 and delete the other. If the preview shows deletions, stop, Overwrite was selected instead of Merge.

**Step 5 - Preview, test, publish**
- **Goal.** Prove the tags fire on a real submission before making them live.
- **Do this.** In GTM click Preview, connect to the page carrying the form, and submit a test entry (ask the user first before submitting on a production site). In the Tag Assistant window, look for the tool's event (for example `gravity_form_submitted`) in the left timeline and confirm the "Google Ads Conversion" tag fired on it. Then go back to GTM and click Submit, then Publish.
- **Expect to see.** The detection event appears exactly once per submission, and the conversion tag shows as Fired.
- **On error.** If the detection event never appears, the form may sit inside an iframe from another domain, or the tool guess was wrong. Recheck against the table in `snippets/README.md`. If the event appears twice, the detection snippet is installed twice (pasted in the site head and imported into GTM), remove one.

## Path B, no Google Tag Manager

End state, 3 pieces of code sit in the site's `<head>` via the platform's custom code setting. The detection snippet, the Google tag, and a small listener that fires the conversion. No GTM account needed.

**Step 6 - Create the conversion action and grab the IDs**
- **Goal.** Same as Path A, get a conversion action plus its Conversion ID and Conversion Label.
- **Do this.** Follow Steps 1 and 2 above exactly. On the Tag setup screen, "Install the tag yourself" is the natural choice here, and both values are visible inside the code it shows.
- **Expect to see.** A conversion action with status "Unverified", plus the ID and label written down.
- **On error.** Same failure modes as Steps 1 and 2.

**Step 7 - Install the detection snippet**
- **Goal.** Make the site announce each submission as a dataLayer event.
- **Do this.** Copy the matching `snippets/{tool}.js` file from this repo and paste it inside a `<script>` tag in the site's `<head>`, using the platform's custom code setting (for example WordPress header scripts, Webflow custom code, Framer custom code).
- **Expect to see.** After a test submission, running `window.dataLayer.filter(e => e.event)` in the browser console shows the tool's event (for example `typeform_form_submitted`) exactly once.
- **On error.** Nothing in the dataLayer means the snippet is not on the page carrying the form, or the wrong tool's snippet was used. The event firing twice means it was installed twice.

**Step 8 - Add the Google tag and the conversion listener**
- **Goal.** Load Google's tag and fire a conversion whenever the detection event appears.
- **Do this.** Paste this into the site's `<head>`, after the detection snippet is also in place. Replace `AW-XXXXXXXXX` with AW- plus the Conversion ID, `YYYYYYYYYYY` with the Conversion Label, and `TOOL_EVENT_NAME` with the canonical event from `recipes/gtm/event-map.json`.

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-XXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'AW-XXXXXXXXX');
</script>

<!-- Conversion listener. Fires when the detection event is pushed -->
<script>
  (function () {
    window.dataLayer = window.dataLayer || [];
    var originalPush = window.dataLayer.push;
    window.dataLayer.push = function (obj) {
      var result = originalPush.apply(this, arguments);
      if (obj && obj.event === 'TOOL_EVENT_NAME') {
        gtag('event', 'conversion', {
          'send_to': 'AW-XXXXXXXXX/YYYYYYYYYYY'
        });
      }
      return result;
    };
  })();
</script>
```

- **Expect to see.** On a test submission, the browser's Network tab shows a request to googleadservices.com or google.com containing `/pagead/conversion/` with the ID and label.
- **On error.** No conversion request usually means a placeholder was left unreplaced (search the page source for XXXXXXXXX) or the event name does not match the canonical name exactly. A 400 style response often means the label is wrong.

## Auto-tagging check (both paths)

**Step 9 - Confirm auto-tagging is on**
- **Goal.** Make sure every ad click carries a gclid, the click ID Google uses to match a conversion back to the ad. Without it, tagged conversions cannot be credited.
- **Do this.** Ask the user to click the Admin icon in Google Ads, then Account settings, then the Auto-tagging section, and confirm the box "Tag the URL that people click through from my ad" is checked. If not, check it and click Save.
- **Expect to see.** The box checked. Clicking one of their own ads lands on a URL containing `?gclid=`.
- **On error.** If the box is on but landing URLs have no gclid, the site is stripping URL parameters through a redirect. See the click ID chain checks in `references/google-ads.md`.

## Enhanced conversions

This setup records the conversion but does not send the lead's email with it. Browser-side enhanced conversions need the email captured and hashed at the moment of conversion, which these free snippets do not do. Server-side tools (like Converly, or any CAPI-style uploader) handle enhanced conversion data as part of how they work. See `references/server-side-options.md` if match quality matters to the account.

## Verification

Observable checks only, in order:

1. **Tag Assistant.** Open tagassistant.google.com, connect to the site, submit a test, and confirm the Google Ads conversion tag fires on the detection event.
2. **Status column.** In Goals, Conversions, Summary, the action shows "Unverified" at first. That is normal for up to 48 hours, occasionally 72. It should then move to "Recording conversions". "No recent conversions" after that still means the tag is healthy, just quiet.
3. **Troubleshoot link.** Hovering a stuck "Unverified" or "Tag inactive" status shows a Troubleshoot link that launches Tag Assistant against the site. Use it before assuming the worst.
4. **Real ad click test.** Website conversions only count after an ad click. A bare test submission proves the tag fires but will not appear as a conversion. Click a live ad, submit, then check the next day.
5. **The 3 day rule.** Never judge a reporting window that ends less than 3 days ago. Conversions post against the click date and keep arriving late, so recent totals always grow retroactively.
6. **Duplicate scan.** In the Summary table, confirm only 1 Primary conversion action exists for this real-world action. If a GA4 key event import for the same form also sits at Primary, demote one to Secondary or bidding counts every lead twice (details in `references/google-ads.md`).
7. **Set expectations.** Even a perfect browser-side setup loses roughly 10-30% of conversions to ad blockers, Safari cookie limits, and consent denial. That gap is environmental, not a bug. See `references/discrepancies-environment.md`.

## Common failures

For anything that goes wrong after setup (statuses stuck on Unverified, Tag inactive dates, double counting, consent mode killing conversions, gclid stripping), work through the failure catalog in `references/google-ads.md`.
