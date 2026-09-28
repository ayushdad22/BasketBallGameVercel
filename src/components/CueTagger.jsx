import { useEffect, useRef, useState } from 'react';
import { normalizeCues } from '../lib/useBasketCues.js';

/**
 * Basket tagger — open the app with ?tag in the URL.
 * Watch the video and press B (or the button) the moment the ball drops
 * through the net. Save downloads <videoId>.json; drop it into public/cues/.
 * (If the old Express server is running, Save writes the file there directly.)
 */

const REACTION_S = 0.25;   // subtract typical key-press lag from each mark

const fmt = (t) => {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
};

export default function CueTagger({ videoRef, videoId, initial, onSaved }) {
  const [marks, setMarks] = useState(() => normalizeCues(initial));
  const [status, setStatus] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [now, setNow] = useState(0);
  const marksRef = useRef(marks);
  marksRef.current = marks;

  useEffect(() => { setMarks(normalizeCues(initial)); }, [initial]);

  useEffect(() => {
    const id = setInterval(() => setNow(videoRef.current?.currentTime ?? 0), 200);
    return () => clearInterval(id);
  }, [videoRef]);

  const mark = () => {
    const v = videoRef.current;
    if (!v) return;
    const t = Math.max(0, Math.round((v.currentTime - REACTION_S) * 10) / 10);
    setMarks((m) => [...m.filter((x) => Math.abs(x - t) > 0.5), t].sort((a, b) => a - b));
    setStatus('');
  };
  const undo = () => setMarks((m) => m.slice(0, -1));
  const remove = (t) => setMarks((m) => m.filter((x) => x !== t));
  const jump = (t) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, t - 2);
    v.play();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); mark(); }
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const save = async () => {
    setStatus('Saving…');
    try {
      const r = await fetch(`/cues/${videoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baskets: marksRef.current }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Server returned ${r.status}`);
      setStatus(`Saved ${data.count} baskets to public/cues/${videoId}.json`);
      onSaved?.({ videoId, baskets: marksRef.current });
    } catch (err) {
      // No server (e.g. Vercel or a plain dev server): hand over the file instead.
      download();
      setStatus(`No save server here, so the file was downloaded instead. Put ${videoId}.json in public/cues/ and redeploy.`);
    }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify({ videoId, baskets: marks }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${videoId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="ct" aria-label="Basket tagger">
      <div className="ct-head">
        <h2 className="ct-title">Tag baskets{videoId ? <small className="ct-id">{videoId}</small> : <small className="ct-id">waiting for video…</small>}</h2>
        <span className="ct-now">{fmt(now)}</span>
        <button type="button" className="ct-collapse" onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}>{collapsed ? 'Show' : 'Hide'}</button>
      </div>
      {!collapsed && <>
      <p className="ct-help">Press <kbd>B</kbd> as the ball drops through the net. <kbd>Z</kbd> removes the last mark. Click a time to replay it.</p>
      <div className="ct-actions">
        <button type="button" className="ss-btn ss-btn-hot" onClick={mark}>Mark basket</button>
        <button type="button" className="ss-btn" onClick={undo} disabled={!marks.length}>Undo</button>
        <button type="button" className="ss-btn" onClick={save} disabled={!videoId}>Save</button>
        <button type="button" className="ss-btn" onClick={download} disabled={!marks.length}>Download JSON</button>
      </div>
      {status && <p className="ct-status" role="status">{status}</p>}
      <ol className="ct-list">
        {marks.map((t, i) => (
          <li key={t}>
            <button type="button" className="ct-time" onClick={() => jump(t)}>#{i + 1} {fmt(t)}</button>
            <button type="button" className="ct-del" onClick={() => remove(t)} aria-label={`Delete mark at ${fmt(t)}`}>×</button>
          </li>
        ))}
        {!marks.length && <li className="ct-empty">No baskets marked yet</li>}
      </ol>
      </>}
    </section>
  );
}

export const CUE_TAGGER_CSS = `
.ct { margin-top:16px; padding:16px; background:#fff3dd; border:3px solid #0d0d0d; box-shadow:4px 4px 0 #0d0d0d; color:#0d0d0d; }
.ct-head { display:flex; align-items:baseline; gap:12px; }
.ct-head .ct-title { margin-right:auto; }
.ct-collapse { background:none; border:0; font:700 12px 'Space Mono', monospace; text-decoration:underline; cursor:pointer; color:#0d0d0d; padding:2px 4px; }
.ct-title { margin:0; font:400 18px 'Archivo Black', sans-serif; }
.ct-id { display:block; font:400 11px 'Space Mono', monospace; opacity:.7; margin-top:2px; }
.ct-now { font:700 18px 'Space Mono', monospace; font-variant-numeric:tabular-nums; }
.ct-help { margin:6px 0 12px; font-size:13px; line-height:1.5; }
.ct-help kbd { font:700 12px 'Space Mono', monospace; padding:1px 6px; border:2px solid #0d0d0d; background:#f3d6a4; }
.ct-actions { display:flex; flex-wrap:wrap; gap:8px; }
.ct-status { margin:10px 0 0; font-size:13px; font-weight:700; }
.ct-list { list-style:none; margin:12px 0 0; padding:0; display:flex; flex-wrap:wrap; gap:6px; max-height:180px; overflow-y:auto; }
.ct-list li { display:flex; border:2px solid #0d0d0d; background:#f3d6a4; }
.ct-time, .ct-del { background:none; border:0; font:700 12px 'Space Mono', monospace; padding:4px 8px; cursor:pointer; color:#0d0d0d; }
.ct-del { border-left:2px solid #0d0d0d; }
.ct-time:focus-visible, .ct-del:focus-visible { outline:2px solid #ff6a00; }
.ct-empty { border:0 !important; background:none !important; font-size:13px; opacity:.7; }
`;