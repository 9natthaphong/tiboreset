"use client";

import dynamic from "next/dynamic";
import { track } from "@vercel/analytics";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ExternalLink } from "lucide-react";
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Forecast } from "@/lib/forecasting";
import type { HistoryPoint, ResetHistoryItem } from "@/lib/public-data-types";
import { formatUtcShortDate, formatUtcTimestamp } from "@/lib/format-date";
import type { PublicBacktestSummary } from "@/lib/backtest-report";
import type { HybridLikelihood } from "@/lib/hybrid-likelihood";

const AdvancedDiagnostics = dynamic(() => import("./advanced-diagnostics"), {
  ssr: false,
  loading: () => (
    <div className="diagnostics-loading" role="status">
      Loading full model record…
    </div>
  ),
});

type Range = "24H" | "7D" | "ALL";
type ForecastView = "movement" | "signals" | "range";
type TrendView = "live" | "resets";

const chartTooltip = {
  background: "#101513",
  border: "1px solid #3e443f",
  color: "#f3eee2",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
};
const dateLabel = formatUtcShortDate;
const contributionLabels: Record<string, string> = {
  explicit_reset_confirmation: "Confirmed reset language",
  explicit_reset_hint: "Direct reset language",
  public_commitment_strength: "Public commitment",
  milestone_proximity: "Milestone momentum",
  milestone_velocity: "Milestone pace",
  usage_incident_strength: "Usage pressure",
  capacity_concern: "Capacity caution",
  historical_analog_success_rate: "Similar past resets",
  historical_analog_similarity: "Historical similarity",
  recent_reset_suppression: "Cooldown effect",
  unresolved_ambiguity_penalty: "Weak evidence penalty",
  signal_frequency_change: "Signal activity",
  evidence_recency: "Fresh evidence",
  promotional_signal: "Promotion activity",
  product_launch_signal: "Launch activity",
  community_poll_signal: "Community polling",
  time_since_last_reset: "Time since last reset",
  source_reliability: "Source reliability",
};
const contributionExplanations: Record<string, string> = {
  explicit_reset_confirmation: "A direct reset confirmation is the strongest evidence the model can receive.",
  explicit_reset_hint: "Recent wording suggests reset intent without treating playful or ambiguous language as confirmation.",
  public_commitment_strength: "A public commitment makes a future reset more plausible, weighted by extraction confidence.",
  milestone_proximity: "The latest public milestone appears close to a known reset trigger.",
  milestone_velocity: "The observed pace toward the next milestone changes how soon a reset could become relevant.",
  usage_incident_strength: "Public usage pressure can increase the case for a limit intervention.",
  capacity_concern: "Capacity uncertainty can reduce confidence that a broad reset will happen soon.",
  historical_analog_success_rate: "Similar verified situations were followed by resets inside the selected horizon.",
  historical_analog_similarity: "Current evidence resembles earlier verified signal windows.",
  recent_reset_suppression: "A recent reset makes another immediate reset less likely.",
  unresolved_ambiguity_penalty: "Unresolved language is discounted until stronger evidence appears.",
  signal_frequency_change: "Reset-related posts are appearing more or less often than the recent baseline.",
  evidence_recency: "Fresh evidence carries more weight than older posts.",
  source_reliability: "Evidence from the monitored official account receives a reliability adjustment.",
};

const viewOrder: ForecastView[] = ["movement", "signals", "range"];
const probabilityBand = (probability: number) => probability >= .98 ? "CONFIRMED" : probability >= .8 ? "IMMINENT" : probability >= .6 ? "HIGH" : probability >= .4 ? "ELEVATED" : probability >= .2 ? "WATCH" : "LOW";

