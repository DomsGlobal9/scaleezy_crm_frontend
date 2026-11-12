import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../lib/config';

/**
 * Instant updates (12 Nov 2026, as Inventory's): one line per signed-in tab to GET /api/v1/live, which says only
 * "this kind of thing changed in your shop". Each topic reloads the screens that show it, through their usual
 * requests and permissions -- so a walk-in taken by another salesperson, a bill from the till, a customer changed in
 * Inventory or a review written online shows on an open screen without a refresh. Screens on show reload at once;
 * the rest are marked old and reload when opened.
 *
 * The browser reconnects a dropped line by itself; after a drop everything reloads once, because what changed
 * meanwhile was not heard. If the server is not hearing the database, or the line cannot be opened at all (a strict
 * network), screens refresh every minute instead.
 */
export const TOPIC_KEYS = {
  customers: [['customers'], ['customer'], ['customerFrom'], ['groups'], ['group'], ['segments'], ['segment'], ['segmentPreview'], ['lookup'], ['counterCard'], ['today'], ['todayCount'], ['merges']],
  timeline: [['customer'], ['customers'], ['today'], ['todayCount'], ['week'], ['counterCard'], ['segments'], ['segment'], ['sales', 'dashboard'], ['sales', 'visit']],
  notes: [['notes'], ['followups'], ['customer'], ['today'], ['todayCount'], ['notifications']],
  today: [['today'], ['todayCount'], ['week'], ['customer']],
  floor: [['sales', 'dashboard'], ['sales', 'visit'], ['arrivals'], ['week'], ['counterCard'], ['customer']],
  merges: [['merges'], ['customers']],
  reviews: [['reviews'], ['customer'], ['notifications']],
  messages: [['messages'], ['week'], ['customer']],
  segments: [['segments'], ['segment'], ['segmentChoices']],
  settings: [['shop'], ['festivals'], ['staff']]
};
const EVERYTHING = Object.keys(TOPIC_KEYS);
const FALLBACK_MS = 60_000;

export function keysFor(topics) {
  const seen = new Set();
  const out = [];
  for (const t of topics) for (const k of TOPIC_KEYS[t] ?? []) {
    const id = JSON.stringify(k);
    if (!seen.has(id)) { seen.add(id); out.push(k); }
  }
  return out;
}

export function useLiveUpdates(enabled = true) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof window.EventSource === 'undefined') return undefined;
    let source = null;
    let dropped = false;
    let fallback = null;
    let closed = false;
    let retry = null;

    const reload = (topics) => {
      for (const queryKey of keysFor(topics)) queryClient.invalidateQueries({ queryKey });
    };
    const startFallback = () => {
      if (fallback || closed) return;
      fallback = window.setInterval(() => reload(EVERYTHING), FALLBACK_MS);
    };
    const stopFallback = () => { if (fallback) { window.clearInterval(fallback); fallback = null; } };

    const connect = () => {
      if (closed) return;
      source = new window.EventSource(`${API_BASE_URL}/live`, { withCredentials: true });
      // Seen by the screen tests: whether this tab is live, or on the minute refresh.
      document.documentElement.dataset.live = 'opening';
      source.addEventListener('ready', (event) => {
        // The server is up but not hearing the database: refresh on the minute until it is.
        let listening = true;
        try { listening = JSON.parse(event.data)?.listening !== false; } catch { /* keep true */ }
        document.documentElement.dataset.live = listening ? 'on' : 'minute';
        if (listening) stopFallback(); else startFallback();
        // Back after a drop: reload everything once, since changes meanwhile were not heard.
        if (dropped) { dropped = false; reload(EVERYTHING); }
      });
      source.onmessage = (event) => {
        try {
          const topics = JSON.parse(event.data)?.topics;
          // A message means the server hears the database again: the minute refresh can stop.
          if (Array.isArray(topics) && topics.length) { stopFallback(); document.documentElement.dataset.live = 'on'; reload(topics); }
        } catch { /* not ours */ }
      };
      // Too many screens open for this shop: stop asking, refresh on the minute instead.
      source.addEventListener('busy', () => { source?.close(); document.documentElement.dataset.live = 'minute'; startFallback(); });
      source.onerror = () => {
        dropped = true;
        // CLOSED: the browser gave up (signed out, or the server refused). Try again in a while; meanwhile refresh.
        if (source?.readyState === 2) {
          document.documentElement.dataset.live = 'minute';
          startFallback();
          retry = window.setTimeout(connect, 15_000);
        }
      };
    };
    connect();
    // Development's StrictMode mounts this twice: the first line is closed here, so only one stays open.
    return () => { closed = true; stopFallback(); if (retry) window.clearTimeout(retry); source?.close(); };
  }, [queryClient, enabled]);
}
