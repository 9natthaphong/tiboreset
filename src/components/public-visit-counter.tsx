"use client";

import { useEffect, useState } from "react";

const TOKEN_KEY = "sacred-forecast-visitor-token";
const DAY_KEY = "sacred-forecast-visit-day";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function PublicVisitCounter({ enabled }: { enabled: boolean }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    const load = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        let token = window.localStorage.getItem(TOKEN_KEY);
        if (!token || !UUID_PATTERN.test(token)) {
          token = window.crypto.randomUUID();
          window.localStorage.setItem(TOKEN_KEY, token);
        }
        const alreadyCountedToday = window.localStorage.getItem(DAY_KEY) === today;
        const response = await fetch("/api/visits", {
          method: alreadyCountedToday ? "GET" : "POST",
          headers: alreadyCountedToday ? undefined : { "content-type": "application/json" },
          body: alreadyCountedToday ? undefined : JSON.stringify({ visitorToken: token }),
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = await response.json() as { count?: unknown };
        if (typeof result.count !== "number" || !Number.isSafeInteger(result.count) || result.count < 0) return;
        if (!alreadyCountedToday) window.localStorage.setItem(DAY_KEY, today);
        setCount(result.count);
      } catch {
        // Storage, network, and privacy-tool failures leave the optional metric hidden.
      } finally {
        window.clearTimeout(timeout);
      }
    };

    void load();
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled]);

  if (count === null) return null;
  return <p className="public-visit-counter" aria-label={`${count.toLocaleString("en-US")} public visits`}>
    <span>Public visits</span>
    <strong>{count.toLocaleString("en-US")}</strong>
  </p>;
}
