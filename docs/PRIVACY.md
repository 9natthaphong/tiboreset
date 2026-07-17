# Privacy

Sacred Forecast uses public posts from the monitored X account, verified reset and milestone records, and reviewed public operational signals. It does not use private X account data.

Vercel Web Analytics provides aggregated page, referrer, device, and region statistics without advertising trackers, analytics cookies, or a cross-site behavioral profile. Query strings are removed before analytics events are sent, and Control Room analytics are suppressed.

Reset Oracle collects an email only when someone subscribes to confirmation, forecast-threshold, or reset notices. It does not send marketing email or subscribe imported addresses. Addresses are normalized; tokens are stored only as hashes. Resend handles delivery when configured, while operational subscription and suppression records are stored in Supabase. Subscriber tables have no public RLS policy. Emails are masked in the Demo Outbox and must not be logged in Live Mode. Unsubscribe is immediate and permanent unless the person explicitly starts a new double-opt-in flow.

Visitor and subscriber data is not sold. If a future analytics or advertising provider introduces non-essential cookies, an appropriate consent mechanism must be added before that provider loads.
