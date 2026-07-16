"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Mail, Sparkles } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Forecast } from "@/lib/forecasting";

type Props = {
  forecast: Forecast;
  freshness: string;
  loading: boolean;
  onInject: () => Promise<void>;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const percentage = (value: number) => Math.round(value * 100);
const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
const formatTime = (value: string) => new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
const formatTimestamp = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));

export function CinematicHero({ forecast, freshness, loading, onInject }: Props) {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const section = root.current;
    const media = video.current;
    if (!section || !media) return;

    gsap.registerPlugin(ScrollTrigger);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 900px)").matches;
    let duration = 8;
    let targetTime = 0;
    let frame = 0;
    let handedOff = false;
    let introPlaying = false;
    let progress = 0;

    const applyReducedState = () => {
      gsap.set(section.querySelectorAll("[data-hero-animate]"), { clearProps: "all", autoAlpha: 1, y: 0, scale: 1, filter: "none" });
      gsap.set(section.querySelector(".hero-video"), { scale: 1.03, filter: "brightness(.78) saturate(.9)" });
      media.currentTime = Math.min(duration * .82, Math.max(0, duration - .05));
      setReady(true);
    };

    const startMedia = () => {
      duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 8;
      if (reduce) { applyReducedState(); return; }
      setReady(true);
      media.currentTime = 0;
      introPlaying = true;
      const play = media.play();
      if (play) play.catch(() => { introPlaying = false; targetTime = 0; });
    };

    const handoff = () => {
      if (reduce || handedOff) return;
      handedOff = true;
      introPlaying = false;
      media.pause();
      targetTime = progress * Math.max(.01, duration - .04);
    };

    const onTimeUpdate = () => {
      if (introPlaying && media.currentTime >= Math.min(.72, duration * .12)) {
        media.pause();
        introPlaying = false;
        targetTime = media.currentTime;
      }
    };

    const seek = () => {
      if (!introPlaying && media.readyState >= 2) {
        const delta = targetTime - media.currentTime;
        if (Math.abs(delta) > .012) media.currentTime = clamp(media.currentTime + delta * (mobile ? .2 : .14), 0, Math.max(0, duration - .025));
      }
      frame = requestAnimationFrame(seek);
    };

    const context = gsap.context(() => {
      if (reduce) return;
      const title = section.querySelector(".hero-story-title");
      const probability = section.querySelector(".hero-story-probability");
      const support = section.querySelector(".hero-story-support");
      const payoff = section.querySelector(".hero-story-payoff");
      const atmosphere = section.querySelector(".hero-bloom");
      const foreground = section.querySelector(".hero-foreground");
      const phaseOne = section.querySelector("[data-phase='shadow']");
      const phaseTwo = section.querySelector("[data-phase='discovery']");
      const phaseThree = section.querySelector("[data-phase='revelation']");
      const phaseFour = section.querySelector("[data-phase='payoff']");

      gsap.set(media, { scale: 1.015, filter: "brightness(.42) saturate(.72)" });
      gsap.set(title, { autoAlpha: .68, y: 0 });
      gsap.set(probability, { autoAlpha: .12, y: 46, scale: .94, filter: "blur(7px)" });
      gsap.set(support, { autoAlpha: 0, y: 30 });
      gsap.set(payoff, { autoAlpha: 0, y: 28 });
      gsap.set(atmosphere, { autoAlpha: .15, scale: .8 });
      gsap.set([phaseTwo, phaseThree, phaseFour], { autoAlpha: 0 });

      const story = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });
      story
        .to(title, { autoAlpha: 1, y: -8, duration: .16 }, 0)
        .to(phaseOne, { autoAlpha: 0, duration: .08 }, .13)
        .to(phaseTwo, { autoAlpha: 1, duration: .1 }, .15)
        .to(probability, { autoAlpha: .56, y: 18, scale: .98, filter: "blur(2px)", duration: .22 }, .18)
        .to(media, { scale: 1.035, filter: "brightness(.58) saturate(.82)", duration: .26 }, .18)
        .to(support, { autoAlpha: .56, y: 8, duration: .18 }, .27)
        .to(title, { autoAlpha: .54, y: -24, scale: .97, duration: .2 }, .33)
        .to(phaseTwo, { autoAlpha: 0, duration: .08 }, .42)
        .to(phaseThree, { autoAlpha: 1, duration: .1 }, .44)
        .to(probability, { autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", duration: .2 }, .45)
        .to(media, { scale: 1.055, filter: "brightness(.84) saturate(1.02)", duration: .25 }, .44)
        .to(atmosphere, { autoAlpha: .9, scale: 1.16, duration: .24 }, .46)
        .to(support, { autoAlpha: 1, y: 0, duration: .16 }, .53)
        .to(phaseThree, { autoAlpha: 0, duration: .08 }, .68)
        .to(phaseFour, { autoAlpha: 1, duration: .1 }, .7)
        .to(title, { autoAlpha: .9, y: -32, duration: .15 }, .72)
        .to(payoff, { autoAlpha: 1, y: 0, duration: .18 }, .75)
        .to(media, { scale: 1.065, filter: "brightness(.95) saturate(1.08)", duration: .2 }, .72)
        .to(foreground, { autoAlpha: .25, yPercent: -7, duration: .2 }, .78)
        .to({}, { duration: .1 });

      const trigger = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: () => `+=${mobile ? 2800 : 4300}`,
        pin: true,
        pinSpacing: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: self => {
          progress = clamp(self.progress, 0, 1);
          if (!handedOff && progress > .002) {
            handedOff = true;
            introPlaying = false;
            media.pause();
          }
          story.progress(progress);
          section.dataset.chapter = progress < .18 ? "shadow" : progress < .44 ? "discovery" : progress < .7 ? "revelation" : "payoff";
          section.dataset.progress = progress.toFixed(3);
          if (handedOff) targetTime = progress * Math.max(.01, duration - .04);
        },
      });
      return () => { trigger.kill(); story.kill(); };
    }, section);

    media.addEventListener("loadedmetadata", startMedia);
    media.addEventListener("timeupdate", onTimeUpdate);
    window.addEventListener("wheel", handoff, { passive: true });
    window.addEventListener("touchstart", handoff, { passive: true });
    window.addEventListener("keydown", handoff);
    if (media.readyState >= 1) startMedia();
    frame = requestAnimationFrame(seek);
    document.fonts.ready.then(() => ScrollTrigger.refresh());

    return () => {
      cancelAnimationFrame(frame);
      media.pause();
      media.removeEventListener("loadedmetadata", startMedia);
      media.removeEventListener("timeupdate", onTimeUpdate);
      window.removeEventListener("wheel", handoff);
      window.removeEventListener("touchstart", handoff);
      window.removeEventListener("keydown", handoff);
      context.revert();
    };
  }, []);

  return <section id="top" ref={root} className={`cinematic-hero ${ready ? "is-media-ready" : ""}`} data-chapter="shadow" data-progress="0">
    <video ref={video} className="hero-video" muted playsInline autoPlay preload="auto" poster="/cinematic/tiboreset-poster.webp" aria-label="Cinematic Reset Oracle reveal">
      <source src="/cinematic/tiboreset-hero.mp4" type="video/mp4"/>
    </video>
    <div className="hero-loading" aria-hidden="true"><span/></div>
    <div className="hero-grade"/><div className="hero-vignette"/><div className="hero-foreground"/><div className="hero-fog fog-a"/><div className="hero-fog fog-b"/><div className="hero-rays"/><div className="hero-bloom"/>
    <div className="hero-particles" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index}/>)}</div>

    <div className="hero-chapter" aria-hidden="true"><span data-phase="shadow">I · SHADOW</span><span data-phase="discovery">II · DISCOVERY</span><span data-phase="revelation">III · REVELATION</span><span data-phase="payoff">IV · THE SIGNAL</span></div>
    <div className="hero-story">
      <div className="hero-story-title" data-hero-animate><p className="mono-label gold-label">RESET ORACLE · SACRED FORECAST</p><h1 aria-label="WILL TIBO RESET?"><span>WILL TIBO</span><em>RESET?</em></h1><p className="hero-premise">Will the tokens flow again?</p></div>
      <div className="hero-story-probability" data-hero-animate><strong>{percentage(forecast.probability)}<small>%</small></strong><div><b>RESET PROBABILITY</b><span>within {forecast.horizonHours} hours</span></div></div>
      <div className="hero-story-support" data-hero-animate><div><span>Credible interval</span><b>{percentage(forecast.credibleIntervalLow)}–{percentage(forecast.credibleIntervalHigh)}%</b></div><div><span>Predicted window</span><b>{formatDate(forecast.predictedWindowStart)} — {formatTime(forecast.predictedWindowEnd)} UTC</b></div><div><span>Freshness</span><b className="live-state">● {freshness}</b></div><div><span>Mode</span><b>{forecast.mode.toUpperCase()}</b></div></div>
      <div className="hero-story-payoff" data-hero-animate><div className="hero-data-line"><span>{forecast.evidenceIds.length} evidence signals</span><span>{forecast.modelVersion}</span><span>Checked {formatTimestamp(forecast.dataCutoff)} UTC</span></div><div className="hero-actions"><a href="#signal"><Mail size={16}/> Get the reset signal</a>{forecast.mode === "demo" && <button onClick={onInject} disabled={loading}><Sparkles size={15}/>{loading ? "Recalculating…" : "Inject demo signal"}</button>}</div><p>Unofficial experimental forecast. Not affiliated with OpenAI or X.</p></div>
    </div>
    <div className="hero-scroll-cue"><span>SCROLL TO REVEAL</span><ArrowDown size={15}/></div>
  </section>;
}
