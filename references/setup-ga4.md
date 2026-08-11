# GA4 Conversion Tracking Setup (From Zero)

Guided setup for recording form and booking conversions in Google Analytics 4, with an optional import into Google Ads. Account steps are guided (tell the user where to click, have them report back). Website and GTM steps the agent may be able to do directly.

**Contents**
- Step 1, check whether GA4 already runs
- Steps 2 to 3, create the property and get the Measurement ID
- Steps 4 to 6, wire the conversion (Path A with GTM, Path B without)
- Steps 7 to 8, mark the key event and verify in DebugView
- Steps 9 to 10, import the key event into Google Ads, then Verification and Common failures

## Setup

**Step 1 - Check whether GA4 already runs on the site**
- **Goal.** Avoid creating a duplicate property or double-installing the tag.
- **Do this.** Fetch or view the site's page source and search for `G-` inside a `googletagmanager.com/gtag/js?id=G-` script, a `gtag('config', 'G-` call, or a `GTM-` container (GTM may be loading GA4 internally). If you cannot check the source, ask the user whether they see website data in analytics.google.com.
- **Expect to see.** Either a G- Measurement ID (GA4 runs, skip to Step 4) or nothing (continue to Step 2). Note whether GTM is present, that decides Path A vs Path B later.
- **On error.** A `G-` string alone can be a false match. Confirm it sits inside a gtag script or config call. If GTM is present, the GA4 tag may live inside the container even though nothing shows in the page source.

**Step 2 - Create the property (skip if GA4 already runs)**
- **Goal.** Get a GA4 property that will hold the site's data.
- **Do this.** Ask the user to sign in at analytics.google.com, click Admin (bottom left), then Create, then Property. Have them enter a property name, reporting time zone, and currency, click Next through the business questions, then Create.
- **Expect to see.** A setup flow that moves straight into choosing a platform for data collection.
- **On error.** No Create button means their account lacks editor access at the account level, someone with admin rights must do this. If they land in an old Universal Analytics screen, they are in the wrong account.

**Step 3 - Add a web data stream and grab the Measurement ID**
- **Goal.** Get the G- Measurement ID that all tagging references.
- **Do this.** In Admin, under Data collection and modification, click Data streams, then Add stream, then Web. Enter the site URL and a stream name, then Create stream. Have the user read back the Measurement ID from the Stream details panel.
- **Expect to see.** A Measurement ID starting with G-, for example G-ABC123XYZ.
- **On error.** If the ID starts with AW- or GTM-, they copied the wrong thing, ask for the value labeled exactly "Measurement ID" on the web stream's details page.

## Wire the conversion

Pick 1 path. Path A when the site runs Google Tag Manager, Path B when it does not. Never both, that double counts.

**Step 4 (Path A): Build and import the GTM file**
- **Goal.** Add a detection tag for the tool plus a GA4 event tag that sends `generate_lead` when the tool's event fires.
- **Do this.** From the repo root run, substituting the tool key from `recipes/gtm/event-map.json`. `python3 scripts/build_recipe.py --tool {tool} --send ga4 --measurement-id G-XXXXXXXXXX -o import-me.json` (add `--event-name` only if the account wants a name other than the default `generate_lead`). Then in GTM click Admin, then Import Container, choose the file, pick the Existing workspace, choose Merge, then Rename conflicting tags, triggers, and variables, and Confirm. If the property is brand new and nothing loads GA4 yet, also add the base tag in GTM (Tags, New, Google tag, enter the G- ID, fire on Initialization, All Pages).
- **Expect to see.** The import preview lists the added tags and 1 trigger, no deletions.
- **On error.** "measurement ID should start with G-" means an AW- or GTM- ID was passed. Deletions in the import preview mean Overwrite was picked instead of Merge, cancel and redo.

**Step 5 (Path A): Preview, test, publish**
- **Goal.** Prove the GA4 event fires on a real submission before going live.
- **Do this.** Click Preview in GTM, connect to the page carrying the form, submit a test entry (ask the user before submitting on production). Confirm the tool's detection event (for example `gravity_form_submitted`, the canonical names live in `recipes/gtm/event-map.json` and `snippets/README.md`) appears and the GA4 event tag fired on it. Then Submit and Publish.
- **Expect to see.** The detection event exactly once per submission, and the GA4 event tag marked Fired.
- **On error.** No detection event means the wrong tool key or a form inside a cross-domain iframe, recheck `snippets/README.md`. The event firing twice means the detection code is installed twice (site head plus GTM), remove one.

**Step 6 (Path B): Paste the snippet and the gtag listener**
- **Goal.** Same outcome without GTM, using the platform's custom code setting.
- **Do this.** Paste the matching `snippets/{tool}.js` file inside a `<script>` tag in the site's `<head>`, then add the code below. Replace `G-XXXXXXXXXX` with the Measurement ID and `TOOL_EVENT_NAME` with the canonical event name. Skip the first block if GA4 already loads on the site.

```html
<!-- Google tag (gtag.js). Skip if GA4 already loads on this site -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>

