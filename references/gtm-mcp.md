# Reading a GTM container through the API (MCP)

Contents: when this matters · setup and the privacy tradeoff · the checks only API access can do · schema gotchas · write safety

Static analysis of a published container has a hard ceiling. Fetching
`googletagmanager.com/gtm.js?id=GTM-XXXXXXX` gives you the **compiled, published**
container, which is enough for most diagnosis (see `form-mechanics-detection.md` §B.2)
and needs no permission from anyone. What it cannot tell you is anything about
unpublished work, version history, custom template source, lookup tables, regex
conditions resolved at runtime, or which built-in variables are switched on.

An MCP server that speaks to the Tag Manager API removes that ceiling. **It is an
escalation, never a requirement.** Every route in `SKILL.md` still runs without it.
Offer it when static recon has run out of road, or when the user has already said
they own the container.

## Setup

Do not build one. Stape publishes an open-source server covering the whole API
(Apache-2.0, `github.com/stape-io/google-tag-manager-mcp-server`). Two modes:

**Hosted**, one line, easiest for a solo business owner:
```
claude mcp add gtm -- npx -y mcp-remote https://gtm-mcp.stape.ai/mcp
```

**Local**, when the container's contents should not leave the user's machine:
run the server yourself against your own Google Cloud OAuth client (enable the Tag
Manager API, create OAuth credentials, set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`).

**State the tradeoff rather than picking for them.** In hosted mode the server making
the API calls runs on Stape's infrastructure, so container contents pass through a
third party. That is fine for most single-business owners and is not fine for some
agencies holding client containers under a DPA. Ask which they are before recommending.

**Authorisation is a browser step the user must complete themselves.** `mcp-remote`
has to stay running to receive the OAuth callback, so a health check that spawns a
short-lived process will appear to authorise and silently leave no token. If tools
fail with an auth error, check for a `*_tokens.json` file in `~/.mcp-auth/mcp-remote-*/`.
A `_code_verifier.txt` with no matching tokens file means the flow was started and
never finished.

## The checks only API access can do

Every one below was verified against a live container. Ordered by value.

### 1. Unpublished changes (the highest-value check in this file)

**Catches:** someone built the conversion tag and never published. `gtm.js` serves only
published versions, so the site looks genuinely untagged from outside, and a static
audit confidently tells a person who knows they built a tag that they have no tag. That
is the worst wrong answer this skill can give, and this check converts it into the best.

```
gtm_workspace {"action":"getStatus","accountId":A,"containerId":C,"workspaceId":W}
```
Returns `workspaceChange[]`, each entry carrying `changeStatus` (`added`, `updated`,
`deleted`) and the entity. A conversion tag sitting at `added` is a complete diagnosis:
the work is done, it just needs publishing.

Check **every** workspace, not just the default. Work parked in a side workspace is
exactly how this happens.

### 2. Version history, to date the breakage

**Catches:** "it was working and stopped." Turns an interview about what might have
changed into evidence.

```
gtm_version_header {"action":"list","accountId":A,"containerId":C,"includeDeleted":false}
gtm_version        {"action":"live","accountId":A,"containerId":C}
```
Compare the live version against its predecessor and read what changed. Line the
publish dates up against the date the conversions stopped.

### 3. Blocking triggers, firing options, consent settings

**Catches:** a tag that never fires, or fires except in the one case that matters, or
fires more often than the conversion happens. All three are hard to read in compiled
output and explicit in the tag record.

```
gtm_tag {"action":"list","accountId":A,"containerId":C,"workspaceId":W}
```
Read on each tag:
- `blockingTriggerId` — a non-empty exception list is a prime suspect for silent no-fire.
- `paused` — configured but dead.
- `tagFiringOption` — `ONCE_PER_EVENT` vs `ONCE_PER_PAGE` vs `UNLIMITED`, a direct cause
  of both over and under counting.
- `consentSettings.consentStatus` — a tag requiring a consent type the banner never
  grants never fires, and nothing on the page reveals why.
- The destination IDs in `parameter` — read them literally and confirm the conversion is
  going to the account the user thinks it is, not an old agency one.

### 4. Real trigger conditions

**Catches:** the false negative where a static grep of minified output cannot resolve
regex conditions or lookup tables, and an audit clears a container it should not have.

```
gtm_trigger {"action":"list","accountId":A,"containerId":C,"workspaceId":W}
```
Returns conditions literally, e.g. `equals {arg0: "{{_event}}", arg1: "gravity_form_submitted"}`.
Compare that against the dataLayer event the page actually pushes. A mismatch is a
complete, dashboard-invisible failure.

### 5. Built-in variables that were never enabled

**Catches:** a trigger keyed on Click URL or Form ID when that variable was never switched
on. It never fires, permanently and silently, and nothing external shows it.

```
gtm_built_in_variable {"action":"list","accountId":A,"containerId":C,"workspaceId":W}
```
A container returning only `pageUrl, pageHostname, pagePath, referrer, event` has the
default set and nothing more. Any trigger referencing a form or click variable is dead.

## Schema gotchas

These cost time if you do not know them. All confirmed against the live server.

| Call | Gotcha |
|---|---|
| `gtm_account` `list` | Requires `accountId` anyway, despite listing accounts |
| `gtm_version_header` `list` | Requires `includeDeleted`; omitting it errors rather than defaulting |
| Workspace IDs | Not predictable and not `1`. Always `gtm_workspace list` first |
| List responses | Wrapped in `data` |
| `gtm_version` `live` | Wrapped in `version`, not `data` |

## Write safety

The API writes as well as reads, which means the skill can create the tag and trigger
directly instead of generating a file to import. Two rules, both absolute.

0. **Being given a container ID is not permission to write to it.** A user naming their
   container so you can look at it has asked you to read it. Diagnose, report, and name the
   change you would make. Do not create, edit or publish anything until they ask. Under test
   an agent was handed a container ID with a one-line symptom, and it edited a tag and
   published a new live version off the back of it.

1. **Creating in a workspace is safe. Publishing is not.** A workspace change affects
   nobody until published and is trivially reversible. Publishing pushes to a live
   production site. Never publish without the user explicitly saying so in that turn.
   "Set up my conversion tracking" is not permission to publish.
2. **Never modify a tag you did not create without saying what you are about to change
   and why.** Containers are shared. Someone else's tag may look wrong and be load-bearing.

The GTM recipes in `recipes/gtm/` remain the path for everyone with no MCP connected,
which will be most users. Do not treat API access as the default.
