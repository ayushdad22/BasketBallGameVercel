import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, VolumeHigh, VolumeLow, VolumeOff, Maximize, Minimize } from './icons.jsx';

/**
 * VideoPlayer — plays a YouTube video through the official embed (IFrame
 * Player API), so no server or video hosting is needed.
 *
 * YouTube's own controls are turned off and replaced by an arcade-style bar
 * that sits UNDER the video, not on top of it: YouTube's embed rules don't
 * allow overlays in front of the player.
 *
 * `videoRef.current` is set to a small adapter with the same shape as a
 * <video> element (currentTime, duration, paused, play(), pause(), muted,
 * volume), so the basket cues and the tagger work unchanged.
 *
 * Keys: Space/K play, M mute, ←/→ or J/L skip 5 s, F fullscreen
 * (they work while the page has focus, not while the YouTube frame does).
 */

const PLAYING = 1, BUFFERING = 3, ENDED = 0;

const YT_ERRORS = {
  2: 'The YouTube video id is invalid',
  5: 'This video can’t play in the embedded player',
  100: 'This video was removed or made private',
  101: 'The owner doesn’t allow this video to be embedded',
  150: 'The owner doesn’t allow this video to be embedded',
};

let apiPromise = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => { apiPromise = null; reject(new Error('Could not load the YouTube player')); };
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

// Looks enough like an HTMLVideoElement for useBasketCues and CueTagger.
function makeAdapter(p) {
  return {
    get currentTime() { return p.getCurrentTime?.() ?? 0; },
    set currentTime(t) { p.seekTo(Math.max(0, t), true); },
    get duration() { return p.getDuration?.() || 0; },
    get paused() { const s = p.getPlayerState?.(); return s !== PLAYING && s !== BUFFERING; },
    play() { p.playVideo(); return Promise.resolve(); },
    pause() { p.pauseVideo(); },
    get muted() { return p.isMuted?.() ?? true; },
    set muted(m) { if (m) p.mute(); else p.unMute(); },
    get volume() { return (p.getVolume?.() ?? 100) / 100; },
    set volume(v) { p.setVolume(Math.round(v * 100)); },
  };
}

