"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { motion } from "motion/react";
import { track } from "@vercel/analytics";
import { CheckCircle2, ChevronDown, Clock3, Database, ExternalLink, Eye, Menu, Radio, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Evidence, Forecast } from "@/lib/forecasting";
import type { ExternalContextEvent } from "@/lib/external-context";
import type { HistoricalDatasetSummary, HistoryPoint, LatestPost, LatestPostsResponse, PublicHealth, PublicMilestoneState, ResetHistoryItem } from "@/lib/public-data-types";
import { getUsageGuidance } from "@/lib/usage-guidance";
import { CinematicHero } from "./cinematic-hero";
import { deriveMilestoneState } from "@/lib/milestones";
import type { PublicBacktestSummary } from "@/lib/backtest-report";
import { formatResetEventTimes, formatUtcShortDate, formatUtcTimestamp } from "@/lib/format-date";
import { PublicVisitCounter } from "./public-visit-counter";
import type { HybridLikelihood } from "@/lib/hybrid-likelihood";
import { formatHistoricalMemoryTimestamp, historicalForecastPresentation, historicalOutcomePresentation } from "@/lib/historical-memory";

const Charts = dynamic(() => import("./oracle-charts"), { ssr: false, loading: () => <div className="chart-loading">Loading forecast record…</div> });
type Analog = { date: string; eventType: string; similarity: number; outcome: string; source: string; followed: boolean | null; forecastBefore?: number };
type Props = { initialForecast: Forecast; initialHybrid: HybridLikelihood | null; hybridStatus: "available" | "unavailable"; evidence: Evidence[]; history: HistoryPoint[]; latestPosts: LatestPostsResponse; resetHistory: ResetHistoryItem[]; milestoneState: PublicMilestoneState; historicalDataset: HistoricalDatasetSummary; externalContextEvents: ExternalContextEvent[]; health: PublicHealth; analogs: Analog[]; renderedAt: string; evidenceExtractionModel: string | null; backtestSummary: PublicBacktestSummary | null };

