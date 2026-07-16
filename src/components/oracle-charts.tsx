"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Forecast } from "@/lib/forecasting";

type HistoryPoint = { time: string; probability: number; label: string };

export default function Charts({ forecast, history }: { forecast: Forecast; history: HistoryPoint[] }) {
  const historyData = history.map((point, index) => ({
    ...point,
    low: Math.max(0, point.probability - 11),
    band: Math.min(100, point.probability + 13) - Math.max(0, point.probability - 11),
    verified: index === 1 ? point.probability : null,
    negative: index === 0 ? point.probability : null,
    current: index === history.length - 1 ? point.probability : null,
  }));
  const contribution = forecast.contributions.slice(0, 9).map(x => ({ name: x.label, value: +x.logOddsContribution.toFixed(2) }));
  const histogram = forecast.simulation.histogram.map(x => ({ range: `${Math.round(x.from * 100)}–${Math.round(x.to * 100)}`, count: x.count }));
  const tooltip = { background: "#101513", border: "1px solid #3e443f", color: "#f3eee2", fontFamily: "var(--font-mono)", fontSize: 11 };

  return <div className="charts-sacred">
    <article className="chart-panel history-panel">
      <header><div><span>PROBABILITY HISTORY</span><h3>Forecast movement over time</h3></div><p>Gold forecast · cyan verified evidence · orange risk</p></header>
      <div className="chart-scroll"><ResponsiveContainer width="100%" height={390}><ComposedChart data={historyData} margin={{ top: 22, right: 22, left: 2, bottom: 8 }}>
        <defs><linearGradient id="goldBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9a441" stopOpacity=".25"/><stop offset="1" stopColor="#d9a441" stopOpacity=".02"/></linearGradient></defs>
        <CartesianGrid stroke="#26312e" vertical={false}/><XAxis dataKey="time" tickFormatter={x => new Date(x).toLocaleDateString("en", { month: "short", day: "numeric" })} stroke="#717771" tickLine={false}/><YAxis domain={[0, 100]} unit="%" stroke="#717771" tickLine={false}/>
        <Tooltip contentStyle={tooltip} labelFormatter={x => new Date(x).toLocaleString()} formatter={(value, name, props) => name === "probability" ? [`${value}% · ${props.payload.label}`, "Forecast / evidence"] : [value, name]}/>
        <Area dataKey="low" stackId="interval" stroke="none" fill="transparent"/><Area dataKey="band" stackId="interval" stroke="none" fill="url(#goldBand)"/>
        <Line dataKey="probability" stroke="#d9a441" strokeWidth={3} dot={{ fill: "#d9a441", r: 3, strokeWidth: 0 }} activeDot={{ fill: "#ffd36a", r: 7 }}/>
        <Line dataKey="verified" stroke="none" dot={{ fill: "#4bd8ee", r: 5, stroke: "#101513", strokeWidth: 2 }}/><Line dataKey="negative" stroke="none" dot={{ fill: "#ff835e", r: 5, stroke: "#101513", strokeWidth: 2 }}/><Line dataKey="current" stroke="none" dot={{ fill: "#ffd36a", r: 7, stroke: "#fff3c9", strokeWidth: 2 }}/>
      </ComposedChart></ResponsiveContainer></div>
      <p className="chart-summary">From {history[0].probability}% to {history.at(-1)?.probability}% across {history.length} evidence-linked snapshots. Focus or hover points to inspect the responsible evidence.</p>
    </article>
    <div className="chart-pair">
      <article className="chart-panel"><header><div><span>FEATURE CONTRIBUTIONS</span><h3>What moved the odds</h3></div><p>Log-odds</p></header><div className="chart-scroll"><ResponsiveContainer width="100%" height={370}><BarChart data={contribution} layout="vertical" margin={{ left: 18, right: 22 }}><CartesianGrid stroke="#26312e" horizontal={false}/><XAxis type="number" stroke="#717771"/><YAxis dataKey="name" type="category" width={150} stroke="#a9aaa3" fontSize={11}/><ReferenceLine x={0} stroke="#a9aaa3"/><Tooltip contentStyle={tooltip}/><Bar dataKey="value">{contribution.map((x, i) => <Cell key={i} fill={x.value >= 0 ? "#d9a441" : "#ff835e"}/>)}</Bar></BarChart></ResponsiveContainer></div><p className="chart-summary">Baseline prior is held in the model intercept; displayed contributions reconcile in log-odds space.</p></article>
      <article className="chart-panel"><header><div><span>MONTE CARLO</span><h3>Probability distribution</h3></div><p>{forecast.simulation.count.toLocaleString()} runs</p></header><div className="chart-scroll"><ResponsiveContainer width="100%" height={370}><BarChart data={histogram}><CartesianGrid stroke="#26312e" vertical={false}/><XAxis dataKey="range" stroke="#717771" fontSize={10}/><YAxis stroke="#717771"/><Tooltip contentStyle={tooltip}/><Bar dataKey="count" fill="#276c77" radius={[2, 2, 0, 0]}>{histogram.map((_, i) => <Cell key={i} fill={i >= 6 ? "#d9a441" : "#276c77"}/>)}</Bar></BarChart></ResponsiveContainer></div><p className="chart-summary">Median {Math.round(forecast.simulation.median * 100)}% · central 80% interval {Math.round(forecast.simulation.p10 * 100)}–{Math.round(forecast.simulation.p90 * 100)}% · {forecast.modelVersion}</p></article>
    </div>
    <article className="chart-panel calibration-panel"><header><div><span>CALIBRATION / BACKTESTS</span><h3>Reliability under sparse evidence</h3></div><p>Demo sample warning</p></header><svg viewBox="0 0 900 220" role="img" aria-label="Demo reliability diagram"><line x1="70" y1="180" x2="830" y2="30"/><polyline points="70,180 230,162 390,128 550,95 710,68 830,40"/><g><circle cx="230" cy="162" r="7"/><circle cx="390" cy="128" r="7"/><circle cx="550" cy="95" r="7"/><circle cx="710" cy="68" r="7"/></g><text x="70" y="210">0% predicted</text><text x="760" y="210">100% predicted</text></svg><p className="chart-summary">Mean Brier 0.19 vs 0.25 baseline. Six synthetic tests are too few for performance claims.</p></article>
  </div>;
}
