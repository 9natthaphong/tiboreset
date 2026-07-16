"use client";

import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { Bell, CheckCircle2, ChevronDown, Clock3, Database, ExternalLink, Eye, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Evidence, Forecast } from "@/lib/forecasting";
import { CinematicHero } from "./cinematic-hero";

const Charts = dynamic(() => import("./oracle-charts"), { ssr: false, loading: () => <div className="chart-loading">Loading forecast record…</div> });
type HistoryPoint = { time: string; probability: number; label: string };
type TimelineItem = { id: string; date: string; type: string; reason: string; description: string; included: boolean; forecastBefore: number };
type Analog = { date: string; eventType: string; similarity: number; outcome: string; source: string; followed: boolean; forecastBefore?: number };
type Props = { initialForecast: Forecast; evidence: Evidence[]; history: HistoryPoint[]; timeline: TimelineItem[]; analogs: Analog[]; renderedAt: string };
const formatTimestamp = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));

export function OracleExperience({ initialForecast, evidence: initialEvidence, history, timeline, analogs, renderedAt }: Props) {
  const [forecast, setForecast] = useState(initialForecast);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const ageMinutes = Math.max(0, Math.floor((Date.parse(renderedAt) - Date.parse(forecast.dataCutoff)) / 60000));
  const freshness = forecast.mode === "demo" ? "DEMO LIVE" : ageMinutes < 10 ? "LIVE" : ageMinutes <= 30 ? "DELAYED" : "STALE";

  const inject = async () => {
    setLoading(true);
    const response = await fetch("/api/lab/demo-event", { method: "POST" });
    const json = await response.json();
    setForecast(json.data);
    const refreshed = await fetch("/api/evidence").then(x => x.json());
    setEvidence(refreshed.data);
    setLoading(false);
  };
  const subscribe = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const threshold = data.get("threshold");
    const response = await fetch("/api/subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: data.get("email"), probabilityThreshold: threshold === "confirmed" ? null : Number(threshold), notifyConfirmedReset: true, notifyForecastReversal: data.get("reversal") === "on", privacyAccepted: true }) });
    if (response.ok) setSubmitted(true);
  };

  return <main>
    <header className="topbar sacred-nav"><a className="wordmark" href="#top"><span>SF</span><b>SACRED FORECAST</b><small>RESET ORACLE</small></a><nav aria-label="Main navigation"><a href="#forecast">Forecast</a><a href="#evidence">Evidence</a><a href="#memory">Memory</a><a href="#time-machine">Time Machine</a></nav><span className="mode-pill"><i/> {forecast.mode.toUpperCase()} MODE</span></header>

    <CinematicHero forecast={forecast} freshness={freshness} loading={loading} onInject={inject}/>

    <section id="signal" className="signal-bar"><div><Mail/><span><b>GET THE RESET SIGNAL</b><small>Double opt-in · meaningful alerts only</small></span></div>{submitted ? <div className="signal-success"><ShieldCheck/><span><b>Check your inbox to confirm your alerts.</b><small>Demo delivery is in the Lab outbox.</small></span></div> : <form onSubmit={subscribe}><input name="email" type="email" placeholder="you@example.com" aria-label="Email address" required/><select name="threshold" defaultValue="70" aria-label="Forecast threshold"><option value="60">At 60%</option><option value="70">At 70% — recommended</option><option value="80">At 80%</option><option value="confirmed">Confirmed reset only</option></select><label className="check compact-consent"><input type="checkbox" required/> <span>I accept the privacy notice and notification terms.</span></label><label className="check reversal"><input name="reversal" type="checkbox"/> Reversal alerts</label><button><Bell size={15}/> Notify me</button></form>}<p>No spam · Unsubscribe anytime · Unofficial experimental forecast</p></section>

    <section id="forecast" className="section forecast-section"><header className="editorial-intro"><div><p className="mono-label">01 · LIVE FORECAST</p><h2>THE WEIGHT<br/>OF A <em>SIGNAL.</em></h2></div><p>The forecast is not a generated percentage. Versioned evidence enters a deterministic hazard model, and every movement remains traceable to its source.</p></header><Charts forecast={forecast} history={history}/></section>

    <section id="evidence" className="section evidence-timeline-section"><header className="section-title"><p className="mono-label cyan-label">02 · EVIDENCE RECORD</p><h2>THE TESTIMONY.</h2><p>Chronological source excerpts and their exact role in the forecast. All current fixtures remain explicitly synthetic Demo Data.</p></header><div className="evidence-timeline">{evidence.slice().reverse().map((item, index) => <article key={item.id}><div className="evidence-rail"><span>{String(evidence.length-index).padStart(2,"0")}</span><i/></div><div className="evidence-body"><header><time>{formatTimestamp(item.postedAt)} UTC</time><span>@thsottiaux · {forecast.mode === "demo" ? "DEMO SOURCE" : "X"}</span></header><blockquote>“{item.excerpt}”</blockquote><dl><div><dt>Classification</dt><dd>{item.eventType.replaceAll("_", " ")}</dd></div><div><dt>Extraction confidence</dt><dd>{Math.round(item.confidence*100)}% · heuristic</dd></div><div><dt>Forecast impact</dt><dd className={item.effect >= 0 ? "positive" : "negative"}>{item.effect >= 0 ? "+" : ""}{item.effect} pts</dd></div><div><dt>Verification</dt><dd>{item.verified ? "Verified" : "Unverified demo evidence"}</dd></div></dl>{!item.verified && <p className="ambiguity">Ambiguity warning: synthetic or unverified evidence must not be treated as historical fact.</p>}</div><a href={item.url} aria-label={`Open source for ${item.id}`}><ExternalLink/></a></article>)}</div></section>

    <section id="memory" className="section historical-memory"><header className="editorial-intro"><div><p className="mono-label cyan-label">03 · HISTORICAL MEMORY</p><h2>WHAT THE PAST<br/>REMEMBERS.</h2></div><p>Nearest situations are evidence, not destiny. Similarity is computed independently and never replaces the hazard model.</p></header><div className="memory-grid">{analogs.map((analog, index) => <article key={analog.source}><span className="memory-index">0{index+1}</span><strong>{analog.similarity}<small>%</small></strong><div><p>{analog.eventType.replaceAll("_", " ")}</p><time>{analog.date}</time><blockquote>{analog.source}</blockquote><b className={analog.followed ? "reset-followed" : "no-reset"}>{analog.followed ? "Reset followed" : "No reset in horizon"}</b><small>Pre-event forecast: {analog.forecastBefore ?? timeline[0]?.forecastBefore ?? "Unavailable"}% · {analog.outcome}</small></div></article>)}</div></section>

    <TimeMachine history={history} evidence={evidence} modelVersion={forecast.modelVersion}/>

    <section id="method" className="section methodology-sacred"><div><p className="mono-label cyan-label">05 · METHODOLOGY</p><h2>THE NUMBER<br/>MUST CONFESS.</h2></div><div><details open><summary>How this was calculated <ChevronDown/></summary><p>Six-hour discrete logistic hazard intervals are combined as 1 − Π(1 − hazard). Coefficients are editable expert priors, not statistically trained estimates.</p><dl><dt>Model</dt><dd>{forecast.modelVersion}</dd><dt>Data cutoff</dt><dd>{forecast.dataCutoff}</dd><dt>Evidence count</dt><dd>{forecast.evidenceIds.length}</dd><dt>Configuration</dt><dd>{forecast.configurationHash}</dd><dt>Simulation</dt><dd>{forecast.simulation.count.toLocaleString()} · seed {forecast.simulation.seed}</dd></dl></details><button className="audit" onClick={() => { const blob = new Blob([JSON.stringify(forecast, null, 2)], { type: "application/json" }); const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `forecast-${forecast.id}.json`; anchor.click(); }}><Database/> Export forecast audit JSON</button></div></section>
    <footer><span>SACRED FORECAST · RESET ORACLE</span><p>Will Tibo let the tokens flow?</p><a href="/lab">OPEN THE LAB →</a></footer>
  </main>;
}

