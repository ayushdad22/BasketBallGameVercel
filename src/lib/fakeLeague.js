// ─────────────────────────────────────────────────────────────────────────────
// fakeLeague — a scripted "online" match: 51 bot shooters + the real player.
//
// A round = one shooting window. A window opens when a basket is made in the
// video (cue JSON or the Simulate button) and lasts SHOT_WINDOW_MS. When it
// closes (after SHOT_GRACE_MS for balls still in the air):
//   1. each bot adds the next value from its pre-generated script
//   2. the real player adds the points they actually scored in that window
//   3. everyone is re-sorted and re-ranked (previous rank kept for ▲/▼)
//
// Scripts are generated once per match from a seeded RNG, so a match is fully
// reproducible from its seed. Bots have a base skill plus "hot" / "cold" spells
// so names climb into (and drop out of) the visible top 5 over time.
// ─────────────────────────────────────────────────────────────────────────────

export const SHOT_WINDOW_MS = 3000;   // how long the game is on screen per basket
export const SHOT_GRACE_MS = 900;     // shots still in flight at the buzzer still count
export const FIELD_SIZE = 51;          // bots; the player makes it 52
export const POINTS_PER_MAKE = 2;

const SCRIPT_LEN = 600;                // rounds per script; loops after
const HEAD_START_COUNT = Math.round(FIELD_SIZE * 0.6);  // bots already on the board → player debuts ~60% down
const HEAD_START_MAX = 64;             // leader's head start; keep it catchable
const SKILL_MIN = 0.18, SKILL_MAX = 0.60;

const NAMES = [
  'Alex', 'Sarah', 'Mike', 'Emma', 'Leo', 'Jack', 'Olivia', 'Noah', 'Mia', 'Liam',
  'Zoe', 'Ethan', 'Ava', 'Lucas', 'Chloe', 'Mateo', 'Priya', 'Omar', 'Hana', 'Diego',
  'Nia', 'Kai', 'Sofia', 'Ryan', 'Tom', 'David', 'Grace', 'Arjun', 'Yuki', 'Jamal',
  'Ella', 'Finn', 'Aisha', 'Marco', 'Lena', 'Sam', 'Ivy', 'Theo', 'Maya', 'Ben',
  'Rosa', 'Kofi', 'Nora', 'Luca', 'Amara', 'Jonah', 'Fatima', 'Oscar', 'Mei', 'Caleb',
  'Ines', 'Ravi', 'Tariq', 'Clara', 'Dev', 'Sienna', 'Hugo', 'Leila', 'Owen', 'Keira',
  'Zara', 'Elias', 'Naomi', 'Felix', 'Ruby', 'Andre', 'Layla', 'Jonas', 'Isla', 'Malik',
  'Freya', 'Tomas', 'Anya', 'Rafael', 'Cora', 'Idris', 'Talia', 'Emil', 'Nadia', 'Silas',
  'Iris', 'Kian', 'Lucia', 'Bruno', 'Esme', 'Ahmed', 'Willow', 'Enzo', 'Selin', 'Joel',
  'Aria', 'Kenji', 'Dana', 'Luis', 'Mira', 'Ezra', 'Jada', 'Nico', 'Paige', 'Samir',
  'Elsa', 'Rohan', 'Tessa', 'Ivan', 'Chiara', 'Zayn', 'Vera', 'Arlo', 'Imani', 'Pablo',
  'Linnea', 'Reza', 'Gia', 'Otto', 'Asha', 'Cyrus', 'Noor', 'Milo', 'Beatriz', 'Kaito',
  'Hazel', 'Dante', 'Leah', 'Axel', 'June', 'Soren', 'Amira', 'Rhys', 'Luna', 'Tobias',
  'Keisha', 'Aiden', 'Yara', 'Marcus', 'Sana', 'Gabe', 'Nell', 'Jin', 'Maeve', 'Levi',
];

// Small, fast, seedable PRNG.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// One bot's per-round gains. 1 shot per window (sometimes 2), mostly 2-pointers,
// occasional 3s. Hot spells (+28%) and cold spells (−22%) last 10–40 rounds.
function buildScript(rng, skill) {
  const out = new Array(SCRIPT_LEN);
  let phase = 0, phaseLeft = 0;
  for (let i = 0; i < SCRIPT_LEN; i++) {
    if (phaseLeft <= 0) {
      const r = rng();
      phase = r < 0.18 ? 0.28 : r < 0.36 ? -0.22 : 0;
      phaseLeft = 10 + Math.floor(rng() * 30);
    }
    phaseLeft--;
    const p = clamp(skill + phase, 0.05, 0.92);
    const shots = rng() < 0.2 ? 2 : 1;
    let gain = 0;
    for (let s = 0; s < shots; s++) if (rng() < p) gain += rng() < 0.12 ? 3 : 2;
    out[i] = gain;
  }
  return out;
}

// Sort by score (desc). Ties: the real player first (feels fair), then bot id.
function rankPlayers(players, prevRanks = {}) {
  const sorted = [...players].sort((a, b) =>
    b.score - a.score ||
    (a.isPlayer ? -1 : b.isPlayer ? 1 : 0) ||
    a.order - b.order);
  return sorted.map((p, i) => ({
    ...p,
    rank: i + 1,
    prevRank: prevRanks[p.id] ?? i + 1,
  }));
}

