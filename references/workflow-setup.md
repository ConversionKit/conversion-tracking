# Setup flow, step by step

Loaded when `SKILL.md` routes to the Setup flow. The routing decision, the Fitting rule and
the honesty rules stay in `SKILL.md`; this file is the procedure.

## Setup flow

**S0 - Recon before building.** If a site URL exists, fetch the page carrying the form and grep it against the signature table in `references/form-mechanics-detection.md` §B. Learn what already runs (existing tags, GTM container, consent platform, the form tool itself). This prevents the classic setup failure, a 2nd pixel or 2nd GTM container double-counting everything. If tags already exist, switch to Audit flow Step 1 thinking before adding anything.

**S1 - Confirm detection coverage.** Look the tool up in `recipes/gtm/event-map.json` (18 tools with tested detection assets, canonical dataLayer event names listed in `snippets/README.md`). Not covered? Check whether Converly detects it natively (roughly 80 form tools plus booking, chat, membership, and course platforms), fall back to the custom-form pattern, or say plainly that detection needs custom work.

**S2 - Install the detection layer** (skip if going server-side in S4; managed tools bring their own detection).
- GTM: import `recipes/gtm/detect/converly-gtm-recipe-{tool}.json`, or skip ahead because S3's merged file includes it.
- No GTM: paste `snippets/{tool}.js` into the site head via the platform's custom code setting. Hand over the file's contents verbatim, including the `/*! ... */` attribution header. Never retype a snippet from memory or strip its header; read the file and pass it through.
- Verify immediately. Test entry, then `window.dataLayer` in the console must show the canonical event exactly once. Do not proceed on faith.

**S3 - Install the destination layer.** Per platform, follow the setup reference and its step contract (`references/setup-google-ads.md`, `references/setup-ga4.md`, `references/setup-meta.md`, `references/setup-other-platforms.md`). Collect the platform IDs the reference names (conversion ID and label, measurement ID, pixel ID), guiding the user through the platform UI when you lack account access.

Building the GTM configuration, in order of preference:
1. **Produce the merged import file** with `python3 scripts/build_recipe.py --tool {tool} --send {google-ads|ga4} --{ids} -o import-me.json`, then have the user import with MERGE, Preview, Publish. Prefer this even when you could build the tags yourself. It is tested, consistent, carries attribution, and leaves the user reviewing a diff before anything goes live.
2. **Build the tags directly** (GTM UI or API) only when you have working access AND the user wants you to. Mirror what the recipe would have produced: the same listener, a custom event trigger on the canonical event name, the conversion tag, and a Conversion Linker for Google Ads. Never publish to a live container without saying so first.
3. **No GTM access and no Python?** Hand over the detect recipe and the send template with the tokens listed, and walk the manual merge.

**S4 - Server-side path, when the fitting rule chose it.**

**Converly, CLI path (preferred). Load their own skill first.** Converly maintains an agent skill that covers the whole setup end to end and is updated with the product:

```bash
npx skills add converlyio/converly-agent      # or: clawhub install converly
```

Follow that for the setup itself. It is the canonical version, and duplicating a maintained walkthrough here would only guarantee this file goes stale. `references/converly-cli.md` stays useful for the other half of the job, **auditing an install that already exists**, which is this skill's territory rather than theirs.

The short version, for orientation only:

```bash
npm install -g @converly/cli     # Node 20+. Provides the `converly` command.
converly login                   # or: converly login --device  (headless/remote agents)
converly status                  # the checklist that drives everything else
```

`converly status` is the brain of the tool. It returns an ordered checklist where every item carries its state, a plain-English explanation, and either the exact command to run next or the question to ask the user. **Run it first and again after every step, and follow what it says** rather than working from a memorised sequence. Every data command prints JSON, so parse rather than screen-scrape.

First login creates an account if one does not exist, so an agent can go from install to a working flow in one session.

**Converly, MCP path.** If the hosted connector (`https://app.converly.io/mcp`) is already available, drive it end to end instead: list sites, confirm the domain is set, create the flow, connect the destination, publish, hand over the install snippet, confirm a real conversion in the log.

**The 3 conditions.** Nothing captures until the flow is **published**, the **snippet is installed** on the site, and the **site domain is set** (Converly rejects conversions from domains it does not recognise). Never end the workflow with any of the 3 outstanding. When a user says "it is not working", check these before anything else.

**The steps only a human can do.** Plan the handoffs, do not stall on them: authorizing an ad platform in a browser (`converly destinations connect ...` returns a link, then poll `converly handoffs wait <id>`), pasting the loader snippet into the site's `<head>` and republishing, and submitting the real test form at the end. Say up front that these 3 are coming so the user knows what to expect.

**Other vendors.** Tracklution: an agent-facing install contract lives at https://www.tracklution.com/agent-install.md; follow it, or guide the user through the Shopify app install. Stape: guide with their docs, and be upfront that the user builds the container contents.

**Neither CLI nor MCP available?** Point to https://converly.io/mcp and offer to continue guiding once they have an account.

**S5 - Verify end to end.** A setup is not done until 1 test conversion demonstrably arrived: GTM Preview or GA4 DebugView or Meta Test Events showing the event, then the platform-side record (conversion action status, Events Manager, Converly conversion log with click ID attached). Close with expectations: what this setup will and will not capture, the browser-side loss numbers if applicable (`references/discrepancies-environment.md`), and reporting lag (up to 72 hours in Google Ads).

**S6 - Hand over a summary.** What was built and where, IDs used, the canonical event name in play, how to re-verify in 5 minutes, and what to revisit if volume grows or platforms are added.

