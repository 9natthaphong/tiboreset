import { ExtractedEventRecords, HistoricalWindowRecords } from "@/components/data-lab-records";
import { LabNavigation } from "@/components/lab-navigation";
import { getDataLabSnapshot } from "@/lib/data-lab";

export const dynamic = "force-dynamic";

type LatestForecast = {
  id?: string;
  generated_at?: string;
  data_cutoff?: string;
  probability?: number;
  horizon_hours?: number;
  evidence_post_ids?: string[];
  feature_snapshot?: Record<string, number>;
  simulation_summary?: Record<string, unknown>;
};

const recordOrEmpty = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export default async function DataLabPage() {
  const data = await getDataLabSnapshot();
  const latest = data.latestForecast as LatestForecast | null;
  const latestRun = data.ingestionRuns[0];
  const xResourcesConsumed = data.ingestionRuns.reduce((total, run) => total + Number(run.metadata?.xResourcesConsumed ?? 0), 0);
  const summaries = [
    ["Live posts", data.counts?.sourcePosts],
    ["Extracted events", data.counts?.extractedEvents],
    ["Verified resets", data.seed.verified],
    ["Forecast snapshots", data.counts?.forecasts],
    ["X resources consumed", xResourcesConsumed],
  ] as const;
  const simulation = recordOrEmpty(latest?.simulation_summary);
  const origins = recordOrEmpty(simulation.featureOrigins);
  const details = recordOrEmpty(simulation.featureDetails);
  const featureRows = Object.entries(latest?.feature_snapshot ?? {}).map(([name, value]) => ({
    name,
    value,
    origin: typeof origins[name] === "string" ? String(origins[name]) : "unavailable",
    detail: typeof details[name] === "string" ? String(details[name]) : "Origin metadata predates this forecast snapshot.",
  }));
  const latestMilestone = data.milestoneState.latestReported;
  const canonical = data.canonicalSnapshot;

  return <main className="lab data-lab">
    <LabNavigation active="data"/>
    <header className="lab-heading"><div><p className="eyebrow">READ-ONLY TECHNICAL RECORD</p><h1>DATA LAB</h1><p>Technical evidence and model records for developers, analysts and reviewers.</p></div></header>
    <div className="data-lab-summary" aria-label="Data Lab summary">
      {summaries.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value ?? "—"}</strong></article>)}
    </div>

    <section aria-labelledby="system-status"><p className="lab-section-index">01</p><h2 id="system-status">SYSTEM STATUS</h2>
      <div className="lab-banner" role="status">DATABASE {data.database.toUpperCase()} · SEED {data.seed.version} · MODEL {data.modelVersion}</div>
      <h3>Latest ingestion summary</h3>{latestRun ? <p>{latestRun.completed_at ?? "running"} · {latestRun.status} · read {latestRun.posts_read ?? 0} · inserted {latestRun.posts_inserted ?? 0} · analyzed {latestRun.posts_analyzed ?? 0} · X resources {String(latestRun.metadata?.xResourcesConsumed ?? 0)}</p> : <p>No ingestion run is stored.</p>}
    </section>

    <section aria-labelledby="dataset-inventory"><p className="lab-section-index">02</p><h2 id="dataset-inventory">DATASET INVENTORY</h2><div className="lab-actions">
      <span>Manifest sources: {data.seed.sources.length}</span><span>Reset ledger: {data.seed.resetRecords}</span><span>Verified: {data.seed.verified}</span><span>Unverified: {data.seed.unverified}</span><span>Positive windows: {data.seed.positive}</span><span>Negative windows: {data.seed.negative}</span>
      {data.counts && <><span>Live posts: {data.counts.sourcePosts}</span><span>Extracted events: {data.counts.extractedEvents}</span><span>Known resets: {data.counts.knownResetEvents}</span><span>Forecasts: {data.counts.forecasts}</span></>}
    </div></section>

    <section aria-labelledby="forecast-inputs"><p className="lab-section-index">03</p><h2 id="forecast-inputs">CURRENT FORECAST INPUTS</h2><p>{canonical ? `Canonical calibrated forecast ${Math.round(canonical.forecast.probability * 100)}% · cutoff ${canonical.cutoff}` : latest ? `Stored forecast ${Math.round(Number(latest.probability ?? 0) * 100)}% · generated ${latest.generated_at} · cutoff ${latest.data_cutoff}` : "No Live forecast has been generated."}</p>
      <details><summary>Feature values, simulation and evidence IDs</summary><pre>{JSON.stringify({ forecastId: latest?.id, horizonHours: latest?.horizon_hours, evidencePostIds: latest?.evidence_post_ids, features: latest?.feature_snapshot, simulation: latest?.simulation_summary }, null, 2)}</pre></details>
    </section>

    <section aria-labelledby="hybrid-record"><p className="lab-section-index">03A</p><h2 id="hybrid-record">CANONICAL WATCH + FORECAST SNAPSHOT</h2>{canonical ? <><div className="lab-banner" role="status" data-testid="data-lab-canonical-score">WATCH {canonical.hybrid.watchScore} / 100 · CALIBRATED NEXT-36H {Math.round(canonical.forecast.probability * 100)}%</div><p>The Reset Watch Score is an operational readiness score, not a probability. Reset Oracle v2 remains the calibrated next-36-hour model.</p>
      {canonical.hybrid.confirmation && <article className="data-lab-cycle-record resolved"><span>RESOLVED EVENT</span><h3>{canonical.hybrid.confirmation.resetType === "banked" ? "Banked reset released" : "Full reset released"}</h3><dl><div><dt>previousCycleResolvedAt</dt><dd>{canonical.hybrid.previousCycleResolvedAt}</dd></div><div><dt>previousCycleFinalProbability</dt><dd>{canonical.hybrid.previousCycleFinalProbability == null ? "Unavailable" : canonical.hybrid.previousCycleFinalProbability}</dd></div><div><dt>latestResetAt</dt><dd>{canonical.hybrid.confirmation.occurredAt}</dd></div><div><dt>latestResetType</dt><dd>{canonical.hybrid.confirmation.resetType}</dd></div><div><dt>latestResetSource</dt><dd>{canonical.hybrid.confirmation.sourceUrl ?? "Unavailable"}</dd></div><div><dt>eventResolutionStatus</dt><dd>{canonical.hybrid.eventResolutionStatus}</dd></div></dl>{canonical.hybrid.confirmation.sourceUrl && <a href={canonical.hybrid.confirmation.sourceUrl} target="_blank" rel="noreferrer">Official source ↗</a>}</article>}
      <article className="data-lab-cycle-record active"><span>RESET WATCH SCORE</span><h3>{canonical.hybrid.watchScore} / 100</h3><p>{canonical.hybrid.whyThisScore}</p><dl className="canonical-hybrid-record"><div><dt>watchModelVersion</dt><dd>{canonical.hybrid.watchModelVersion}</dd></div><div><dt>activeCycleStartAt</dt><dd>{canonical.hybrid.cycleStartAt ?? "Unavailable"}</dd></div><div><dt>elapsedCycleHours</dt><dd>{canonical.hybrid.elapsedCycleHours.toFixed(2)}</dd></div><div><dt>expectedCycleHours</dt><dd>{canonical.hybrid.expectedCycleHours.toFixed(2)}</dd></div><div><dt>elapsedCycleRatio</dt><dd>{canonical.hybrid.elapsedCycleRatio.toFixed(4)}</dd></div><div><dt>cyclePoints</dt><dd>{canonical.hybrid.cyclePoints.toFixed(3)}</dd></div><div><dt>cycleMaturity</dt><dd>{canonical.hybrid.cycleMaturity.toFixed(4)}</dd></div><div><dt>timingChannel</dt><dd>{canonical.hybrid.timingChannel.toFixed(4)}</dd></div><div><dt>policyTimingChannel</dt><dd>{canonical.hybrid.policyTimingChannel.toFixed(4)}</dd></div><div><dt>strongestSignalChannel</dt><dd>{canonical.hybrid.strongestSignalChannel.toFixed(4)}</dd></div><div><dt>negativePenalty</dt><dd>{canonical.hybrid.negativePenalty.toFixed(4)}</dd></div><div><dt>maxWinningChannel</dt><dd>{canonical.hybrid.maxWinningChannel}</dd></div><div><dt>finalWatchScore</dt><dd>{canonical.hybrid.watchScore}</dd></div><div><dt>intervalSampleCount</dt><dd>{canonical.hybrid.intervalSampleCount}</dd></div><div><dt>intervalSource</dt><dd>{canonical.hybrid.intervalSource}</dd></div><div><dt>Override</dt><dd>{canonical.hybrid.appliedOverride ?? "None"}</dd></div><div><dt>Canonical cutoff</dt><dd>{canonical.cutoff}</dd></div><div><dt>preCycleSignalExclusions</dt><dd>{canonical.hybrid.excludedSignals.filter(item => item.exclusionReason === "before_cycle_start").length}</dd></div></dl></article>
      <article className="data-lab-cycle-record active"><span>RESET ORACLE V2</span><h3>{Math.round(canonical.forecast.probability * 100)}% calibrated next-36h probability</h3><dl className="canonical-hybrid-record"><div><dt>credibleInterval</dt><dd>{canonical.forecast.credibleIntervalLow.toFixed(4)}–{canonical.forecast.credibleIntervalHigh.toFixed(4)}</dd></div><div><dt>policyDrivenBranch</dt><dd>{canonical.forecast.policyModel?.policyProbability ?? "Unavailable"}</dd></div><div><dt>discretionaryBranch</dt><dd>{canonical.forecast.policyModel?.discretionaryProbability ?? "Unavailable"}</dd></div><div><dt>simulationSeed</dt><dd>{canonical.forecast.simulation.seed}</dd></div><div><dt>simulationCount</dt><dd>{canonical.forecast.simulation.count}</dd></div><div><dt>modelVersion</dt><dd>{canonical.forecast.modelVersion}</dd></div><div><dt>cutoff</dt><dd>{canonical.forecast.dataCutoff}</dd></div></dl></article>
      <article className="data-lab-cycle-record active"><span>POLICY REGIME</span><h3>{canonical.hybrid.policyRegimeState.replaceAll("_", " ")}</h3><dl className="canonical-hybrid-record"><div><dt>sourcePostId</dt><dd>{canonical.hybrid.policyRegimeSourcePostId ?? "None"}</dd></div><div><dt>activatedAt</dt><dd>{canonical.hybrid.policyRegimeActivatedAt ?? "None"}</dd></div><div><dt>expiresAt</dt><dd>{canonical.hybrid.policyRegimeExpiresAt ?? "None"}</dd></div><div><dt>confidence</dt><dd>{canonical.hybrid.policyRegimeConfidence}</dd></div><div><dt>ageHours</dt><dd>{canonical.hybrid.policyRegimeAgeHours ?? "Inactive"}</dd></div><div><dt>decay</dt><dd>{canonical.hybrid.policyRegimeDecayFactor}</dd></div><div><dt>policyTimingChannel</dt><dd>{canonical.hybrid.policyTimingChannel}</dd></div><div><dt>reason</dt><dd>{canonical.hybrid.policyRegimeReason}</dd></div><div><dt>watchCounterfactualDeltaPoints</dt><dd>{canonical.hybrid.policyRegimeWatchCounterfactualDeltaPoints ?? "Unavailable"}</dd></div><div><dt>calibratedCounterfactualDeltaPercentagePoints</dt><dd>{canonical.hybrid.policyRegimeCalibratedCounterfactualDeltaPercentagePoints ?? "Unavailable"}</dd></div></dl><p>Policy confidence is distinct from timing readiness. The 72-hour full-strength window and seven-day expiry are transparent expert product priors.</p></article>
      <details><summary>Structured signal readiness and exclusions</summary><pre>{JSON.stringify({ active: canonical.hybrid.activeSignals, excluded: canonical.hybrid.excludedSignals, watch: { timingChannel: canonical.hybrid.timingChannel, policyConfidence: canonical.hybrid.policyRegimeConfidence, cycleMaturity: canonical.hybrid.cycleMaturity, policyDecay: canonical.hybrid.policyRegimeDecayFactor, policyTimingChannel: canonical.hybrid.policyTimingChannel, strongestSignalChannel: canonical.hybrid.strongestSignalChannel, negativePenalty: canonical.hybrid.negativePenalty, maxWinningChannel: canonical.hybrid.maxWinningChannel, finalWatchScore: canonical.hybrid.watchScore }, policyRegime: { state: canonical.hybrid.policyRegimeState, sourcePostId: canonical.hybrid.policyRegimeSourcePostId, activatedAt: canonical.hybrid.policyRegimeActivatedAt, expiresAt: canonical.hybrid.policyRegimeExpiresAt, confidence: canonical.hybrid.policyRegimeConfidence, reason: canonical.hybrid.policyRegimeReason, decayFactor: canonical.hybrid.policyRegimeDecayFactor, watchCounterfactualDeltaPoints: canonical.hybrid.policyRegimeWatchCounterfactualDeltaPoints, calibratedCounterfactualDeltaPercentagePoints: canonical.hybrid.policyRegimeCalibratedCounterfactualDeltaPercentagePoints }, resolvedEvent: canonical.hybrid.confirmation, persistedForecast: canonical.persistedForecast, resolvedForecast: canonical.resolvedForecast }, null, 2)}</pre></details></> : <p>The canonical Watch Score is unavailable. No operational score is fabricated.</p>}</section>

    <section aria-labelledby="extracted-events"><p className="lab-section-index">04</p><h2 id="extracted-events">EXTRACTED EVENTS</h2><ExtractedEventRecords events={data.extractedEvents}/></section>
    <section aria-labelledby="historical-windows"><p className="lab-section-index">05</p><h2 id="historical-windows">HISTORICAL WINDOWS</h2><HistoricalWindowRecords windows={data.seed.windows}/></section>
    <section aria-labelledby="backtests"><p className="lab-section-index">06</p><h2 id="backtests">BACKTESTS</h2>{!data.seed.retrospectiveScoringAvailable ? <p>Historical reset events are verified. Retrospective forecast scores are not yet available.</p> : data.backtests.length === 0 ? <p>No stored backtests.</p> : data.backtests.map((row, index) => <p key={`${row.cutoff_at}-${index}`}>{row.cutoff_at} · {Math.round(row.predicted_probability * 100)}% · outcome {row.actual_outcome ? "reset" : "no reset"} · Brier {row.brier_loss.toFixed(3)}</p>)}</section>
    <section aria-labelledby="x-resource-audit"><p className="lab-section-index">07</p><h2 id="x-resource-audit">X API RESOURCE AUDIT</h2>{data.ingestionRuns.length === 0 ? <p>No ingestion runs.</p> : data.ingestionRuns.map(run => <p key={run.id}>{run.completed_at ?? "running"} · {run.status} · read {run.posts_read ?? 0} · inserted {run.posts_inserted ?? 0} · analyzed {run.posts_analyzed ?? 0} · resources {String(run.metadata?.xResourcesConsumed ?? 0)}</p>)}</section>

    <section aria-labelledby="data-sources"><p className="lab-section-index">08</p><h2 id="data-sources">DATA SOURCES</h2><p>Live posts enter through the official X API after activation. Historical records come only from the reviewed local manifest.</p><div className="data-source-records">{data.seed.sources.map(source => <article key={source.id}><div><b>{source.sourceAccount}</b><span>{source.sourceType.replaceAll("_", " ")} · {source.verificationStatus}</span></div><p>{source.sourceExcerpt}</p><a href={source.sourceUrl} target="_blank" rel="noreferrer">Open official source ↗</a></article>)}</div></section>

    <section aria-labelledby="feature-origins"><p className="lab-section-index">09</p><h2 id="feature-origins">FEATURE ORIGINS</h2><div className="feature-origin-legend"><article><b>MEASURED</b><p>Structured fields taken directly from cutoff-safe public evidence.</p></article><article><b>DERIVED</b><p>Deterministic transforms of verified dates, milestones, frequency and source state.</p></article><article><b>EXPERT PRIOR</b><p>Configured coefficient means, uncertainty and intercept; not trained estimates.</p></article><article><b>UNAVAILABLE</b><p>No sufficiently sourced value exists at this forecast cutoff.</p></article></div></section>

    <section aria-labelledby="measured-prior-values"><p className="lab-section-index">10</p><h2 id="measured-prior-values">MEASURED VS PRIOR VALUES</h2>{featureRows.length ? <div className="feature-value-records">{featureRows.map(row => <article key={row.name}><code>{row.name}</code><b>{row.value.toFixed(4)}</b><span className={`feature-origin origin-${row.origin}`}>{row.origin}</span><p>{row.detail}</p></article>)}</div> : <p>No stored feature snapshot is available.</p>}<p>All coefficient means and uncertainty values in model {data.modelVersion} are editable expert priors.</p></section>

    <section aria-labelledby="combined-milestone"><p className="lab-section-index">11</p><h2 id="combined-milestone">CURRENT COMBINED MILESTONE</h2>{latestMilestone ? <div className="milestone-data-record"><strong>{(latestMilestone.reportedActiveUsers / 1_000_000).toFixed(0)}M</strong><div><b>Codex + ChatGPT Work combined active users</b><p>Derived from the highest verified combined-denominator milestone record.</p><a href={latestMilestone.sourceUrl} target="_blank" rel="noreferrer">Official announcement ↗</a></div></div> : <p>No reviewed combined milestone is available.</p>}</section>

    <section aria-labelledby="next-pledged-milestone"><p className="lab-section-index">12</p><h2 id="next-pledged-milestone">TARGET POLICY</h2><div className="milestone-data-record"><strong>{data.milestoneState.nextTargetUsers ? `${data.milestoneState.nextTargetUsers / 1_000_000}M` : "REACHED"}</strong><div><b>{data.milestoneState.progressPercent ?? 0}% milestone progress</b><p>{data.milestoneState.pledgedMilestoneReached ? "The final pledged milestone has been reached. No later target is assumed without a verified new commitment." : `Policy ${data.milestoneState.policy.policyId} remains active.`}</p></div></div></section>

    <section aria-labelledby="milestone-candidates"><p className="lab-section-index">12A</p><h2 id="milestone-candidates">EXTRACTED MILESTONE CANDIDATES</h2><div className="data-source-records">{data.milestoneCandidates.map(candidate => <article key={candidate.sourcePostId}><div><b>{candidate.reportedActiveUsers / 1_000_000}M · {candidate.denominator.replaceAll("_", " ")}</b><span>{candidate.verificationStatus} · {candidate.resetType.replaceAll("_", " ")}</span></div><p>{candidate.rejectionReason ?? candidate.verificationMethod}</p><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a></article>)}</div></section>

    <section aria-labelledby="external-context"><p className="lab-section-index">13</p><h2 id="external-context">EXTERNAL CONTEXT EVENTS</h2><div className="data-source-records">{data.externalContext.map(event => <article key={event.id}><div><b>{event.provider} · {event.title}</b><span>{event.category.replaceAll("_", " ")} · {event.verificationStatus}</span></div><p>{event.description}</p><p>Forecast weight: {event.forecastWeight} · {event.rationale}</p><a href={event.sourceUrl} target="_blank" rel="noreferrer">Open official source ↗</a></article>)}</div></section>

    <section aria-labelledby="operational-events"><p className="lab-section-index">14</p><h2 id="operational-events">OPENAI OPERATIONAL EVENTS</h2>{data.operationalEvents.length ? <div className="data-source-records">{data.operationalEvents.map(event => <article key={event.id}><div><b>{event.title}</b><span>{event.occurredAt} · reviewed official status</span></div><p>{event.description}</p><a href={event.sourceUrl} target="_blank" rel="noreferrer">Open status source ↗</a></article>)}</div> : <p>No manually reviewed OpenAI Status incident is present in the current local dataset. No uncontrolled status-page request is made.</p>}</section>

    <section aria-labelledby="model-limitations"><p className="lab-section-index">15</p><h2 id="model-limitations">MODEL LIMITATIONS</h2><ul><li>The model uses expert-prior coefficients and has not been statistically trained.</li><li>Historical reset announcements are verified, but forward outcomes are not yet sufficient for retrospective calibration.</li><li>Competitor context carries zero forecast weight.</li><li>Operational incidents affect usage pressure only after human review of an official OpenAI Status source.</li></ul></section>
  </main>;
}
