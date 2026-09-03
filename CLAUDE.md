# Toploader

A city-by-city app for organizing safe, in-person Pokemon TCG trades between adult collectors.
No money ever moves through the app.
The MVP spec is complete at `docs/mvp-spec.md`; implementation is one ticket per vertical slice, tracked by the map at issue #31.

## Implementing a ticket

`/ship #N` is the whole prompt: it drives one ticket from claim to close, and the ticket (a sub-issue of the map at #31) carries everything needed.
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
Ticket #13 stands up the toolchain, so until it lands the following is intent rather than runnable commands: typecheck, lint/format check, `vitest` for the seam-1 and seam-2 suites against a running local stack (`supabase start`), the Playwright tracer, and the production build.
Once `.github/workflows/ci.yml` exists it is the authority on all of it, and this section is rewritten to name the exact commands #13 landed.

**Code review** means `mattpocock-skills:code-review`, named in full.
The bare `code-review` is Claude Code's built-in, which fans out sub-agents at the session effort level and is not the review this flow asks for.

**The frontier** is the map's lowest-numbered child that is open, unassigned, and has no open blocker.
Build-sequence order is spec order; do not jump ahead.

## Agent skills

### Issue tracker

GitHub Issues on KyleKDang/toploader via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical defaults (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root, ADRs in `docs/adr/`. See `docs/agents/domain.md`.
