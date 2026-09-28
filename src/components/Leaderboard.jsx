import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { visibleRows } from '../lib/fakeLeague.js';
import { Basketball, Trophy, Crown, Flame, TrendUp, TrendDown, Blocked, Caret, Medal } from './icons.jsx';

/**
 * Leaderboard — top 5, the player, and last place.
 *   • rows glide to their new positions when ranks change (FLIP)
 *   • scores count up, a flame on 3+ scoring rounds in a row, medals for the podium
 *   • a round-result toast ("You passed Olivia!") and a live scoring feed
 * LiveStrip is the one-line version shown under the video on phones.
 */

const C = { cream: '#f3d6a4', orange: '#ff6a00', black: '#0d0d0d', brown: '#3b2a1a', gold: '#d6b25e' };
const AVATAR_COLORS = ['#ff6a00', '#d6b25e', '#4fb3ff', '#8be36b', '#ff5fa2', '#b58cff', '#ffd400', '#3fd1c1'];

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function colorFor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function AnimatedNumber({ value }) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    if (reducedMotion()) { shownRef.current = value; setShown(value); return; }
    const t0 = performance.now(), dur = 650;
    let raf;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const v = Math.round(from + (value - from) * (1 - (1 - k) ** 3));
      shownRef.current = v; setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
}

function Delta({ d }) {
  if (!d) return <span className="lb-delta" aria-hidden="true" />;
  return (
    <span className={`lb-delta ${d > 0 ? 'up' : 'down'}`} aria-label={d > 0 ? `up ${d}` : `down ${-d}`}>
      <Caret down={d < 0} size={11} />{Math.abs(d)}
    </span>
  );
}

function Avatar({ name }) {
  return <span className="lb-avatar" style={{ background: colorFor(name) }} aria-hidden="true">{name[0]?.toUpperCase()}</span>;
}

function FeedText({ item }) {
  if (!item) return <span className="lb-muted">Waiting for a basket in the video</span>;
  const who = item.isPlayer ? <b className="lb-you">You</b> : <b>{item.name}</b>;
  return (
    <span className="lb-feed-line">
      {item.fire ? <Flame size={16} className="ic-fire" /> : <Basketball size={16} className="ic-ball" />}
      <span>{who} +{item.gain}{item.fire && !item.isPlayer ? ', on fire' : ''}</span>
    </span>
  );
}

function ShotClock({ shot }) {
  if (!shot?.open) return null;
  const left = Math.max(0, shot.endsAt - Date.now());
  return (
    <div className="lb-shotclock" key={shot.endsAt}>
      <span>Your shot!</span>
      <div className="lb-shotbar"><div style={{ animationDuration: `${left}ms` }} /></div>
    </div>
  );
}

export function LiveStrip({ league, pending, feed, shot, finished }) {
  if (!league) return null;
  const me = league.ranked.find((p) => p.isPlayer);
  return (
    <div className={`lb-strip${shot?.open ? ' is-shot' : ''}`}>
      <span className="lb-livedot" aria-hidden="true" />
      <span className="lb-strip-rank">#{me.rank}<small>/{league.ranked.length}</small></span>
      <span className="lb-strip-pts">
        <AnimatedNumber value={me.score} /> pts{pending > 0 && <b className="lb-pending">+{pending}</b>}
      </span>
      <span className="lb-strip-feed" key={shot?.open ? 'shot' : feed[0]?.key}>
        {finished ? <b>Final standings</b>
          : shot?.open ? <b className="lb-feed-line"><Basketball size={18} /> Your shot, go!</b>
          : <FeedText item={feed[0]} />}
      </span>
    </div>
  );
}

