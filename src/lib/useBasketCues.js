import { useEffect } from 'react';
import { VIDEO_BASKET_EVENT } from './useFakeLeague.js';

/**
 * Fires 'jam-video-basket' when the video plays past each basket timestamp.
 *
 * Accepted cue formats (seconds into the video):
 *   [12.4, 31, 58.2]
 *   [{ "t": 12.4 }, { "time": 31 }]
 *   { "baskets": [...either of the above] }
 *
 * Seeking backwards or looping re-arms the cues; jumping forward more than a
 * second (a seek, or a throttled background tab) skips the cues in between.
 */
export function normalizeCues(cues) {
  const list = Array.isArray(cues) ? cues : cues?.baskets ?? [];
  return list
    .map((c) => (typeof c === 'number' ? c : c?.t ?? c?.time))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
}

export async function loadBasketCues(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Cue file ${url} returned ${r.status}`);
  return r.json();
}

/**
 * options.once      each basket fires at most once per match: rewinding (or a
 *                   seek backwards) can't replay baskets for more points, and
 *                   baskets you skip past by seeking forward are used up too.
 * options.resetKey  change it to start a fresh match (all baskets live again).
 */
export function useBasketCues(videoRef, cues, ready, { once = true, resetKey = 0 } = {}) {
  useEffect(() => {
    const video = videoRef.current;
    const times = normalizeCues(cues);
    if (!video || !times.length) return;

    const used = new Set();
    let last = video.currentTime;
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = video.currentTime;
      if (now < last) {                          // rewound / looped
        if (!once) used.clear();
        last = now;
        return;
      }
      const jumped = now - last > 1;             // seeked forward (or tab was asleep)
      for (const t of times) {
        if (t > last && t <= now && !used.has(t)) {
          used.add(t);
          if (!jumped) window.dispatchEvent(new CustomEvent(VIDEO_BASKET_EVENT, { detail: { t } }));
        }
      }
      last = now;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, cues, ready, once, resetKey]);
}