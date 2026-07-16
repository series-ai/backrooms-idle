import { createRoot } from 'react-dom/client';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { GameController } from '../game/GameController';
import { App } from './App';
import './tokens.css';
import './app.css';

/** SDK handshake with a standalone fallback (mirrors the old bootstrap). */
async function waitForSdk(): Promise<void> {
  await Promise.race([
    RundotGameAPI.initializeAsync(),
    new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  ]);
}

async function bootstrap(): Promise<void> {
  try {
    await waitForSdk();
  } catch (error) {
    console.error('[Main] SDK init failed, booting standalone:', error);
  }

  // Host safe-area beats the CSS env() fallback when the SDK reports it.
  try {
    const insets = RundotGameAPI.system.getSafeArea();
    const root = document.documentElement;
    root.style.setProperty('--safe-top', `${insets.top}px`);
    root.style.setProperty('--safe-bottom', `${insets.bottom}px`);
  } catch {
    // Standalone browser — env(safe-area-inset-*) covers it.
  }

  const controller = new GameController();
  await controller.boot();

  // Dev console handle (mock wallet: RUN.iap.hardCurrency = N).
  (globalThis as Record<string, unknown>).RUN = RundotGameAPI;

  const el = document.getElementById('app');
  if (!el) throw new Error('#app missing');
  // No long-press context menus in a game (image-save sheet, text selection).
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  createRoot(el).render(<App game={controller} />);

  RundotGameAPI.analytics.recordCustomEvent('game_loaded');
  RundotGameAPI.log('[Main] Backrooms Idle started (React UI)');
}

void bootstrap();
