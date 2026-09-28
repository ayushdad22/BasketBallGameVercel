import { useEffect, useState } from 'react';

// Pull an id out of a YouTube link (watch?v=, youtu.be/, /embed/, /shorts/).
export function youtubeIdFrom(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop() || null;
  } catch { return null; }
}

/**
 * Resolves the demo's YouTube id and loads its basket times from the static
 * file /cues/<id>.json (public/cues/ in the project). No server involved.
 *
 * Returns { videoId, cues, setCues, error }
 */
export function useDemoVideo(demo) {
  const videoId = demo?.youtubeId || (demo?.url ? youtubeIdFrom(demo.url) : null);
  const [cues, setCues] = useState(null);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    setCues(null);
    fetch(`/cues/${videoId}.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => { if (!cancelled) setCues(c); })
      .catch(() => { /* no cue file yet (or the host answered with HTML) */ });
    return () => { cancelled = true; };
  }, [videoId]);

  return { videoId, cues, setCues, error: videoId ? null : 'No YouTube video id set in lib/demoVideo.js' };
}