const fmt = (t) => {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

const isTyping = (el) =>
  el && (el.matches?.('input, textarea, select, [contenteditable="true"]') || el.isContentEditable);

export default function VideoPlayer({
  youtubeId, videoRef, markers = [], loop = true, isFs = false,
  onToggleFullscreen, onReady, onEnded, lockFrame = false,
}) {
  const frameRef = useRef(null);
  const playerRef = useRef(null);
  const barRef = useRef(null);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [state, setState] = useState(-1);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [muted, setMuted] = useState(true);     // embed starts muted so autoplay is allowed
  const [volume, setVolume] = useState(1);
  const [scrub, setScrub] = useState(null);
  const [hover, setHover] = useState(null);

  const playing = state === PLAYING || state === BUFFERING;

  // Create the YouTube player. It replaces a div we create ourselves, so
  // React never loses track of its own DOM.
  useEffect(() => {
    if (!youtubeId) return;
    let cancelled = false;
    setReady(false); setError(null); setState(-1);

    const host = document.createElement('div');
    frameRef.current.appendChild(host);

    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      const p = new YT.Player(host, {
        videoId: youtubeId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1, mute: 1, controls: 0, disablekb: 1, fs: 0,
          rel: 0, playsinline: 1, iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = p;
            videoRef.current = makeAdapter(p);
            setVolume((p.getVolume?.() ?? 100) / 100);
            setReady(true);
            onReady?.();
            p.playVideo();
          },
          onStateChange: (e) => {
            setState(e.data);
            if (e.data === ENDED) {
              if (loopRef.current) { p.seekTo(0, true); p.playVideo(); }
              else endedRef.current?.();
            }
          },
          onError: (e) => setError(YT_ERRORS[e.data] ?? `YouTube error ${e.data}`),
        },
      });
      playerRef.current = p;
    }).catch((err) => { if (!cancelled) setError(err.message); });

    return () => {
      cancelled = true;
      videoRef.current = null;
      try { playerRef.current?.destroy(); } catch { /* already gone */ }
      playerRef.current = null;
      if (frameRef.current) frameRef.current.innerHTML = '';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeId]);

  // Poll duration / buffered (YouTube has no timeupdate event)…
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getDuration) return;
      const d = p.getDuration() || 0;
      setDur(d);
      setLoaded((p.getVideoLoadedFraction?.() ?? 0) * d);
      setTime(p.getCurrentTime() || 0);
    }, 250);
    return () => clearInterval(id);
  }, [ready]);

  // …and move the playhead smoothly while playing.
  useEffect(() => {
    if (!playing) return;
    let raf;
    const tick = () => { setTime(playerRef.current?.getCurrentTime?.() ?? 0); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p?.getPlayerState) return;
    const s = p.getPlayerState();
    if (s === PLAYING || s === BUFFERING) p.pauseVideo(); else p.playVideo();
  }, []);
  const seekTo = useCallback((t) => {
    const p = playerRef.current;
    if (!p?.seekTo) return;
    p.seekTo(Math.min(Math.max(t, 0), p.getDuration() || 0), true);
    setTime(t);
  }, []);
  const skip = useCallback((d) => seekTo((playerRef.current?.getCurrentTime?.() ?? 0) + d), [seekTo]);
  const toggleMute = useCallback(() => {
    const p = playerRef.current;
    if (!p?.mute) return;
    setMuted((m) => {
      if (m) { p.unMute(); if (p.getVolume() === 0) { p.setVolume(80); setVolume(0.8); } }
      else p.mute();
      return !m;
    });
  }, []);
  const setVol = (v) => {
    const p = playerRef.current;
    if (!p?.setVolume) return;
    p.setVolume(Math.round(v * 100));
    setVolume(v);
    if (v === 0) { p.mute(); setMuted(true); } else if (muted) { p.unMute(); setMuted(false); }
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const onControl = e.target?.matches?.('button, [role="slider"], input[type="range"]');
      const k = e.key.toLowerCase();
      if ((k === ' ' && !onControl) || k === 'k') { e.preventDefault(); togglePlay(); }
      else if (k === 'm') toggleMute();
      else if (k === 'f') onToggleFullscreen?.();
      else if ((k === 'arrowleft' && !onControl) || k === 'j') { e.preventDefault(); skip(-5); }
      else if ((k === 'arrowright' && !onControl) || k === 'l') { e.preventDefault(); skip(5); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, toggleMute, skip, onToggleFullscreen]);

  // Seek bar.
  const fracAt = (x) => {
    const r = barRef.current.getBoundingClientRect();
    return Math.min(Math.max((x - r.left) / r.width, 0), 1);
  };
  const onSeekDown = (e) => { e.currentTarget.setPointerCapture(e.pointerId); setScrub(fracAt(e.clientX)); };
  const onSeekMove = (e) => { const f = fracAt(e.clientX); setHover(f); if (scrub != null) setScrub(f); };
  const onSeekUp = (e) => { if (scrub == null) return; seekTo(fracAt(e.clientX) * dur); setScrub(null); };
  const onSeekKey = (e) => {
    const map = { ArrowLeft: () => skip(-5), ArrowRight: () => skip(5), Home: () => seekTo(0), End: () => seekTo(dur - 1) };
    if (map[e.key]) { e.preventDefault(); map[e.key](); }
  };

  const played = scrub ?? (dur ? time / dur : 0);
  const shownTime = scrub != null ? scrub * dur : hover != null ? hover * dur : time;
  const VolIcon = muted ? VolumeOff : volume < 0.5 ? VolumeLow : VolumeHigh;

  return (
    <div className="vp">
      <div className={`vp-frame${lockFrame ? ' is-locked' : ''}`} ref={frameRef} />

      {error && (
        <div className="vp-error" role="alert">
          <strong>VIDEO DIDN’T LOAD</strong>
          <span>{error}.{error.startsWith('Could not load') ? ' Check your internet connection or ad blocker.' : ' Pick another video in lib/demoVideo.js.'}</span>
        </div>
      )}

      <div className="vp-bar">
        <div
          className={`vp-seek${scrub != null ? ' is-scrubbing' : ''}`}
          ref={barRef}
          role="slider" tabIndex={0}
          aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(time)} aria-valuetext={`${fmt(time)} of ${fmt(dur)}`}
          onPointerDown={onSeekDown} onPointerMove={onSeekMove} onPointerUp={onSeekUp}
          onPointerLeave={() => setHover(null)} onKeyDown={onSeekKey}
        >
          <div className="vp-track">
            <div className="vp-buffered" style={{ width: `${dur ? (loaded / dur) * 100 : 0}%` }} />
            <div className="vp-played" style={{ width: `${played * 100}%` }} />
            {hover != null && <div className="vp-hoverline" style={{ left: `${hover * 100}%` }} />}
            {dur > 0 && markers.map((t) => (
              <span key={t} className={`vp-marker${t <= time ? ' is-past' : ''}`} style={{ left: `${(t / dur) * 100}%` }} />
            ))}
          </div>
          <div className="vp-thumb" style={{ left: `${played * 100}%` }} />
        </div>

        <div className="vp-row">
          <button type="button" className="vp-btn" onClick={togglePlay} disabled={!ready} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={22} /> : <Play size={22} />}
          </button>

          <div className="vp-vol">
            <button
              type="button" className={`vp-btn${muted ? ' vp-sound-off' : ''}`}
              onClick={toggleMute} disabled={!ready} aria-label={muted ? 'Turn sound on' : 'Mute'}
            >
              <VolIcon size={22} />
              {muted && <span className="vp-sound-label">Tap for sound</span>}
            </button>
            {!muted && (
              <input
                type="range" className="vp-volrange" min="0" max="1" step="0.05"
                value={volume} aria-label="Volume"
                style={{ '--vp-vol': `${volume * 100}%` }}
                onChange={(e) => setVol(Number(e.target.value))}
              />
            )}
          </div>

          <span className={`vp-time${hover != null && scrub == null ? ' is-preview' : ''}`}>
            {fmt(shownTime)} <span>/ {fmt(dur)}</span>
          </span>

          <span className="vp-live"><span className="vp-live-dot" />LIVE</span>

          {markers.length > 0 && (
            <span className="vp-count" title="Baskets in this video">
              {markers.filter((t) => t <= time).length}/{markers.length}
            </span>
          )}

          <button type="button" className="vp-btn" onClick={onToggleFullscreen} aria-label={isFs ? 'Exit fullscreen' : 'Fullscreen'}>
            {isFs ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}

