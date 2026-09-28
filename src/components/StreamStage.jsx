import { useEffect, useMemo, useRef, useState } from 'react';
import BasketballGame from './BasketballGame.jsx';
import NameEntry, { NAME_ENTRY_CSS } from './NameEntry.jsx';
import { Leaderboard, LiveStrip, LEADERBOARD_CSS } from './Leaderboard.jsx';
import { useFakeLeague, VIDEO_BASKET_EVENT, VIDEO_ENDED_EVENT } from '../lib/useFakeLeague.js';
import { useBasketCues, normalizeCues } from '../lib/useBasketCues.js';
import { useDemoVideo } from '../lib/useDemoVideo.js';
import { demoFromLocation } from '../lib/demoVideo.js';
import CueTagger, { CUE_TAGGER_CSS } from './CueTagger.jsx';
import { Basketball } from './icons.jsx';
import VideoPlayer, { VIDEO_PLAYER_CSS, VP_BAR_H } from './VideoPlayer.jsx';

/**
 * StreamStage
 * The game is hidden until a basket is made in the video. Then it pops in from
 * the right for one shooting window and slides back out.
 *
 *   desktop   YouTube watch-page layout: player (video + game, flush) with the
 *             title under it; leaderboard in the right column where YouTube
 *             puts its ad slot. The video squeezes left as the game slides in.
 *   split     landscape phone / fullscreen: video 65 | leaderboard 35; the game
 *             slides in over the leaderboard.
 *   portrait  phone upright: video edge to edge on top, live strip, then the
 *             title and leaderboard scroll underneath; the game slides in over
 *             that whole area.
 *
 * Same DOM in every layout (only classes change), so resizing or rotating never
 * reloads the <video> or the game iframe.
 *
 * The video is fixed (lib/demoVideo.js). Its basket times come from
 * public/cues/<videoId>.json. Add ?tag to the URL to mark them yourself.
 * Fullscreen shows the top 50 instead of the top 5.
 *
 * Props
 *   demo       { url, file, id, title, channel }  defaults to DEMO_VIDEO,
 *              or ?v=<youtube id> in the page URL
 *   fullBleed  let the desktop layout break out of a max-width page wrapper
 */

const PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 820px)';
const DESKTOP_QUERY = '(min-width: 1000px) and (min-height: 600px)';
const SCORE_EVENTS = ['jam-score-made', 'jam-score-missed'];

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export default function StreamStage({
  demo: demoProp,
  fullBleed = true,
}) {
  const [demo] = useState(() => demoProp ?? demoFromLocation());
  const { title, channel } = demo;
  const stageRef = useRef(null);
  const videoRef = useRef(null);
  const gameRef = useRef(null);
  const [isFs, setIsFs] = useState(false);
  const [flash, setFlash] = useState(0);
  const [playerName, setPlayerName] = useState(null);

  const isPortrait = useMediaQuery(PORTRAIT_QUERY);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const layout = isPortrait ? 'portrait' : (isDesktop && !isFs ? 'desktop' : 'split');

  const [tagMode] = useState(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('tag'));
  // In tag mode skip the name screen and play as "Tester" so the game and
  // leaderboard can be checked against the basket times.
  const { league, pending, feed, shot, toast, finished, matchId, restart } = useFakeLeague(playerName ?? (tagMode ? 'Tester' : null));

  // Desktop breaks out of any max-width page wrapper so the player can reach
  // YouTube size. 100vw includes the scrollbar, so measure and subtract it.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const set = () => el.style.setProperty('--ss-sbw', `${window.innerWidth - document.documentElement.clientWidth}px`);
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, [layout]);
  const video = useDemoVideo(demo);
  const [playerReady, setPlayerReady] = useState(false);
  // Each basket counts once per match (rewinding earns nothing). Tag mode
  // re-arms them so you can check your times.
  useBasketCues(videoRef, video.cues, playerReady, { once: !tagMode, resetKey: matchId });

  // Tell the game in the iframe when the match ends or restarts.
  const tellGame = (type) => {
    const frame = gameRef.current?.querySelector('iframe');
    try { frame?.contentWindow?.postMessage({ type }, window.location.origin); } catch { /* not loaded yet */ }
  };
  useEffect(() => { if (finished) tellGame('jam-match-over'); }, [finished]);
  const playAgain = () => {
    restart();
    tellGame('jam-match-start');
    const v = videoRef.current;
    if (v) { v.currentTime = 0; v.play(); }
  };
  const basketTimes = useMemo(() => normalizeCues(video.cues), [video.cues]);

  // "+2" pop on every make.
  useEffect(() => {
    const onMade = () => setFlash((n) => n + 1);
    window.addEventListener('jam-score-made', onMade);
    return () => window.removeEventListener('jam-score-made', onMade);
  }, []);

  // Bridge: the iframe game can report makes with
  //   parent.postMessage({ type: 'jam-score-made' }, '*')
  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin) return;
      const type = e.data?.type;
      if (SCORE_EVENTS.includes(type)) window.dispatchEvent(new CustomEvent(type));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Hidden game can't be focused or clicked.
  useEffect(() => {
    if (gameRef.current) gameRef.current.inert = !shot.open;
  }, [shot.open]);

  const simulateBasket = () => window.dispatchEvent(new CustomEvent(VIDEO_BASKET_EVENT, { detail: { simulated: true } }));
  const simulateMake = () => window.dispatchEvent(new CustomEvent('jam-score-made'));

  function toggleFullscreen() {
    const el = stageRef.current;
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
  useEffect(() => {
    const onFs = () => setIsFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    };
  }, []);

  const shotLeft = Math.max(0, shot.endsAt - Date.now());
  const cls = ['ss-stage', `lay-${layout}`, isFs && 'is-fs', fullBleed && 'full-bleed', shot.open && 'shot-open', !playerName && !tagMode && 'is-locked']
    .filter(Boolean).join(' ');

  return (
    <div ref={stageRef} className={cls}>
      <div className="ss-player">
        <div className="ss-video">
          {video.videoId ? (
            <VideoPlayer
              youtubeId={video.videoId} videoRef={videoRef} loop={false} lockFrame={tagMode}
              onEnded={tagMode ? undefined : () => window.dispatchEvent(new CustomEvent(VIDEO_ENDED_EVENT))}
              markers={basketTimes} isFs={isFs} onToggleFullscreen={toggleFullscreen}
              onReady={() => setPlayerReady(true)}
            />
          ) : (
            <div className="ss-placeholder">
              <div className="ss-ph-ball"><Basketball size={56} strokeWidth={1.75} /></div>
              <strong className="ss-ph-title">NO VIDEO SET</strong>
              <span className="ss-ph-copy">{video.error}</span>
            </div>
          )}
        </div>

        <div className="ss-game" ref={gameRef} aria-hidden={!shot.open}>
          <div className="ss-game-layer">
            <div className="ss-game-head">
              <span className="ss-shot-label"><Basketball size={18} /> YOUR SHOT</span>
              <div className="ss-shot-bar">
                {shot.open && <div key={shot.endsAt} style={{ animationDuration: `${shotLeft}ms` }} />}
              </div>
            </div>
            <div className="ss-game-frame">
              <BasketballGame />
              {shot.open && <div key={`b${shot.id}`} className="ss-banner">BASKET!<small>Your turn</small></div>}
              {flash > 0 && <div key={`f${flash}`} className="ss-flash">+2</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="ss-strip">
        <LiveStrip league={league} pending={pending} feed={feed} shot={shot} finished={finished} />
      </div>

      <div className="ss-body">
        <div className="ss-meta">
          <h1 className="ss-title">{title}</h1>
          <div className="ss-meta-row">
            <span className="ss-channel">
              <span className="ss-channel-av" aria-hidden="true"><Basketball size={24} /></span>
              <span><b>{channel}</b><small>{league ? `${league.ranked.length} shooting now` : 'Join to play'}</small></span>
            </span>
            {tagMode && (
              <div className="ss-actions" aria-label="Test controls">
                <button className="ss-btn ss-btn-hot" onClick={simulateBasket}>Simulate basket</button>
                <button className="ss-btn" onClick={simulateMake} disabled={!shot.open}>Simulate make</button>
              </div>
            )}
          </div>
        </div>

        <aside className="ss-side">
          <Leaderboard
            league={league} pending={pending} feed={feed} shot={shot} toast={toast}
            onLeave={() => setPlayerName(null)}
            topN={isFs ? 50 : 5}
            finished={finished} onRestart={playAgain}
          />
        </aside>

      </div>

      {!playerName && !tagMode && <NameEntry onJoin={setPlayerName} />}

      {/* Tagger floats over every layout (desktop, phone, fullscreen) */}
      {tagMode && (
        <div className="ss-tagdock">
          <CueTagger videoRef={videoRef} videoId={video.videoId} initial={video.cues} onSaved={video.setCues} />
        </div>
      )}

      <style>{STAGE_CSS + LEADERBOARD_CSS + NAME_ENTRY_CSS + CUE_TAGGER_CSS + VIDEO_PLAYER_CSS}</style>
    </div>
  );
}

