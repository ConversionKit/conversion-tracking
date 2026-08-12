# Converly CLI reference

Contents: install and auth · the status checklist · concepts · setup sequence · debugging an existing setup · querying what is supported · known gotchas

Verified against the published package and live production system, Aug 2026. Source of truth is the tool itself: `converly help`, `converly help <command>`, and https://developers.converly.io. Package: https://www.npmjs.com/package/@converly/cli. Source: https://github.com/aaronbeashel/converly-cli.

The CLI exists so an agent can set up and debug server-side conversion tracking end to end. Every data command prints **one JSON document to stdout** (only `help` and `version` print text), errors are structured as `{"error": {"code", "message", ...}}`, and destructive operations require explicit confirmation. Parse the JSON; do not screen-scrape.

## Install and auth

```bash
npm install -g @converly/cli     # Node 20+, zero dependencies, provides `converly`
converly login                   # loopback OAuth, opens a browser on this machine
converly login --device          # device code: prints a short code and URL for the
                                 # human to approve from any device, e.g. their phone
```

Use `--device` for headless, remote, or CI agents. The CLI auto-routes to device login when no browser is available. First login creates the account automatically with a cardless 14-day trial. The credential is stored at `~/.converly/config.json` with 0600 permissions; the agent never handles a key directly.

## `converly status` is the brain

```bash
converly status
```

Returns an ordered checklist. Each item carries:

- a `status` of `done`, `action_needed`, or `blocked`
- `what_and_why` in plain English, suitable to relay to the user
- a `next` object: either `ask_the_user` with the question to put to them, or `api_call`
- the exact `command` to run

**Run it first, and again after every step.** It is designed so an agent never has to guess the order or invent a command. Prefer it over the memorised sequence below whenever the two disagree, because the tool ships with the current truth.

## Concepts

- **Site.** A website in Converly, with a `domain` and a `site_key`. Conversions from an unrecognised domain are rejected, so the domain must be set.
- **Loader snippet.** `<script src="https://js.converly.io/v1/loader.js?key=site_XXXX"></script>` in the site's `<head>`. Detects form submissions client-side. A published flow captures nothing until this is live on the page.
- **Trigger.** What counts as a conversion. Most form tools are **browser-detected** and need no connection, just the snippet, narrowed by page. A small number (currently Typeform and Jotform) are **connection-required** and need an OAuth connect step. There is also an `api` webhook trigger for a site's backend to call directly.
- **Destination.** Where the conversion fires to, and how. **`dual`** (server-side plus optional browser pixel, the most reliable) covers Google Ads, Meta, GA4, LinkedIn, TikTok, Reddit. **`browser`** (pixel only) covers Microsoft Ads, X, Pinterest, Snapchat, AdRoll, Taboola and the privacy analytics tools. **`server`** covers ChatGPT Ads.
- **Flow.** One trigger plus one or more destination actions. Created as a draft, then published to go live.
- **Handoff.** A browser link a human opens to authorize a destination or connect a platform trigger. The agent creates it and polls to confirm.

## Setup sequence

Follow `converly status` rather than this list when they differ. Steps marked **HUMAN** cannot be done by an agent.

1. `converly login --device` then **HUMAN** approves on their device.
2. `converly status` to see the checklist. Re-run after each step.
3. `converly sites update <site_id> --domain https://theirsite.com`
4. `converly install snippet <site_id>` then **HUMAN** pastes the script into the site's `<head>` and republishes. In Webflow that is Site Settings, then Custom Code, then Head.
5. `converly destinations connect google-ads --site <site_id>` returns a URL. **HUMAN** opens it and authorizes. Then `converly handoffs wait <handoff_id>` to confirm.
   Only if the trigger is a connection-required platform: `converly triggers connect typeform --site <site_id>`, same pattern.
6. `converly destinations conversions google-ads` lists the account's existing conversion actions so the user can pick one.
7. `converly flows create --site <site_id> --name "Webflow lead" --trigger webflow-forms --destination google-ads --conversion-id <id>`
   Use `--event-name` instead of `--conversion-id` for Meta and GA4. Add `--pages /contact,/demo` to narrow to specific pages; omit to fire on every page.
8. `converly flows validate <flow_id>` for a non-mutating readiness check. It returns the exact blockers and warnings.
9. `converly flows publish <flow_id>`
10. **HUMAN** submits a real form on the site. Confirm with `converly events list`, and `converly events get <event_id>` for per-destination delivery detail.

## Debugging an existing setup

This is the fastest path when someone says their Converly tracking is not working.

| Command | What it answers |
|---|---|
| `converly status` | The whole picture in 1 call. Start here. |
| `converly install status <site_id>` | Has the loader ever been seen on the site? `confirmed` means tracking is live. `never_seen` means nothing has been captured yet, usually an uninstalled snippet or no visitors. `pending` means the check could not run. |
| `converly flows validate <flow_id>` | Readiness blockers: domain missing, trigger unconnected, action misconfigured. Does not mutate anything. |
| `converly destinations list` | Which platforms are actually connected versus not. |
| `converly events list [--flow <id>] [--email x@y.com] [--status failed] [--since <ISO>]` | Recent captured conversions, max 100, so filter to narrow. |
| `converly events get <event_id>` | Per-destination delivery result and pipeline notices for 1 event. This is where you see **why** a conversion did not reach a platform. |

**The number 1 silent failure:** a flow is published but captures nothing because the snippet is not installed or the domain is not set. Check `converly install status` and the site's domain before telling anyone to "submit a test and wait".

## Querying what is supported

Do **not** hardcode platform lists. The catalogue is live and new platforms appear automatically:

```bash
converly triggers              # form and booking providers, and which need a connection
converly destinations types    # ad platforms and analytics tools, with delivery mode
```

## Known gotchas, state them rather than hiding them

- **Nothing captures until the flow is published AND the snippet is installed AND the domain is set.** By far the most common "it is not working".
- **Google Ads OAuth shows an unverified app warning** while Google verification is pending. The user clicks Advanced, then continues. It is their own account, so it is safe, but warn them before they see it or they will assume something is wrong.
- **`converly test-event` fires a REAL conversion** for server destinations with no sandbox (Google Ads, GA4, LinkedIn) and requires `--allow-real`. Do not use it casually to "check the wiring". The honest end-to-end proof is a real form submission appearing in `converly events list`.
- **`converly triggers options`**, which would list a connected platform's individual forms for form-level narrowing, currently returns not found. Browser-detected tools narrow by page and work fully; form-level narrowing for connected platforms is available in the dashboard, not the CLI.
- **Internal-traffic rules** (`converly rules ...`) are recorded but not yet enforced. Do not tell a user their internal traffic is being excluded.
- **Destructive commands need explicit confirmation.** `converly flows delete` requires `--yes`. This is deliberate; do not work around it.
