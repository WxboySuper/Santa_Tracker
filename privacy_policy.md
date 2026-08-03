# Privacy Policy
**Last Updated: June 9, 2026**

**TL;DR:** Your local forecasts stay on your device. If you choose to make an account, we only collect what is strictly necessary to sync your work and securely manage your subscription. 

**1. Local-First by Default**
If you use Graphical Forecast Creator (GFC) without creating an account, all of your forecast data, preferences, and cycle history remain stored locally on your device. We do not have access to this data.

**2. Account & Authentication Data**
If you choose to create an account to sync your settings or use premium features, we authenticate you via Firebase Auth. We use essential session cookies strictly to keep you logged in and we store:
* Your email address
* Your authentication provider (Google or Email/Password)
* Basic profile information (Name/Avatar)
* Your synced settings needed to keep the hosted account experience working across devices

**3. Premium Cloud Storage & Encryption**
If you subscribe to GFC Premium and actively use Cloud Saves, your forecast cycles, metadata, and discussions are stored securely—encrypted in transit and at rest—via Firebase. This data is stored strictly to provide cross-device synchronization. We do not sell this data or use it for advertising.

**4. Payment Information**
All payments are processed securely by Stripe. GFC does not collect, process, or store your credit card numbers or banking details. To operate subscriptions, we store limited billing metadata such as your subscription status, billing interval, renewal/cancellation state, and Stripe-linked customer or subscription identifiers needed to unlock and manage premium features.

**5. Product Analytics & Progress Metrics**
To monitor the health of the hosted service, we collect privacy-conscious product telemetry such as signups, sign-ins, cloud saves/loads, verification runs, and aggregate storage usage. **We do not log raw IP addresses for product analytics**, and your forecast payload contents are never exposed to our metrics dashboard.

If you are signed in, we also store limited progress metrics tied to your account so we can show you your own activity inside GFC. This may include values such as active-day streak, total active days, forecast saves, cloud saves, discussions written, and verification sessions run. These account metrics are visible only to you inside your account view.

We also generate a browser-scoped anonymous installation identifier to help estimate daily active devices without relying on long-term raw IP storage. Where possible, admin metrics are aggregated by day and shown only in aggregate form.

Separately from product metrics, the hosted service may keep short operational request logs such as page path, referrer, timestamp, and user-agent for maintenance and debugging. These logs are not used to inspect forecast contents and are kept separate from the product metrics dashboard.

On the public production site (gfc.weatherboysuper.com), we use Google Analytics (GA4) to measure aggregate traffic and navigation patterns in a separate property from other Weatherboy Super sites. GA is loaded only on the hosted production domain, not on localhost development builds. Google's processing is governed by [Google's privacy policy](https://policies.google.com/privacy).

On production and beta hosted deployments, we use Sentry (a third-party error monitoring service) to capture application errors and limited performance data so we can fix bugs quickly. This is separate from product analytics above. We do not use Sentry for advertising or the sale of personal data. Error reports are designed to exclude forecast map payloads, do not use session replay, and are configured without sending IP addresses or cookies by default. Events are tagged by environment (production or beta) so staging issues stay separate from production.

**6. Data Retention & Deletion**
You own your data. You can delete your account from the Account page after confirming the request and authenticating again. The deletion process ends any subscription linked to the account, then permanently removes your cloud-hosted cycles, profile data, synced settings, user-linked progress metrics, billing linkage, and Firebase sign-in. Your local, offline saves remain untouched on your device. If cleanup cannot finish, the sign-in is kept available so you can retry; contact us if the problem continues. We retain a one-way hash of the deleted Firebase identifier as a deletion-safety marker so delayed billing events cannot recreate the account; it contains no email, profile, settings, metrics, or forecast content. Stripe may retain transaction records it is independently required to keep for payment, fraud-prevention, tax, or legal purposes.

Aggregate admin metrics may be retained in a non-user-specific form for product operations. Short-lived dedupe records used for daily unique counts are intended to expire automatically after a limited retention window.

**7. Age Restrictions**
GFC is intended for general audiences and is not directed at children under the age of 13. By creating an account, you confirm you are 13 years of age or older.

**8. Security & Breach Notification**
We rely on enterprise-grade infrastructure from Google (Firebase) and Stripe to keep your data safe. In the unlikely event of a data breach that compromises your account information, we will notify affected users via email as quickly as legally and technically possible.

**9. Policy Changes & Contact**
We may update this policy as GFC evolves. Significant changes will be communicated via in-app notices or email. For privacy questions, or to request manual data deletion, contact us at: alex@weatherboysuper.com.