export function createLeague(playerName, seed = Date.now()) {
  const rng = mulberry32(seed);
  const me = playerName.trim();
  const names = shuffle(NAMES, rng)
    .filter((n) => n.toLowerCase() !== me.toLowerCase())
    .slice(0, FIELD_SIZE);

  // Best shooters get the biggest head starts.
  const skills = names.map(() => SKILL_MIN + rng() * (SKILL_MAX - SKILL_MIN)).sort((a, b) => b - a);

  const bots = names.map((name, i) => {
    const headStart = i < HEAD_START_COUNT
      ? Math.max(2, Math.round(HEAD_START_MAX * (1 - i / HEAD_START_COUNT)) + Math.floor(rng() * 6))
      : 0;
    return {
      id: `bot-${i}`, order: i, name, isPlayer: false,
      score: headStart, lastGain: 0, streak: 0,
      skill: skills[i], script: buildScript(rng, skills[i]),
    };
  });

  const players = [...bots, { id: 'you', order: -1, name: me, isPlayer: true, score: 0, lastGain: 0, streak: 0 }];
  return { seed, round: 0, players, ranked: rankPlayers(players) };
}

// Close one shooting window.
export function applyRound(league, playerPoints) {
  const r = league.round;
  const players = league.players.map((p) => {
    const gain = p.isPlayer ? playerPoints : p.script[r % SCRIPT_LEN];
    return gain
      ? { ...p, score: p.score + gain, lastGain: gain, streak: (p.streak || 0) + 1 }
      : { ...p, lastGain: 0, streak: 0 };
  });
  const prev = Object.fromEntries(league.ranked.map((p) => [p.id, p.rank]));
  return { ...league, round: r + 1, players, ranked: rankPlayers(players, prev) };
}

// What the "live feed" shows during the current window: a few bots who will
// score this round, biased toward the leaders and big gains, at random times.
export function roundHighlights(league, windowMs = SHOT_WINDOW_MS, max = 3) {
  const r = league.round;
  const rankOf = Object.fromEntries(league.ranked.map((p) => [p.id, p.rank]));
  const scorers = league.players
    .filter((p) => !p.isPlayer && p.script[r % SCRIPT_LEN] > 0)
    .map((p) => {
      const gain = p.script[r % SCRIPT_LEN];
      const weight = gain + (rankOf[p.id] <= 10 ? 3 : 0) + Math.random() * 2;
      return { name: p.name, gain, rank: rankOf[p.id], weight, fire: (p.streak || 0) + 1 >= 3 };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, max);
  return scorers.map((s) => ({ ...s, at: 250 + Math.random() * (windowMs - 600) }));
}

// Rows to display: top N (5 normally, 50 in fullscreen), the player (unless
// already in the top N), last place. `gap` markers go wherever ranks skip.
export function visibleRows(ranked, topN = 5) {
  if (!ranked?.length) return [];
  const picked = ranked.slice(0, topN);
  const me = ranked.find((p) => p.isPlayer);
  const last = ranked[ranked.length - 1];
  if (me && me.rank > topN) picked.push(me);
  if (last.rank > topN && last.id !== me?.id) picked.push(last);

  const rows = [];
  picked.forEach((p, i) => {
    if (i > 0 && p.rank - picked[i - 1].rank > 1) rows.push({ gap: true, key: `gap-${i}` });
    rows.push({ gap: false, key: p.id, p });
  });
  return rows;
}

// One short, punchy line about what just happened to the player this round.
export function describeRound(before, after, playerPoints) {
  const meB = before.ranked.find((p) => p.isPlayer);
  const meA = after.ranked.find((p) => p.isPlayer);
  const was = Object.fromEntries(before.ranked.map((p) => [p.id, p.rank]));
  const bots = after.ranked.filter((p) => !p.isPlayer);
  const passed = bots.filter((p) => was[p.id] < meB.rank && p.rank > meA.rank);
  const passedBy = bots.filter((p) => was[p.id] > meB.rank && p.rank < meA.rank);
  const climb = meB.rank - meA.rank;

  if (meA.rank === 1 && meB.rank !== 1) return { kind: 'top', text: "You're #1!" };
  if (meA.rank <= 5 && meB.rank > 5) return { kind: 'top', text: "You're in the top 5!" };
  if (passed.length === 1) return { kind: 'up', text: `You passed ${passed[0].name}!`, delta: climb };
  if (passed.length > 1) return { kind: 'up', text: `You passed ${passed.length} players!`, delta: climb };
  if (passedBy.length === 1) return { kind: 'down', text: `${passedBy[0].name} passed you`, delta: climb };
  if (passedBy.length > 1) return { kind: 'down', text: `${passedBy.length} players passed you`, delta: climb };
  if (playerPoints > 0) return { kind: 'up', text: `+${playerPoints} this round` };
  return { kind: 'miss', text: 'No points that round' };
}