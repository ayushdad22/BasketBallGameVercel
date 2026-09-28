import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Plain static site: no backend, so no dev proxies. `vite build` → dist/,
// which is what Vercel serves.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
