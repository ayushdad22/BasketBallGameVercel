// The one video the demo plays, through YouTube's embedded player (no server
// needed). Basket times live in public/cues/<youtubeId>.json; make them with
// ?tag (see components/CueTagger.jsx).
//
// The video's owner must allow embedding. Official league highlights usually do.
//
// To try another video without editing this file, add ?v=<video id> to the
// page URL, e.g. /?v=5j_R6ilQWiQ&tag
export const DEMO_VIDEO = {
  youtubeId: 'qK-r8xideiQ',
  title: 'Germany vs Serbia, FIBA Basketball World Cup 2023 Final highlights',
  channel: 'FIBA',
};

// Other FIBA World Cup 2023 full-game highlights from the same channel:
//   5j_R6ilQWiQ  USA vs Germany
//   92KsxvAmbO8  Lithuania vs Slovenia
//   TL9X26ix_rc  USA vs Canada

export function demoFromLocation(base = DEMO_VIDEO) {
  if (typeof window === 'undefined') return base;
  const v = new URLSearchParams(window.location.search).get('v');
  if (!v || !/^[\w-]{6,32}$/.test(v)) return base;
  return { ...base, youtubeId: v, title: `YouTube video ${v}`, channel: 'Hoops Live' };
}