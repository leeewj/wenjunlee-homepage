// Terminal abstraction over xterm.js. Owns the xterm instance + addons and exposes
// two modes:
//   - shell mode: raw input via onShellData (the shell implements line editing)
//   - tui mode:   takeOver() hands an app exclusive key + draw control
//
// Uses xterm's default DOM renderer (no canvas/webgl addon): on resize it updates
// the DOM row-by-row instead of clearing a whole canvas, so window-dragging
// doesn't flicker. OSC 8 hyperlinks still work.
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { displayWidth } from './ansi';
import '@xterm/xterm/css/xterm.css';

export interface KeyEvent {
  key: string;
  domEvent: KeyboardEvent;
}
export interface TermSize {
  cols: number;
  rows: number;
}

/** Control surface handed to a TUI app while it owns the terminal. */
export interface TuiSession {
  readonly cols: number;
  readonly rows: number;
  write(s: string): void;
  clear(): void;
  onKey(cb: (e: KeyEvent) => void): () => void;
  onResize(cb: (size: TermSize) => void): () => void;
  /** Return control to the shell. */
  release(): void;
}

/** If `target` is an internal same-page link, return its command slug; else null. */
function internalPage(target: string): string | null {
  if (target.startsWith('#')) return target.slice(1) || null;
  try {
    const u = new URL(target, location.href);
    if (u.origin === location.origin && u.pathname === location.pathname && u.hash) {
      return u.hash.slice(1) || null;
    }
  } catch {
    /* not a url */
  }
  return null;
}

export class Term {
  readonly xterm: Terminal;
  private fitAddon = new FitAddon();
  private mode: 'shell' | 'tui' = 'shell';
  private shellDataCb?: (d: string) => void;
  private tuiKeyCb?: (e: KeyEvent) => void;
  private tuiResizeCb?: (size: TermSize) => void;
  private cleanups: Array<() => void> = [];
  private readonly onNavigate?: (cmd: string) => void;
  private readonly fontFamily =
    '"Maple Mono", "Fira Code", "JetBrains Mono", "SFMono-Regular", ui-monospace, Menlo, Consolas, ' +
    '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", ' +
    '"Apple Color Emoji", "Segoe UI Emoji", monospace';
  private measureCtx?: CanvasRenderingContext2D;

  constructor(host: HTMLElement, onNavigate?: (cmd: string) => void) {
    this.onNavigate = onNavigate;
    this.xterm = new Terminal({
      fontFamily: this.fontFamily,
      fontSize: 16,
      lineHeight: 1.0,
      letterSpacing: 0,
      cursorBlink: true,
      allowProposedApi: true,
      linkHandler: {
        allowNonHttpProtocols: true,
        activate: (_event, target) => {
          // Internal same-page links go through onNavigate (pushState + run);
          // everything else opens in a new tab.
          const page = internalPage(target);
          if (page !== null) {
            this.onNavigate?.(page);
            return;
          }
          window.open(target, '_blank', 'noopener');
        },
      },
      theme: {
        background: '#fafafa',
        foreground: '#2e3338',
        cursor: '#4a5158',
        selectionBackground: '#d0d7de',
      },
    });

    this.xterm.loadAddon(this.fitAddon);
    this.xterm.open(host);

    try {
      // Wide-character (CJK / emoji) width handling.
      this.xterm.loadAddon(new Unicode11Addon());
      this.xterm.unicode.activeVersion = '11';
    } catch (e) {
      console.warn('unicode11 addon unavailable', e);
    }

    this.fit();
    const ro = new ResizeObserver(() => this.fit());
    ro.observe(host);
    this.cleanups.push(() => ro.disconnect());

    const d1 = this.xterm.onData((d) => {
      if (this.mode === 'shell') this.shellDataCb?.(d);
    });
    this.cleanups.push(() => d1.dispose());

    const d2 = this.xterm.onKey((e) => {
      if (this.mode === 'tui') this.tuiKeyCb?.(e);
    });
    this.cleanups.push(() => d2.dispose());

    const d3 = this.xterm.onResize(({ cols, rows }) => {
      if (this.mode === 'tui') this.tuiResizeCb?.({ cols, rows });
    });
    this.cleanups.push(() => d3.dispose());

    // Correct wide-glyph padding on every paint (see normalizeWideSpacing).
    const d4 = this.xterm.onRender(() => {
      // onRender fires while xterm is still writing rows; correcting the spans in
      // the same tick would be overwritten by that paint.
      requestAnimationFrame(() => this.normalizeWideSpacing());
    });
    this.cleanups.push(() => d4.dispose());
    // Glyph advances change once the webfonts land, which can re-introduce the
    // mismatch, so re-apply after they are ready.
    void document.fonts?.ready.then(() => this.normalizeWideSpacing());
  }

