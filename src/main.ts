import Phaser from 'phaser';
import GameScene from './scenes/GameScene';
import { LAYOUT } from './config';
import './style.css';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';

async function bootstrap(): Promise<void> {
  try {
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
