/**
 * Unit tests for AnimationController
 * Requirements: 2.2, 2.3
 *
 * AnimationController is defined inline in index.html. To test it in isolation
 * we re-declare it here — the logic is identical to the inline version.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Inline copy of AnimationController (mirrors index.html exactly)
// ---------------------------------------------------------------------------
const AnimationController = {
  playOnce(el, className, onDone) {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      el.classList.remove(className);
      if (typeof onDone === 'function') onDone();
    };

    el.classList.add(className);

    const rawDuration = getComputedStyle(el).animationDuration || '0s';
    const durationMs = rawDuration.endsWith('ms')
      ? parseFloat(rawDuration)
      : parseFloat(rawDuration) * 1000;

    el.addEventListener('animationend', finish, { once: true });

    const fallbackTimer = setTimeout(finish, durationMs + 50);

    el._acTimers = el._acTimers || {};
    el._acTimers[className] = fallbackTimer;
  },

  playLoop(el, className) {
    el.classList.add(className);
  },

  stop(el, className) {
    el.classList.remove(className);
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal DOM element whose computed animationDuration we can control.
 * jsdom does not run real CSS, so getComputedStyle always returns '' for
 * animation properties. We patch the global getComputedStyle for each test.
 */
function makeEl(animDurationMs = 500) {
  const el = document.createElement('div');
  document.body.appendChild(el);

  // Patch getComputedStyle to return the requested duration for this element.
  vi.spyOn(window, 'getComputedStyle').mockImplementation((target) => {
    if (target === el) {
      return { animationDuration: `${animDurationMs}ms` };
    }
    // Fall through to real implementation for other elements.
    return Object.getPrototypeOf(window.getComputedStyle).call(window, target);
  });

  return el;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnimationController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  // -------------------------------------------------------------------------
  // playOnce — animationend path (primary)
  // Requirements: 2.2
  // -------------------------------------------------------------------------

  describe('playOnce — animationend path', () => {
    it('adds the class immediately when playOnce is called', () => {
      const el = makeEl(500);
      const onDone = vi.fn();

      AnimationController.playOnce(el, 'dog--click', onDone);

      expect(el.classList.contains('dog--click')).toBe(true);
    });

    it('calls onDone after animationend fires and removes the class', () => {
      const el = makeEl(500);
      const onDone = vi.fn();

      AnimationController.playOnce(el, 'dog--click', onDone);

      // Class should be present before the animation ends.
      expect(el.classList.contains('dog--click')).toBe(true);
      expect(onDone).not.toHaveBeenCalled();

      // Simulate the browser firing animationend.
      el.dispatchEvent(new Event('animationend'));

      // Class must be removed and onDone must have been called.
      expect(el.classList.contains('dog--click')).toBe(false);
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('does not call onDone more than once even if animationend fires twice', () => {
      const el = makeEl(500);
      const onDone = vi.fn();

      AnimationController.playOnce(el, 'dog--click', onDone);

      el.dispatchEvent(new Event('animationend'));
      el.dispatchEvent(new Event('animationend')); // second fire — should be ignored

      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('works without an onDone callback (no error thrown)', () => {
      const el = makeEl(500);

      AnimationController.playOnce(el, 'dog--click'); // no callback

      expect(() => el.dispatchEvent(new Event('animationend'))).not.toThrow();
      expect(el.classList.contains('dog--click')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // playOnce — fallback setTimeout path
  // Requirements: 2.3 (animationend may never fire)
  // -------------------------------------------------------------------------

  describe('playOnce — fallback setTimeout path', () => {
    it('calls onDone via fallback timer when animationend never fires', () => {
      const durationMs = 500;
      const el = makeEl(durationMs);
      const onDone = vi.fn();

      AnimationController.playOnce(el, 'dog--click', onDone);

      // animationend is never dispatched.
      // Advance time to just before the fallback threshold — onDone not yet called.
      vi.advanceTimersByTime(durationMs + 49);
      expect(onDone).not.toHaveBeenCalled();

      // Advance past the fallback threshold (duration + 50 ms).
      vi.advanceTimersByTime(1); // now at durationMs + 50
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('removes the class via fallback timer', () => {
      const durationMs = 300;
      const el = makeEl(durationMs);
      const onDone = vi.fn();

      AnimationController.playOnce(el, 'dog--click', onDone);

      expect(el.classList.contains('dog--click')).toBe(true);

      vi.advanceTimersByTime(durationMs + 50);

      expect(el.classList.contains('dog--click')).toBe(false);
    });

    it('does not call onDone twice when fallback fires after animationend', () => {
      const durationMs = 500;
      const el = makeEl(durationMs);
      const onDone = vi.fn();

      AnimationController.playOnce(el, 'dog--click', onDone);

      // animationend fires first.
      el.dispatchEvent(new Event('animationend'));
      expect(onDone).toHaveBeenCalledTimes(1);

      // Fallback timer fires later — onDone must NOT be called again.
      vi.advanceTimersByTime(durationMs + 50);
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('stores the fallback timer id on el._acTimers keyed by className', () => {
      const el = makeEl(500);
      const onDone = vi.fn();

      AnimationController.playOnce(el, 'dog--click', onDone);

      expect(el._acTimers).toBeDefined();
      expect(el._acTimers['dog--click']).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // playLoop
  // -------------------------------------------------------------------------

  describe('playLoop', () => {
    it('adds the class to the element', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);

      AnimationController.playLoop(el, 'dog--hold');

      expect(el.classList.contains('dog--hold')).toBe(true);
    });

    it('does not remove the class automatically over time', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);

      AnimationController.playLoop(el, 'dog--hold');

      vi.advanceTimersByTime(5000);

      expect(el.classList.contains('dog--hold')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // stop
  // Requirements: 2.3
  // -------------------------------------------------------------------------

  describe('stop', () => {
    it('removes the class immediately', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      el.classList.add('dog--hold');

      AnimationController.stop(el, 'dog--hold');

      expect(el.classList.contains('dog--hold')).toBe(false);
    });

    it('is a no-op when the class is not present (does not throw)', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);

      expect(() => AnimationController.stop(el, 'dog--hold')).not.toThrow();
      expect(el.classList.contains('dog--hold')).toBe(false);
    });

    it('removes the class before any timers advance', () => {
      const el = makeEl(500);
      const onDone = vi.fn();

      AnimationController.playOnce(el, 'dog--click', onDone);
      expect(el.classList.contains('dog--click')).toBe(true);

      // stop() should remove the class synchronously, before animationend or fallback.
      AnimationController.stop(el, 'dog--click');
      expect(el.classList.contains('dog--click')).toBe(false);
    });
  });
});
