/**
 * The two pieces of button bookkeeping that have their own rules, in a module a
 * test can import — `sidepanel.ts` cannot be imported, its top level talks to
 * Chrome.
 */

/**
 * The status bar, as much of it as a tooltip needs: the panel passes this in
 * rather than being reached for, which is the whole reason this is testable.
 *
 * `token()` is what makes the ownership question answerable — every write to the
 * status bar takes a new one, so comparing tells the tooltip whether what is on
 * screen is still its own text or somebody else's.
 */
export interface StatusBar {
  /** Write the tooltip, and return the token it was written with. */
  show(): number;
  /** Put the base status back. */
  restore(): void;
  /** The token of whatever is on the status bar right now. */
  token(): number;
}

/**
 * Name a button in the status bar while the pointer is on it.
 *
 * Two rules, both paid for. A disabled button shows nothing on the way in and so
 * must clear nothing on the way out: while `mouseleave` cleared unconditionally,
 * moving the pointer across a disabled Undo — its resting state on an empty
 * panel — wiped the "no selection" error the reader had just been given.
 *
 * And the way out may only clear what is still *this* tooltip. Hover Copy, press
 * it without moving the pointer, and the click writes its own message — "Opening
 * in Obsidian…", or a clipboard error; moving the pointer away then cleared that,
 * instantly and along with its timer, because the tooltip believed the status bar
 * was still showing what it had put there.
 */
export function attachStatusTooltip(btn: HTMLButtonElement, status: StatusBar): void {
  let mine: number | null = null;
  btn.addEventListener('mouseenter', () => {
    if (btn.disabled) return;
    mine = status.show();
  });
  btn.addEventListener('mouseleave', () => {
    if (mine === null) return;
    const stillMine = status.token() === mine;
    mine = null;
    if (stillMine) status.restore();
  });
}

/**
 * A toggle button's state, for assistive tech as well as for the eye.
 *
 * `aria-pressed` is the only programmatic form of "this is on": the highlighter
 * announced its state by changing its accessible name instead ("Highlighter on"
 * → "Highlighter off"), which reads to a screen reader as a different button
 * appearing rather than as the same one being pressed. The name stays put and the
 * state travels separately — WAI's button pattern.
 */
export function setToggleState(
  btn: HTMLButtonElement,
  pressed: boolean,
  name: string,
): void {
  btn.setAttribute('aria-pressed', String(pressed));
  btn.setAttribute('aria-label', name);
}