const C = { cream: '#f3d6a4', orange: '#ff6a00', black: '#0d0d0d', brown: '#3b2a1a', gold: '#d6b25e' };
export const VP_BAR_H = 66;

export const VIDEO_PLAYER_CSS = `
.vp { position:absolute; inset:0; display:flex; flex-direction:column; font-family:'Space Mono', monospace; background:${C.black}; }
.vp-frame { position:relative; flex:1 1 auto; min-height:0; background:${C.black}; }
.vp-frame iframe { position:absolute; inset:0; width:100%; height:100%; border:0; display:block; }
.vp-frame.is-locked iframe { pointer-events:none; }   /* tag mode: keep keyboard focus on the page */

.vp-error { position:absolute; inset:0 0 var(--vp-bar-h, 66px); z-index:2; display:flex; flex-direction:column; gap:8px; align-items:center; justify-content:center; padding:16px; text-align:center; background:${C.brown}; color:${C.cream}; font-size:13px; }
.vp-error strong { font:400 16px 'Archivo Black', sans-serif; color:${C.orange}; }

.vp-bar { flex:none; height:var(--vp-bar-h, 66px); box-sizing:border-box; padding:4px 10px 0; background:${C.black}; border-top:3px solid ${C.orange}; }

.vp-seek { position:relative; height:16px; display:flex; align-items:center; cursor:pointer; touch-action:none; }
.vp-track { position:relative; width:100%; height:5px; background:#2a2118; transition:height .15s; }
.vp-seek:hover .vp-track, .vp-seek.is-scrubbing .vp-track, .vp-seek:focus-visible .vp-track { height:9px; }
.vp-buffered { position:absolute; inset:0 auto 0 0; background:#4a3a28; }
.vp-played { position:absolute; inset:0 auto 0 0; background:${C.orange}; }
.vp-hoverline { position:absolute; top:-2px; bottom:-2px; width:2px; margin-left:-1px; background:${C.cream}; }
.vp-marker { position:absolute; top:-3px; bottom:-3px; width:3px; margin-left:-1px; background:${C.gold}; border:1px solid ${C.black}; }
.vp-marker.is-past { background:${C.cream}; opacity:.55; }
.vp-thumb { position:absolute; top:50%; width:16px; height:16px; margin:-8px 0 0 -8px; background:${C.orange}; border:3px solid ${C.black}; border-radius:50%; transform:scale(0); transition:transform .15s; pointer-events:none; }
.vp-seek:hover .vp-thumb, .vp-seek.is-scrubbing .vp-thumb, .vp-seek:focus-visible .vp-thumb { transform:scale(1); }
.vp-seek:focus-visible { outline:2px solid ${C.gold}; outline-offset:3px; }

.vp-row { display:flex; align-items:center; gap:6px; height:42px; color:${C.cream}; }
.vp-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-width:38px; height:38px; padding:0 4px; background:none; border:0; color:${C.cream}; cursor:pointer; font:700 12px 'Space Mono', monospace; }
.vp-btn:hover:not(:disabled) { color:${C.orange}; }
.vp-btn:disabled { opacity:.4; cursor:default; }
.vp-btn:focus-visible { outline:2px solid ${C.gold}; outline-offset:-2px; }
.vp-sound-off { color:${C.black}; background:${C.gold}; padding:0 10px; border:2px solid ${C.black}; animation:vp-nudge 2.4s ease-in-out infinite; }
.vp-sound-off:hover:not(:disabled) { color:${C.black}; background:${C.orange}; }
.vp-vol { display:flex; align-items:center; }
.vp-volrange { width:84px; margin:0 8px 0 4px; -webkit-appearance:none; appearance:none; height:5px; cursor:pointer;
  background:linear-gradient(to right, ${C.orange} var(--vp-vol), #3a2e22 var(--vp-vol)); }
.vp-volrange::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:${C.cream}; border:2px solid ${C.black}; }
.vp-volrange::-moz-range-thumb { width:12px; height:12px; border-radius:50%; background:${C.cream}; border:2px solid ${C.black}; }
.vp-volrange:focus-visible { outline:2px solid ${C.gold}; outline-offset:4px; }
.vp-time { font:700 13px 'Space Mono', monospace; font-variant-numeric:tabular-nums; white-space:nowrap; margin-left:4px; }
.vp-time span { opacity:.6; font-weight:400; }
.vp-time.is-preview { color:${C.gold}; }
.vp-live { margin-left:auto; display:inline-flex; align-items:center; gap:6px; padding:3px 8px; font:700 11px 'Space Mono', monospace; color:${C.cream}; background:${C.orange}; border:2px solid ${C.black}; }
.vp-live-dot { width:7px; height:7px; border-radius:50%; background:${C.cream}; animation:vp-pulse 1.2s ease-in-out infinite; }
.vp-count { font:700 11px 'Space Mono', monospace; color:${C.gold}; white-space:nowrap; padding:2px 7px; border:1px solid ${C.gold}; }

@keyframes vp-nudge { 0%, 85%, 100% { transform:none; } 90% { transform:translateX(-2px); } 95% { transform:translateX(2px); } }
@keyframes vp-pulse { 50% { opacity:.35; } }
@media (prefers-reduced-motion: reduce) {
  .vp-sound-off, .vp-live-dot { animation:none; }
  .vp-track, .vp-thumb { transition:none; }
}
/* sideways phones: slimmer bar so the picture gets the height */
@media (max-height: 500px) {
  .vp-bar { padding:2px 8px 0; border-top-width:2px; }
  .vp-seek { height:12px; }
  .vp-row { height:28px; gap:4px; }
  .vp-btn { min-width:30px; height:28px; }
  .vp-btn .icon { width:18px; height:18px; }
  .vp-sound-off { padding:0 8px; }
  .vp-sound-label { font-size:11px; }
  .vp-time { font-size:11px; }
  .vp-live { padding:1px 6px; font-size:10px; }
}
@media (max-width: 480px) {
  .vp-bar { padding:2px 6px 0; }
  .vp-sound-label, .vp-count, .vp-volrange { display:none; }
  .vp-time { font-size:12px; }
}
`;