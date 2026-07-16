import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rundotGameLibrariesPlugin } from "@series-inc/rundot-game-sdk/vite";

export default defineConfig({
  plugins: [react(), rundotGameLibrariesPlugin()],
  base: "./",
  server: {
    // Listen on the LAN so phones on the same wifi can hit the dev server
    // (mobile-first QA is the whole point — see MIGRATION.md).
    host: true,
    allowedHosts: true,
  },
  esbuild: {
    target: "es2022",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2022",
    },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ["phaser"],
        },
      },
    },
  },
});
