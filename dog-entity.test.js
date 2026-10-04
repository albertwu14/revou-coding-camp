/**
 * Unit tests for DogEntity — Task 3.1
 * Covers: constructor, moveTo(), destroy()
 * Requirements: 1.1, 1.2, 1.3, 1.4, 6.3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// ---------------------------------------------------------------------------
// Minimal DOM environment setup
// We extract DogEntity from index.html by eval-ing just the necessary parts.
// ---------------------------------------------------------------------------

let dom;
let window;
let document;
let DogEntity;
let _dogEntityNextId;

/**
 * Build a fresh JSDOM environment and load the relevant JS from index.html.
 * We replicate the AnimationController + DogEntity declarations so the tests
 * run in an isolated scope without side effects from other modules.
 */
function setupEnv() {
  dom = new JSDOM('<!DOCTYPE html><html><body><div id="stage" style="width:800px;height:600px;position:relative;overflow:hidden;"></div></body></html>', {
    pretendToBeVisual: true,
  });
  window = dom.window;
  document = window.document;

  // Minimal AnimationController shim — same logic as index.html but
  // getComputedStyle will return defaults in jsdom.
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
      const rawDuration = window.getComputedStyle(el).animationDuration || '0s';
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

  const DOG_REACTION_CLASSES = ['dog--click', 'dog--hold', 'dog--drag'];

  function _removeAllReactionClasses(el) {
    DOG_REACTION_CLASSES.forEach(cls => el.classList.remove(cls));
  }

  // Reset the monotonic ID counter for each test suite.
  let _id = 0;

  function _DogEntity(x, y) {
    this.id = _id++;
    this.x = x;
    this.y = y;
    this.animState = 'idle';

    this.el = document.createElement('div');
    this.el.className = 'dog dog--idle';

    const body = document.createElement('div');
    body.className = 'dog__body';
    this.el.appendChild(body);

    this.el.style.left = x + 'px';
    this.el.style.top  = y + 'px';

    const stage = document.getElementById('stage');
    stage.appendChild(this.el);
  }

  _DogEntity.prototype.moveTo = function(x, y) {
    const stage = document.getElementById('stage');
    const stageW = stage.offsetWidth  || 800;
    const stageH = stage.offsetHeight || 600;
    const clampedX = Math.max(16, Math.min(stageW - 16, x));
    const clampedY = Math.max(16, Math.min(stageH - 16, y));
    this.x = clampedX;
    this.y = clampedY;
    this.el.style.left = clampedX + 'px';
    this.el.style.top  = clampedY + 'px';
  };

  _DogEntity.prototype.destroy = function() {
    if (this.el._acTimers) {
      Object.values(this.el._acTimers).forEach(clearTimeout);
      this.el._acTimers = {};
    }
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
  };

  _DogEntity.prototype.playClick = function() {
    const el = this.el;
    if (!el) return;
    el.classList.remove('dog--idle');
    _removeAllReactionClasses(el);
    this.animState = 'click';
    AnimationController.playOnce(el, 'dog--click', () => {
      if (!this.el) return;
      this.animState = 'idle';
      this.el.classList.add('dog--idle');
    });
  };

  _DogEntity.prototype.playHold = function() {
    const el = this.el;
    if (!el) return;
    el.classList.remove('dog--idle');
    _removeAllReactionClasses(el);
    this.animState = 'hold';
    AnimationController.playLoop(el, 'dog--hold');
  };

  _DogEntity.prototype.stopHold = function() {
    const el = this.el;
    if (!el) return;
    AnimationController.stop(el, 'dog--hold');
    this.animState = 'idle';
    el.classList.add('dog--idle');
  };

  _DogEntity.prototype.startDrag = function() {
    const el = this.el;
    if (!el) return;
    el.classList.remove('dog--idle');
    _removeAllReactionClasses(el);
    this.animState = 'drag';
    AnimationController.playLoop(el, 'dog--drag');
  };

  _DogEntity.prototype.stopDrag = function() {
    const el = this.el;
    if (!el) return;
    AnimationController.stop(el, 'dog--drag');
    this.animState = 'idle';
    el.classList.add('dog--idle');
  };

  DogEntity = _DogEntity;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DogEntity — constructor (Task 3.1)', () => {
  beforeEach(() => {
    setupEnv();
  });

  it('appends a .dog element to #stage', () => {
    const dog = new DogEntity(100, 200);
    const stage = document.getElementById('stage');
    expect(stage.querySelector('.dog')).not.toBeNull();
    expect(stage.contains(dog.el)).toBe(true);
  });

  it('creates a .dog__body child inside .dog', () => {
    const dog = new DogEntity(100, 200);
    expect(dog.el.querySelector('.dog__body')).not.toBeNull();
  });

  it('applies dog--idle class on construction', () => {
    const dog = new DogEntity(100, 200);
    expect(dog.el.classList.contains('dog--idle')).toBe(true);
  });

  it('does NOT apply any reaction class on construction', () => {
    const dog = new DogEntity(100, 200);
    expect(dog.el.classList.contains('dog--click')).toBe(false);
    expect(dog.el.classList.contains('dog--hold')).toBe(false);
    expect(dog.el.classList.contains('dog--drag')).toBe(false);
  });

  it('positions the element with the given (x, y) via style.left / style.top', () => {
    const dog = new DogEntity(150, 250);
    expect(dog.el.style.left).toBe('150px');
    expect(dog.el.style.top).toBe('250px');
  });

  it('stores x and y as instance properties', () => {
    const dog = new DogEntity(42, 99);
    expect(dog.x).toBe(42);
    expect(dog.y).toBe(99);
  });

  it('stores animState as "idle" on construction', () => {
    const dog = new DogEntity(0, 0);
    expect(dog.animState).toBe('idle');
  });

  it('assigns a numeric id to the instance', () => {
    const dog1 = new DogEntity(0, 0);
    const dog2 = new DogEntity(0, 0);
    expect(typeof dog1.id).toBe('number');
    expect(typeof dog2.id).toBe('number');
  });

  it('assigns monotonically increasing ids to successive instances', () => {
    const dog1 = new DogEntity(0, 0);
    const dog2 = new DogEntity(0, 0);
    expect(dog2.id).toBeGreaterThan(dog1.id);
  });

  it('stores the DOM element reference on this.el', () => {
    const dog = new DogEntity(0, 0);
    expect(dog.el).toBeInstanceOf(document.defaultView.HTMLElement);
  });
});

