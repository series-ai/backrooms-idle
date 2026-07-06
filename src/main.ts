import Phaser from 'phaser';
import GameScene from './scenes/GameScene';
import { LAYOUT, initLayout } from './config';
import './style.css';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';

interface Insets { top: number; right: number; bottom: number; left: number }

/**
 * Wait for the SDK handshake with the RUN host — system.* (safe area, device
 * metrics) throws until it completes. A dead or absent host must not brick
 * the game, so give up after a few seconds and boot with fallback metrics.
 */
async function waitForSdk(): Promise<void> {
  await Promise.race([
    RundotGameAPI.initializeAsync(),
    new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  ]);
}

/** Device notch + host chrome padding; zero when running outside the host. */
function readSafeArea(): Insets {
  try {
    return RundotGameAPI.system.getSafeArea();
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

/** Viewport size, preferring the SDK's report over window measurements. */
function readViewport(): { width: number; height: number } {
  try {
    const { viewportSize } = RundotGameAPI.system.getDevice();
    if (viewportSize.width > 0 && viewportSize.height > 0) return viewportSize;
  } catch {
    // SDK not ready (local dev) — fall through to window metrics.
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

async function bootstrap(): Promise<void> {
  try {
    try {
      await waitForSdk();
    } catch (error) {
      console.error('[Main] SDK init failed, booting standalone:', error);
    }

    // Keep the playfield inside the safe rect so the header isn't under the
    // host toolbar and the tab row isn't under the home indicator. Insets are
    // static for the session (per SDK docs), so applying them once is enough.
    const insets = readSafeArea();
    const app = document.getElementById('app') as HTMLElement;
    app.style.inset = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`;

    // Match the internal resolution to the safe viewport's aspect ratio so
    // FIT fills it edge to edge (no letterbox bars on phones).
    const viewport = readViewport();
    initLayout(
      viewport.width - insets.left - insets.right,
      viewport.height - insets.top - insets.bottom,
    );

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: LAYOUT.GAME_WIDTH,
      height: LAYOUT.GAME_HEIGHT,
      parent: 'app',
      backgroundColor: '#111111',
      scene: GameScene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    new Phaser.Game(config);
    RundotGameAPI.analytics.recordCustomEvent('game_loaded');
    RundotGameAPI.log('[Main] Backrooms Idle started');
  } catch (error) {
    console.error('[Main] Bootstrap error:', error);
  }
}

bootstrap();