export function Leaderboard({ league, pending, feed, shot, toast, onLeave, topN = 5, finished = false, onRestart }) {
  const listRef = useRef(null);
  const topsRef = useRef(new Map());

  // FLIP: animate rows from their previous offsetTop to the new one.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const next = new Map();
    const skip = reducedMotion();
    list.querySelectorAll('[data-flip]').forEach((el) => {
      const id = el.dataset.flip, top = el.offsetTop, prev = topsRef.current.get(id);
      next.set(id, top);
      if (skip || !el.animate) return;
      if (prev == null) {
        el.animate([{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'none' }],
          { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
      } else if (Math.abs(prev - top) > 1) {
        el.animate([{ transform: `translateY(${prev - top}px)` }, { transform: 'none' }],
          { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    });
    topsRef.current = next;
  });

  if (!league) return null;
  const rows = visibleRows(league.ranked, topN);
  const long = topN > 5;

  return (
    <section className={`lb${long ? ' is-long' : ''}`} aria-label="Leaderboard">
      <header className="lb-head">
        <h2 className="lb-title"><Trophy size={26} /> {long ? `Top ${topN}` : 'Leaderboard'}</h2>
        <span className="lb-chip lb-chip-live"><span className="lb-livedot" aria-hidden="true" />{league.ranked.length} live</span>
        <span className={`lb-chip${finished ? ' lb-chip-final' : ''}`}>
          {finished ? 'Final' : `Round ${league.round + (shot?.open ? 1 : 0) || 1}`}
        </span>
      </header>

      <div className="lb-status">
        {finished ? (
          <div className="lb-final">
            <span>Match over. The video has ended.</span>
            {onRestart && <button type="button" className="lb-again" onClick={onRestart}>Play again</button>}
          </div>
        ) : shot?.open ? <ShotClock shot={shot} /> : (
          <span className="lb-muted">Next shot opens when a basket drops in the video</span>
        )}
      </div>

      <div className="lb-toast-slot" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`lb-toast is-${toast.kind}`}>
            {toast.kind === 'top' ? <Crown size={20} /> : toast.kind === 'up' ? <TrendUp size={20} />
              : toast.kind === 'down' ? <TrendDown size={20} /> : <Blocked size={20} />}
            <span>{toast.text}</span>
            {toast.delta > 0 && <b className="lb-toast-delta"><Caret size={12} />{toast.delta}</b>}
          </div>
        )}
      </div>

      <ol className="lb-rows" ref={listRef}>
        {rows.map((r) => r.gap ? (
          <li key={r.key} className="lb-gap" aria-hidden="true"><span /><span /><span /></li>
        ) : (
          <li
            key={r.key}
            data-flip={r.p.id}
            className={`lb-row${r.p.isPlayer ? ' is-me' : ''}${r.p.rank <= 3 ? ` is-podium p${r.p.rank}` : ''}`}
          >
            <span className="lb-rank">{r.p.rank <= 3 ? <Medal rank={r.p.rank} /> : r.p.rank}</span>
            <Avatar name={r.p.name} />
            <span className="lb-name">
              {r.p.name}
              {r.p.rank === 1 && <Crown size={18} className="ic-crown" label="Leader" />}
              {r.p.streak >= 3 && <span className="lb-fire"><Flame size={18} className="ic-fire" label="On fire" /></span>}
              {r.p.isPlayer && <span className="lb-tagyou">YOU</span>}
            </span>
            <Delta d={r.p.prevRank - r.p.rank} />
            <span className="lb-pts">
              <AnimatedNumber value={r.p.score} />
              {r.p.isPlayer && pending > 0 && <b className="lb-pending">+{pending}</b>}
            </span>
          </li>
        ))}
      </ol>

      {!long && <>
      <div className="lb-feed-head">Live feed</div>
      <ul className="lb-feed">
        {feed.slice(0, 4).map((f) => (
          <li key={f.key} className={f.isPlayer ? 'is-me' : ''}><FeedText item={f} /></li>
        ))}
        {!feed.length && <li className="lb-muted">Scores land when each shot clock runs out</li>}
      </ul>
      </>}

      {onLeave && <button type="button" className="lb-textbtn lb-leave" onClick={onLeave}>Leave match</button>}
    </section>
  );
}

