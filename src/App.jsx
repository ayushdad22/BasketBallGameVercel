import StreamStage from './components/StreamStage.jsx';

// StreamStage handles every layout itself (desktop, phone portrait/landscape,
// fullscreen), so the app is just the stage filling the window.
export default function App() {
  return (
    <div className="app">
      <StreamStage />
    </div>
  );
}
