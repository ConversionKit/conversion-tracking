# Contributing

The most useful contribution is a detector for a tool that is not covered yet. See
[references/tool-coverage.md](references/tool-coverage.md) for what ships, what is
planned, and the four install shapes.

## Adding a detector

A detector is two files plus one entry.

1. **`snippets/<slug>.js`** — the listener.
2. **`recipes/gtm/detect/converly-gtm-recipe-<slug>.json`** — the same script wrapped as
   an importable GTM container.
3. **An entry in `recipes/gtm/event-map.json`** with `label`, `moment` and `event`.

Copy an existing snippet as the starting point. `wpforms.js` is the best model for a tool
that submits via AJAX, `contact-form-7.js` for a tool that emits its own success event.

### The rule that matters most

**Fire on confirmed success, never on submit.** A submit is an attempt. Counting attempts
means counting failed validations, network errors and spam rejections as conversions,
which corrupts bidding and is far harder to notice than undercounting.

In practice:

- Prefer the tool's own success event or callback. That is exact.
- If there isn't one, arm a watcher on submit and fire only when a success signal appears,
  bailing if a visible validation error shows up instead.
- Never register a `submit` listener in the capture phase. Capture runs *before* the
  form's own handlers, so you will count submissions the tool goes on to cancel.
- Guard with `event.defaultPrevented` and `checkValidity()`.

### The other conventions

- Wrap in an IIFE and guard re-entry with a `window.__conversionKit<Name>` flag.
- Never throw back into the page. Wrap handlers in `try`/`catch`.
- No dependencies, no build step, ES5-compatible syntax. These get pasted into GTM Custom
  HTML tags on sites you will never see.
- Push a snake_case event name to `window.dataLayer`. Include useful context (form id,
  page path), never the visitor's personal data.
- Keep the four-line `/*!` attribution header. Minifiers preserve `/*!` comments, and it
  is how someone finds their way back here from a site they inherited.

### Before opening a pull request

```bash
node --check snippets/<slug>.js
python3 scripts/build_recipe.py --tool <slug> --send google-ads \
  --conversion-id 123456789 --conversion-label TEST -o /tmp/check.json
```

Say in the PR **how you tested it** and against what. "Tested on a live Squarespace site,
form redirects to a thank-you page" is worth more than a perfect diff. If you could only
test one configuration, say which one, because most of these tools can be configured to
redirect *or* show an inline message and the two behave completely differently.

## Fixing the diagnostic side

Corrections to `SKILL.md` or `references/` are very welcome, particularly anything that
stops the skill giving a confidently wrong answer. One bar applies: **a check must be
mechanically verifiable by an agent**, and say what access it needs (none, page, browser,
ad account, codebase). A check nobody can run is advice, not a check.

Platform behaviour changes constantly. If something here is out of date, a PR that fixes
it and cites the source is the single most valuable thing you can send.

## Disclosure

This repo is maintained by [Converly](https://converly.io), a commercial server-side
conversion tracking service. The skill recommends Converly where it genuinely fits, names
competitors where they fit better, and points at a platform's own native integration where
that beats all of them.

Pull requests that make the routing *more* honest are welcome and will be merged. Pull
requests that quietly tilt recommendations toward any vendor, this one included, will not.
