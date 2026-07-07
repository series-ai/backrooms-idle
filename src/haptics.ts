import RundotGameAPI from '@series-inc/rundot-game-sdk/api';

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

// The user's haptics preference lives on GameState (persisted in the save);
// the scene binds a getter at boot so every call site stays a one-liner.
let isEnabled: () => boolean = () => true;

export function bindHapticsSetting(check: () => boolean): void {
  isEnabled = check;
}

/** Fire a haptic pulse — silently skipped when the user has haptics off. */
export function haptic(style: HapticStyle): void {
  if (!isEnabled()) return;
  RundotGameAPI.triggerHapticAsync(style as never);
}
