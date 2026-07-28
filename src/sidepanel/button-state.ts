/**
 * The two pieces of button bookkeeping that have their own rules, in a module a
 * test can import — `sidepanel.ts` cannot be imported, its top level talks to
 * Chrome.
 */

/**
 * Name a button in the status bar while the pointer is on it.
 *
 * `show` and `hide` are the panel's status layers, passed in rather than reached
 * for, which is the whole reason this is testable.
 *
 * The flag is the rule: `mouseleave` may only restore the base status if *this*
 * button actually replaced it. A disabled button shows nothing on `mouseenter`,
 * and while `mouseleave` cleared unconditionally, moving the pointer across a
 * disabled Undo — disabled is its resting state on an empty panel — wiped the
 * "no selection" error the reader had just been given, seconds early and with no
 * way to see what had happened.
 */
export function attachStatusTooltip(
  btn: HTMLButtonElement,
  show: () => void,
  hide: () => void,
): void {
  let shown = false;
  btn.addEventListener('mouseenter', () => {
    if (btn.disabled) return;
    shown = true;
    show();
  });
  btn.addEventListener('mouseleave', () => {
    if (!shown) return;
    shown = false;
    hide();
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