function TimeMachine({ history, evidence, modelVersion }: { history: HistoryPoint[]; evidence: Evidence[]; modelVersion: string }) {
  const [index, setIndex] = useState(1);
  const [reveal, setReveal] = useState(false);
  const selected = history[index];
  const available = evidence.filter(item => Date.parse(item.postedAt) <= Date.parse(selected.time)).length;
  return <section id="time-machine" className={`section time-machine-sacred ${reveal && index > 1 ? "reset-revealed" : ""}`}><div className="time-copy"><p className="mono-label gold-label">04 · BLIND WALK-FORWARD</p><h2>TIME<br/><i>MACHINE.</i></h2><p>Choose a historical cutoff. Future evidence and outcomes remain sealed until revelation.</p></div><div className="time-console"><label><span>SELECTED CUTOFF</span><input aria-label="Historical cutoff" type="range" min="0" max={history.length-2} value={index} onChange={event => { setIndex(Number(event.target.value)); setReveal(false); }}/></label><div className="timeline-marks">{history.slice(0,-1).map((item, i) => <button key={item.time} aria-label={`Select ${formatDate(item.time)}`} className={i===index ? "active" : ""} onClick={() => { setIndex(i); setReveal(false); }}><i/><span>{formatDate(item.time)}</span></button>)}</div><div className="cutoff-record"><div><span>Historical probability</span><strong>{selected.probability}%</strong></div><dl><dt>Evidence available</dt><dd>{available}</dd><dt>Horizon</dt><dd>36 hours</dd><dt>Model version</dt><dd>{modelVersion}</dd><dt>Cutoff</dt><dd>{formatTimestamp(selected.time)} UTC</dd></dl></div><button className="reveal-outcome" onClick={() => setReveal(true)}><Eye/> Reveal what happened</button>{reveal && <motion.div className="outcome" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}><Clock3/><div><b>{index > 1 ? "VERIFIED RESET FOLLOWED" : "NO RESET IN THE HORIZON"}</b><span>In the synthetic demo timeline, a reset {index > 1 ? "did" : "did not"} follow within the horizon.</span></div>{index > 1 && <CheckCircle2/>}</motion.div>}</div></section>;
}
