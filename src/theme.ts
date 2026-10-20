import type { ITheme } from '@xterm/xterm';
import type { Command } from './shell/types';

type Preference = 'system' | 'light' | 'dark';

// Preserve the template's exact 256-color light palette. Override only the
// colors used by the renderer and prompt when switching to a dark background.
function extendedPalette(dark: boolean): string[] {
  const colors: string[] = [];
  const levels = [0, 95, 135, 175, 215, 255];
  for (let i = 0; i < 216; i++) {
    colors.push('#' + [levels[Math.floor(i / 36)], levels[Math.floor(i / 6) % 6], levels[i % 6]]
      .map(value => value.toString(16).padStart(2, '0')).join(''));
  }
  for (let i = 0; i < 24; i++) colors.push('#' + (8 + i * 10).toString(16).padStart(2, '0').repeat(3));
  if (dark) {
    for (const [index, color] of Object.entries({ 33: '#8ab4f8', 62: '#b6a5ed', 242: '#a0a8b5', 244: '#929aa7', 252: '#717c8b' })) {
      colors[Number(index) - 16] = color;
    }
  }
  return colors;
}

/** Appearance is controlled by a shell command, without adding page chrome. */
export function setupTheme(apply: (theme: ITheme) => void): Command {
  const media = matchMedia('(prefers-color-scheme: dark)');
  let preference: Preference = 'system';
  try {
    const saved = localStorage.getItem('wenjun-theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch {}
  const update = () => {
    const dark = preference === 'dark' || (preference === 'system' && media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    apply({
      background: dark ? '#191c22' : '#fafafa',
      foreground: dark ? '#d9dfe8' : '#2e3338',
      cursor: dark ? '#d9dfe8' : '#4a5158',
      selectionBackground: dark ? '#414d66' : '#d0d7de',
      extendedAnsi: extendedPalette(dark),
    });
  };
  media.addEventListener('change', () => { if (preference === 'system') update(); });
  update();
  return {
    name: 'theme',
    description: 'theme [light|dark|system] — change appearance',
    async run(ctx, argv) {
      const value = argv[1];
      if (value === undefined) { ctx.stdout.print('Theme: ' + preference + '. Usage: theme light|dark|system'); return; }
      if (value !== 'light' && value !== 'dark' && value !== 'system') {
        ctx.stdout.print('Usage: theme light|dark|system'); return;
      }
      preference = value;
      try { localStorage.setItem('wenjun-theme', preference); } catch {}
      update();
      ctx.stdout.print('Theme: ' + preference);
    },
  };
}
