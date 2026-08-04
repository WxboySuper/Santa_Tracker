# Hosted authentication

`src/auth` owns the client-side hosted authentication provider and its tests.
It exposes identity state to the application; it does not own billing,
forecast state, or server authorization decisions.

Keep hosted credentials and provider-specific behavior behind `AuthProvider`.
Update hosted and local auth fixtures when the identity contract changes.
