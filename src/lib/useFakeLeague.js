import { useEffect, useRef, useState } from 'react';
import {
  createLeague, applyRound, roundHighlights, describeRound,
  SHOT_WINDOW_MS, SHOT_GRACE_MS, POINTS_PER_MAKE,
} from './fakeLeague.js';

export const VIDEO_BASKET_EVENT = 'jam-video-basket';
export const VIDEO_ENDED_EVENT = 'jam-video-ended';
const TOAST_MS = 2800;

/**
 * Runs the scripted match while `name` is set.
 *
 *   window event 'jam-video-basket'  → a basket happened in the video:
 *                                      open a shooting window (game pops in)
 *   window event 'jam-score-made'    → the player scored (counts only while
 *                                      a window is open, plus a short grace)
 *
 *   window event 'jam-video-ended'   → the video finished: close any open
 *                                      window, score it, and end the match.
 *                                      Nothing counts after that.
 *
 * A basket during an open window extends it instead of starting a new round.
 *
 * Returns { league, pending, feed, shot, toast, finished, matchId, restart }
 *   shot  – { open, id, endsAt }  (endsAt is a Date.now() timestamp)
 *   toast – { id, kind, text, delta? } | null, round result for the player
 */
export function useFakeLeague(name) {
  const [league, setLeague] = useState(null);
  const [pending, setPending] = useState(0);
  const [feed, setFeed] = useState([]);
  const [shot, setShot] = useState({ open: false, id: 0, endsAt: 0 });
  const [toast, setToast] = useState(null);
  const leagueRef = useRef(null);
  const pendingRef = useRef(0);
  const seqRef = useRef(0);
  const [finished, setFinished] = useState(false);
  const [matchId, setMatchId] = useState(0);

  useEffect(() => {
    if (!name) {
      leagueRef.current = null;
      setLeague(null); setFeed([]); setToast(null);
      setShot({ open: false, id: 0, endsAt: 0 });
      return;
    }

    const pushFeed = (item) =>
      setFeed((f) => [{ ...item, key: ++seqRef.current }, ...f].slice(0, 6));

    setFinished(false);
    const start = createLeague(name);
    leagueRef.current = start;
    setLeague(start);
    pendingRef.current = 0; setPending(0); setFeed([]); setToast(null);

    const timers = new Set();
    const later = (fn, ms) => {
      const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
      timers.add(t);
      return t;
    };
    const cancel = (t) => { if (t) { clearTimeout(t); timers.delete(t); } };

    let open = false, collecting = false, shotId = 0, over = false;
    let closeTimer = null, settleTimer = null, toastTimer = null;

    const settle = () => {
      cancel(settleTimer); settleTimer = null;
      collecting = false;
      const before = leagueRef.current;
      const pts = pendingRef.current;
      const next = applyRound(before, pts);
      leagueRef.current = next;
      setLeague(next);
      pendingRef.current = 0; setPending(0);
      cancel(toastTimer);
      if (over) {
        const me = next.ranked.find((p) => p.isPlayer);
        setToast({ id: `final-${next.round}`, kind: me.rank <= 5 ? 'top' : 'up', text: `Final: #${me.rank} of ${next.ranked.length}` });
        setFinished(true);
        return;
      }
      setToast({ id: next.round, ...describeRound(before, next, pts) });
      toastTimer = later(() => setToast(null), TOAST_MS);
    };

    const onEnded = () => {
      if (over) return;
      over = true;
      if (open) { cancel(closeTimer); close(); }   // last window: grace period, then settle → finished
      else if (!settleTimer) {
        const me = leagueRef.current.ranked.find((p) => p.isPlayer);
        cancel(toastTimer);
        setToast({ id: 'final', kind: me.rank <= 5 ? 'top' : 'up', text: `Final: #${me.rank} of ${leagueRef.current.ranked.length}` });
        setFinished(true);
      }
      // (a settle already pending will mark the match finished itself)
    };

    const close = () => {
      open = false; closeTimer = null;
      setShot((s) => ({ ...s, open: false }));
      settleTimer = later(settle, SHOT_GRACE_MS);
    };

    const onBasket = () => {
      if (over) return;
      if (open) {
        cancel(closeTimer);                       // extend the current window
      } else {
        if (settleTimer) settle();                // finish the previous round first
        open = true; collecting = true; shotId += 1;
        cancel(toastTimer); setToast(null);           // last round's toast makes way
        for (const h of roundHighlights(leagueRef.current, SHOT_WINDOW_MS)) later(() => pushFeed(h), h.at);
      }
      closeTimer = later(close, SHOT_WINDOW_MS);
      setShot({ open: true, id: shotId, endsAt: Date.now() + SHOT_WINDOW_MS });
    };

    const onMade = () => {
      if (!collecting) return;
      pendingRef.current += POINTS_PER_MAKE;
      setPending(pendingRef.current);
      pushFeed({ name, gain: POINTS_PER_MAKE, isPlayer: true });
    };

    window.addEventListener(VIDEO_BASKET_EVENT, onBasket);
    window.addEventListener('jam-score-made', onMade);
    window.addEventListener(VIDEO_ENDED_EVENT, onEnded);
    return () => {
      window.removeEventListener(VIDEO_ENDED_EVENT, onEnded);
      timers.forEach(clearTimeout);
      window.removeEventListener(VIDEO_BASKET_EVENT, onBasket);
      window.removeEventListener('jam-score-made', onMade);
    };
  }, [name, matchId]);

  const restart = () => setMatchId((n) => n + 1);
  return { league, pending, feed, shot, toast, finished, matchId, restart };
}