  /**
   * xterm's DOM renderer pads every wide (CJK / fullwidth) glyph with
   * letter-spacing so that one character fills exactly two cells. It derives the
   * padding from a cached canvas measurement, and for fullwidth punctuation that
   * cache disagrees with what layout actually uses: it measures `，` at ~8.24px
   * while the browser lays the same glyph out at 16px. Each such glyph then
   * overshoots its two cells by ~7.8px, so a Chinese line with two commas in it
   * ends ~15px past the screen edge and its final character is clipped — which is
   * exactly the bug users see, even though the wrapping is correct.
   *
   * Re-derive the padding from the advance the browser really uses, which
   * restores exact two-cell advances (and therefore kills the cumulative drift).
   * Only spans xterm already annotated are touched, and only when every glyph in
   * the span is wide; narrow text keeps the renderer's own spacing.
   */
  private normalizeWideSpacing(): void {
    const screen = this.xterm.element?.querySelector('.xterm-screen') as HTMLElement | null;
    const rowsEl = this.xterm.element?.querySelector('.xterm-rows') as HTMLElement | null;
    const cols = this.xterm.cols;
    if (!screen || !rowsEl || cols < 1) return;
    const cell = screen.clientWidth / cols;
    if (!(cell > 0)) return;

    if (!this.measureCtx) {
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) return;
      ctx.font = `${this.xterm.options.fontSize ?? 16}px ${this.fontFamily}`;
      this.measureCtx = ctx;
    }
    const ctx = this.measureCtx;

    for (const span of rowsEl.querySelectorAll<HTMLSpanElement>('span[style*="letter-spacing"]')) {
      const text = span.textContent;
      if (!text) continue;
      const cps = [...text];
      if (!cps.every((c) => displayWidth(c) === 2)) continue;
      const glyphW = ctx.measureText(cps[0]).width;
      if (!(glyphW > 0)) continue;
      const pad = 2 * cell - glyphW;
      const next = `${pad.toFixed(3)}px`;
      if (span.style.letterSpacing !== next) span.style.letterSpacing = next;
    }
  }

  get cols() {
    return this.xterm.cols;
  }
  get rows() {
    return this.xterm.rows;
  }

  write(s: string) {
    this.xterm.write(s.replace(/(?<!\r)\n/g, '\r\n'));
  }
  print(s: string) {
    this.write(s + '\n');
  }
  clear() {
    this.xterm.clear();
  }
  fit() {
    // Fit xterm to its host; the host's column count is capped in CSS
    // (max-width: calc(80ch + ...) in index.html), so this is all that's needed.
    this.fitAddon.fit();
  }
  focus() {
    this.xterm.focus();
  }

  /** Shell-mode raw keystream. Returns an unsubscribe. */
  onShellData(cb: (d: string) => void): () => void {
    this.shellDataCb = cb;
    return () => {
      if (this.shellDataCb === cb) this.shellDataCb = undefined;
    };
  }

  /** Hand the terminal to a TUI app. */
  takeOver(): TuiSession {
    this.mode = 'tui';
    const xt = this.xterm;
    const self = this;
    return {
      get cols() {
        return xt.cols;
      },
      get rows() {
        return xt.rows;
      },
      write: (s) => xt.write(s),
      clear: () => xt.reset(),
      onKey: (cb) => {
        self.tuiKeyCb = cb;
        return () => {
          if (self.tuiKeyCb === cb) self.tuiKeyCb = undefined;
        };
      },
      onResize: (cb) => {
        self.tuiResizeCb = cb;
        return () => {
          if (self.tuiResizeCb === cb) self.tuiResizeCb = undefined;
        };
      },
      release: () => {
        self.mode = 'shell';
      },
    };
  }

  dispose() {
    for (const c of this.cleanups) c();
    this.xterm.dispose();
  }
}
