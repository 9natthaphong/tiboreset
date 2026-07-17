"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Forecast } from "@/lib/forecasting";

const chartTooltip = { background: "#101513", border: "1px solid #3e443f", color: "#f3eee2", fontFamily: "var(--font-mono)", fontSize: 11 };

export default function AdvancedDiagnostics({ forecast }: { forecast: Forecast }) {
  const histogram = forecast.simulation.histogram.map(item => ({ range: `${Math.round(item.from * 100)}–${Math.round(item.to * 100)}`, count: item.count }));
  return <div className="advanced-diagnostics-content">
    <div className="diagnostic-grid">
      <article><h3>Full simulation distribution</h3><ResponsiveContainer width="100%" height={280}><BarChart data={histogram}><XAxis dataKey="range" stroke="#717771" fontSize={9} tickLine={false} axisLine={false}/><YAxis stroke="#717771" tickLine={false} axisLine={false}/><Tooltip contentStyle={chartTooltip}/><Bar dataKey="count" fill="#276c77" animationDuration={700}>{histogram.map((_, index) => <Cell key={index} fill={index >= Math.floor(histogram.length * 0.6) ? "#d9a441" : "#276c77"}/>)}</Bar></BarChart></ResponsiveContainer><p>{forecast.simulation.count.toLocaleString()} seeded simulations · median {Math.round(forecast.simulation.median * 100)}% · p10–p90 {Math.round(forecast.simulation.p10 * 100)}–{Math.round(forecast.simulation.p90 * 100)}%</p></article>
      <article className="model-record"><h3>Model record</h3><dl><dt>Model version</dt><dd>{forecast.modelVersion}</dd><dt>Forecast ID</dt><dd>{forecast.id}</dd><dt>Data cutoff</dt><dd>{forecast.dataCutoff}</dd><dt>Configuration hash</dt><dd>{forecast.configurationHash}</dd><dt>Simulation seed</dt><dd>{forecast.simulation.seed}</dd><dt>Evidence IDs</dt><dd>{forecast.evidenceIds.join(", ") || "None"}</dd></dl></article>
    </div>
    <div className="coefficient-table" role="table" aria-label="Forecast coefficients" tabIndex={0}><div role="row"><b>Display label</b><b>Technical feature</b><b>Origin</b><b>Value</b><b>Coefficient</b><b>Contribution</b></div>{forecast.contributions.map(item => {
      const featureName = item.featureName as keyof typeof forecast.featureOrigins;
      return <div role="row" key={item.featureName}><span>{item.label}</span><code>{item.featureName}</code><span className={`feature-origin origin-${forecast.featureOrigins[featureName]}`}>{forecast.featureOrigins[featureName]}</span><span>{item.normalizedValue.toFixed(2)}</span><span>{item.coefficient.toFixed(2)} <small>expert prior</small></span><span>{item.logOddsContribution.toFixed(3)}</span></div>;
    })}</div>
    <div className="calibration-note"><b>Calibration and backtests</b><span>Historical reset events are verified. Retrospective forecast scores are not yet available.</span></div>
  </div>;
}
