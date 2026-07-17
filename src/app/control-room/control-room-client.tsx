"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LabNavigation } from "@/components/lab-navigation";

type OutboxMessage = { id: string; subject: string; recipient: string; type: string; status: string; html: string };

export function ControlRoomClient({ live, adminConfigured }: { live: boolean; adminConfigured: boolean }) {
  const [outbox, setOutbox] = useState<OutboxMessage[]>([]);
  const [note, setNote] = useState(live ? "Administrative access required." : "Email delivery simulation — no external messages sent.");
  const [adminSecret, setAdminSecret] = useState("");
  const [unlocked, setUnlocked] = useState(!live);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/lab/email-outbox", { cache: "no-store", headers: live && adminSecret ? { Authorization: `Bearer ${adminSecret}` } : undefined });
    if (!response.ok) return;
    const json = await response.json() as { data?: OutboxMessage[] };
    setOutbox(json.data ?? []);
  }, [adminSecret, live]);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    void fetch("/api/lab/email-outbox", { cache: "no-store", headers: live && adminSecret ? { Authorization: `Bearer ${adminSecret}` } : undefined })
      .then(response => response.ok ? response.json() as Promise<{ data?: OutboxMessage[] }> : null)
      .then(json => { if (!cancelled && json) setOutbox(json.data ?? []); });
    return () => { cancelled = true; };
  }, [adminSecret, live, unlocked]);

  const unlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/lab/authorize", { method: "POST", headers: live && adminSecret ? { Authorization: `Bearer ${adminSecret}` } : undefined });
    if (response.ok) { setUnlocked(true); setNote("Control Room unlocked for this browser session."); }
    else setNote(response.status === 429 ? "Too many attempts. Try again later." : "Administrative access required.");
    setBusy(false);
  };

  const act = async (path: string) => {
    setBusy(true);
    setNote(`Running ${path.split("/").at(-1)}…`);
    try {
      const response = await fetch(path, { method: "POST", headers: live && adminSecret ? { Authorization: `Bearer ${adminSecret}` } : undefined });
      const result = await response.json().catch(() => null) as { data?: { postsRead?: number; postsInserted?: number; postsAnalyzed?: number; forecastChanged?: boolean }; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(result?.error?.message ?? "Request failed");
      await refresh();
      setNote(result?.data?.postsRead != null ? `X check complete: ${result.data.postsRead} read, ${result.data.postsInserted} inserted, ${result.data.postsAnalyzed} analyzed, forecast ${result.data.forecastChanged ? "updated" : "unchanged"}.` : `Completed ${path.split("/").at(-1)}. Re-run to demonstrate idempotency.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Request failed");
    } finally { setBusy(false); }
  };

  return <main className="lab">
    <LabNavigation active="control"/>
    <header className="lab-heading"><div><p className="eyebrow">RESET ORACLE / CONTROL ROOM</p><h1>CONTROL ROOM</h1><p>Operational tools for ingestion, forecasting and notification simulations.</p></div></header>
    <Link className="lab-primary-link" href="/lab/data">Open Data Lab <span aria-hidden="true">→</span></Link>
    <p className="lab-link-description">Inspect source records, extraction results, forecast inputs, historical windows and X API usage.</p>
    <div className="lab-banner" role="status">{live ? "LIVE MODE" : "DEMO MODE"} · {note}</div>

    {!unlocked ? <section className="lab-access-gate" aria-labelledby="lab-access-title">
      <p className="eyebrow">PROTECTED OPERATIONS</p><h2 id="lab-access-title">Administrative access required.</h2>
      <form onSubmit={unlock}><label htmlFor="admin-secret">Admin secret</label><input id="admin-secret" type="password" autoComplete="off" value={adminSecret} onChange={event => setAdminSecret(event.target.value)} required/><button disabled={busy || !adminSecret || !adminConfigured}>Unlock control room</button></form>
      {!adminConfigured && <p>Control Room authorization is not configured on this deployment.</p>}
    </section> : <>
      {live && <section><h2>Live ingestion</h2><p>Check X uses the same bounded ingestion service as the protected cron route. The initial read is capped at 10; later reads use the stored cursor.</p><div className="lab-actions"><button disabled={busy} onClick={() => act("/api/lab/ingest")}>Check X now</button></div></section>}
      <section><h2>{live ? "Administrative actions" : "Demo simulations"}</h2><div className="lab-actions"><button disabled={busy} onClick={() => act("/api/lab/simulate-confirmation")}>Simulate confirmation</button><button disabled={busy} onClick={() => act("/api/lab/demo-event")}>Simulate forecast crossing 70%</button><button disabled={busy} onClick={() => act("/api/internal/notifications/evaluate")}>Run notification evaluation</button><button disabled={busy} onClick={() => act("/api/lab/simulate-reset")}>Simulate confirmed reset</button><button disabled={busy} onClick={() => act("/api/lab/reset-demo")}>Reset demo state</button></div></section>
      <section><h2>Demo email outbox</h2><p>Recipients are masked. Generated previews are local fixtures, never proof of external delivery.</p><div className="outbox">{outbox.length === 0 ? <p>No demo emails yet. Subscribe on the homepage first.</p> : outbox.map(message => <article key={message.id}><div><b>{message.subject}</b><span>{message.recipient} · {message.type} · {message.status}</span></div><details><summary>Rendered preview</summary><iframe title={message.subject} srcDoc={message.html}/></details></article>)}</div></section>
    </>}
  </main>;
}
