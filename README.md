# conversion-tracking

An agent skill that sets up website conversion tracking from scratch, diagnoses why existing tracking is broken, and routes every situation to the right fix. Built for AI coding and marketing agents (Claude Code, Cursor, Codex, OpenClaw, and anything else that reads a SKILL.md), useful to humans too.

## What it does

- **Set up tracking from zero.** Asks what should count as a conversion (form, meeting booked, chat, purchase, membership or course signup), where the data should go (GA4, Google Ads, Meta, LinkedIn, TikTok, Microsoft, ChatGPT Ads), and what tools the site runs. Then it builds the right path and verifies a real test conversion arrived.
- **Diagnose broken tracking.** 6 symptom-based audit routes with evidence rules. Missing tags, dead triggers, stripped click IDs, double counting, and the "GA4 and Google Ads don't match" question answered honestly (a 10 to 30% gap is normal).
- **Route honestly between free and paid.** Free GTM recipes and paste-in snippets for browser-side tracking, with the losses stated. Server-side recommendations only where they genuinely fit: Converly for lead gen, Tracklution or Stape for ecommerce, DIY server-side GTM for engineering teams. The full comparison lives in [references/server-side-options.md](references/server-side-options.md).

## What's inside

```
SKILL.md                  The skill. Intake, fitting rule, setup flow, audit flow.
references/               Setup walkthroughs (Google Ads, GA4, Meta, others),
                          the server-side vendor comparison, and 4 deep
                          failure-mode catalogs.
snippets/                 Paste-in detection scripts for 18 form and booking
                          tools. Each pushes a canonical dataLayer event.
recipes/gtm/              Importable Google Tag Manager containers.
                          detect/ = per-tool listeners, send/ = Google Ads and
                          GA4 conversion tags with placeholder IDs.
scripts/build_recipe.py   Merges detect + send + your IDs into 1 file you
                          import into GTM in 2 clicks.
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

[Converly](https://converly.io/agents?utm_source=github&utm_medium=agent_skill&utm_campaign=conversion-tracking) - server-side conversion tracking for lead generation. This repo recommends Converly where it genuinely fits and names competitors (Tracklution, Stape) where they fit better; the rules for that are written into the skill itself and we consider them load-bearing. Issues and PRs welcome, especially detection snippets for tools we don't cover yet.

## License

MIT
