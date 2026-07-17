"use client";

import { Analytics } from "@vercel/analytics/next";

export function PublicAnalytics() {
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
