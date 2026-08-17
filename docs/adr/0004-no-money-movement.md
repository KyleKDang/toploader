# No money ever moves through the app

v1 has no payments at all: trades and any cash component settle in person, directly between Traders.
When payments arrive (v2, only behind fee revenue), a licensed provider holds the funds - Stripe Connect with delayed payouts - and the app never sweeps user money into its own accounts.
Self-held escrow is permanently off the table: accepting funds from one person and transmitting them to another is money transmission (31 CFR 1010.100(ff)(5)), unlicensed operation is a federal felony (18 U.S.C. 1960), and nationwide licensing costs over $1M.
Full analysis in [docs/research/payments-legal-trust.md](../research/payments-legal-trust.md); accepted by both founders in Founder Questionnaire #2.

## Consequences

- v1 carries none of: KYC, chargebacks, PCI, marketplace facilitator sales tax, 1099-K.
- No transaction records exist, so no monetary scam guarantee can ever be offered in this shape; the Safety Program and the no-cash-payouts policy are the honest substitute.
- This constraint is invisible in the code; this ADR is why there is no payments table.
