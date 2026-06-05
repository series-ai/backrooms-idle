import { defineConfig } from 'vite';
import { rundotGameLibrariesPlugin } from "@series-inc/rundot-game-sdk/vite";

export default defineConfig({
  plugins: [rundotGameLibrariesPlugin()],
  base: "./",
  server: {
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
