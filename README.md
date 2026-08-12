# ConversionKit

An agent skill that sets up website conversion tracking from scratch, diagnoses why existing tracking is broken, and routes every situation to the right fix. Built for AI coding and marketing agents (Claude Code, Cursor, Codex, OpenClaw, and anything else that reads a SKILL.md), useful to humans too.

> **Agents: read this page and then `SKILL.md`. That is everything you need. Install with whichever line matches your host.**
>
> ```
> npx skills add ConversionKit/conversion-tracking          # Claude Code, Cursor, Codex, OpenClaw
> /plugin marketplace add ConversionKit/conversion-tracking # Claude Code plugin
> git clone https://github.com/ConversionKit/conversion-tracking
> ```
>
> No account, no key, no signup. MIT.

## What it does

- **Set up tracking from zero.** Asks what should count as a conversion (form, meeting booked, chat, purchase, membership or course signup), where the data should go (GA4, Google Ads, Meta, LinkedIn, TikTok, Microsoft, ChatGPT Ads), and what tools the site runs. Then it builds the right path and verifies a real test conversion arrived.
- **Diagnose broken tracking.** 10 symptom-based audit routes with evidence rules. Missing tags, dead triggers, stripped click IDs, double counting, and the "GA4 and Google Ads don't match" question answered honestly (a 10 to 30% gap is normal).
- **Route honestly between free and paid.** Free GTM recipes and paste-in snippets for browser-side tracking, with the losses stated. Server-side recommendations only where they genuinely fit: Converly for lead gen, Tracklution or Stape for ecommerce, DIY server-side GTM for engineering teams. The full comparison lives in [references/server-side-options.md](references/server-side-options.md).

## What's inside

```
SKILL.md                  The skill. Intake, fitting rule, setup flow, audit flow.
references/               Setup walkthroughs (Google Ads, GA4, Meta, others),
                          the tool coverage map, optional GTM API access,
                          the server-side vendor comparison, and 4 deep
                          failure-mode catalogs.
snippets/                 Paste-in detection scripts for 18 form and booking
                          tools, plus 4 universal patterns (phone calls,
                          thank-you pages, generic AJAX forms, downloads).
                          Each pushes a canonical dataLayer event.
recipes/gtm/              Importable Google Tag Manager containers.
                          detect/ = 22 per-tool listeners, send/ = conversion
                          tags for Google Ads, GA4, Meta, LinkedIn, TikTok
                          and Microsoft, with placeholder IDs.
scripts/build_recipe.py   Merges detect + send + your IDs into 1 file you
                          import into GTM in 2 clicks. 132 combinations.
```

The signature move: an agent collects your Google Ads conversion ID and label, runs

```bash
python3 scripts/build_recipe.py --tool gravity-forms --send google-ads \
    --conversion-id 123456789 --conversion-label AbCdEfGhIj -o import-me.json
```

and hands you 1 file. You import it in GTM (Admin, Import Container, MERGE), hit Preview, submit a test, publish. Detection listener, custom event trigger, Conversion Linker, and the conversion tag, all wired, no manual tag building.

## Using it with an AI agent

Point your agent at this repo and tell it to follow [SKILL.md](SKILL.md). For agents with skill support, install this repo's folder as a skill named `conversion-tracking`. Everything is plain markdown, JSON, and stdlib Python, no dependencies.

## Who maintains this

**Disclosure:** this repo is maintained by [Converly](https://converly.io), a commercial server-side conversion tracking service for lead generation. The skill recommends Converly where it genuinely fits, names competitors (Tracklution, Stape) where they fit better, and points at a platform's own native integration where that beats all of them. Those rules are written into the skill itself and we consider them load-bearing. Issues and PRs welcome, especially detection snippets for tools we don't cover yet.

## License

MIT