export default function Charts({ forecast, hybrid, history, resetHistory, backtestSummary }: { forecast: Forecast; hybrid: HybridLikelihood | null; history: HistoryPoint[]; resetHistory: ResetHistoryItem[]; backtestSummary: PublicBacktestSummary | null }) {
  const [view, setView] = useState<ForecastView>("movement");
  const [range, setRange] = useState<Range>("ALL");
  const [trendView, setTrendView] = useState<TrendView>("live");
  const [focused, setFocused] = useState<HistoryPoint | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(true);
  const policyRecord = forecast.policyModel
    ? {
        combinedProbability: forecast.probability,
        policyProbability: forecast.policyModel.policyProbability,
        discretionaryProbability: forecast.policyModel.discretionaryProbability,
        nextTargetUsers: forecast.policyModel.nextTargetUsers,
        recentMedianHours: forecast.policyModel.recentIntervalMedianHours,
        longTermMedianHours: forecast.policyModel.longTermIntervalMedianHours,
        regimeWeight: forecast.policyModel.regimeWeight,
        elapsedHours: forecast.policyModel.elapsedHours,
        conditionalArrivalProbability: forecast.policyModel.conditionalArrivalProbability,
        posteriorSuccesses: forecast.policyModel.posteriorSuccesses,
        posteriorFailures: forecast.policyModel.posteriorFailures,
        posteriorMean: forecast.policyModel.posteriorMean,
        posteriorInterval: forecast.policyModel.posteriorInterval,
        discretionaryCooldown: forecast.policyModel.discretionaryCooldown,
        alertBand: forecast.policyModel.alertBand,
        experimental: false,
      }
    : backtestSummary?.policySnapshot
      ? {
          ...backtestSummary.policySnapshot,
          discretionaryCooldown: forecast.features.recent_reset_suppression,
          alertBand: probabilityBand(backtestSummary.policySnapshot.combinedProbability),
          experimental: true,
        }
      : null;
  const latestTime = Date.parse(history.at(-1)?.time ?? forecast.generatedAt);
  const filtered = useMemo(
    () =>
      history.filter((point) => {
        if (range === "ALL") return true;
        return Date.parse(point.time) >= latestTime - (range === "24H" ? 86_400_000 : 7 * 86_400_000);
      }),
    [history, latestTime, range],
  );
  const historyData = filtered.map((point, index) => ({
    ...point,
    previousProbability: point.cyclePhase !== "active" ? point.probability : null,
    activeProbability: point.cyclePhase === "active" ? point.probability : null,
    previousBandBase: point.cyclePhase !== "active" ? point.low : null,
    previousBandRange: point.cyclePhase !== "active" ? Math.max(0, point.high - point.low) : null,
    activeBandBase: point.cyclePhase === "active" ? point.low : null,
    activeBandRange: point.cyclePhase === "active" ? Math.max(0, point.high - point.low) : null,
    relevantMarker: point.evidencePostId && (point.impact ?? 0) >= 0 ? point.probability : null,
    negativeMarker: (point.impact ?? 0) < 0 ? point.probability : null,
    verifiedMarker: point.verified ? point.probability : null,
    resolvedMarker: point.resolvedResetAt ? point.probability : null,
    currentMarker: index === filtered.length - 1 ? point.probability : null,
    before: history[Math.max(0, history.findIndex((item) => item.forecastId === point.forecastId) - 1)]?.probability ?? point.probability,
  }));
  const positives = forecast.contributions
    .filter((item) => item.logOddsContribution > 0)
    .sort((a, b) => b.logOddsContribution - a.logOddsContribution)
    .slice(0, 4);
  const negatives = forecast.contributions
    .filter((item) => item.logOddsContribution < 0)
    .sort((a, b) => a.logOddsContribution - b.logOddsContribution)
    .slice(0, 3);
  const contribution = [...positives, ...negatives].map((item) => ({
    name: contributionLabels[item.featureName] ?? item.label,
    value: Number(item.logOddsContribution.toFixed(2)),
    technicalName: item.featureName,
    explanation: contributionExplanations[item.featureName] ?? "This factor changes the deterministic model estimate using its configured expert-prior coefficient.",
  }));
  const rankedContributions = [...forecast.contributions].sort((a, b) => Math.abs(b.logOddsContribution) - Math.abs(a.logOddsContribution)).slice(0, 7);
  const maxContribution = Math.max(...contribution.map((item) => Math.abs(item.value)), 0.01);
  const first = history[0];
  const last = history.at(-1);
  const delta = first && last ? last.probability - first.probability : 0;
  const trackingDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(first?.time ?? forecast.generatedAt));
  const summary = hybrid?.eventResolutionStatus === "resolved"
    ? `The previous forecast resolved when the official reset was released. Current values estimate a new reset after that event.`
    : history.length >= 2 && first && last ? `Reset probability ${delta >= 0 ? "increased" : "decreased"} from ${first.probability}% to ${last.probability}%${last.label ? ` after ${last.label.toLowerCase()} evidence` : ""}.` : `Live forecast tracking began on ${trackingDate}. More points will appear as new signals are processed.`;

  const selectView = (next: ForecastView) => setView(next);
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const current = viewOrder.indexOf(view);
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % viewOrder.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + viewOrder.length) % viewOrder.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = viewOrder.length - 1;
    else return;
    event.preventDefault();
    const nextView = viewOrder[next];
    setView(nextView);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-forecast-tab="${nextView}"]`)?.focus());
  };

  return (
    <div className="forecast-visuals">
      <div className="forecast-view-tabs" role="tablist" aria-label="Forecast view">
        {viewOrder.map((item) => (
          <button key={item} type="button" role="tab" id={`forecast-tab-${item}`} aria-controls={`forecast-panel-${item}`} aria-selected={view === item} tabIndex={view === item ? 0 : -1} className={view === item ? "active" : ""} data-forecast-tab={item} onClick={() => selectView(item)} onKeyDown={onTabKeyDown}>
            <span>{item.toUpperCase()}</span>
            <ArrowRight size={15} />
          </button>
        ))}
      </div>

      <div className="forecast-active-view">
        {view === "movement" && (
          <section id="forecast-panel-movement" role="tabpanel" aria-labelledby="forecast-tab-movement" className="forecast-view-panel movement-view" data-testid="probability-trend">
            <header className="forecast-view-heading">
              <div>
                <span>{trendView === "live" ? `CALIBRATED ${forecast.horizonHours}-HOUR PROBABILITY TREND` : "VERIFIED RESET CALENDAR"}</span>
                <h3>{trendView === "live" ? "How the forecast is moving" : "Milestone announcements over time"}</h3>
                {trendView === "live" && <p>This chart tracks Reset Oracle v2 probability, not the Live Reset Likelihood score.</p>}
              </div>
              <div className="trend-view-toggle" aria-label="Movement data source">
                <button type="button" className={trendView === "live" ? "active" : ""} onClick={() => setTrendView("live")} aria-pressed={trendView === "live"}>
                  LIVE FORECAST
                </button>
                <button type="button" className={trendView === "resets" ? "active" : ""} onClick={() => setTrendView("resets")} aria-pressed={trendView === "resets"}>
                  RESET HISTORY
                </button>
              </div>
            </header>
            {trendView === "live" ? (
              <>
                {hybrid?.eventResolutionStatus === "resolved" && hybrid.confirmation && <div className="forecast-cycle-resolution" role="status">
                  <div><span>RESET RELEASED</span><strong>{formatUtcTimestamp(hybrid.confirmation.occurredAt)}</strong><p>The previous forecast resolved at {hybrid.previousCycleFinalProbability == null ? "the confirmed event" : `${Math.round(hybrid.previousCycleFinalProbability * 100)}%`}. The active forecast starts a new visual cycle.</p></div>
                  {hybrid.confirmation.sourceUrl && <a href={hybrid.confirmation.sourceUrl} target="_blank" rel="noreferrer">Official source <ExternalLink size={14}/></a>}
                </div>}
                {history.length < 2 ? (
                  <div className="sparse-forecast-state" data-testid="sparse-forecast-state">
                    <span>LIVE TRACKING HAS JUST STARTED</span>
                    <strong>{Math.round(forecast.probability * 100)}%</strong>
                    <h4>The first forecast was recorded on {trackingDate}.</h4>
                    <p>New points will appear when fresh signals change the model.</p>
                    <button type="button" onClick={() => setTrendView("resets")}>
                      View reset history <ArrowRight size={16} />
                    </button>
                    <small>One actual forecast snapshot · no historical probabilities inferred</small>
                  </div>
                ) : (
                  <>
                    <div className="range-toggle trend-range-toggle" aria-label="Forecast history range">
                      {(["24H", "7D", "ALL"] as Range[]).map((option) => (
                        <button type="button" key={option} className={option === range ? "active" : ""} onClick={() => setRange(option)} aria-pressed={option === range}>
                          {option}
                        </button>
                      ))}
                    </div>
                    <div className="chart-scroll" role="region" aria-label="Scrollable reset probability chart" tabIndex={0}>
                      <ResponsiveContainer width="100%" height={360}>
                        <ComposedChart data={historyData} margin={{ top: 22, right: 22, left: 2, bottom: 8 }}>
                          <defs>
                            <linearGradient id="goldBand" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0" stopColor="#d9a441" stopOpacity=".24" />
                              <stop offset="1" stopColor="#d9a441" stopOpacity=".025" />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="time" tickFormatter={dateLabel} stroke="#717771" tickLine={false} axisLine={false} />
                          <YAxis domain={[0, 100]} unit="%" stroke="#717771" tickLine={false} axisLine={false} width={42} />
                          <Tooltip contentStyle={chartTooltip} labelFormatter={(value) => formatUtcTimestamp(String(value))} formatter={(value, name, item) => (name === "probability" ? [`${value}% · ${String(item.payload.label)}`, `Forecast (${item.payload.before}% → ${value}%)`] : [value, name])} />
                          <Area dataKey="previousBandBase" stackId="previous-interval" stroke="none" fill="transparent" isAnimationActive={false} />
                          <Area dataKey="previousBandRange" stackId="previous-interval" stroke="none" fill="url(#goldBand)" animationDuration={800} />
                          <Area dataKey="activeBandBase" stackId="active-interval" stroke="none" fill="transparent" isAnimationActive={false} />
                          <Area dataKey="activeBandRange" stackId="active-interval" stroke="none" fill="url(#goldBand)" animationDuration={800} />
                          <Line
                            dataKey="previousProbability"
                            name="probability"
                            stroke="#ffd36a"
                            strokeWidth={3}
                            dot={false}
                            activeDot={{
                              fill: "#ffd36a",
                              r: 6,
                              stroke: "#fff3c9",
                              strokeWidth: 1,
                            }}
                            animationDuration={850}
                          />
                          <Line dataKey="activeProbability" name="probability" stroke="#ffd36a" strokeWidth={3} dot={{ fill: "#ffd36a", r: 5, stroke: "#fff3c9", strokeWidth: 1 }} activeDot={{ fill: "#ffd36a", r: 6, stroke: "#fff3c9", strokeWidth: 1 }} animationDuration={850}/>
                          <Line
                            dataKey="relevantMarker"
                            stroke="none"
                            dot={{
                              fill: "#4bd8ee",
                              r: 5,
                              stroke: "#101513",
                              strokeWidth: 2,
                            }}
                          />
                          <Line
                            dataKey="negativeMarker"
                            stroke="none"
                            dot={{
                              fill: "#ff835e",
                              r: 5,
                              stroke: "#101513",
                              strokeWidth: 2,
                            }}
                          />
                          <Line
                            dataKey="verifiedMarker"
                            stroke="none"
                            dot={{
                              fill: "#f3eee2",
                              r: 6,
                              stroke: "#ffd36a",
                              strokeWidth: 2,
                            }}
                          />
                          <Line dataKey="resolvedMarker" stroke="none" dot={{ fill: "#ffd36a", r: 9, stroke: "#f3eee2", strokeWidth: 2 }}/>
                          <Line
                            dataKey="currentMarker"
                            stroke="none"
                            dot={{
                              fill: "#ffd36a",
                              r: 7,
                              stroke: "#fff3c9",
                              strokeWidth: 2,
                            }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="chart-legend" aria-hidden="true">
                      <span>
                        <i className="gold" />
                        Probability
                      </span>
                      <span>
                        <i className="cyan" />
                        Tibo signal
                      </span>
                      <span>
                        <i className="orange" />
                        Negative signal
                      </span>
                      <span><i className="resolved"/> Reset released</span>
                    </div>
                    <p className="chart-summary" aria-live="polite">
                      {summary}
                    </p>
                    <div className="annotation-focus" aria-label="Evidence-linked forecast changes">
                      {history
                        .filter((point) => point.evidencePostId)
                        .map((point, index) => {
                          const before = history[Math.max(0, index - 1)]?.probability ?? point.probability;
                          const change = point.probability - before;
                          return (
                            <button type="button" key={point.forecastId} onFocus={() => setFocused(point)} onMouseEnter={() => setFocused(point)} onMouseLeave={() => setFocused(null)} aria-label={`${point.label}. ${point.probability}% forecast, ${change >= 0 ? "plus" : "minus"} ${Math.abs(change)} points.`}>
                              <i className={(point.impact ?? 0) < 0 ? "negative-dot" : "signal-dot"} />
                              <span>{dateLabel(point.time)}</span>
                            </button>
                          );
                        })}
                    </div>
                    {focused && (
                      <div className="annotation-card" role="status">
                        <strong>{focused.excerpt ?? focused.label}</strong>
                        <span>
                          {formatUtcTimestamp(focused.time)} · {focused.eventType?.replaceAll("_", " ")}
                        </span>
                        <b>
                          {focused.impact && focused.impact > 0 ? "+" : ""}
                          {focused.impact ?? 0} pts
                        </b>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <ResetCalendar resetHistory={resetHistory} />
            )}
          </section>
        )}

        {view === "signals" && (
          <section id="forecast-panel-signals" role="tabpanel" aria-labelledby="forecast-tab-signals" className="forecast-view-panel signals-view" data-testid="contribution-chart">
            <header className="forecast-view-heading">
              <div>
                <span>WHAT MOVED THE FORECAST</span>
                <h3>Signals ranked by impact</h3>
              </div>
              <p>Clear language first. Technical math stays one layer deeper.</p>
            </header>
            <div className="signal-ranking">
              <div className="signal-rank-row baseline-signal">
                <span>00</span>
                <div>
                  <b>Baseline prior</b>
                  <small>Starting point before current evidence</small>
                </div>
                <em>Expert prior</em>
              </div>
              {contribution.map((item, index) => {
                const magnitude = Math.abs(item.value);
                const strength = magnitude >= 0.7 ? "Strong" : magnitude >= 0.3 ? "Moderate" : "Slight";
                const selected = selectedSignal === item.technicalName;
                return (
                  <div className={`signal-rank-wrap ${item.value >= 0 ? "positive-factor" : "negative-factor"}`} key={item.technicalName}>
                    <button type="button" className="signal-rank-row" aria-expanded={selected} onClick={() => setSelectedSignal(selected ? null : item.technicalName)}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <b>{item.name}</b>
                        <small>
                          {strength} {item.value >= 0 ? "positive" : "negative"}
                        </small>
                        <i>
                          <u
                            style={{
                              width: `${(magnitude / maxContribution) * 100}%`,
                            }}
                          />
                        </i>
                      </div>
                      <em>
                        {item.value > 0 ? "+" : ""}
                        {item.value}
                      </em>
                      <ChevronDown size={16} />
                    </button>
                    {selected && <p className="signal-explanation">{item.explanation}</p>}
                  </div>
                );
              })}
            </div>
            <details className="calculation-drawer">
              <summary>
                <span>
                  <b>VIEW CALCULATION</b>
                  <small>Technical feature names, origins and configured values</small>
                </span>
                <ChevronDown size={17} />
              </summary>
              <div>
                {forecast.contributions.map((item) => {
                  const featureName = item.featureName as keyof typeof forecast.featureOrigins;
                  return (
                    <dl key={item.featureName}>
                      <dt>
                        {contributionLabels[item.featureName] ?? item.label}
                        <small>{forecast.featureDetails[featureName]}</small>
                      </dt>
                      <dd>
                        <code>{item.featureName}</code>
                        <span className={`feature-origin origin-${forecast.featureOrigins[featureName]}`}>{forecast.featureOrigins[featureName]}</span>
                        <span>value {item.normalizedValue.toFixed(2)}</span>
                        <span>coefficient {item.coefficient.toFixed(2)} · expert prior</span>
                        <b>{item.logOddsContribution.toFixed(3)}</b>
                      </dd>
                    </dl>
                  );
                })}
              </div>
            </details>
          </section>
        )}

        {view === "range" && (
          <section id="forecast-panel-range" role="tabpanel" aria-labelledby="forecast-tab-range" className="forecast-view-panel range-view" data-testid="forecast-range">
            <header className="forecast-view-heading">
              <div>
                <span>FORECAST RANGE</span>
                <h3>Uncertainty, without the statistical fog.</h3>
              </div>
              <p>{forecast.simulation.count.toLocaleString()} seeded simulations</p>
            </header>
            <div className="range-editorial-values">
              <div>
                <span>CURRENT ESTIMATE</span>
                <strong data-testid="chart-probability">{Math.round(forecast.probability * 100)}%</strong>
              </div>
              <div>
                <span>LIKELY RANGE</span>
                <b>
                  {Math.round(forecast.credibleIntervalLow * 100)}–{Math.round(forecast.credibleIntervalHigh * 100)}%
                </b>
              </div>
            </div>
            <div className="probability-range editorial-range" role="img" aria-label={`Likely probability range from ${Math.round(forecast.credibleIntervalLow * 100)} to ${Math.round(forecast.credibleIntervalHigh * 100)} percent, current estimate ${Math.round(forecast.probability * 100)} percent`}>
              <i
                style={{
                  left: `${forecast.credibleIntervalLow * 100}%`,
                  width: `${(forecast.credibleIntervalHigh - forecast.credibleIntervalLow) * 100}%`,
                }}
              />
              <b style={{ left: `${forecast.probability * 100}%` }}>
                <span>{Math.round(forecast.probability * 100)}%</span>
              </b>
              <small className="range-low" style={{ left: `${forecast.credibleIntervalLow * 100}%` }}>
                {Math.round(forecast.credibleIntervalLow * 100)}%
              </small>
              <small className="range-high" style={{ left: `${forecast.credibleIntervalHigh * 100}%` }}>
                {Math.round(forecast.credibleIntervalHigh * 100)}%
              </small>
            </div>
            <p className="range-confidence-copy">In 80% of simulations, the result fell inside this range.</p>
          </section>
        )}
      </div>

      <details className="advanced-diagnostics" open={diagnosticsOpen} onToggle={(event) => setDiagnosticsOpen(event.currentTarget.open)} data-testid="advanced-diagnostics">
        <summary
          aria-expanded={diagnosticsOpen}
          onClick={() => {
            if (!diagnosticsOpen) track("expand_model_record");
          }}
        >
          <span className="diagnostic-toggle-icon" aria-hidden="true">
            <i>+</i>
            <b>−</b>
          </span>
          <span>
            <b className="diagnostic-open-copy">OPEN FULL MODEL RECORD</b>
            <b className="diagnostic-close-copy">COLLAPSE MODEL RECORD</b>
            <small>Model summary, feature ranking, coefficients and audit details</small>
          </span>
          <ChevronDown size={18} />
        </summary>
        {diagnosticsOpen && (
          <div className="diagnostics-disclosure">
            {hybrid && <section className="hybrid-model-record" aria-labelledby="hybrid-model-title"><header><span>ACTIVE NEXT-RESET FORECAST</span><h3 id="hybrid-model-title">New-cycle operational state</h3><p>The confirmed reset closes the previous forecast. Current scores estimate a future reset after that event.</p></header>{hybrid.eventResolutionStatus === "resolved" && hybrid.confirmation && <div className="resolved-event-audit"><span>RESOLVED EVENT</span><strong>{hybrid.confirmation.resetType === "banked" ? "Banked reset released" : "Full reset released"}</strong><p>{formatUtcTimestamp(hybrid.confirmation.occurredAt)} · previous forecast {hybrid.previousCycleFinalProbability == null ? "record unavailable" : `${Math.round(hybrid.previousCycleFinalProbability * 100)}%`}</p>{hybrid.confirmation.sourceUrl && <a href={hybrid.confirmation.sourceUrl} target="_blank" rel="noreferrer">Official source <ExternalLink size={13}/></a>}</div>}<dl><div><dt>Active state</dt><dd>{hybrid.hybridState.replaceAll("_", " ")}</dd></div><div><dt>Live Reset Likelihood</dt><dd>{hybrid.hybridScore}</dd></div><div><dt>Active cycle start</dt><dd>{hybrid.cycleStartAt ? formatUtcTimestamp(hybrid.cycleStartAt) : "Unavailable"}</dd></div><div><dt>Current calibrated probability</dt><dd>{Math.round(hybrid.calibratedProbability * 100)}%</dd></div><div><dt>Cycle pressure</dt><dd>{hybrid.cyclePoints.toFixed(1)}</dd></div><div><dt>Historical component</dt><dd>{hybrid.historicalPoints.toFixed(1)}</dd></div><div><dt>Signal component</dt><dd>{hybrid.signalPoints.toFixed(1)}</dd></div><div><dt>Negative component</dt><dd>{hybrid.negativePoints.toFixed(1)}</dd></div><div><dt>Override</dt><dd>{hybrid.appliedOverride ?? "None"}</dd></div></dl></section>}
            {hybrid && <section className="policy-regime-record" aria-labelledby="policy-regime-title"><header><span>RESET POLICY REGIME</span><h3 id="policy-regime-title">{hybrid.policyRegimeState.replaceAll("_", " ")}</h3><p>{hybrid.policyRegimeReason}</p></header><dl><div><dt>Source post</dt><dd>{hybrid.policyRegimeSourcePostId ?? "None"}</dd></div><div><dt>Activated</dt><dd>{hybrid.policyRegimeActivatedAt ? formatUtcTimestamp(hybrid.policyRegimeActivatedAt) : "Inactive"}</dd></div><div><dt>Expires</dt><dd>{hybrid.policyRegimeExpiresAt ? formatUtcTimestamp(hybrid.policyRegimeExpiresAt) : "Inactive"}</dd></div><div><dt>Confidence</dt><dd>{Math.round(hybrid.policyRegimeConfidence * 100)}%</dd></div><div><dt>Policy boost</dt><dd>{hybrid.policyContinuationBoost.toFixed(1)} points</dd></div><div><dt>Score floor</dt><dd>{hybrid.policyRegimeScoreFloor.toFixed(1)}%</dd></div><div><dt>Policy-only cap</dt><dd>{hybrid.policyRegimeCap}%</dd></div><div><dt>Calibrated counterfactual</dt><dd>{hybrid.policyRegimeCalibratedCounterfactualDeltaPercentagePoints == null ? "Unavailable" : `${hybrid.policyRegimeCalibratedCounterfactualDeltaPercentagePoints.toFixed(1)} points`}</dd></div></dl><p className="model-record-note">The seven-day lifetime and 72-hour full-strength window are transparent expert product priors, not statistically learned parameters.</p></section>}
            <section className="model-summary" aria-labelledby="model-summary-title">
              <header>
                <span>MODEL RECORD</span>
                <h3 id="model-summary-title">Current forecast at a glance</h3>
              </header>
              <dl>
                <div>
                  <dt>Current probability</dt>
                  <dd>{Math.round(forecast.probability * 100)}%</dd>
                </div>
                <div>
                  <dt>Likely interval</dt>
                  <dd>
                    {Math.round(forecast.credibleIntervalLow * 100)}–{Math.round(forecast.credibleIntervalHigh * 100)}%
                  </dd>
                </div>
                <div>
                  <dt>Model version</dt>
                  <dd>{forecast.modelVersion}</dd>
                </div>
                <div>
                  <dt>Forecast horizon</dt>
                  <dd>{forecast.horizonHours} hours</dd>
                </div>
                <div>
                  <dt>Simulations</dt>
                  <dd>{forecast.simulation.count.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Data cutoff</dt>
                  <dd>{formatUtcTimestamp(forecast.dataCutoff)}</dd>
                </div>
                <div>
                  <dt>Evidence count</dt>
                  <dd>{forecast.evidenceIds.length}</dd>
                </div>
              </dl>
              <div className="model-summary-ranking">
                <h4>Feature contribution ranking</h4>
                <ol>
                  {rankedContributions.map((item) => (
                    <li key={item.featureName}>
                      <span>{contributionLabels[item.featureName] ?? item.label}</span>
                      <b className={item.logOddsContribution < 0 ? "negative" : "positive"}>
                        {item.logOddsContribution > 0 ? "+" : ""}
                        {item.logOddsContribution.toFixed(2)}
                      </b>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
            {policyRecord && (
              <section className="policy-branch-record" aria-labelledby="policy-branch-title">
                <header>
                  <span>RESET PROBABILITY</span>
                  <h3 id="policy-branch-title">Two causes. One combined forecast.</h3>
                  <p>Reset Oracle separately estimates when the next pledged user milestone will arrive and whether a reset is likely when it does. It then combines that policy-driven risk with live public signals.</p>
                </header>
                <div className="policy-branch-values">
                  <div><span>Policy-driven reset risk</span><strong>{Math.round(policyRecord.policyProbability * 100)}%</strong></div>
                  <div><span>Signal-driven reset risk</span><strong>{Math.round(policyRecord.discretionaryProbability * 100)}%</strong></div>
                  <div><span>Combined {forecast.horizonHours}-hour probability</span><strong>{Math.round(policyRecord.combinedProbability * 100)}%</strong><em>{policyRecord.alertBand}</em></div>
                </div>
                <dl>
                  <div><dt>Next pledged milestone</dt><dd>{policyRecord.nextTargetUsers ? `${policyRecord.nextTargetUsers / 1_000_000}M` : "Policy fulfilled — awaiting commitment"}</dd></div>
                  <div><dt>Elapsed since latest milestone</dt><dd>{policyRecord.elapsedHours == null ? "Unavailable" : `${policyRecord.elapsedHours.toFixed(1)} hours`}</dd></div>
                  <div><dt>Recent milestone cadence</dt><dd>{policyRecord.recentMedianHours == null ? "No recent regime" : `${policyRecord.recentMedianHours.toFixed(1)} hours`}</dd></div>
                  <div><dt>Long-term cadence</dt><dd>{policyRecord.longTermMedianHours == null ? "Unavailable" : `${policyRecord.longTermMedianHours.toFixed(1)} hours`}</dd></div>
                  <div><dt>Recent-regime weight</dt><dd>{Math.round(policyRecord.regimeWeight * 100)}%</dd></div>
                  <div><dt>Milestone arrival pressure</dt><dd>{Math.round(policyRecord.conditionalArrivalProbability * 100)}%</dd></div>
                  <div><dt>Reset at milestone posterior</dt><dd>{Math.round(policyRecord.posteriorMean * 100)}% · {policyRecord.posteriorSuccesses} success / {policyRecord.posteriorFailures} failure</dd></div>
                  <div><dt>Discretionary cooldown</dt><dd>{Math.round(policyRecord.discretionaryCooldown * 100)}% · signal branch only</dd></div>
                </dl>
                {policyRecord.experimental && <footer>Experimental policy snapshot at the cached backtest endpoint.</footer>}
              </section>
            )}
            {backtestSummary && <section className="public-backtest-summary" aria-labelledby="public-backtest-title">
              <header><span>STRICT PRE-ANNOUNCEMENT BACKTEST</span><h3 id="public-backtest-title">{backtestSummary.interpretation}</h3><p>Historical simulation, not a guarantee of future resets.</p></header>
              <dl><div><dt>Evaluation period</dt><dd>{formatUtcShortDate(backtestSummary.from)}–{formatUtcShortDate(backtestSummary.to)}</dd></div><div><dt>Six-hour cutoffs</dt><dd>{backtestSummary.sampleSize}</dd></div><div><dt>Brier score</dt><dd>{backtestSummary.brierScore.toFixed(4)}</dd></div><div><dt>Base-rate Brier</dt><dd>{backtestSummary.baselineBrierScore.toFixed(4)}</dd></div><div><dt>Brier skill</dt><dd>{backtestSummary.brierSkillScore?.toFixed(4) ?? "Unavailable"}</dd></div><div><dt>Resets above 50%</dt><dd>{backtestSummary.resetsAbove50}</dd></div><div><dt>Median lead time</dt><dd>{backtestSummary.medianLeadHours == null ? "Not reached" : `${backtestSummary.medianLeadHours.toFixed(1)} hours`}</dd></div><div><dt>Calibration</dt><dd>{backtestSummary.calibrationStatus}</dd></div></dl>
              <footer>Report {backtestSummary.version}</footer>
            </section>}
            <AdvancedDiagnostics forecast={forecast} />
          </div>
        )}
      </details>
    </div>
  );
}

function ResetCalendar({ resetHistory }: { resetHistory: ResetHistoryItem[] }) {
  const records = resetHistory.filter((item) => item.milestoneUsers).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!records.length) return <div className="reset-calendar-empty">No verified reset announcements are available.</div>;
  const start = Date.parse(records[0].date);
  const end = Date.parse(records.at(-1)!.date);
  const span = Math.max(1, end - start);
  const position = (date: string) => 4 + ((Date.parse(date) - start) / span) * 92;
  return (
    <div className="reset-calendar" data-testid="reset-history-calendar">
      <div className="calendar-axis" role="img" aria-label={`Verified reset announcements from ${dateLabel(records[0].date)} to ${dateLabel(records.at(-1)!.date)}`}>
        <span className="axis-start">{dateLabel(records[0].date)}</span>
        <span className="axis-end">{dateLabel(records.at(-1)!.date)}</span>
        {records.map((record) => (
          <span className="calendar-marker" key={record.id} style={{ left: `${position(record.date)}%` }} title={`${(record.milestoneUsers ?? 0) / 1_000_000}M · ${record.type} · ${dateLabel(record.date)}`} tabIndex={0} aria-label={`${(record.milestoneUsers ?? 0) / 1_000_000} million users, ${record.type} reset announcement, ${dateLabel(record.date)}`}>
            <i />
            <b>{(record.milestoneUsers ?? 0) / 1_000_000}M</b>
          </span>
        ))}
      </div>
      <div className="calendar-record-grid">
        {records.map((record) => (
          <article key={record.id}>
            <span>{record.displayDateThailand ?? record.date.slice(0, 10)}</span>
            <strong>{(record.milestoneUsers ?? 0) / 1_000_000}M</strong>
            <b>{record.type === "scheduled" ? "SCHEDULED" : record.type.toUpperCase()}</b>
          </article>
        ))}
      </div>
      <p>Verified announcement dates only. Reset types are categorical and are not plotted on the probability axis.</p>
    </div>
  );
}
