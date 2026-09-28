import { useState } from 'react';

const STORAGE_KEY = 'hoops.playerName';
const MAX_LEN = 16;

function savedName() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

/** Covers the stage until the player enters a name. */
export default function NameEntry({ onJoin }) {
  const [name, setName] = useState(savedName);
  const clean = name.trim().slice(0, MAX_LEN);

  const join = (e) => {
    e.preventDefault();
    if (!clean) return;
    try { localStorage.setItem(STORAGE_KEY, clean); } catch {}
    onJoin(clean);
  };

  return (
    <div className="ne-backdrop" role="dialog" aria-modal="true" aria-labelledby="ne-title">
      <form className="ne-card" onSubmit={join}>
        <h2 id="ne-title" className="ne-title">Join the match</h2>
        <p className="ne-copy">52 shooters, 3-second rounds. Every basket you make is 2 points.</p>
        <label className="ne-label" htmlFor="ne-name">Your name</label>
        <input
          id="ne-name"
          className="ne-input"
          value={name}
          maxLength={MAX_LEN}
          autoComplete="nickname"
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <button className="ne-btn" type="submit" disabled={!clean}>Join match</button>
      </form>
    </div>
  );
}

export const NAME_ENTRY_CSS = `
.ne-backdrop { position:absolute; inset:0; z-index:50; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(13,13,13,.78); }
.ne-card { width:min(340px, 100%); background:#f3d6a4; color:#3b2a1a; border:4px solid #0d0d0d; box-shadow:6px 6px 0 #ff6a00; padding:20px; font-family:'Space Mono', monospace; }
.ne-title { margin:0 0 6px; font:400 22px/1.1 'Archivo Black', sans-serif; color:#0d0d0d; }
.ne-copy { margin:0 0 16px; font-size:13px; line-height:1.5; }
.ne-label { display:block; font-size:12px; font-weight:700; margin-bottom:4px; }
.ne-input { width:100%; box-sizing:border-box; padding:10px; font:700 16px 'Space Mono', monospace; border:3px solid #0d0d0d; background:#fff; color:#0d0d0d; }
.ne-input:focus-visible { outline:3px solid #ff6a00; outline-offset:0; }
.ne-btn { margin-top:12px; width:100%; padding:12px; font:400 15px 'Archivo Black', sans-serif; background:#ff6a00; color:#0d0d0d; border:3px solid #0d0d0d; cursor:pointer; }
.ne-btn:disabled { opacity:.5; cursor:not-allowed; }
.ne-btn:focus-visible { outline:3px solid #0d0d0d; outline-offset:2px; }
`;