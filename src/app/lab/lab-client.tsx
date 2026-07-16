"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type OutboxMessage = { id: string; subject: string; recipient: string; type: string; status: string; html: string };

export function LabClient() {
  const live = process.env.NEXT_PUBLIC_APP_MODE === "live";
  const [outbox, setOutbox] = useState<OutboxMessage[]>([]);
  const [note, setNote] = useState(live ? "Live controls require the admin secret; it is never stored." : "Email delivery simulation — no external messages sent.");
  const [adminSecret, setAdminSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => fetch("/api/lab/email-outbox", { cache: "no-store" }).then(response => response.json()).then(json => setOutbox(json.data));
  useEffect(() => { void refresh(); }, []);
  const act = async (path: string, requiresAdmin = false) => {
    setBusy(true);
    setNote(`Running ${path.split("/").at(-1)}…`);
    try {
      const response = await fetch(path, { method: "POST", headers: requiresAdmin ? { Authorization: `Bearer ${adminSecret}` } : undefined });
      const result = await response.json().catch(() => null) as { ok?: boolean; data?: { postsRead?: number; postsInserted?: number; postsAnalyzed?: number; forecastChanged?: boolean }; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(result?.error?.message ?? "Request failed");
      await refresh();
      setNote(result?.data?.postsRead != null ? `X check complete: ${result.data.postsRead} read, ${result.data.postsInserted} inserted, ${result.data.postsAnalyzed} analyzed, forecast ${result.data.forecastChanged ? "updated" : "unchanged"}.` : `Completed ${path.split("/").at(-1)}. Re-run to demonstrate idempotency.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Request failed");
    } finally { setBusy(false); }
  };
  return <main className="lab"><header><div><p className="eyebrow">RESET ORACLE / CONTROL ROOM</p><h1>THE LAB</h1></div><nav><Link href="/lab/data">Data Lab</Link> · <Link href="/">Public forecast</Link></nav></header><div className="lab-banner" role="status">{live ? "LIVE MODE" : "DEMO MODE"} · {note}</div>{live && <section><h2>Live ingestion</h2><p>Check X uses the same bounded ingestion service as the protected cron route. The initial read is capped at 10; later reads use the stored cursor.</p><div className="lab-actions"><input aria-label="Admin secret" type="password" autoComplete="current-password" value={adminSecret} onChange={event => setAdminSecret(event.target.value)} placeholder="Admin secret"/><button disabled={busy || !adminSecret} onClick={() => act("/api/lab/ingest", true)}>Check X now</button></div></section>}<section className="lab-actions"><button disabled={busy} onClick={() => act("/api/lab/simulate-confirmation")}>Simulate confirmation</button><button disabled={busy} onClick={() => act("/api/lab/demo-event")}>Simulate forecast crossing 70%</button><button disabled={busy} onClick={() => act("/api/internal/notifications/evaluate")}>Run evaluation again</button><button disabled={busy} onClick={() => act("/api/lab/simulate-reset")}>Simulate confirmed reset</button><button disabled={busy} onClick={() => act("/api/lab/reset-demo")}>Reset demo state</button></section><section><h2>Demo email outbox</h2><p>Recipients are masked. Generated previews are local fixtures, never proof of external delivery.</p><div className="outbox">{outbox.length === 0 ? <p>No demo emails yet. Subscribe on the homepage first.</p> : outbox.map(message => <article key={message.id}><div><b>{message.subject}</b><span>{message.recipient} · {message.type} · {message.status}</span></div><details><summary>Rendered preview</summary><iframe title={message.subject} srcDoc={message.html}/></details></article>)}</div></section></main>;
}
