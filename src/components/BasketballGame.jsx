/**
 * BasketballGame — the wall-hoop game (public/wall-game.html) in an iframe.
 * Presentational only: fills its container.
 */
export default function BasketballGame({ src = '/wall-game.html', style }) {
  return (
    <iframe
      src={src}
      title="Hoop game"
      allow="autoplay"
      style={{ width: '100%', height: '100%', border: 0, display: 'block', ...style }}
    />
  );
}
