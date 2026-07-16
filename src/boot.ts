/**
 * PHASER PURGE (see MIGRATION.md): the React/DOM UI is the default.
 * `?legacy=1` boots the condemned Phaser build for side-by-side parity checks
 * only — it gets deleted the moment the React UI reaches parity.
 */
if (new URLSearchParams(location.search).has('legacy')) {
  import('./main');
} else {
  import('./ui-react/main');
}
