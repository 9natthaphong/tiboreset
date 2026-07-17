"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Mail } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Forecast } from "@/lib/forecasting";

type Props = {
  forecast: Forecast;
  freshness: string;
  trend: "Rising" | "Falling" | "Steady";
  latestKnownReset: string;
  lastCheckedAt: string;
};

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const percentage = (value: number) => Math.round(value * 100);
const formatTimestamp = (value: string) => new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
}).format(new Date(value));
const VIDEO_START_PROGRESS = 0.15;
const VIDEO_END_PROGRESS = 0.78;
const TOPBAR_REVEAL_PROGRESS = 0.29;

export function CinematicHero({ forecast, freshness, trend, latestKnownReset, lastCheckedAt }: Props) {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [loadProgress, setLoadProgress] = useState(12);

  useLayoutEffect(() => {
    const section = root.current;
    const media = video.current as FrameVideo | null;
    if (!section || !media) return;

    gsap.registerPlugin(ScrollTrigger);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 900px)").matches;
    const topbar = document.querySelector<HTMLElement>(".sacred-nav");
    const revealShell = section.querySelector<HTMLElement>(".hero-reveal-shell");
    const loader = section.querySelector<HTMLElement>(".oracle-loader");
    let duration = 8;
    let targetTime = 0;
    let seekFrame = 0;
    let frameCallback: number | undefined;
    let frameFallback: number | undefined;
    let firstFrameSettled = false;
    let decodePrimed = false;
    let returningToZero = false;
    let master: gsap.core.Timeline | undefined;
    let trigger: ScrollTrigger | undefined;

    document.documentElement.dataset.oracleLoading = "true";
    media.autoplay = false;
    media.defaultMuted = true;
    media.muted = true;
    media.controls = false;
    media.loop = false;
    media.pause();

    const setTopbarAvailability = (visible: boolean, solid: boolean) => {
      if (!topbar) return;
      topbar.dataset.visible = visible ? "true" : "false";
      topbar.dataset.solid = solid ? "true" : "false";
      topbar.setAttribute("aria-hidden", visible ? "false" : "true");
      topbar.inert = !visible;
    };

    const buildMasterTimeline = () => {
      const title = section.querySelector(".hero-story-title");
      const probability = section.querySelector(".hero-story-probability");
      const support = section.querySelector(".hero-final-meta");
      const payoff = section.querySelector(".hero-story-payoff");
      const atmosphere = section.querySelector(".hero-bloom");
      const foreground = section.querySelector(".hero-foreground");
      const handoff = section.querySelector(".hero-section-handoff");
      const scrollCue = section.querySelector(".hero-scroll-cue");

      gsap.set(media, { scale: 1.015, filter: "brightness(.38) saturate(.68)" });
      gsap.set(title, { autoAlpha: 1, y: 0, scale: 1 });
      gsap.set(probability, { autoAlpha: 0, y: 28, scale: 0.985, filter: "blur(8px)" });
      gsap.set([support, payoff], { autoAlpha: 0, y: 24 });
      gsap.set(atmosphere, { autoAlpha: 0.08, scale: 0.86 });
      gsap.set(foreground, { autoAlpha: 0.72, yPercent: 0 });
      gsap.set(handoff, { scaleX: 0, transformOrigin: "left center" });
      gsap.set(scrollCue, { autoAlpha: 0.72, y: 0 });
      if (topbar) {
        gsap.set(topbar, { autoAlpha: 0, y: -18, pointerEvents: "none", backgroundColor: "rgba(7,9,8,0)" });
        setTopbarAvailability(false, false);
      }

      master = gsap.timeline({ paused: true, defaults: { ease: "none" } });
      master
        .to(title, { y: -8, duration: 0.15 }, 0)
        .to(media, { scale: 1.032, filter: "brightness(.52) saturate(.78)", duration: 0.30 }, 0.15)
        .to(scrollCue, { autoAlpha: 0, y: 10, duration: 0.12 }, 0.18)
        .to(title, { autoAlpha: 0.64, y: -24, scale: 0.98, duration: 0.20 }, 0.30)
        .to(probability, { autoAlpha: 1, y: 0, scale: 1.04, filter: "blur(0px)", duration: 0.17 }, 0.38)
        .to(media, { scale: 1.052, filter: "brightness(.78) saturate(.96)", duration: 0.33 }, 0.45)
        .to(atmosphere, { autoAlpha: 0.72, scale: 1.08, duration: 0.30 }, 0.46)
        .to(support, { autoAlpha: 1, y: 0, duration: 0.20 }, 0.54)
        .to(support ? Array.from(support.children) : [], { autoAlpha: 1, y: 0, stagger: 0.025, duration: 0.12 }, 0.55)
        .to(title, { autoAlpha: 0.9, y: -30, duration: 0.16 }, 0.67)
        .to(probability, { scale: 1.08, duration: 0.14 }, 0.70)
        .to(media, { scale: 1.06, filter: "brightness(.92) saturate(1.04)", duration: 0.12 }, 0.72)
        .to(foreground, { autoAlpha: 0.34, yPercent: -5, duration: 0.14 }, 0.72)
        .to(payoff, { autoAlpha: 1, y: 0, duration: 0.16 }, 0.78)
        .to(handoff, { scaleX: 1, duration: 0.10 }, 0.90)
        .to({}, { duration: 0.10 }, 0.90);

      if (topbar) {
        master
          .to(topbar, { autoAlpha: 1, y: 0, pointerEvents: "auto", duration: 0.10 }, TOPBAR_REVEAL_PROGRESS)
          .to(topbar, { backgroundColor: "rgba(7,9,8,.78)", duration: 0.13 }, 0.78);
      }

      if (reduce) {
        master.progress(1);
        media.currentTime = 0;
        setTopbarAvailability(true, true);
        section.dataset.chapter = "hold";
        section.dataset.hold = "true";
        section.dataset.motionReady = "true";
        return;
      }

      trigger = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: () => `+=${mobile ? 3500 : 5400}`,
        pin: true,
        pinSpacing: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: self => {
          const progress = clamp(self.progress, 0, 1);
          master?.progress(progress);
          const videoProgress = clamp((progress - VIDEO_START_PROGRESS) / (VIDEO_END_PROGRESS - VIDEO_START_PROGRESS), 0, 1);
          targetTime = Math.pow(videoProgress, 1.06) * Math.max(0, duration - 0.035);
          if (progress >= VIDEO_END_PROGRESS && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            targetTime = Math.max(0, duration - 0.035);
            if (Math.abs(media.currentTime - targetTime) > 0.015) media.currentTime = targetTime;
          }
          const navVisible = progress >= TOPBAR_REVEAL_PROGRESS;
          setTopbarAvailability(navVisible, progress >= VIDEO_END_PROGRESS);
          section.dataset.chapter = progress < 0.15 ? "shadow" : progress < 0.45 ? "discovery" : progress < VIDEO_END_PROGRESS ? "revelation" : "hold";
          section.dataset.hold = progress >= VIDEO_END_PROGRESS ? "true" : "false";
          section.dataset.progress = progress.toFixed(3);
        },
      });
      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        section.dataset.motionReady = "true";
      });
    };

    const exitLoader = () => {
      if (firstFrameSettled) return;
      firstFrameSettled = true;
      decodePrimed = false;
      returningToZero = false;
      media.pause();
      media.currentTime = 0;
      targetTime = 0;
      setLoadProgress(100);
      section.dataset.firstFrameReady = "true";
      setReady(true);
      buildMasterTimeline();

      const complete = () => {
        delete document.documentElement.dataset.oracleLoading;
        setLoaderVisible(false);
        ScrollTrigger.refresh();
      };
      if (reduce) {
        gsap.to(loader, { autoAlpha: 0, duration: 0.25, onComplete: complete });
        gsap.set(revealShell, { autoAlpha: 1, scale: 1 });
      } else {
        gsap.timeline({ onComplete: complete })
          .to(loader, { autoAlpha: 0, duration: 0.82, ease: "power2.inOut" })
          .fromTo(revealShell, { autoAlpha: 0, scale: 1.015 }, { autoAlpha: 1, scale: 1, duration: 0.86, ease: "power2.out" }, "<0.05");
      }
    };

    const confirmFirstFrame = () => {
      if (firstFrameSettled || media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      media.pause();
      media.currentTime = 0;
      setLoadProgress(78);
      if (media.requestVideoFrameCallback) {
        frameCallback = media.requestVideoFrameCallback(exitLoader);
        frameFallback = window.setTimeout(exitLoader, 900);
      } else {
        requestAnimationFrame(() => requestAnimationFrame(exitLoader));
      }
    };

    const primePausedDecode = () => {
      if (firstFrameSettled || decodePrimed || media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
      decodePrimed = true;
      media.pause();
      media.currentTime = Math.min(0.001, Math.max(0, duration - 0.05));
    };

    const onMetadata = () => {
      if (firstFrameSettled) return;
      duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 8;
      media.pause();
      media.currentTime = 0;
      setLoadProgress(48);
      if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) confirmFirstFrame();
      else primePausedDecode();
    };
    const onLoadedData = () => {
      if (firstFrameSettled) return;
      media.pause();
      media.currentTime = 0;
      confirmFirstFrame();
    };
    const onSeeked = () => {
      if (firstFrameSettled) return;
      media.pause();
      if (decodePrimed && !returningToZero && media.currentTime > 0) {
        returningToZero = true;
        media.currentTime = 0;
        return;
      }
      if (returningToZero || media.currentTime === 0) {
        returningToZero = false;
        confirmFirstFrame();
      }
    };
    const onError = () => {
      section.dataset.videoFallback = "true";
      exitLoader();
    };
    const seek = () => {
      if (firstFrameSettled && !reduce && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const delta = targetTime - media.currentTime;
        if (Math.abs(delta) > 0.01) {
          media.currentTime = clamp(media.currentTime + delta * (mobile ? 0.22 : 0.16), 0, Math.max(0, duration - 0.025));
        }
      }
      seekFrame = requestAnimationFrame(seek);
    };

    media.addEventListener("loadedmetadata", onMetadata);
    media.addEventListener("loadeddata", onLoadedData);
    media.addEventListener("canplay", onLoadedData);
    media.addEventListener("seeked", onSeeked);
    media.addEventListener("error", onError);
    if (media.readyState >= HTMLMediaElement.HAVE_METADATA) onMetadata();
    if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onLoadedData();
    seekFrame = requestAnimationFrame(seek);
    document.fonts.ready.then(() => ScrollTrigger.refresh());

    return () => {
      cancelAnimationFrame(seekFrame);
      if (frameCallback !== undefined) media.cancelVideoFrameCallback?.(frameCallback);
      if (frameFallback !== undefined) window.clearTimeout(frameFallback);
      media.pause();
      media.removeEventListener("loadedmetadata", onMetadata);
      media.removeEventListener("loadeddata", onLoadedData);
      media.removeEventListener("canplay", onLoadedData);
      media.removeEventListener("seeked", onSeeked);
      media.removeEventListener("error", onError);
      trigger?.kill();
      master?.kill();
      if (topbar) {
        gsap.set(topbar, { clearProps: "opacity,visibility,transform,pointerEvents,backgroundColor" });
        topbar.inert = false;
        delete topbar.dataset.visible;
        delete topbar.dataset.solid;
      }
      delete document.documentElement.dataset.oracleLoading;
      delete section.dataset.motionReady;
      delete section.dataset.hold;
      delete section.dataset.firstFrameReady;
    };
  }, []);

  return <section
    id="top"
    ref={root}
    className={`cinematic-hero ${ready ? "is-media-ready" : ""}`}
    data-chapter="shadow"
    data-progress="0"
    data-hold="false"
    data-motion-ready="false"
    data-first-frame-ready="false"
  >
    {loaderVisible && <div className="oracle-loader" role="status" aria-live="polite">
      <div className="oracle-loader-mark"><span>SF</span><small>SACRED FORECAST</small></div>
      <p>CALIBRATING THE ORACLE</p>
      <div className="oracle-loader-track" aria-hidden="true"><i style={{ width: `${loadProgress}%` }}/></div>
      <span className="sr-only">Loading cinematic forecast, {loadProgress}% complete</span>
    </div>}

    <div className="hero-reveal-shell">
      <video
        ref={video}
        className="hero-video"
        muted
        playsInline
        controls={false}
        loop={false}
        autoPlay={false}
        preload="auto"
        poster="/cinematic/tiboreset-poster.webp"
        aria-label="Cinematic Reset Oracle reveal"
      >
        <source src="/cinematic/tiboreset-hero.mp4" type="video/mp4"/>
      </video>
      <div className="hero-grade"/><div className="hero-vignette"/><div className="hero-foreground"/>
      <div className="hero-fog fog-a"/><div className="hero-fog fog-b"/><div className="hero-rays"/><div className="hero-bloom"/>

      <div className="hero-story">
        <div className="hero-story-title">
          <h1 aria-label="WILL TIBO RESET?"><span>WILL TIBO</span><em>RESET?</em></h1>
          <p className="hero-premise">Forecast the reset. Plan the next 36 hours of coding.</p>
        </div>
        <div className="hero-story-probability">
          <strong data-testid="hero-probability">{percentage(forecast.probability)}<small>%</small></strong>
        </div>
        <dl className="hero-final-meta" aria-label="Current forecast details">
          <div><dt>Trend</dt><dd className={`trend-${trend.toLowerCase()}`}>{trend}</dd></div>
          <div><dt>Latest verified milestone</dt><dd>{latestKnownReset}</dd></div>
          <div><dt>Confidence range</dt><dd>{percentage(forecast.credibleIntervalLow)}–{percentage(forecast.credibleIntervalHigh)}%</dd></div>
          <div><dt>Horizon</dt><dd>{forecast.horizonHours} hours</dd></div>
          <div><dt>Last checked</dt><dd>{formatTimestamp(lastCheckedAt)} UTC</dd></div>
        </dl>
        <div className="hero-story-payoff">
          <a href="#signal"><Mail size={16}/> Get the reset signal</a>
          <span>{forecast.mode === "demo" ? "Demo mode" : `${freshness} · Live mode`}</span>
        </div>
      </div>
      <div className="hero-scroll-cue"><span>SCROLL TO REVEAL</span><ArrowDown size={15}/></div>
      <div className="hero-section-handoff" aria-hidden="true"/>
    </div>
  </section>;
}
