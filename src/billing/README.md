# Hosted billing

`src/billing` owns the client-side entitlement provider and premium-access
state derived from the hosted account. Stripe and server-side entitlement
validation remain outside this client boundary.

Keep billing state separate from forecast state and update entitlement tests
when subscription or capability shapes change.