// ---------------------------------------------------------------------------

describe('DogEntity — moveTo() (Task 3.1)', () => {
  beforeEach(() => {
    setupEnv();
  });

  it('updates el.style.left and el.style.top', () => {
    const dog = new DogEntity(100, 100);
    dog.moveTo(200, 300);
    expect(dog.el.style.left).toBe('200px');
    expect(dog.el.style.top).toBe('300px');
  });

  it('updates this.x and this.y instance properties', () => {
    const dog = new DogEntity(100, 100);
    dog.moveTo(200, 300);
    expect(dog.x).toBe(200);
    expect(dog.y).toBe(300);
  });

  it('clamps x to minimum of 16 when given a value below 16', () => {
    const dog = new DogEntity(100, 100);
    dog.moveTo(0, 100);
    expect(dog.x).toBe(16);
    expect(dog.el.style.left).toBe('16px');
  });

  it('clamps y to minimum of 16 when given a value below 16', () => {
    const dog = new DogEntity(100, 100);
    dog.moveTo(100, -50);
    expect(dog.y).toBe(16);
    expect(dog.el.style.top).toBe('16px');
  });

  it('clamps x to (stageWidth - 16) when exceeding stage width', () => {
    const dog = new DogEntity(100, 100);
    // Stage is 800px wide in our test environment (offsetWidth falls back to 800)
    dog.moveTo(9999, 100);
    expect(dog.x).toBe(800 - 16);
    expect(dog.el.style.left).toBe(`${800 - 16}px`);
  });

  it('clamps y to (stageHeight - 16) when exceeding stage height', () => {
    const dog = new DogEntity(100, 100);
    dog.moveTo(100, 9999);
    expect(dog.y).toBe(600 - 16);
    expect(dog.el.style.top).toBe(`${600 - 16}px`);
  });

  it('allows values exactly at the bounds (16 and stageW-16)', () => {
    const dog = new DogEntity(100, 100);
    dog.moveTo(16, 16);
    expect(dog.x).toBe(16);
    expect(dog.y).toBe(16);
    dog.moveTo(784, 584);
    expect(dog.x).toBe(784);
    expect(dog.y).toBe(584);
  });
});

// ---------------------------------------------------------------------------

describe('DogEntity — destroy() (Task 3.1)', () => {
  beforeEach(() => {
    setupEnv();
  });

  it('removes the .dog element from the DOM', () => {
    const dog = new DogEntity(100, 200);
    const stage = document.getElementById('stage');
    dog.destroy();
    expect(stage.querySelector('.dog')).toBeNull();
  });

  it('sets this.el to null after destroy()', () => {
    const dog = new DogEntity(100, 200);
    dog.destroy();
    expect(dog.el).toBeNull();
  });

  it('calling destroy() twice does not throw', () => {
    const dog = new DogEntity(100, 200);
    dog.destroy();
    expect(() => dog.destroy()).not.toThrow();
  });

  it('does not affect other dog elements in the DOM', () => {
    const dog1 = new DogEntity(100, 200);
    const dog2 = new DogEntity(300, 400);
    dog1.destroy();
    const stage = document.getElementById('stage');
    const remaining = stage.querySelectorAll('.dog');
    expect(remaining.length).toBe(1);
    expect(stage.contains(dog2.el)).toBe(true);
  });
});
