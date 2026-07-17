# Privacy notice

This notice describes the data used by the Sacred Forecast / TiboReset application. It is not a claim of legal certification.

## Data used for forecasting

- Public posts from the monitored X account.
- Verified public reset and milestone announcement records.
- Human-reviewed public operational and market-context signals.
- No private X account data.

Raw Live X payloads are retained server-side for audit. Public views expose only safe post and evidence fields. Historical seed records are human-reviewed; an LLM cannot create or rewrite them.

## Anonymous site analytics

Vercel Web Analytics may provide aggregate page, referrer, device, and region statistics. Sacred Forecast does not add advertising trackers, analytics cookies, or a cross-site behavioral profile. Query strings are removed before analytics events are sent, and Control Room analytics are suppressed.

The separate public visit counter creates a random browser token and stores it in local storage, not a cookie. The server combines that token with the UTC date, stores only its SHA-256 hash in Supabase, and counts at most one visit per browser token per day. The raw token, IP address, and a cross-site identifier are not stored in the counter table. Clearing local storage or using another browser can create another count, so the displayed number is an approximate forecast-session count rather than unique people.

## Email alerts

An email address is collected only when someone starts the double-opt-in alert flow. It is used for confirmation, forecast-threshold alerts, and reset notices, not marketing. Manually imported addresses are never subscribed automatically.

Addresses are normalized; confirmation and unsubscribe tokens are stored only as hashes. Resend handles delivery when fully configured, while operational subscription, delivery, bounce, complaint, and suppression records are stored in Supabase. Subscriber tables have no public read policy. Unsubscribe is immediate, and complaints suppress future sending.

## Data not sold

Visitor and subscriber data is not sold.

## Contact

Use the reply address in a received alert email when production email is configured. No private environment value is exposed on this page.

If a future provider introduces non-essential cookies, advertising, or cross-site tracking, an appropriate consent mechanism must be added before that provider loads.