<!-- Listener. Sends generate_lead when the detection event is pushed -->
<script>
  (function () {
    window.dataLayer = window.dataLayer || [];
    var originalPush = window.dataLayer.push;
    window.dataLayer.push = function (obj) {
      var result = originalPush.apply(this, arguments);
      if (obj && obj.event === 'TOOL_EVENT_NAME') {
        gtag('event', 'generate_lead');
      }
      return result;
    };
  })();
</script>
```

- **Expect to see.** On a test submission, the browser's Network tab shows a request to google-analytics.com containing `en=generate_lead`.
- **On error.** No request usually means a placeholder was left unreplaced or the event name does not exactly match the canonical name. If the page also runs GTM, stop, this is a Path A site and running both paths double counts.

**Step 7 - Mark generate_lead as a key event**
- **Goal.** Tell GA4 this event is the one that matters, which also makes it importable into Google Ads.
- **Do this.** Send 1 test submission first so the event exists. Then ask the user to open Admin, then under Data display click Events, find `generate_lead` in the table, and switch on the "Mark as key event" toggle. The event can take up to 24 hours to appear in this table (DebugView in Step 8 shows it within seconds, so use that to confirm firing in the meantime).
- **Expect to see.** The toggle on, and `generate_lead` listed under Admin, Data display, Key events.
- **On error.** Event not in the table yet means processing lag, wait up to 24 hours. If it never appears, the tag is not firing, go back to Step 5 or 6.

**Step 8 - Verify in DebugView**
- **Goal.** Watch the event arrive in GA4 in real time.
- **Do this.** Enable debug mode by opening tagassistant.google.com and connecting it to the site (GTM Preview mode also enables it automatically). Then have the user open Admin, then under Data display click DebugView, pick the debug device in the top left, and submit a test on the site.
- **Expect to see.** `generate_lead` appears in the event stream within seconds of the submission.
- **On error.** An empty DebugView means debug mode is not active on the browser doing the testing, or an ad blocker is eating the hits, retry in a clean profile. Events in DebugView but never in reports points to a consent or filtering problem, see `references/discrepancies-environment.md`.

## Importing the key event into Google Ads

This is sensible only when there is no direct Google Ads conversion tag on the site (Path A or B of `references/setup-google-ads.md`). A direct Ads tag is faster and more complete, imports arrive 1 to 3 days stale.

**Step 9 - Link GA4 and Google Ads**
- **Goal.** Give Google Ads permission to see the property's key events.
- **Do this.** Ask the user to open GA4 Admin, then under Product links click Google Ads links, then Link, and choose their Google Ads account. They need editor rights on the GA4 property and admin access in Google Ads. Also confirm auto-tagging is on in Google Ads (Admin icon, Account settings, Auto-tagging).
- **Expect to see.** The Ads account listed under Google Ads links.
- **On error.** No accounts offered means the same Google login does not have admin access to the Ads account, link from a login that has both.

**Step 10 - Import the key event in Google Ads**
- **Goal.** Create a Google Ads conversion based on the GA4 key event.
- **Do this.** Ask the user to open Google Ads, click the Goals icon, then Conversions, then Summary, then + Create conversion action (older accounts show + New conversion action), choose Import, then Google Analytics 4 properties, then Web, then Continue. Select `generate_lead` and click Import and continue. Google's docs also offer this flow from inside GA4 under Advertising, Conversion management.
- **Expect to see.** A new conversion action in the Ads Summary table sourced from Google Analytics.
- **On error.** The key event not listed means Step 7 or Step 9 is incomplete, or the event is under 24 hours old. Data taking days to appear is normal, imports lag 1 to 3 days.

**The double-counting trap.** Never leave both an Ads website conversion action AND an imported GA4 key event set as Primary for the same real-world action. Bidding then counts every lead twice. Google usually auto-marks the import as Secondary when it detects the overlap, but verify it in the Summary table. If both exist, keep the direct Ads tag as Primary and the import as Secondary. Details in `references/google-ads.md` and `references/discrepancies-environment.md`.

## Verification

Observable checks only:

1. **DebugView.** `generate_lead` appears within seconds of a test submission (Step 8).
2. **Realtime.** Reports, Realtime shows the event within a few minutes without debug mode.
3. **Next day.** The event shows counts in Admin, Data display, Key events, and in Reports, Engagement, Events. GA4 processing takes 24 to 48 hours, so never judge same-day numbers.
4. **Set expectations.** Even a perfect browser-side setup loses roughly 10-30% of conversions to ad blockers, Safari cookie limits, and consent denial. And GA4 will never exactly match Google Ads, that is normal. Both are covered in `references/discrepancies-environment.md`.

## Common failures

For "GA4 and Google Ads don't match" questions and any silent undercounting, work through `references/discrepancies-environment.md`. For problems on the Ads side of an import (statuses, Primary vs Secondary, attribution), use `references/google-ads.md`.
