import { describe, test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import { attachStatusTooltip, setToggleState, type StatusBar } from '../button-state';

let win: Window;

function button(disabled = false): HTMLButtonElement {
  const btn = win.document.createElement('button') as unknown as HTMLButtonElement;
  btn.disabled = disabled;
  win.document.body.appendChild(btn as unknown as Node);
  return btn;
}

function hover(btn: HTMLButtonElement) {
  btn.dispatchEvent(new win.Event('mouseenter') as unknown as Event);
}

function unhover(btn: HTMLButtonElement) {
  btn.dispatchEvent(new win.Event('mouseleave') as unknown as Event);
}

/** The panel's status bar, down to what the tooltip can see of it. */
function statusBar() {
  const calls: string[] = [];
  let token = 0;
  const bar: StatusBar = {
    show: () => { calls.push('show'); return ++token; },
    restore: () => { calls.push('restore'); token++; },
    token: () => token,
  };
  /** Something else writes the status bar — a click's own confirmation or error. */
  const write = () => { token++; };
  return { bar, calls, write };
}

beforeEach(() => {
  win = new Window();
});

describe('attachStatusTooltip', () => {
  test('an enabled button shows the name and puts the status back', () => {
    const { bar, calls } = statusBar();
    const btn = button();
    attachStatusTooltip(btn, bar);

    hover(btn);
    unhover(btn);

    expect(calls).toEqual(['show', 'restore']);
  });

  // The status bar is where errors and confirmations are read, and Undo is
  // disabled whenever the panel is empty — which is exactly when "no selection"
  // has just been written. Clearing on the way out of a button that showed
  // nothing took that message away seconds early.
  test('a disabled button neither shows nor clears', () => {
    const { bar, calls } = statusBar();
    const btn = button(true);
    attachStatusTooltip(btn, bar);

    hover(btn);
    unhover(btn);

    expect(calls).toEqual([]);
  });

  test('a button disabled between enter and leave still clears its own tooltip', () => {
    const { bar, calls } = statusBar();
    const btn = button();
    attachStatusTooltip(btn, bar);

    hover(btn);
    btn.disabled = true;
    unhover(btn);

    expect(calls).toEqual(['show', 'restore']);
  });

  test('each button tracks its own hover', () => {
    const { bar, calls } = statusBar();
    const enabled = button();
    const disabled = button(true);
    attachStatusTooltip(enabled, bar);
    attachStatusTooltip(disabled, bar);

    hover(disabled);
    unhover(disabled);
    hover(enabled);
    unhover(enabled);

    expect(calls).toEqual(['show', 'restore']);
  });

  // Press Copy, or the Obsidian hand-off, without moving the pointer: the click
  // writes its own message, and the pointer leaving must not take it away.
  test('a message written while hovering survives the pointer leaving', () => {
    const { bar, calls, write } = statusBar();
    const btn = button();
    attachStatusTooltip(btn, bar);

    hover(btn);
    write();
    unhover(btn);

    expect(calls).toEqual(['show']);
  });

  test('and the hover after that one still works', () => {
    const { bar, calls, write } = statusBar();
    const btn = button();
    attachStatusTooltip(btn, bar);

    hover(btn);
    write();
    unhover(btn);
    hover(btn);
    unhover(btn);

    expect(calls).toEqual(['show', 'show', 'restore']);
  });
});

describe('setToggleState', () => {
  test('the state travels in aria-pressed and the name does not move', () => {
    const btn = button();

    setToggleState(btn, false, 'Highlight elements on the page');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.getAttribute('aria-label')).toBe('Highlight elements on the page');

    setToggleState(btn, true, 'Highlight elements on the page');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Highlight elements on the page');

    setToggleState(btn, false, 'Highlight elements on the page');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.getAttribute('aria-label')).toBe('Highlight elements on the page');
  });
});
