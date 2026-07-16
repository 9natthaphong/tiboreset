import Link from "next/link";
import { getDataLabSnapshot } from "@/lib/data-lab";
import { ExtractedEventRecords, HistoricalWindowRecords } from "@/components/data-lab-records";

export const dynamic = "force-dynamic";

export default async function DataLabPage() {
  const data = await getDataLabSnapshot();
  const latest = data.latestForecast as null | {
    id?: string;
    generated_at?: string;
    data_cutoff?: string;
    probability?: number;
    horizon_hours?: number;
    evidence_post_ids?: string[];
    feature_snapshot?: Record<string, number>;
    simulation_summary?: Record<string, unknown>;
  };
  const latestRun = data.ingestionRuns[0];

  return <main className="lab">
    <header><div><p className="eyebrow">RESET ORACLE / HUMAN-VERIFIED DATA</p><h1>DATA LAB</h1></div><Link href="/lab">← Control room</Link></header>
    <div className="lab-banner" role="status">DATABASE {data.database.toUpperCase()} · SEED {data.seed.version} · MODEL {data.modelVersion}</div>

    <section><h2>Dataset inventory</h2><div className="lab-actions">
      <span>Manifest sources: {data.seed.sources}</span><span>Reset ledger: {data.seed.resetRecords}</span><span>Verified: {data.seed.verified}</span><span>Unverified: {data.seed.unverified}</span><span>Positive windows: {data.seed.positive}</span><span>Negative windows: {data.seed.negative}</span>
      {data.counts && <><span>Live posts: {data.counts.sourcePosts}</span><span>Extracted events: {data.counts.extractedEvents}</span><span>Known resets: {data.counts.knownResetEvents}</span><span>Forecasts: {data.counts.forecasts}</span></>}
    </div></section>

    <section><h2>Current forecast inputs</h2><p>{latest ? `Forecast ${Math.round(Number(latest.probability ?? 0) * 100)}% · generated ${latest.generated_at} · cutoff ${latest.data_cutoff}` : "No Live forecast has been generated."}</p>
      <details><summary>Feature values, simulation and evidence IDs</summary><pre>{JSON.stringify({ forecastId: latest?.id, horizonHours: latest?.horizon_hours, evidencePostIds: latest?.evidence_post_ids, features: latest?.feature_snapshot, simulation: latest?.simulation_summary }, null, 2)}</pre></details>
    </section>

    <section><h2>Latest ingestion summary</h2>{latestRun ? <p>{latestRun.completed_at ?? "running"} · {latestRun.status} · read {latestRun.posts_read ?? 0} · inserted {latestRun.posts_inserted ?? 0} · analyzed {latestRun.posts_analyzed ?? 0} · X resources {String(latestRun.metadata?.xResourcesConsumed ?? 0)}</p> : <p>No ingestion run is stored.</p>}</section>

    <section><h2>Extracted event records</h2><ExtractedEventRecords events={data.extractedEvents}/></section>

    <section><h2>Historical signal windows</h2><HistoricalWindowRecords windows={data.seed.windows}/></section>

    <section><h2>Blind backtests</h2>{!data.seed.retrospectiveScoringAvailable ? <p>Historical reset events are verified. Retrospective forecast scores are not yet available.</p> : data.backtests.length === 0 ? <p>No stored backtests.</p> : data.backtests.map((row, index) => <p key={`${row.cutoff_at}-${index}`}>{row.cutoff_at} · {Math.round(row.predicted_probability * 100)}% · outcome {row.actual_outcome ? "reset" : "no reset"} · Brier {row.brier_loss.toFixed(3)}</p>)}</section>
    <section><h2>X API resource audit</h2>{data.ingestionRuns.length === 0 ? <p>No ingestion runs.</p> : data.ingestionRuns.map(run => <p key={run.id}>{run.completed_at ?? "running"} · {run.status} · read {run.posts_read ?? 0} · inserted {run.posts_inserted ?? 0} · analyzed {run.posts_analyzed ?? 0} · resources {String(run.metadata?.xResourcesConsumed ?? 0)}</p>)}</section>
  </main>;
}