const formatTimestamp = formatUtcTimestamp;
const formatDate = formatUtcShortDate;
const relativeTime = (value: string, now: string) => {
  const minutes = Math.max(0, Math.round((Date.parse(now) - Date.parse(value)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)}d ago`;
};
export function OracleExperience({ initialForecast, initialHybrid, hybridStatus: initialHybridStatus, evidence: initialEvidence, history: initialHistory, latestPosts: initialPosts, resetHistory: initialResetHistory, milestoneState, historicalDataset, externalContextEvents, health: initialHealth, analogs, renderedAt, evidenceExtractionModel, backtestSummary }: Props) {
  const [forecast, setForecast] = useState(initialForecast);
  const [hybrid, setHybrid] = useState(initialHybrid);
  const [hybridStatus, setHybridStatus] = useState(initialHybridStatus);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [history, setHistory] = useState(initialHistory);
  const [posts, setPosts] = useState(initialPosts);
  const [resetHistory, setResetHistory] = useState(initialResetHistory);
  const [health, setHealth] = useState(initialHealth);
  const [referenceTime, setReferenceTime] = useState(renderedAt);
  const [showAllPosts, setShowAllPosts] = useState(false);
  const [signalTab, setSignalTab] = useState<"forecast_moving" | "screened_out">("forecast_moving");
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [updated, setUpdated] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const realtimeConnected = useRef(false);
  const refreshInFlight = useRef<Promise<boolean> | null>(null);
  const refreshFailures = useRef(0);
  const currentForecastId = useRef(initialForecast.id);
  const latestChecked = health.lastIngestionAt ?? posts.lastUpdatedAt ?? forecast.dataCutoff;
  const ageMinutes = Math.max(0, Math.floor((Date.parse(referenceTime) - Date.parse(latestChecked)) / 60000));
  const freshness = forecast.mode === "demo" ? "DEMO" : ageMinutes < 10 ? "LIVE" : ageMinutes <= 30 ? "DELAYED" : "STALE";
  const previousProbability = history.at(-2)?.probability ?? Math.round(forecast.probability * 100);
  const currentProbability = Math.round(forecast.probability * 100);
  const trend = currentProbability > previousProbability ? "Rising" : currentProbability < previousProbability ? "Falling" : "Steady";
  const resetReleased = hybrid?.eventResolutionStatus === "resolved" && Boolean(hybrid.confirmation);
  const scheduledResolution = hybrid?.confirmation?.resetType === "scheduled";
  const guidance = getUsageGuidance(hybrid ? hybrid.watchScore / 100 : forecast.probability, false);
  const latestResetTimes = hybrid?.confirmation ? formatResetEventTimes(hybrid.confirmation.occurredAt) : null;
  const currentMilestoneState = useMemo<PublicMilestoneState>(() => {
    const events = resetHistory.filter(item => item.milestoneUsers && item.sourcePostId && item.sourceUrl && item.denominator).map(item => ({ sourcePostId: item.sourcePostId!, sourceUrl: item.sourceUrl!, sourceAccount: item.sourceAccount ?? "@thsottiaux", reportedActiveUsers: item.milestoneUsers!, denominator: item.denominator!, resetType: (["full", "banked", "scheduled", "announcement_only"].includes(item.type) ? item.type : "announcement_only") as "full" | "banked" | "scheduled" | "announcement_only", announcedAt: item.date, executionAt: item.type === "full" || item.type === "banked" ? item.date : null, verificationStatus: "verified" as const, verificationMethod: "public_snapshot", rejectionReason: null }));
    if (!events.length) return milestoneState;
    const derived = deriveMilestoneState(events);
    return { latestReportedUsers: derived.latestReported?.reportedActiveUsers ?? null, latestVerifiedResetUsers: derived.latestVerifiedReset?.reportedActiveUsers ?? null, latestResetType: derived.latestVerifiedReset?.resetType ?? null, latestEventDate: derived.latestVerifiedReset?.announcedAt ?? null, nextTargetUsers: derived.nextTargetUsers, progressPercent: derived.progressPercent, pledgedMilestoneReached: derived.pledgedMilestoneReached, policyId: derived.policy.policyId };
  }, [milestoneState, resetHistory]);
  const latestKnownReset = currentMilestoneState.latestVerifiedResetUsers
    ? `${forecast.mode === "demo" ? "Demo · " : ""}${currentMilestoneState.latestVerifiedResetUsers / 1_000_000}M combined active users`
    : historicalDataset.latestMilestoneLabel ?? "Not yet seeded";

  const refreshPublicData = useCallback((announce = true) => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const refresh = (async () => {
      try {
        const responses = await Promise.all([
          fetch("/api/hybrid/current", { cache: "no-store" }),
          fetch("/api/health", { cache: "no-store" }),
        ]);
        if (responses.some(response => !response.ok)) throw new Error("Public refresh unavailable");
        const [canonicalJson, healthJson] = await Promise.all(responses.map(response => response.json()));
        const nextForecast = canonicalJson.forecast as Forecast;
        const nextEvidence = canonicalJson.evidence as Evidence[];
        setForecast(nextForecast);
        setHybrid(canonicalJson.hybrid as HybridLikelihood | null);
        setHybridStatus(canonicalJson.status === "available" ? "available" : "unavailable");
        setEvidence(nextEvidence);
        setHistory(canonicalJson.history as HistoryPoint[]);
        setPosts(canonicalJson.latestPosts as LatestPostsResponse);
        setResetHistory(canonicalJson.resetHistory as ResetHistoryItem[]);
        setHealth(healthJson as PublicHealth);
        setReferenceTime(new Date().toISOString());
        refreshFailures.current = 0;
        if (announce && nextForecast.id !== currentForecastId.current) {
          setUpdated(true);
          window.setTimeout(() => setUpdated(false), 3500);
        }
        currentForecastId.current = nextForecast.id;
        return true;
      } catch {
        refreshFailures.current += 1;
        return false;
      } finally {
        refreshInFlight.current = null;
      }
    })();
    refreshInFlight.current = refresh;
    return refresh;
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    let pollTimer: number | undefined;
    const scheduleFallback = () => {
      if (pollTimer) window.clearTimeout(pollTimer);
      const delay = 300_000 * 2 ** Math.min(refreshFailures.current, 3);
      pollTimer = window.setTimeout(async () => {
        if (!realtimeConnected.current && document.visibilityState === "visible") await refreshPublicData();
        scheduleFallback();
      }, delay);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshPublicData(false).finally(scheduleFallback);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    main?.setAttribute("data-refresh-ready", "true");
    scheduleFallback();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    let cleanupRealtime = () => {};
    if (forecast.mode === "live" && url && anon) {
      const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
      const channel = client.channel("public-forecast-updates").on("postgres_changes", { event: "INSERT", schema: "public", table: "forecasts" }, () => void refreshPublicData().finally(scheduleFallback)).subscribe(status => { realtimeConnected.current = status === "SUBSCRIBED"; });
      cleanupRealtime = () => { realtimeConnected.current = false; void client.removeChannel(channel); };
    }
    return () => { if (pollTimer) window.clearTimeout(pollTimer); document.removeEventListener("visibilitychange", refreshWhenVisible); window.removeEventListener("focus", refreshWhenVisible); main?.setAttribute("data-refresh-ready", "false"); cleanupRealtime(); };
  }, [forecast.mode, refreshPublicData]);

  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    gsap.registerPlugin(ScrollTrigger);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = gsap.context(() => {
      const sections = gsap.utils.toArray<HTMLElement>("[data-editorial-section]", main);
      sections.forEach(section => {
        const heading = section.querySelector("[data-reveal-heading]");
        const primary = section.querySelector("[data-reveal-primary]");
        const support = Array.from(section.querySelectorAll("[data-reveal-support]"));
        const progressLine = section.querySelector(".milestone-progress-line");
        if (reduce) {
          if (heading) gsap.set(heading, { autoAlpha: 1, y: 0, clearProps: "transform" });
          if (primary) gsap.set(primary, { autoAlpha: 1, y: 0, clearProps: "transform" });
          if (support.length) gsap.set(support, { autoAlpha: 1, y: 0, clearProps: "transform" });
          if (progressLine) gsap.set(progressLine, { scaleY: 1 });
          return;
        }
        if (heading) gsap.set(heading, { autoAlpha: 0, y: 28 });
        if (primary) gsap.set(primary, { autoAlpha: 0, y: 22 });
        if (support.length) gsap.set(support, { autoAlpha: 0, y: 18 });
        if (progressLine) gsap.set(progressLine, { scaleY: 0, transformOrigin: "top center" });
        const timeline = gsap.timeline({
          scrollTrigger: { trigger: section, start: "top 82%", once: true },
          defaults: { ease: "power2.out" },
        });
        if (heading) timeline.to(heading, { autoAlpha: 1, y: 0, duration: 0.62 });
        if (primary) timeline.to(primary, { autoAlpha: 1, y: 0, duration: 0.66 }, heading ? "-=0.34" : 0);
        if (support.length) timeline.to(support, { autoAlpha: 1, y: 0, duration: 0.54, stagger: 0.07 }, "-=0.34");
        if (progressLine) timeline.to(progressLine, { scaleY: 1, duration: 0.9, ease: "power1.inOut" }, "-=0.58");
        const transformed = [heading, primary, ...support].filter((target): target is Element => target !== null);
        if (transformed.length) timeline.set(transformed, { clearProps: "transform" });
      });
    }, main);
    return () => context.revert();
  }, []);

  const movingPosts = posts.posts.filter(post => post.signalBucket === "forecast_moving");
  const screenedPosts = posts.posts.filter(post => post.signalBucket !== "forecast_moving");
  const selectedPosts = signalTab === "forecast_moving" ? movingPosts : screenedPosts;
  const onSignalTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next = signalTab === "forecast_moving" ? "screened_out" : "forecast_moving";
    setSignalTab(event.key === "Home" ? "forecast_moving" : event.key === "End" ? "screened_out" : next);
  };

  return <main ref={mainRef} data-refresh-ready="false">
    <header className="topbar sacred-nav" aria-hidden="true"><a className="wordmark" href="#top"><span>SF</span><b>SACRED FORECAST</b><small>RESET ORACLE</small></a><nav className="desktop-navigation" aria-label="Main navigation"><a href="#forecast">Forecast</a><a href="#latest-signals">Latest signals</a><a href="#reset-history">Reset history</a><a href="#method">Method</a><a href="/lab/data">Data Lab</a></nav><span className="mode-pill"><i/> {forecast.mode.toUpperCase()} MODE</span><details className="mobile-navigation"><summary aria-label="Open navigation"><Menu size={18}/><span>Menu</span><ChevronDown size={15}/></summary><nav aria-label="Mobile navigation"><a href="#forecast">Forecast</a><a href="#latest-signals">Latest signals</a><a href="#reset-history">Reset history</a><a href="#method">Method</a><a href="/lab/data">Data Lab</a></nav></details></header>
    {updated && <motion.div className="update-indicator" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} role="status"><Sparkles size={14}/> Forecast updated from new evidence</motion.div>}

    <CinematicHero forecast={forecast} hybrid={hybrid} hybridStatus={hybridStatus} freshness={freshness} trend={trend} latestKnownReset={latestKnownReset} lastCheckedAt={latestChecked}/>

    <p className="post-hero-disclaimer">Unofficial project. Not affiliated with or endorsed by OpenAI or X.</p>

    <section className="quota-plan-value section" data-editorial-section>
      <header data-reveal-heading><p className="mono-label gold-label">MORE THAN A TOKEN COUNTER.</p><h2>Turn uncertainty into a quota plan.</h2></header>
      <div className="quota-plan-copy" data-reveal-primary><p>Sacred Forecast turns verified public signals, milestone velocity, usage pressure and reset history into a probabilistic plan for when to run the work that matters. <small>A six-hour logistic hazard model, evaluated across {forecast.simulation.count.toLocaleString()} seeded simulations.</small></p><a href="#usage-plan" onClick={() => track("plan_next_36_hours")}>PLAN THE NEXT 36 HOURS <span aria-hidden="true">→</span></a></div>
    </section>

    <section id="usage-plan" className={`usage-planning ${resetReleased ? "reset-available" : ""}`} data-band={guidance.band} data-testid="usage-guidance" data-editorial-section>
      <div data-reveal-heading>
        <p className="mono-label gold-label">QUOTA PLANNING</p>
        <h2>{resetReleased ? scheduledResolution ? "RESET ANNOUNCED" : "RESET AVAILABLE" : "SPEND. SAVE. OR QUEUE."}</h2>
        <p>{resetReleased ? scheduledResolution ? "An official near-term reset announcement was detected. Verify that rollout has reached your account before relying on renewed capacity." : "An official reset announcement was detected. Verify that the reset is available on your account, then use the renewed capacity while the window is stable." : "Use capacity while the window is stable. Queue heavy agent runs when reset odds rise. Protect the quota that remains when evidence is weak."}</p>
        {resetReleased && hybrid?.confirmation && latestResetTimes
          ? <span className="current-guidance">Released {latestResetTimes.thailand} · {latestResetTimes.utc}. Account availability may still vary.</span>
          : <span className="current-guidance">Current guidance · {guidance.title}: {guidance.guidance}</span>}
        {resetReleased && hybrid?.confirmation?.sourceUrl && <a className="source-action reset-guidance-source" href={hybrid.confirmation.sourceUrl} target="_blank" rel="noreferrer" onClick={() => track("view_official_source")}>View official announcement <ExternalLink size={13}/></a>}
      </div>
      <aside data-reveal-primary><span>{hybridStatus === "available" && hybrid ? `${hybrid.watchScore} / 100` : "—"}</span><b>{resetReleased ? "NEXT RESET CYCLE" : guidance.band}</b>{trend === "Rising" ? <TrendingUp/> : trend === "Falling" ? <TrendingDown/> : <Radio/>}</aside>
      {hybrid && <p className="why-watch-score" data-reveal-support><b>Why this score?</b>{hybrid.whyThisScore}</p>}
      <small data-reveal-support>{resetReleased ? `${scheduledResolution ? "The scheduled reset announcement" : "The completed reset announcement"} is verified. The Watch Score estimates readiness in the next announcement cycle.` : "This is usage-planning guidance, not an official OpenAI announcement."}</small>
    </section>

    <section id="forecast" className="section forecast-section" data-editorial-section><header className="concise-heading" data-reveal-heading><div><p className="mono-label gold-label">THE FORECAST</p><h2>One answer. Three clear views.</h2></div><p>What changed, how certain it is, and what the model sees now.</p></header><div data-reveal-primary><Charts forecast={forecast} hybrid={hybrid} history={history} resetHistory={resetHistory} backtestSummary={backtestSummary}/></div></section>

    <section id="latest-signals" className="section latest-signals-section" data-editorial-section>
      <header className="concise-heading" data-reveal-heading><div><p className="mono-label cyan-label">LATEST SIGNALS FROM TIBO</p><h2>The posts moving the forecast.</h2></div><div className="source-status">{posts.account.profileImageUrl ? <Image className="signal-account-avatar" src={posts.account.profileImageUrl} alt={`${posts.account.displayName} profile`} width={48} height={48}/> : <span className="signal-account-avatar fallback" role="img" aria-label={`${posts.account.displayName} profile placeholder`}>T</span>}<Radio size={14}/><span><b>{posts.mode === "live" ? "LIVE SOURCE" : "DEMO SOURCE"}</b><small>{posts.mode === "live" ? `${posts.account.username} · checked ${relativeTime(posts.lastUpdatedAt, referenceTime)}` : "Synthetic fixtures for offline demonstration"}</small></span></div></header>
      <p className="section-deck" data-reveal-primary>The newest public posts that may affect the reset forecast.</p>
      <div className="ingestion-forecast-status" aria-label="Latest ingestion and forecast status">
        <span><small>Last successful X check</small><b>{health.lastSuccessfulIngestionAt ? formatTimestamp(health.lastSuccessfulIngestionAt) : "Not yet checked"}</b></span>
        <span><small>Latest ingestion</small><b>{health.latestIngestionResult?.toUpperCase() ?? "NOT YET RUN"}</b></span>
        <span><small>Source freshness</small><b>{health.sourceFreshness}</b></span>
        <span><small>Forecast last calculated</small><b>{health.lastForecastCalculatedAt ? formatTimestamp(health.lastForecastCalculatedAt) : "Not yet calculated"}</b></span>
        <span><small>Forecast last saved</small><b>{health.lastForecastSavedAt ? formatTimestamp(health.lastForecastSavedAt) : "No forecast yet"}</b></span>
        <span><small>Current model</small><b>{health.currentModelVersion ?? forecast.modelVersion}</b></span>
        <span><small>Forecast freshness</small><b>{health.forecastFreshness}</b></span>
        {health.latestRun && <><span><small>New posts screened</small><b>{health.latestRun.newPostsScreened}</b></span><span><small>Relevant posts analyzed</small><b>{health.latestRun.relevantPostsAnalyzed}</b></span><span><small>Forecast changed</small><b>{health.latestRun.forecastChanged ? "Yes" : "No"}</b></span>{health.latestRun.status === "failure" ? <p>Source check failed ({health.latestIngestionFailureCategory ?? "unknown"}). Stored-state forecast recalculation is reported separately.</p> : health.latestRun.forecastRecalculated && !health.latestRun.forecastChanged && <p>Fresh posts and elapsed policy time were evaluated, but the forecast remained below the materiality threshold.</p>}</>}
      </div>
      <div className="latest-signal-tabs" role="tablist" aria-label="Latest signal classification"><button type="button" role="tab" aria-selected={signalTab === "forecast_moving"} tabIndex={signalTab === "forecast_moving" ? 0 : -1} className={signalTab === "forecast_moving" ? "active" : ""} onClick={() => setSignalTab("forecast_moving")} onKeyDown={onSignalTabKeyDown}>Forecast-moving <span>{movingPosts.length}</span></button><button type="button" role="tab" aria-selected={signalTab === "screened_out"} tabIndex={signalTab === "screened_out" ? 0 : -1} className={signalTab === "screened_out" ? "active" : ""} onClick={() => setSignalTab("screened_out")} onKeyDown={onSignalTabKeyDown}>Screened out <span>{screenedPosts.length}</span></button></div>
      {selectedPosts.length ? <div className={`latest-signals-grid ${showAllPosts ? "show-all" : "compact"}`} role="tabpanel" data-reveal-support>{selectedPosts.map(post => <LatestPostCard key={post.id} post={post} mode={posts.mode} expanded={expandedPosts.has(post.id)} onToggle={() => setExpandedPosts(current => { const next = new Set(current); if (next.has(post.id)) next.delete(post.id); else next.add(post.id); return next; })} now={referenceTime}/>)}</div> : <p className="signal-tab-empty" role="tabpanel">No posts in this view.</p>}
      {selectedPosts.length > 4 && <button className="view-all-signals" onClick={() => setShowAllPosts(value => !value)}>{showAllPosts ? "Show fewer signals" : "View all latest signals"} <ChevronDown size={16}/></button>}
    </section>

    <MarketPressure events={externalContextEvents}/>

    <ResetHistory resetHistory={resetHistory} milestoneState={currentMilestoneState} historicalDataset={historicalDataset} mode={forecast.mode}/>

    <HowForecastIsCalculated forecast={forecast} evidenceExtractionModel={evidenceExtractionModel}/>

    <details className="research-archive"><summary><span className="archive-toggle-icon" aria-hidden="true"><i>+</i><b>−</b></span><span><b className="archive-open-copy">OPEN TECHNICAL DETAILS</b><b className="archive-close-copy">CLOSE TECHNICAL DETAILS</b><small>Historical analogs, Time Machine, methodology and audit export</small></span><ChevronDown/></summary><div className="archive-content"><HistoricalMemory analogs={analogs}/><TimeMachine history={history} evidence={evidence} modelVersion={forecast.modelVersion}/><Methodology forecast={forecast}/><div className="full-data-lab-action"><p>Need the complete source and model record?</p><Link href="/lab/data" onClick={() => track("open_data_lab")}>Open Full Data Lab <span aria-hidden="true">→</span></Link></div></div></details>

    <footer className="site-footer"><span className="site-footer-mark">SACRED FORECAST · RESET ORACLE</span><div className="site-footer-copy"><p className="site-footer-primary">Forecasting workflow uses public signals, milestone history, and GPT-5.6-assisted analysis.</p><p className="site-footer-disclaimer">Unofficial project. Not affiliated with or endorsed by OpenAI or X.</p></div><PublicVisitCounter enabled={forecast.mode === "live"}/><nav aria-label="Footer links"><Link href="/privacy">Privacy</Link><Link href="/lab/data" onClick={() => track("open_data_lab")}>Open Data Lab →</Link></nav></footer>
  </main>;
}

function ResetHistory({ resetHistory, milestoneState, historicalDataset, mode }: { resetHistory: ResetHistoryItem[]; milestoneState: PublicMilestoneState; historicalDataset: HistoricalDatasetSummary; mode: "demo" | "live" }) {
  const milestoneRecords = resetHistory.filter(item => item.milestoneUsers);
  const latestMilestone = milestoneRecords.find(item => item.milestoneUsers === milestoneState.latestReportedUsers) ?? [...milestoneRecords].sort((a, b) => (b.milestoneUsers ?? 0) - (a.milestoneUsers ?? 0))[0];
  const nonMilestoneRecords = resetHistory.filter(item => !item.milestoneUsers);
  const sourceLabel = resetHistory.some(item => item.historicalSource === "seed") ? "Human-verified local seed" : mode === "demo" ? "Synthetic demo fixture" : "Reviewed live records";

  return <section id="reset-history" className="section reset-history-section" data-editorial-section>
    <header className="concise-heading reset-history-heading" data-reveal-heading><div><p className="mono-label gold-label">RESET HISTORY</p><h2>The milestones that opened the gates.</h2></div><p>Verified announcements only. No retrospective probabilities are inferred.</p></header>

    {latestMilestone && <div className="latest-verified-milestone" data-reveal-primary>
      <span>LATEST REPORTED COMBINED ACTIVE USERS</span>
      <strong>{(latestMilestone.milestoneUsers ?? 0) / 1_000_000}M <small>CODEX + CHATGPT WORK</small></strong>
      <b>{latestMilestone.type === "scheduled" ? "RESET SCHEDULED" : `${latestMilestone.type.toUpperCase()} RESET ANNOUNCED`}</b>
      <time dateTime={latestMilestone.displayDateThailand ?? latestMilestone.date}>{latestMilestone.displayDateThailand ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${latestMilestone.displayDateThailand}T00:00:00+07:00`)) : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(latestMilestone.date))}</time>
      <div className="next-milestone"><span>{milestoneState.pledgedMilestoneReached ? "PLEDGED MILESTONE REACHED" : "NEXT PLEDGED MILESTONE"}</span><b>{milestoneState.nextTargetUsers ? `${milestoneState.nextTargetUsers / 1_000_000}M` : "AWAITING NEW COMMITMENT"}</b><small>MILESTONE PROGRESS · {milestoneState.progressPercent ?? 0}%</small></div>
      <p>The July 9M figure covers Codex and ChatGPT Work combined. The latest official Codex-only figure was 5M+ weekly users on June 2.</p>
      {latestMilestone.sourceUrl && <a href={latestMilestone.sourceUrl} target="_blank" rel="noreferrer" onClick={() => track("view_official_source")}>View official post <ExternalLink size={14}/></a>}
    </div>}

    <div className="historical-provenance-row" aria-label="Historical dataset summary" data-reveal-support><span>HISTORICAL SEED · {historicalDataset.datasetVersion}</span><p><b>{historicalDataset.confirmedResets}</b> confirmed resets</p><p><b>{historicalDataset.verifiedSources}</b> verified sources</p><p><b>{historicalDataset.negativeWindows}</b> verified negative windows</p><small><Database size={14}/> {sourceLabel}</small></div>

    <div className="milestone-story" aria-label="Verified user milestone reset ledger" data-reveal-support><div className="milestone-progress-line" aria-hidden="true"/>
      {[...new Set(milestoneRecords.map(item => item.milestoneUsers!))].sort((a, b) => a - b).map(milestoneUsers => {
        const record = milestoneRecords.find(item => item.milestoneUsers === milestoneUsers);
        const isLatest = Boolean(record && latestMilestone && record.id === latestMilestone.id);
        return <article key={milestoneUsers} className={`milestone-node ${record ? "is-confirmed" : "is-unseeded"} ${isLatest ? "is-latest" : ""}`}>
          <div className="milestone-number"><strong>{milestoneUsers / 1_000_000}M</strong><span>USERS</span></div>
          <div className="milestone-record">
            <div className="milestone-badges"><span>MILESTONE</span>{record && <span>OFFICIAL ANNOUNCEMENT</span>}{isLatest && <span>LATEST</span>}</div>
            {record ? <><time dateTime={record.displayDateThailand ?? record.date}>{record.displayDateThailand ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${record.displayDateThailand}T00:00:00+07:00`)) : `${formatDate(record.date)} · ${new Date(record.date).getUTCFullYear()}`} · THAILAND</time><h3>{record.type === "scheduled" ? "Scheduled reset announcement" : `${record.type.replaceAll("_", " ")} reset announcement`}</h3><p>{record.description}</p><footer>{record.sourceUrl ? <a className="source-action" href={record.sourceUrl} target="_blank" rel="noreferrer" onClick={() => track("view_official_source")}>View official post <ExternalLink size={13}/></a> : <span>Verified ledger record</span>}<span>{record.timeSincePreviousDays === undefined ? "First verified record in view" : `${record.timeSincePreviousDays} days since previous announcement`}</span></footer></> : <><h3>Awaiting verified record</h3><p>No reset claim is displayed for this milestone until a human-reviewed source is added.</p></>}
          </div>
        </article>;
      })}
    </div>

    <p className="unverified-milestone-note">No verified milestone-reset announcement has been seeded for 1M or 2M.</p>

    {nonMilestoneRecords.length > 0 && <div className="other-reset-records"><h3>Other verified reset records</h3>{nonMilestoneRecords.map(item => <article key={item.id}><time>{formatDate(item.date)}</time><div><b>{item.type.replaceAll("_", " ")} reset</b><span>{item.description}</span></div>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={13}/></a>}</article>)}</div>}
  </section>;
}

function LatestPostCard({ post, mode, expanded, onToggle, now }: { post: LatestPost; mode: "demo" | "live"; expanded: boolean; onToggle: () => void; now: string }) {
  const readiness = post.signalReadiness ?? 0;
  const resolvedReset = post.cycleStatus === "previous_cycle_resolved" && (post.signalType === "reset_confirmation" || post.signalType === "near_term_reset_commitment");
  const scheduledResolution = resolvedReset && post.resetType === "scheduled";
  const activePolicy = post.signalType === "reset_policy_continuation" && post.policyRegimeState === "reset_policy_active";
  const historical = post.cycleStatus === "historical";
  const classification = post.needsReview ? "Context only" : post.signalType ? post.signalType.replaceAll("_", " ") : post.isRelevant ? post.eventType.replaceAll("_", " ") : "Screened as unrelated";
  const status = resolvedReset ? "Verified" : historical ? "Historical" : post.needsReview ? "Needs review" : post.verified ? "Verified" : post.isRelevant ? "Unverified" : "Screened";
  const negative = post.signalType === "negative_or_delaying_signal";
  const result = resolvedReset ? scheduledResolution ? "Official announcement" : "Completed confirmation" : activePolicy ? "Policy channel" : readiness > 0 ? "Readiness signal" : negative ? "Lowered" : "Contextual";
  return <article className={`signal-card impact-${activePolicy || readiness > 0 ? "positive" : negative ? "negative" : "neutral"}`} data-testid="latest-post-card">
    <header><span>{resolvedReset ? scheduledResolution ? "RESET ANNOUNCED" : "RESET RELEASED" : activePolicy ? "RESET POLICY CONTINUES" : mode === "demo" ? "DEMO POST" : "@thsottiaux"}</span><time dateTime={post.postedAt}>{resolvedReset ? formatUtcTimestamp(post.postedAt) : relativeTime(post.postedAt, now)}</time></header>
    <div className="signal-card-body"><p className={expanded ? "expanded" : ""}>{post.text}</p><button type="button" className="expand-post" aria-expanded={expanded} onClick={onToggle}>{expanded ? "Show less" : "Read full post"} <ChevronDown size={14}/></button></div>
    <div className="signal-card-result"><div className="signal-impact"><b>{resolvedReset ? "Previous cycle resolved" : activePolicy ? `Policy-timing ${Math.round((post.policyTimingChannel ?? 0) * 100)} / 100` : readiness === 0 ? "No active readiness" : `Readiness ${Math.round(readiness * 100)} / 100`}</b><span>{result}</span></div><div className="signal-classification"><b>{resolvedReset ? scheduledResolution ? "Scheduled reset announcement" : `${post.resetType === "banked" ? "Banked" : "Full"} reset` : activePolicy ? "Reset policy continuation" : classification}</b><span>{activePolicy ? "The monitored official account stated that resets will continue. This supports policy status but does not specify when the next reset will occur." : post.signalReason ?? (post.needsReview ? "Not used until reviewed" : post.isRelevant ? "Relevant signal" : "Local relevance screen")}</span></div></div>
    <div className="signal-meta"><span>{post.wasAnalyzed ? `${Math.round(post.extractionConfidence * 100)}% extraction confidence` : "Local screen only"}</span><span className={post.verified ? "verified" : post.needsReview ? "ambiguous" : "screened"}>{status}</span></div>
    {activePolicy && <div className="signal-policy-meta"><span>Policy active</span><span>{Math.round((post.policyRegimeConfidence ?? 0) * 100)}% evidence confidence</span><span>{post.timeImmediacy ?? "low"} timing immediacy</span><span>{Math.round((post.policyRegimeDecayFactor ?? 0) * 100)}% policy decay factor</span>{post.watchCounterfactualDeltaPoints != null && <span>Watch counterfactual {post.watchCounterfactualDeltaPoints > 0 ? "+" : ""}{post.watchCounterfactualDeltaPoints} pts</span>}{post.probabilityCounterfactualDeltaPercentagePoints != null && <span>Calibrated counterfactual {post.probabilityCounterfactualDeltaPercentagePoints.toFixed(1)} pts</span>}</div>}
    <footer><span>{resolvedReset ? "Previous-cycle resolution · 0 active points" : post.exclusionReason ? `${post.exclusionReason.replaceAll("_", " ")} · decay ${Math.round((post.recencyFactor ?? 0) * 100)}%` : mode === "demo" ? "Synthetic fixture" : "Official X source"}</span><a className="source-action" href={post.url} target="_blank" rel="noreferrer" onClick={() => track("view_official_source")}>{resolvedReset ? "View official announcement" : mode === "demo" ? "Open demo evidence" : "View original post"} <ExternalLink size={13}/></a></footer>
  </article>;
}

function MarketPressure({ events }: { events: ExternalContextEvent[] }) {
  const contextEvents = events.filter(event => event.category.startsWith("competitor_") && event.verificationStatus === "reviewed");
  if (!contextEvents.length) return null;
  return <section className="section market-pressure" data-editorial-section>
    <header className="concise-heading" data-reveal-heading><div><p className="mono-label cyan-label">MARKET PRESSURE</p><h2>What competing coding agents are expanding.</h2></div><p>Reviewed official context. These records do not drive the forecast.</p></header>
    <div className="market-pressure-grid" data-reveal-primary>{contextEvents.map(event => <article key={event.id}>
      <header><span>{event.provider}</span><time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time></header>
      <h3>{event.title}</h3><p>{event.description}</p>
      <footer><span>CONTEXT ONLY · WEIGHT {event.forecastWeight}</span><a href={event.sourceUrl} target="_blank" rel="noreferrer" onClick={() => track("view_official_source")}>Official source <ExternalLink size={13}/></a></footer>
    </article>)}</div>
    <p className="market-pressure-note" data-reveal-support>External competitor events have no calibrated causal relationship to a Codex reset and currently carry zero forecast weight.</p>
  </section>;
}

function HowForecastIsCalculated({ forecast, evidenceExtractionModel }: { forecast: Forecast; evidenceExtractionModel: string | null }) {
  const pipeline = ["X PUBLIC SIGNALS", "OPENAI-ASSISTED EVIDENCE EXTRACTION", "VERIFIED FEATURE VECTOR", "SIX-HOUR LOGISTIC HAZARDS", `${forecast.simulation.count.toLocaleString()} SEEDED SIMULATIONS`, `${forecast.horizonHours}-HOUR FORECAST`];
  const displayModel = evidenceExtractionModel?.replace(/^gpt-/i, "GPT-") ?? "Local deterministic heuristic";
  const categories = [
    { origin: "MEASURED", items: ["Direct reset confirmation", "Reset wording", "Public commitment", "Usage incident", "Capacity concern", "Promotional language", "Product launch", "Community poll", "Evidence recency", "Ambiguity"] },
    { origin: "DERIVED", items: ["Time since last reset", "Recent-reset suppression", "Milestone proximity", "Milestone velocity", "Signal frequency change", "Source reliability"] },
    { origin: "EXPERT PRIOR", items: ["Coefficient means and uncertainty", "Intercept", "Values not yet supported by a calibrated historical dataset"] },
  ];
  return <section id="method" className="section model-explainer" data-editorial-section>
    <header className="concise-heading" data-reveal-heading><div><p className="mono-label gold-label">HOW THE FORECAST IS CALCULATED</p><h2>Evidence in. Probability out.</h2></div><p>Reset Oracle is an expert-prior hazard model, not a statistically trained prediction model.</p></header>
    <div className="model-stages" data-reveal-primary><article><span>STAGE 1 · EVIDENCE EXTRACTION</span><h3>{evidenceExtractionModel ? `Evidence extractor: ${displayModel} via OpenAI API` : displayModel}</h3><p>{evidenceExtractionModel ? "An OpenAI model converts relevant public posts into structured, reviewable evidence." : "A deterministic local heuristic produces reviewable Demo Mode evidence when OpenAI is unavailable."}</p></article><article><span>STAGE 2 · PROBABILITY ENGINE</span><h3>Reset Oracle</h3><p>Deterministic six-hour logistic hazards and seeded Monte Carlo coefficient uncertainty calculate the {forecast.horizonHours}-hour probability range.</p></article></div>
    <p className="model-explainer-deck" data-reveal-primary>The final probability is calculated by Reset Oracle, not generated by the language model.</p>
    <ol className="forecast-pipeline" aria-label="Forecast calculation pipeline" data-reveal-support>{pipeline.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><b>{step}</b>{index < pipeline.length - 1 && <i aria-hidden="true">→</i>}</li>)}</ol>
    <div className="feature-origin-groups" data-reveal-support>{categories.map(category => <article key={category.origin}><h3>{category.origin}</h3><ul>{category.items.map(item => <li key={item}>{item}</li>)}</ul></article>)}</div>
    <div className="technology-record" data-reveal-support aria-label="Technology record"><span>OpenAI API · structured evidence extraction</span><span>X API · monitored public signals</span><span>Supabase · verified records and forecast history</span><span>Reset Oracle · deterministic probability engine</span><span>Vercel · production delivery and anonymous analytics</span></div>
    <footer className="model-explainer-record" data-reveal-support><span>MODEL {forecast.modelVersion}</span><span>DATA CUTOFF {formatTimestamp(forecast.dataCutoff)}</span><p>Every forecast exposes its evidence, feature origins, coefficients, uncertainty and audit record.</p><Link href="/lab/data" onClick={() => track("open_data_lab")}>Inspect the full technical record <span aria-hidden="true">→</span></Link></footer>
  </section>;
}

function HistoricalMemory({ analogs }: { analogs: Analog[] }) {
  return <section className="archive-section historical-memory" data-testid="historical-memory"><header className="concise-heading"><div><p className="mono-label cyan-label">HISTORICAL MEMORY</p><h2>Nearest situations.</h2></div><p>Similarity compares feature patterns with verified historical windows. It is supporting context, not a probability and not part of the final forecast calculation.</p></header><div className="memory-grid">{analogs.slice(0, 3).map((analog, index) => {
    const outcome = historicalOutcomePresentation(analog.followed, analog.outcome);
    return <article key={`${analog.date}-${analog.source}`} data-testid="historical-analog">
      <span className="memory-index">0{index + 1}</span>
      <div className="memory-similarity" aria-label={`Similarity match ${analog.similarity} out of 100. Not a probability.`}>
        <span>SIMILARITY MATCH</span>
        <strong>{analog.similarity}<small>/ 100</small></strong>
        <em>Not a probability</em>
      </div>
      <dl className="memory-meta">
        <div><dt>Event type</dt><dd>{analog.eventType.replaceAll("_", " ")}</dd></div>
        <div><dt>Historical timestamp</dt><dd><time dateTime={analog.date}>{formatHistoricalMemoryTimestamp(analog.date)}</time></dd></div>
      </dl>
      <div className="memory-excerpt"><span>Source excerpt</span><blockquote>{analog.source}</blockquote></div>
      <div className={`memory-outcome ${outcome.scored ? "is-scored" : "is-unscored"}`}>
        <b>{outcome.title}</b>
        <p>{outcome.explanation}</p>
      </div>
      <p className="memory-forecast">{historicalForecastPresentation(analog.forecastBefore)}</p>
    </article>;
  })}</div></section>;
}

function TimeMachine({ history, evidence, modelVersion }: { history: HistoryPoint[]; evidence: Evidence[]; modelVersion: string }) {
  const maximum = Math.max(0, history.length - 2);
  const [index, setIndex] = useState(Math.min(1, maximum));
  const [reveal, setReveal] = useState(false);
  if (history.length < 2) return <section id="time-machine" className="archive-section time-machine-unavailable"><p className="mono-label gold-label">BLIND WALK-FORWARD</p><h2>Time Machine is waiting for evidence.</h2><p>Historical reset events are verified. Retrospective forecast scores are not yet available.</p></section>;
  const selected = history[Math.min(index, history.length - 1)] ?? { time: new Date(0).toISOString(), probability: 0 };
  const available = evidence.filter(item => Date.parse(item.postedAt) <= Date.parse(selected.time)).length;
  return <section id="time-machine" className={`archive-section time-machine-sacred ${reveal && index > 1 ? "reset-revealed" : ""}`}><div className="time-copy"><p className="mono-label gold-label">BLIND WALK-FORWARD</p><h2>TIME<br/><i>MACHINE.</i></h2><p>Choose a historical cutoff. Future evidence and outcomes remain sealed until revelation.</p></div><div className="time-console"><label><span>SELECTED CUTOFF</span><input aria-label="Historical cutoff" type="range" min="0" max={maximum} value={Math.min(index, maximum)} onChange={event => { setIndex(Number(event.target.value)); setReveal(false); }}/></label><div className="timeline-marks">{history.slice(0, -1).map((item, itemIndex) => <button key={item.time} aria-label={`Select ${formatDate(item.time)}`} className={itemIndex === index ? "active" : ""} onClick={() => { setIndex(itemIndex); setReveal(false); }}><i/><span>{formatDate(item.time)}</span></button>)}</div><div className="cutoff-record"><div><span>Historical probability</span><strong>{selected.probability}%</strong></div><dl><dt>Evidence available</dt><dd>{available}</dd><dt>Horizon</dt><dd>36 hours</dd><dt>Model version</dt><dd>{modelVersion}</dd><dt>Cutoff</dt><dd>{formatTimestamp(selected.time)} UTC</dd></dl></div><button className="reveal-outcome" onClick={() => setReveal(true)}><Eye/> Reveal what happened</button>{reveal && <motion.div className="outcome" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><Clock3/><div><b>{index > 1 ? "VERIFIED RESET FOLLOWED" : "NO RESET IN THE HORIZON"}</b><span>In the synthetic demo timeline, a reset {index > 1 ? "did" : "did not"} follow within the horizon.</span></div>{index > 1 && <CheckCircle2/>}</motion.div>}</div></section>;
}

function Methodology({ forecast }: { forecast: Forecast }) {
  return <section className="archive-section methodology-sacred"><div><p className="mono-label cyan-label">METHODOLOGY</p><h2>The number must confess.</h2></div><div><p>Six-hour logistic hazard intervals combine into a horizon probability. Coefficients are editable expert priors, not statistically trained estimates.</p><dl><dt>Model</dt><dd>{forecast.modelVersion}</dd><dt>Data cutoff</dt><dd>{forecast.dataCutoff}</dd><dt>Evidence count</dt><dd>{forecast.evidenceIds.length}</dd><dt>Configuration</dt><dd>{forecast.configurationHash}</dd><dt>Simulation</dt><dd>{forecast.simulation.count.toLocaleString()} · seed {forecast.simulation.seed}</dd></dl><button className="audit" onClick={() => { const blob = new Blob([JSON.stringify(forecast, null, 2)], { type: "application/json" }); const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `forecast-${forecast.id}.json`; anchor.click(); URL.revokeObjectURL(anchor.href); }}><Database/> Export forecast audit JSON</button></div></section>;
}