const C = { cream: '#f3d6a4', orange: '#ff6a00', black: '#0d0d0d', brown: '#3b2a1a', gold: '#d6b25e' };
const GAME_SHARE = 35;          // % of the player the game takes while it's in
const STRIP_H = '52px';
const FS_SIDE_MIN = 280;       // fullscreen leaderboard/game column never narrower than this

// Desktop sizing copied from YouTube's default (non-theater) watch page:
// the player fills the main column and is as tall as the window allows, leaving
// room for the title row below; the side column is 402px (down to 300px).
const YT_MASTHEAD = 56;       // YouTube's top bar; the player is sized as if it's there
const YT_MARGIN = 24;
const YT_SPACE_BELOW = 136;   // title + channel row under the player
const YT_SIDE = 402;
const YT_SIDE_MIN = 300;
const POP_IN = '560ms cubic-bezier(.34,1.56,.64,1)';   // overshoot = "pop"
const POP_OUT = '380ms cubic-bezier(.55,0,1,.45)';

const STAGE_CSS = `
.ss-stage { position:relative; height:100%; min-height:0; box-sizing:border-box; container-type:inline-size; font-family:'Space Mono', monospace; }
.ss-stage.is-locked { overflow:hidden !important; }
.ss-stage *, .ss-stage *::before, .ss-stage *::after { box-sizing:border-box; }

/* ── video ─────────────────────────────────────────────────────────────── */
.ss-video { position:relative; overflow:hidden; background:${C.black}; min-width:0; }
.ss-video-el { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; background:${C.black}; }
.ss-placeholder { position:absolute; inset:0; display:flex; flex-direction:column; gap:10px; align-items:center; justify-content:center; padding:12px; background:${C.brown}; color:${C.cream}; text-align:center; }
.ss-ph-ball { color:${C.orange}; }
.ss-ph-title { font:400 16px 'Archivo Black', sans-serif; }
.ss-ph-copy { font-size:12px; max-width:340px; }
.ss-vtop { position:absolute; top:10px; right:10px; z-index:5; display:flex; gap:8px; pointer-events:none; }
.ss-chip { display:inline-flex; align-items:center; gap:6px; background:${C.orange}; color:${C.cream}; padding:5px 9px; font:700 11px 'Space Mono', monospace; border:2px solid ${C.black}; }
.ss-dot { width:8px; height:8px; border-radius:50%; background:${C.cream}; display:inline-block; }
.ss-icbtn { background:${C.gold}; color:${C.black}; padding:5px 9px; font:400 11px 'Archivo Black', sans-serif; cursor:pointer; border:2px solid ${C.black}; }

/* ── game (hidden until a basket) ──────────────────────────────────────── */
.ss-game { position:relative; overflow:hidden; pointer-events:none; }
.shot-open .ss-game { pointer-events:auto; }
.ss-game-layer { position:absolute; inset:0; display:flex; flex-direction:column; background:${C.cream}; border-left:4px solid ${C.black}; }
.ss-game-head { display:flex; align-items:center; gap:12px; padding:10px 14px; background:${C.black}; }
.ss-shot-label { display:inline-flex; align-items:center; gap:8px; font:400 15px 'Archivo Black', sans-serif; color:${C.orange}; white-space:nowrap; }
.ss-shot-bar { flex:1; height:12px; background:${C.brown}; }
.ss-shot-bar > div { height:100%; background:${C.orange}; transform-origin:left; animation:ss-drain linear forwards; }
.ss-game-frame { position:relative; flex:1; min-height:0; background:#bfe6ff; }
.ss-banner { position:absolute; left:0; right:0; top:10%; z-index:4; display:flex; flex-direction:column; align-items:center; pointer-events:none; font:400 34px/1 'Archivo Black', sans-serif; color:${C.gold}; text-shadow:3px 3px 0 ${C.black}; animation:ss-banner 1.3s ease-out forwards; }
.ss-banner small { font:700 13px 'Space Mono', monospace; color:${C.black}; background:${C.gold}; padding:2px 8px; margin-top:6px; text-shadow:none; border:2px solid ${C.black}; }
.ss-flash { position:absolute; left:0; right:0; top:30%; z-index:5; text-align:center; pointer-events:none; font:400 44px 'Archivo Black', sans-serif; color:${C.orange}; text-shadow:3px 3px 0 ${C.black}; animation:ss-plus .9s ease-out forwards; }

/* ── strip, meta, side ─────────────────────────────────────────────────── */
.ss-strip { display:none; }
.ss-tagdock { position:fixed; left:16px; bottom:16px; z-index:60; width:min(460px, calc(100vw - 32px)); max-height:min(60vh, 520px); overflow-y:auto; }
.ss-tagdock .ct { margin:0; }
.ss-title { margin:0; font:400 24px/1.25 'Archivo Black', sans-serif; color:${C.black}; }
.ss-meta-row { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-top:10px; }
.ss-channel { display:flex; align-items:center; gap:10px; color:${C.black}; }
.ss-channel b { display:block; font-size:16px; }
.ss-channel small { display:block; font-size:13px; opacity:.75; }
.ss-channel-av { width:44px; height:44px; border-radius:50%; background:${C.orange}; color:${C.black}; display:grid; place-items:center; border:2px solid ${C.black}; }
.ss-actions { display:flex; gap:8px; flex-wrap:wrap; }
.ss-btn { font:700 14px 'Space Mono', monospace; padding:10px 16px; background:${C.cream}; color:${C.black}; border:2px solid ${C.black}; cursor:pointer; box-shadow:3px 3px 0 ${C.black}; }
.ss-btn:active { transform:translate(2px,2px); box-shadow:1px 1px 0 ${C.black}; }
.ss-btn:disabled { opacity:.45; cursor:not-allowed; box-shadow:none; }
.ss-btn-hot { background:${C.orange}; }
.ss-btn:focus-visible, .ss-icbtn:focus-visible { outline:3px solid ${C.gold}; outline-offset:2px; }

/* ══ DESKTOP: YouTube watch page ══════════════════════════════════════════ */
.lay-desktop { overflow-y:auto; background:${C.cream}; padding:${YT_MARGIN}px ${YT_MARGIN}px 0; }
.lay-desktop .ss-body { display:contents; }
.lay-desktop.full-bleed { --ss-vw:calc(100vw - var(--ss-sbw, 0px)); width:var(--ss-vw); max-width:none; margin-left:calc(50% - var(--ss-vw) / 2); }
.lay-desktop { display:grid; grid-template-columns:minmax(0, calc((100svh - ${YT_MASTHEAD}px - ${YT_MARGIN}px - ${YT_SPACE_BELOW}px - ${VP_BAR_H}px) * 16 / 9)) minmax(${YT_SIDE_MIN}px, ${YT_SIDE}px); justify-content:center; grid-template-rows:auto auto 1fr; grid-template-areas:"player side" "meta side" "loader side"; column-gap:${YT_MARGIN}px; align-content:start; }
.lay-desktop .ss-player { grid-area:player; display:flex; width:100%; background:${C.black}; container-type:inline-size; }
/* the frame keeps the full-width 16:9 height even while the game squeezes the video */
.lay-desktop .vp { position:relative; inset:auto; }
.lay-desktop .vp-frame { flex:none; height:calc(100cqw * 9 / 16); }
.lay-desktop .ss-video { flex:1 1 0; }
.lay-desktop .ss-game { flex:none; width:0; transition:width ${POP_OUT}; }
.lay-desktop.shot-open .ss-game { width:${GAME_SHARE}%; transition:width ${POP_IN}; }
.lay-desktop .ss-game-layer { right:auto; width:${GAME_SHARE}cqw; }
.lay-desktop .ss-meta { grid-area:meta; padding-top:14px; }
.lay-desktop .ss-side { grid-area:side; align-self:start; position:sticky; top:0; }

/* ══ SPLIT: landscape phone / fullscreen ══════════════════════════════════ */
.lay-split { display:grid; grid-template-columns:minmax(0,65fr) minmax(260px,35fr); grid-template-rows:minmax(0,1fr); grid-template-areas:"video slot"; overflow:hidden; background:${C.black}; border:4px solid ${C.black}; }
.lay-split .ss-player, .lay-split .ss-body { display:contents; }
.lay-split .ss-video { grid-area:video; }
.lay-split .ss-side { grid-area:slot; overflow-y:auto; border-left:4px solid ${C.black}; }
.lay-split .ss-side .lb { min-height:100%; }
.lay-split .ss-meta { grid-area:video; align-self:end; z-index:3; padding:28px 12px 10px; background:linear-gradient(transparent, rgba(13,13,13,.85)); pointer-events:none; }
.lay-split .ss-meta > * { pointer-events:auto; }
.lay-split .ss-title { color:${C.cream}; font-size:15px; }
.lay-split .ss-channel { display:none; }
/* split layouts (landscape phone, narrow window, fullscreen): compact leaderboard */
.lay-split .lb { padding:8px 10px; }
.lay-split .lb-title { font-size:18px; }
.lay-split .lb-status:not(:has(.lb-shotclock, .lb-final)), .lay-split .lb-feed-head, .lay-split .lb-feed, .lay-split .lb-leave { display:none; }
.lay-split .lb { position:relative; }
.lay-split .lb-toast-slot { position:absolute; top:6px; left:10px; right:10px; z-index:2; min-height:0; pointer-events:none; }
.lay-split .lb-chip:not(.lb-chip-live) { display:none; }
.lay-split .lb-rows { margin-top:10px; }
.lay-split .lb-row { padding:4px 8px; margin-bottom:3px; grid-template-columns:28px 26px 1fr 2.6em auto; gap:8px; font-size:14px; }
.lay-split .lb-pts { font-size:16px; }
.lay-split .lb-rank { font-size:15px; }
.lay-split .lb-rank .icon { width:24px; height:24px; }
.lay-split .lb-chip { font-size:11px; padding:3px 7px; }
.lay-split .lb-row.is-me { margin:5px 3px 6px; }
.lay-split .lb-avatar { width:26px; height:26px; font-size:12px; }

/* ── FULLSCREEN: biggest uncropped video; leaderboard + game get what's left ── */
.lay-split.is-fs { grid-template-columns:minmax(0,1fr) max(${FS_SIDE_MIN}px, calc(100vw - (100vh - ${VP_BAR_H}px) * 16 / 9)); border:0; }
.lay-split.is-fs .ss-meta { display:none; }
.lay-split.is-fs .ss-video-el { object-fit:contain; }
.lay-split.is-fs .ss-side { border-left:3px solid ${C.black}; }
.lay-split.is-fs .ss-game-head { padding:8px 10px; }
.lay-split.is-fs .ss-shot-label { font-size:13px; }
.lay-split.is-fs .ss-banner { font-size:26px; }
.lay-split.is-fs .lb-name { font-size:14px; }
/* fullscreen top 50: scrolls inside the right column */
.lay-split.is-fs .ss-side { scroll-behavior:smooth; }
.lay-split .ss-meta-row { margin-top:6px; }
.lay-split .ss-game { grid-area:slot; z-index:4; transform:translateX(110%); transition:transform ${POP_OUT}; }
.lay-split.shot-open .ss-game { transform:none; transition:transform ${POP_IN}; }

/* ══ PORTRAIT: YouTube mobile ═════════════════════════════════════════════ */
.lay-portrait { display:flex; flex-direction:column; overflow:hidden; background:${C.cream}; }
.lay-portrait .ss-player { flex:none; }
.lay-portrait .ss-video { width:100%; height:calc(56.25cqw + ${VP_BAR_H}px); }
.lay-portrait .ss-video-el { object-fit:cover; }
.lay-portrait .ss-vtop { top:8px; right:8px; }
.lay-portrait .ss-strip { display:block; flex:none; }
.lay-portrait .ss-body { flex:1; min-height:0; overflow-y:auto; overscroll-behavior-y:contain; -webkit-overflow-scrolling:touch; }
.lay-portrait .ss-meta { padding:12px; }
.lay-portrait .ss-title { font-size:19px; }
.lay-portrait .ss-game { position:absolute; left:0; right:0; bottom:0; top:calc(56.25cqw + ${VP_BAR_H}px + ${STRIP_H}); z-index:8; transform:translateX(110%); transition:transform ${POP_OUT}; }
.lay-portrait.shot-open .ss-game { transform:none; transition:transform ${POP_IN}; }
.lay-portrait .ss-game-layer { border-left:0; border-top:3px solid ${C.black}; }

/* entry wobble on the game panel itself */
.shot-open .ss-game-layer { animation:ss-pop 620ms cubic-bezier(.34,1.56,.64,1); }

@keyframes ss-drain { from { transform:scaleX(1); } to { transform:scaleX(0); } }
@keyframes ss-pop { 0% { transform:rotate(3deg) scale(.94); } 60% { transform:rotate(-1deg) scale(1.01); } 100% { transform:none; } }
@keyframes ss-banner { 0% { opacity:0; transform:scale(.4) rotate(-8deg); } 25% { opacity:1; transform:scale(1.12) rotate(2deg); } 40% { transform:scale(1); } 80% { opacity:1; } 100% { opacity:0; transform:translateY(-16px); } }
@keyframes ss-plus { 0% { opacity:0; transform:scale(.6); } 25% { opacity:1; transform:scale(1.15); } 100% { opacity:0; transform:translateY(-40px); } }
@media (prefers-reduced-motion: reduce) {
  .ss-game, .shot-open .ss-game { transition-duration:.01s !important; }
  .shot-open .ss-game-layer, .ss-banner, .ss-flash { animation-duration:.01s; }
}
`;