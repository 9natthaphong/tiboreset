"use client";

import { Analytics } from "@vercel/analytics/next";

export function PublicAnalytics() {
  // Dashboard reporting starts after Web Analytics is enabled and production traffic arrives;
  // Vercel's aggregate view can lag and privacy tools may block individual events.
  return <Analytics beforeSend={event => {
    try {
      const url = new URL(event.url);
      if (url.pathname.startsWith("/control-room")) return null;
      return { ...event, url: `${url.origin}${url.pathname}` };
    } catch {
      return null;
    }
  }}/>;
}
