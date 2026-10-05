# Toploader

A city-by-city app for organizing safe, in-person Pokemon TCG trades between adult collectors.
No money ever moves through the app.
The MVP spec is complete at `docs/mvp-spec.md`; implementation is one ticket per vertical slice, tracked by the map at issue #31.

## Implementing a ticket

`/ship #N` is the whole prompt: it drives one ticket from claim to close, and the ticket carries everything needed.
`/ship` owns the sequence; this file owns what is specific to this project.

**Pacing.**
A ticket starts only when Kyle says to, one at a time.
Reading the tracker or naming the frontier never starts work.

**The brief.**
The ticket's "Spec and seam" section is required reading: it cites the `docs/mvp-spec.md` sections it implements and names which seam its tests live at.
Read those spec sections plus the spec's Testing decisions section, `CONTEXT.md` for the domain vocabulary that tests and code are named in, and any ADR the ticket cites.
The acceptance criteria are the completion bar: every box provably ticked.

**The seams** are the three fixed in the spec's Testing decisions, and tickets cite them by number.
Seam 1, the database interface, is primary: Vitest with supabase-js clients signed in as seeded Traders against the local stack, two-Trader adversarial pairs by default, and every policy and RPC ships its foreign-Trader denial test.
Seam 2 is edge/scheduled functions with external HTTP faked only at the network edge.
Seam 3 is Playwright, one thin happy-path tracer per flow, wiring only.
Nothing below a seam is mocked; no new indirection layer gets added to make something testable.

**Branching and merging.**
Code reaches `main` only through a PR that links the ticket (`Closes #N`), rebase-merged, branch deleted.
The repo is private, so GitHub cannot enforce this - hold it as convention anyway.
Docs, ADRs, and config one-liners go straight to `main`, as the research-findings convention already did.

**Validation green.**
`.github/workflows/ci.yml` is the authority: a branch is green when its CI run is.
To run the same checks locally, start the stack with `npx supabase start`, then run these in order: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm test` (seams 1 and 2), and `npm run test:browser` (seam 3).
If the two ever disagree, CI wins, and this list is corrected to match it.

**Deploys.**
A merge to `main` deploys.
CI's `migrate` job applies new migrations to the hosted database, and Render builds the app only once every check on the commit has passed (`render.yaml`).
So a merge is a production deploy, and a migration merged to `main` is applied to production data.

**Code review** means `mattpocock-skills:code-review`, named in full.
The bare `code-review` is Claude Code's built-in, which fans out sub-agents at the session effort level and is not the review this flow asks for.

**The frontier** is the map's lowest-numbered direct child that is open, unassigned, and has no open blocker.
Build-sequence order is spec order; do not jump ahead.

**What gets filed.**
v1 launches in one City, Orange County, with hundreds of Traders at most, and that is the size to design and judge against.
A follow-up is filed only when it is an actual problem at that size: a Trader would lose data, be unsafe, or be stuck, or it blocks the ticket in hand, CI, or a deploy.
Anything else is left alone until it becomes a problem: slow at a scale v1 does not have, a cleaner structure, a hardening against a case nobody has hit.
Park it as a one-line comment on #118 (what, where, and what would make it a problem) and move on.
Nothing parked there is work until Kyle says so, and getting to v1 comes before all of it.

**The map** at #31 holds only the tickets planned from the spec.
A follow-up filed while shipping another ticket becomes a sub-issue of the feature ticket it belongs to, never of the map, so the map's own list stays the planned features.
That is usually the ticket it was found on; when it is not, parent it to the feature it is part of and say "Found on #N" in the body.
A follow-up is off the frontier whatever its parent, and is started by number when Kyle says to.

## Agent skills

### Issue tracker

GitHub Issues on KyleKDang/toploader via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical defaults (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root, ADRs in `docs/adr/`. See `docs/agents/domain.md`.
