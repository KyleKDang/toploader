# Trade is one aggregate with a single state machine

A deal between two Traders is one `trades` row walking proposed -> accepted -> scheduled -> completed / cancelled / no_show, not separate Proposal, Meetup, and TradeRecord entities.
The scheduled time and Safe Spot are fields the Trade gains along the way; the Trade Record is simply the completed Trade, frozen immutable.
One aggregate means one RPC state machine, which is where all trade invariants live under the write discipline of ADR-0001.

## Consequences

- Do not "fix" this by splitting proposal/meetup/record into their own tables in a refactor; the merge is deliberate.
- Completion requires both parties' confirmation; after the second confirm the row (and its items/photos) is immutable by policy.
