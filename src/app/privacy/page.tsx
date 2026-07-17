import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Notice · Sacred Forecast", description: "How Sacred Forecast uses public forecast data, anonymous analytics, and email subscription records." };

const publicContact = () => {
  const value = process.env.EMAIL_REPLY_TO?.trim();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
};

export default function PrivacyPage() {
  const contact = publicContact();
  return <main className="privacy-page">
    <header><p className="mono-label gold-label">SACRED FORECAST</p><h1>Privacy Notice</h1><p>A concise record of the public data, anonymous analytics, and optional email information used by this unofficial project.</p></header>
    <div className="privacy-sections">
      <section><h2>Data used for forecasting</h2><p>The forecast uses public posts from the monitored X account, verified reset and milestone records, and reviewed public operational signals. It does not use private X account data.</p></section>
      <section><h2>Anonymous site analytics</h2><p>Aggregated Vercel Web Analytics may provide approximate page, referrer, device, and region statistics. A separate public counter stores a random browser token locally and records only its one-way hash once per UTC day, preventing ordinary reloads from inflating the total. Sacred Forecast uses no advertising trackers, analytics cookies, or cross-site behavioral profiles.</p></section>
      <section><h2>Email alerts</h2><p>An email address is collected only when a visitor subscribes. It is used for double-opt-in confirmation, forecast-threshold alerts, and reset notices. Resend handles delivery when configured; operational subscription and suppression records are stored in Supabase. Every alert supports unsubscribe.</p></section>
      <section><h2>Data not sold</h2><p>Visitor and subscriber data is not sold.</p></section>
      <section><h2>Contact</h2><p>{contact ? <>Questions may be sent to <a href={`mailto:${contact}`}>{contact}</a>.</> : "A public privacy contact is not currently listed."}</p></section>
    </div>
    <aside>Future non-essential cookie or advertising providers require an appropriate consent mechanism before they load.</aside>
    <footer><Link href="/">Return to the forecast →</Link><Link href="/lab/data">Open Data Lab →</Link></footer>
  </main>;
}
