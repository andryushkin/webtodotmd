import { describe, test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import { attachStatusTooltip, setToggleState } from '../button-state';

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

beforeEach(() => {
  win = new Window();
});

describe('attachStatusTooltip', () => {
  test('an enabled button shows the name and puts the status back', () => {
    const calls: string[] = [];
    const btn = button();
    attachStatusTooltip(btn, () => calls.push('show'), () => calls.push('hide'));

    hover(btn);
    unhover(btn);

    expect(calls).toEqual(['show', 'hide']);
  });

  // The status bar is where errors and confirmations are read, and Undo is
  // disabled whenever the panel is empty — which is exactly when "no selection"
  // has just been written. Clearing on the way out of a button that showed
  // nothing took that message away seconds early.
  test('a disabled button neither shows nor clears', () => {
    const calls: string[] = [];
    const btn = button(true);
    attachStatusTooltip(btn, () => calls.push('show'), () => calls.push('hide'));

    hover(btn);
    unhover(btn);

    expect(calls).toEqual([]);
  });

  test('a button disabled between enter and leave still clears its own tooltip', () => {
    const calls: string[] = [];
    const btn = button();
    attachStatusTooltip(btn, () => calls.push('show'), () => calls.push('hide'));

    hover(btn);
    btn.disabled = true;
    unhover(btn);

    expect(calls).toEqual(['show', 'hide']);
  });

  test('each button tracks its own hover', () => {
    const calls: string[] = [];
    const enabled = button();
    const disabled = button(true);
    attachStatusTooltip(enabled, () => calls.push('show'), () => calls.push('hide'));
    attachStatusTooltip(disabled, () => calls.push('show'), () => calls.push('hide'));

    hover(disabled);
    unhover(disabled);
    hover(enabled);
    unhover(enabled);

    expect(calls).toEqual(['show', 'hide']);
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
