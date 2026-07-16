"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Clipboard, ExternalLink } from "lucide-react";

type EventRecord = {
  id: string;
  event_type: string;
  extraction_confidence: number;
  requires_review: boolean;
  created_at: string;
  extraction_version: string;
  event_payload: Record<string, unknown>;
  source?: { text: string; post_url: string | null; platform_post_id: string; posted_at: string } | null;
};

type WindowRecord = {
  id: string;
  sourceUrl: string;
  eventCategory: string;
  observationWindow: string;
  eventAt: string;
  cutoffAt: string;
  sourceExcerpt: string;
  forecastBefore?: number | null;
  forecastAfter?: number | null;
  featureVector: Record<string, number>;
  dataProvenance: unknown;
  verificationNotes: string;
};

function CopyJsonButton({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="lab-copy-button" onClick={async () => {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }}><Clipboard size={14}/>{copied ? "Copied" : "Copy JSON"}</button>;
}

export function ExtractedEventRecords({ events }: { events: EventRecord[] }) {
  const [sort, setSort] = useState<"date" | "type" | "confidence">("date");
  const [expanded, setExpanded] = useState<string | null>(null);
  const records = useMemo(() => [...events].sort((a, b) => sort === "type" ? a.event_type.localeCompare(b.event_type) : sort === "confidence" ? b.extraction_confidence - a.extraction_confidence : Date.parse(b.created_at) - Date.parse(a.created_at)), [events, sort]);
  if (!records.length) return <p>No extracted events are stored.</p>;
  return <>
    <div className="lab-table-shell">
      <table className="lab-data-table"><thead><tr><th><button type="button" onClick={() => setSort("date")}>Observed {sort === "date" && "↓"}</button></th><th><button type="button" onClick={() => setSort("type")}>Event type {sort === "type" && "↓"}</button></th><th>Source excerpt</th><th><button type="button" onClick={() => setSort("confidence")}>Confidence {sort === "confidence" && "↓"}</button></th><th>Status</th><th>Actions</th></tr></thead><tbody>{records.map(event => <FragmentRow key={event.id} event={event} expanded={expanded === event.id} onToggle={() => setExpanded(expanded === event.id ? null : event.id)}/>)}</tbody></table>
    </div>
    <div className="lab-record-cards">{records.map(event => <article key={event.id}><header><time>{new Date(event.created_at).toLocaleString()}</time><span>{Math.round(event.extraction_confidence * 100)}%</span></header><h3>{event.event_type.replaceAll("_", " ")}</h3><p>{event.source?.text ?? "Source post unavailable"}</p><div><span>{event.requires_review ? "Review required" : "Reviewed"}</span>{event.source?.post_url && <a href={event.source.post_url} target="_blank" rel="noreferrer">Source <ExternalLink size={13}/></a>}<CopyJsonButton value={event.event_payload}/></div></article>)}</div>
  </>;
}

function FragmentRow({ event, expanded, onToggle }: { event: EventRecord; expanded: boolean; onToggle: () => void }) {
  return <><tr><td><time>{new Date(event.created_at).toLocaleDateString()}</time></td><td><b>{event.event_type.replaceAll("_", " ")}</b><code>{event.extraction_version}</code></td><td><span className="lab-source-excerpt">{event.source?.text ?? "Source post unavailable"}</span></td><td>{Math.round(event.extraction_confidence * 100)}%</td><td>{event.requires_review ? "Review required" : "Reviewed"}</td><td><div className="lab-row-actions">{event.source?.post_url && <a href={event.source.post_url} target="_blank" rel="noreferrer" aria-label="Open source post"><ExternalLink size={14}/></a>}<button type="button" aria-expanded={expanded} onClick={onToggle}>Details <ChevronDown size={14}/></button></div></td></tr>{expanded && <tr className="lab-expanded-row"><td colSpan={6}><div><pre>{JSON.stringify(event.event_payload, null, 2)}</pre><CopyJsonButton value={event.event_payload}/></div></td></tr>}</>;
}

export function HistoricalWindowRecords({ windows }: { windows: WindowRecord[] }) {
  const [sort, setSort] = useState<"date" | "category">("date");
  const [expanded, setExpanded] = useState<string | null>(null);
  const records = useMemo(() => [...windows].sort((a, b) => sort === "category" ? a.eventCategory.localeCompare(b.eventCategory) : Date.parse(b.eventAt) - Date.parse(a.eventAt)), [windows, sort]);
  if (!records.length) return <p>No human-verified seed windows supplied yet.</p>;
  return <>
    <div className="lab-table-shell"><table className="lab-data-table"><thead><tr><th><button type="button" onClick={() => setSort("date")}>Event date {sort === "date" && "↓"}</button></th><th><button type="button" onClick={() => setSort("category")}>Category {sort === "category" && "↓"}</button></th><th>Evidence</th><th>Window</th><th>Forecast</th><th>Actions</th></tr></thead><tbody>{records.map(window => {
      const detail = { features: window.featureVector, provenance: window.dataProvenance, verification: window.verificationNotes };
      const open = expanded === window.id;
      return <Fragment key={window.id}><tr><td>{new Date(window.eventAt).toLocaleDateString()}</td><td><b>{window.eventCategory.replaceAll("_", " ")}</b></td><td><span className="lab-source-excerpt">{window.sourceExcerpt}</span></td><td>{window.observationWindow}</td><td>{window.forecastBefore == null ? "—" : `${Math.round(window.forecastBefore * 100)}%`} → {window.forecastAfter == null ? "—" : `${Math.round(window.forecastAfter * 100)}%`}</td><td><div className="lab-row-actions"><a href={window.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/></a><button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : window.id)}>Details <ChevronDown size={14}/></button></div></td></tr>{open && <tr className="lab-expanded-row"><td colSpan={6}><div><pre>{JSON.stringify(detail, null, 2)}</pre><CopyJsonButton value={detail}/></div></td></tr>}</Fragment>;
    })}</tbody></table></div>
    <div className="lab-record-cards">{records.map(window => <article key={window.id}><header><time>{new Date(window.eventAt).toLocaleDateString()}</time><span>{window.observationWindow}</span></header><h3>{window.eventCategory.replaceAll("_", " ")}</h3><p>{window.sourceExcerpt}</p><div><a href={window.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={13}/></a><CopyJsonButton value={{ features: window.featureVector, provenance: window.dataProvenance, verification: window.verificationNotes }}/></div></article>)}</div>
  </>;
}
