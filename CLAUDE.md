## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels are used as-is (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Implementing a ticket (`/implement`)

`/implement #<n>` builds implementation ticket `<n>` (a GitHub issue) end to end.

1. Fetch the ticket and verify every blocker is closed (dependency query: `docs/agents/issue-tracker.md`); if one is open, stop and say which.
2. Claim it: `gh issue edit <n> --add-assignee @me`.
3. Before designing, read `docs/mvp-spec.md` in full - the ticket cites the spec section it implements, and the spec's Testing decisions section defines the pre-agreed seams `/tdd` tests at - plus `CONTEXT.md` and any ADR the ticket cites.
4. The ticket's acceptance criteria are the completion bar: every box provably ticked.
5. After validation passes and the work is committed, tick the criteria, close the ticket with a resolution comment, and name the tickets that are now unblocked.