export const LEADERBOARD_CSS = `
.lb { background:${C.black}; color:${C.cream}; font-family:'Space Mono', monospace; padding:18px 18px 14px; box-sizing:border-box; }
.lb-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.lb-title { margin:0 auto 0 0; display:flex; align-items:center; gap:10px; font:400 24px/1 'Archivo Black', sans-serif; color:${C.gold}; }
.lb-chip { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:700; padding:5px 10px; border:2px solid ${C.cream}; color:${C.cream}; }
.lb-chip-live { border-color:${C.orange}; }
.lb-chip-final { background:${C.gold}; color:${C.black}; border-color:${C.gold}; }
.lb-final { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; flex-wrap:wrap; }
.lb-again { font:400 14px 'Archivo Black', sans-serif; padding:8px 14px; color:${C.black}; background:${C.orange}; border:2px solid ${C.black}; box-shadow:3px 3px 0 ${C.gold}; cursor:pointer; }
.lb-again:active { transform:translate(2px,2px); box-shadow:1px 1px 0 ${C.gold}; }
.lb-again:focus-visible { outline:2px solid ${C.gold}; outline-offset:2px; }
.lb-livedot { width:10px; height:10px; border-radius:50%; background:${C.orange}; display:inline-block; flex:none; animation:lb-pulse 1.2s ease-in-out infinite; }
.lb-textbtn { background:none; border:0; color:${C.gold}; font:700 13px 'Space Mono', monospace; text-decoration:underline; cursor:pointer; padding:4px; }
.lb-textbtn:focus-visible { outline:2px solid ${C.gold}; outline-offset:2px; }

.lb-status { margin:14px 0 8px; min-height:28px; font-size:14px; display:flex; align-items:center; }
.lb-shotclock { display:flex; align-items:center; gap:8px; width:100%; font:400 17px 'Archivo Black', sans-serif; color:${C.orange}; animation:lb-shake .35s ease-in-out 2; }
.lb-shotbar { flex:1; height:12px; background:${C.brown}; border:2px solid ${C.orange}; }
.lb-shotbar > div { height:100%; background:${C.orange}; transform-origin:left; animation:lb-drain linear forwards; }

.lb-toast-slot { min-height:46px; }
.lb-toast { display:inline-flex; align-items:center; gap:8px; padding:8px 14px; font:400 16px 'Archivo Black', sans-serif; color:${C.black}; background:${C.gold}; border:2px solid ${C.black}; box-shadow:3px 3px 0 ${C.orange}; animation:lb-toast .5s cubic-bezier(.34,1.56,.64,1); }
.lb-toast.is-top { background:${C.orange}; box-shadow:3px 3px 0 ${C.gold}; }
.lb-toast.is-down { background:${C.cream}; box-shadow:3px 3px 0 #ff8a5c; }
.lb-toast.is-miss { background:${C.cream}; box-shadow:3px 3px 0 ${C.brown}; }

.lb-rows { list-style:none; margin:6px 0 0; padding:0; position:relative; }
.lb-row { display:grid; grid-template-columns:34px 36px 1fr 3em auto; align-items:center; gap:12px; padding:10px 12px; margin-bottom:6px; font-size:17px; background:#1c1510; border-left:4px solid ${C.brown}; }
.lb-row.is-podium { background:#241a10; }
.lb-row.p1 { border-left-color:#ffd400; } .lb-row.p2 { border-left-color:#d8d8d8; } .lb-row.p3 { border-left-color:#d08a4a; }
.lb-row.is-me { background:${C.orange}; color:${C.black}; font-weight:700; border-left-color:${C.black}; box-shadow:0 0 0 2px ${C.black}, 0 0 0 4px ${C.orange}; margin:8px 4px 10px; }
.lb-rank { display:flex; justify-content:center; font:400 18px 'Archivo Black', sans-serif; font-variant-numeric:tabular-nums; }
.lb-avatar { width:36px; height:36px; border-radius:50%; display:grid; place-items:center; font:400 16px 'Archivo Black', sans-serif; color:${C.black}; border:2px solid ${C.black}; }
.lb-name { display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden; white-space:nowrap; }
.lb-fire { display:inline-block; animation:lb-flicker .6s ease-in-out infinite alternate; }
.lb-tagyou { font-size:11px; padding:2px 6px; background:${C.black}; color:${C.orange}; vertical-align:2px; }
.lb-delta { display:inline-flex; align-items:center; justify-content:flex-end; gap:2px; font-size:13px; font-weight:700; }
.lb-delta.up { color:#8be36b; } .lb-delta.down { color:#ff8a5c; }
.lb-row.is-me .lb-delta.up, .lb-row.is-me .lb-delta.down { color:${C.black}; }
.lb-pts { text-align:right; font:400 20px 'Archivo Black', sans-serif; font-variant-numeric:tabular-nums; min-width:3em; }
.lb-pending { margin-left:6px; font:700 13px 'Space Mono', monospace; color:${C.gold}; }
.lb-row.is-me .lb-pending { color:${C.black}; }
/* long list (fullscreen top 50): your row stays pinned while the list scrolls */
.lb.is-long .lb-row.is-me { position:sticky; top:4px; bottom:4px; z-index:2; }
.lb.is-long .lb-row { padding:6px 12px; margin-bottom:4px; }
.lb.is-long .lb-avatar { width:30px; height:30px; font-size:14px; }
.icon { flex:none; display:block; }
.ic-fire { color:#ff7a1a; } .ic-crown { color:#ffd400; } .ic-ball { color:${C.orange}; }
.lb-row.is-me .ic-fire, .lb-row.is-me .ic-crown { color:${C.black}; }
.lb-feed-line { display:inline-flex; align-items:center; gap:8px; }
.lb-toast-delta { display:inline-flex; align-items:center; gap:2px; }
.lb-gap { display:flex; justify-content:center; gap:4px; padding:2px 0 6px; }
.lb-gap span { width:6px; height:6px; background:${C.brown}; }

.lb-feed-head { margin-top:14px; font:400 14px 'Archivo Black', sans-serif; color:${C.gold}; }
.lb-feed { list-style:none; margin:6px 0 0; padding:0; font-size:14px; min-height:6.4em; }
.lb-feed li { padding:3px 0; animation:lb-in .3s ease-out; }
.lb-feed li.is-me, .lb-you { color:${C.gold}; }
.lb-muted { opacity:.65; }
.lb-leave { display:block; margin:4px 0 0 auto; opacity:.8; }

.lb-strip { display:flex; align-items:center; gap:12px; height:52px; box-sizing:border-box; padding:0 14px; background:${C.black}; color:${C.cream}; font:15px 'Space Mono', monospace; }
.lb-strip.is-shot { background:${C.orange}; color:${C.black}; }
.lb-strip.is-shot .lb-strip-rank, .lb-strip.is-shot .lb-strip-rank small { color:${C.black}; }
.lb-strip-rank { font:400 20px/1 'Archivo Black', sans-serif; color:${C.gold}; }
.lb-strip-rank small { font:12px 'Space Mono', monospace; color:${C.cream}; opacity:.7; }
.lb-strip-pts { font-weight:700; white-space:nowrap; }
.lb-strip-feed { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:right; animation:lb-in .3s ease-out; }

@keyframes lb-pulse { 50% { opacity:.3; } }
@keyframes lb-drain { from { transform:scaleX(1); } to { transform:scaleX(0); } }
@keyframes lb-toast { from { opacity:0; transform:translateY(8px) scale(.8) rotate(-3deg); } to { opacity:1; transform:none; } }
@keyframes lb-in { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
@keyframes lb-shake { 25% { transform:translateX(-2px); } 75% { transform:translateX(2px); } }
@keyframes lb-flicker { from { transform:scale(1) rotate(-6deg); } to { transform:scale(1.2) rotate(6deg); } }
@media (prefers-reduced-motion: reduce) {
  .lb-livedot, .lb-feed li, .lb-strip-feed, .lb-toast, .lb-shotclock, .lb-fire { animation:none; }
}
`;