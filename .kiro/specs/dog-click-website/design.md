# Design Document — Dog Click Website

## Overview

The dog-click-website is a single HTML file delivering a purely client-side interactive experience. When a user interacts with the page (click, hold, or drag), a dog character spawns at the interaction origin and plays a reaction animation appropriate to that input type. The feature set is deliberately constrained to vanilla HTML, CSS, and JavaScript — no runtime dependencies, no build step.

The core design challenge is correctly discriminating between three mutually exclusive input gestures using a state machine, while keeping up to 50 dog entities alive, animated at 60 fps, and individually lifecycle-managed.

### Guiding Principles

- **Zero dependencies** — everything ships inline in a single `.html` file (or a minimal sibling `.css`/`.js` pair if readability requires).
- **CSS drives animation** — reactions and idle loops are CSS keyframe animations; JavaScript only adds/removes classes and repositions elements.
- **State machine is the source of truth** — all input classification happens in one clearly bounded module.
- **LRU pool** — dogs are capped at 50; the least-recently-spawned dog is evicted when the limit is exceeded.
- **Performance budget** — every frame-critical path must complete in ≤16 ms so the main thread keeps 60 fps.

---

## Architecture

The page is organized into three logical layers:

```
┌──────────────────────────────────────────┐
│              Presentation Layer           │
│   HTML structure · CSS animations ·      │
│   custom cursor · responsive layout      │
└────────────────┬─────────────────────────┘
                 │ DOM manipulation
┌────────────────▼─────────────────────────┐
│            Application Layer             │
│  InputStateMachine · DogPool ·           │
│  DogEntity · AnimationController         │
└────────────────┬─────────────────────────┘
                 │ events
┌────────────────▼─────────────────────────┐
│              Event Layer                  │
│  mousedown · mousemove · mouseup ·        │
│  contextmenu suppress                     │
└──────────────────────────────────────────┘
```

### Module Map

| Module | Responsibility |
|---|---|
| `InputStateMachine` | Classifies raw pointer events into Click / Hold / Drag gestures |
| `DogPool` | Manages the array of active `DogEntity` instances, enforces the 50-dog LRU cap |
| `DogEntity` | Owns one dog DOM element; manages its position, animation class, and lifecycle |
| `AnimationController` | Utility that triggers and observes CSS animations on a `DogEntity` |
| `CursorController` | Applies custom cursor CSS to the interactive area |
| Stylesheet (inline) | Defines all keyframe animations, layout, responsive behaviour, and cursor |

Because everything is vanilla JS, modules are implemented as plain ES module objects or IIFE-namespaced constructor functions bundled inline in the HTML.

---

## Components and Interfaces

### InputStateMachine

Tracks a single pointer interaction from `mousedown` through `mouseup`.

```
States: IDLE → PENDING → HOLDING | DRAGGING
                          ↑ 300ms timer fires
              ↑ ≥10px movement → DRAGGING
```

**Public API**

```js
// Call once at page load
InputStateMachine.init(containerEl);

// Emits custom events on containerEl:
//   'dog:click'  { x, y }
//   'dog:holdstart' { x, y }
//   'dog:holdend'
//   'dog:dragstart' { x, y }
//   'dog:dragmove'  { x, y }
//   'dog:dragend'
```

**Internal state fields**

```js
{
  phase: 'IDLE' | 'PENDING' | 'HOLDING' | 'DRAGGING',
  startX: number,
  startY: number,
  holdTimer: TimeoutID | null,
  activeEntity: DogEntity | null
}
```

**Transition table**

| Current state | Event | Condition | Next state | Action |
|---|---|---|---|---|
| IDLE | mousedown | — | PENDING | record startX/Y, start holdTimer(300ms), spawn dog |
| PENDING | mousemove | Δ ≥ 10px | DRAGGING | clear holdTimer, emit `dog:dragstart` |
| PENDING | mousemove | Δ < 10px | PENDING | — |
| PENDING | holdTimer | — | HOLDING | emit `dog:holdstart` |
| PENDING | mouseup | Δ < 10px, t < 300ms | IDLE | clear holdTimer, emit `dog:click` |
| PENDING | mouseup | Δ ≥ 10px | IDLE | clear holdTimer, emit `dog:dragend` |
| HOLDING | mousemove | Δ ≥ 10px | DRAGGING | emit `dog:dragstart` |
| HOLDING | mouseup | — | IDLE | emit `dog:holdend` |
| DRAGGING | mousemove | — | DRAGGING | emit `dog:dragmove` |
| DRAGGING | mouseup | — | IDLE | emit `dog:dragend` |

**Implementation notes**
- `Δ` is Euclidean distance from `(startX, startY)` to current pointer position.
- The hold timer is started immediately on `mousedown`; it is cancelled on any `mouseup` or on ≥10px movement.
- `contextmenu` and `selectstart` default behaviors are suppressed during PENDING / HOLDING / DRAGGING to prevent text selection or native drag.

---

### DogPool

Maintains the ordered list of active dogs and enforces the 50-entity cap via LRU eviction.

**Public API**

```js
DogPool.spawn(x, y): DogEntity   // creates and registers a new dog
DogPool.evictOldest(): void      // removes and destroys the oldest dog
DogPool.size(): number           // current dog count
```

**Internal structure**

```js
// Insertion-ordered array; index 0 = oldest
const dogs: DogEntity[] = [];
const MAX = 50;
```

`spawn()` calls `evictOldest()` when `dogs.length === MAX` before creating the new entity. The new entity is pushed to the tail.

---

### DogEntity

Owns one `<div class="dog">` element. Manages position and animation state.

**Public API**

```js
const dog = new DogEntity(x, y);   // creates DOM node, positions it
dog.playClick(): void              // enter click reaction
dog.playHold(): void               // enter hold reaction
dog.stopHold(): void               // return to idle from hold
dog.startDrag(): void              // enter drag reaction
dog.moveTo(x, y): void            // update position during drag
dog.stopDrag(): void               // return to idle from drag
dog.destroy(): void                // remove DOM node, cancel timers
```

**Animation state machine (per entity)**

```
            playClick()
   IDLE ──────────────► CLICK_REACTION
    ▲                         │ animationend
    └─────────────────────────┘
            playHold()
   IDLE ──────────────► HOLD_REACTION
    ▲                         │ stopHold()
    └─────────────────────────┘
            startDrag()
   IDLE ──────────────► DRAG_REACTION
    ▲                         │ stopDrag()
    └─────────────────────────┘
```

In HOLD_REACTION and DRAG_REACTION, transition back to IDLE is triggered externally. In CLICK_REACTION, the CSS animation fires `animationend` which triggers the return to IDLE.

**CSS class mapping**

| Entity state | CSS class on `.dog` |
|---|---|
| IDLE | `dog--idle` |
| CLICK_REACTION | `dog--click` |
| HOLD_REACTION | `dog--hold` |
| DRAG_REACTION | `dog--drag` |

**Positioning**

Dogs are positioned with `position: fixed` (or `position: absolute` relative to a full-viewport container). The spawn point `(x, y)` is the pointer's `clientX`/`clientY`. The dog element is centered on the spawn point using `transform: translate(-50%, -50%)`.

```js
moveTo(x, y) {
  this.el.style.left = x + 'px';
  this.el.style.top  = y + 'px';
}
```

`moveTo` is called directly from the `dog:dragmove` handler — no `requestAnimationFrame` batching needed since `mousemove` fires at the display refresh rate in modern browsers; if needed, a `rAF` gate can be added.

---

### AnimationController

A thin helper that wraps `animationend` observation and class toggling so `DogEntity` stays clean.

```js
AnimationController.playOnce(el, className, onDone): void
// Adds className, listens for animationend (once), removes className, calls onDone.

AnimationController.playLoop(el, className): void
// Adds className; caller must call AnimationController.stop(el, className) to remove.

AnimationController.stop(el, className): void
// Removes className.
```

---

### CursorController

```js
CursorController.init(containerEl): void
// Sets containerEl style cursor to 'none' and inserts a <div class="cursor">
// that follows the pointer via mousemove, giving full control over cursor appearance.
```

Alternatively, a simpler approach uses `cursor: url(data:image/...) hotspot, auto` on the container, embedding the cursor image as a data URI in the stylesheet — no extra DOM element needed.

---

## Data Models

### GestureEvent

Custom events dispatched by `InputStateMachine` on the container element.

```ts
interface GestureEvent extends CustomEvent {
  detail: {
    x: number;   // clientX at gesture origin or current pointer position
    y: number;   // clientY
  }
}
```

Event names: `'dog:click'`, `'dog:holdstart'`, `'dog:holdend'`, `'dog:dragstart'`, `'dog:dragmove'`, `'dog:dragend'`

---

### DogEntityState

Internal state carried by each `DogEntity`.

```ts
interface DogEntityState {
  id: number;              // monotonic spawn index, used for LRU ordering
  el: HTMLElement;         // the .dog DOM node
  x: number;              // current left position (px)
  y: number;              // current top position (px)
  animState:
    | 'idle'
    | 'click'
    | 'hold'
    | 'drag';
}
```

---

### InputState

Internal state of the `InputStateMachine`.

```ts
interface InputState {
  phase: 'IDLE' | 'PENDING' | 'HOLDING' | 'DRAGGING';
  startX: number;
  startY: number;
  holdTimer: ReturnType<typeof setTimeout> | null;
  activeEntity: DogEntity | null;
}
```

---

### DogPool internal

```ts
// Ordered array; dogs[0] is the oldest (LRU candidate)
const dogs: DogEntity[];
const MAX_DOGS = 50;
```

---

## DOM Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dog Click</title>
  <style>/* all styles inline */</style>
</head>
<body>
  <!-- Full-viewport interactive surface -->
  <div id="stage">

    <!-- Dogs are appended here dynamically -->
    <!-- Each dog:
    <div class="dog dog--idle" style="left: Xpx; top: Ypx;">
      <div class="dog__body"></div>
    </div>
    -->

  </div>

  <script>/* all JS inline */</script>
</body>
</html>
```

**`#stage`** fills the full viewport (`width: 100vw; height: 100vh; overflow: hidden; position: relative`). Dogs are positioned absolutely within it. The custom cursor is applied on `#stage`.

**`.dog`** is a `32×32px` minimum wrapper. Internal structure (`.dog__body`, `.dog__tail`, etc.) is shaped by the CSS animation design — simple SVG-based or pure-CSS shapes work without external image files.

**Responsive layout** — the `#stage` element stretches to fill any viewport width from 320 px to 2560 px. Dogs are clamped to stage bounds during drag to avoid clipping at edges:

```js
const clampedX = Math.max(16, Math.min(stageW - 16, x));
const clampedY = Math.max(16, Math.min(stageH - 16, y));
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Click classification and response

*For any* pointer interaction where total pointer movement is less than 10 px AND total duration from mousedown to mouseup is less than 300 ms, the input state machine SHALL classify the interaction as Click, a dog SHALL be spawned at the pointer coordinates, and the `dog--click` CSS class SHALL be applied — all within 100 ms of the mouseup event. The interaction SHALL NOT be classified as Hold or Drag.

**Validates: Requirements 1.1, 2.1, 5.1, 5.5**

---

### Property 2: Hold classification and response

*For any* pointer interaction where total pointer movement remains less than 10 px AND the mousedown is held for 300 ms or longer, the input state machine SHALL classify the interaction as Hold, a dog SHALL have been spawned at the pointer coordinates within 100 ms of mousedown, and the `dog--hold` CSS class SHALL be active at the 300 ms threshold. The interaction SHALL NOT be classified as Click or Drag.

**Validates: Requirements 1.2, 3.1, 5.1**

---

### Property 3: Drag classification and response

*For any* pointer interaction where the pointer moves 10 px or more from the spawn point (at any elapsed time before mouseup), the input state machine SHALL classify the interaction as Drag, the dog SHALL have been spawned at the spawn-point coordinates within 100 ms of mousedown, and the `dog--drag` CSS class SHALL be applied within 100 ms of the ≥10 px movement threshold being crossed. The interaction SHALL NOT be classified as Click or Hold.

**Validates: Requirements 1.3, 3.2, 4.1, 5.1, 5.4**

---

### Property 4: Mutual exclusivity of animation states

*For any* dog element and any point in time, the element SHALL carry at most one of the three reaction classes — `dog--click`, `dog--hold`, `dog--drag` — never two or more simultaneously.

**Validates: Requirements 5.1**

---

### Property 5: Hold-to-Drag mid-interaction transition

*For any* interaction that has already entered Hold Reaction (≥300 ms without ≥10 px movement) and subsequently crosses the 10 px movement threshold, the dog SHALL remove the `dog--hold` class and apply the `dog--drag` class within 100 ms of the movement threshold being crossed, with no frame where both classes are present simultaneously.

**Validates: Requirements 5.2**

---

### Property 6: Dog pool LRU eviction invariant

*For any* sequence of N spawn events (N ≥ 1), the count of live dog elements in the DOM SHALL never exceed 50. When N > 50, the dog evicted on each overflow spawn SHALL be the one with the smallest spawn-sequence index (i.e., the oldest remaining dog).

**Validates: Requirements 1.5, 1.6**

---

### Property 7: Click reaction time bound and idle return

*For any* click interaction, the `dog--click` animation SHALL complete and the dog SHALL transition back to `dog--idle` state within 1000 ms of the mouseup event.

**Validates: Requirements 2.2, 2.3**

---

### Property 8: Click reaction restart on re-click

*For any* dog that is currently in Click Reaction, if a new click event is applied to that dog, the `dog--click` animation SHALL restart from its initial frame within 100 ms of the new mouseup event (i.e., the class is removed and re-added, resetting the animation).

**Validates: Requirements 2.5**

---

### Property 9: Hold timer cancellation

*For any* pointer interaction where the mouseup event fires before the 300 ms hold threshold elapses, the hold timer SHALL be cleared and no `dog--hold` class SHALL ever be applied to the dog spawned by that interaction.

**Validates: Requirements 5.3**

---

### Property 10: Drag position tracking

*For any* drag interaction, for every `mousemove` event in the sequence, the dog element's `left` and `top` CSS properties SHALL reflect the event's pointer coordinates within 16 ms of the event firing.

**Validates: Requirements 4.2**

---

### Property 11: Idle animation lifecycle

*For any* dog that transitions into Idle State (via click reaction end, hold release, or drag release), the `dog--idle` class SHALL be applied within 16 ms of the transition. *For any* dog transitioning from Idle into any Reaction state, the `dog--idle` class SHALL be removed within 16 ms of the reaction beginning.

**Validates: Requirements 6.3**

---

### Property 12: Dog minimum spawn dimensions

*For any* dog element spawned at any coordinates, its bounding rectangle (via `getBoundingClientRect()`) SHALL have both width ≥ 32 px and height ≥ 32 px at all times during its lifecycle.

**Validates: Requirements 1.4**

---

## Error Handling

### Input edge cases

| Scenario | Handling |
|---|---|
| `mouseup` fires outside the browser window | `document`-level `mouseup` listener catches it; state machine transitions to IDLE, hold timer cleared |
| Rapid repeated clicks on the same spot | Each click is independent; `playClick()` restarts the animation from frame 0 (Requirement 2.5) |
| Hold → Drag: 300ms fires simultaneously with 10px movement | Movement check runs on every `mousemove`; if ≥10 px is detected, `holdTimer` is cancelled before it can fire via `clearTimeout` |
| Drag with pointer leaving viewport | `mousemove` on `document` keeps tracking; `mouseup` on `document` ends drag |
| Spawn when pool is at 50 | `DogPool.spawn()` evicts oldest before creating new entity — always succeeds |
| `animationend` never fires (browser quirk) | `AnimationController.playOnce` sets a fallback `setTimeout` at animation duration + 50 ms as a safety net |

### Performance safeguards

| Risk | Mitigation |
|---|---|
| Excessive DOM reflows during drag | Batch `style.left` / `style.top` updates in a single `rAF` if profiling shows jank |
| 50 dogs each looping CSS animations | CSS keyframe animations are GPU-composited (`transform`, `opacity`); avoid layout-triggering properties in keyframes |
| Memory leak from destroyed dogs | `DogEntity.destroy()` removes the DOM node and nullifies all references; the `DogPool` splices the entity from its array |

---

## Testing Strategy

### Unit Tests (example-based)

- `InputStateMachine`: verify each cell of the transition table with synthetic pointer events
  - Click: mousedown → immediate mouseup with <10 px, <300 ms → `dog:click` fires
  - Hold: mousedown → wait 300 ms → `dog:holdstart` fires
  - Drag: mousedown → mousemove ≥10 px → `dog:dragstart` fires
  - Hold-to-Drag: mousedown → 300 ms → mousemove ≥10 px → `dog:dragstart` fires, `dog:holdend` does NOT fire
  - Hold cancellation: mousedown → 200 ms → mouseup → no `dog:holdstart`
- `DogPool`: verify eviction at boundary (49 dogs → add 1 = 50, add 1 more = still 50, oldest removed)
- `DogEntity`: verify CSS class transitions per method call
- `AnimationController`: mock `animationend`, verify class lifecycle and `onDone` callback

### Property-Based Tests

Property-based tests use a library (e.g., [fast-check](https://github.com/dubzzz/fast-check) for JS) with a minimum of **100 iterations per property**. Each test is tagged with a reference to its design property.

**Feature: dog-click-website**

| Property | Test tag | Generator sketch |
|---|---|---|
| P1 — Click classification and response | `Property 1: Click classification and response` | Generate (Δpx ∈ [0,9], Δms ∈ [0,299], random x/y) → assert `dog:click` emitted, dog spawned, `dog--click` applied within 100 ms |
| P2 — Hold classification and response | `Property 2: Hold classification and response` | Generate (Δpx ∈ [0,9], Δms ∈ [300,2000], random x/y) → assert `dog:holdstart` emitted, dog spawned, `dog--hold` applied |
| P3 — Drag classification and response | `Property 3: Drag classification and response` | Generate (Δpx ∈ [10,500], Δms ∈ [0,2000], random x/y) → assert `dog:dragstart` emitted, dog spawned, `dog--drag` applied |
| P4 — Mutual exclusivity | `Property 4: Mutual exclusivity of animation states` | Generate arbitrary event sequences → assert never two of {dog--click, dog--hold, dog--drag} simultaneously on any dog |
| P5 — Hold-to-Drag transition | `Property 5: Hold-to-Drag mid-interaction transition` | Generate hold (≥300 ms) then movement ≥10 px → assert `dog--drag` active, `dog--hold` absent, transition within 100 ms |
| P6 — LRU eviction invariant | `Property 6: Dog pool LRU eviction invariant` | Generate N ∈ [51,200] spawns → assert pool.size() ≤ 50 always, evicted entity has smallest spawn index |
| P7 — Click time bound | `Property 7: Click reaction time bound and idle return` | For any click event, assert dog transitions to `dog--idle` within 1000 ms of mouseup |
| P8 — Click restart on re-click | `Property 8: Click reaction restart on re-click` | Generate click during active click reaction → assert animation class removed then re-added within 100 ms |
| P9 — Hold timer cancellation | `Property 9: Hold timer cancellation` | Generate mouseup at Δms ∈ [0,299] → assert `dog--hold` never applied to that dog |
| P10 — Drag position tracking | `Property 10: Drag position tracking` | Generate sequence of (x,y) mousemove events during drag → assert dog left/top matches each event within 16 ms |
| P11 — Idle animation lifecycle | `Property 11: Idle animation lifecycle` | For any state transition to/from idle → assert `dog--idle` class added/removed within 16 ms |
| P12 — Spawn dimensions | `Property 12: Dog minimum spawn dimensions` | Generate spawn at any (x,y) → assert getBoundingClientRect() width ≥ 32 and height ≥ 32 |

**Property test configuration:**
- Tag format: `// Feature: dog-click-website, Property N: <property text>`
- Minimum 100 iterations per property
- Use fake timers (e.g., `sinon` or `jest.useFakeTimers`) to control the 300 ms hold threshold

### Integration / Smoke Tests

- Load the page in a headless browser (Playwright or Puppeteer); assert no console errors on load
- Simulate click → assert `.dog--click` class appears within 100 ms
- Simulate hold (300 ms) → assert `.dog--hold` class appears
- Simulate drag → assert dog position updates
- Verify 50-dog cap: spawn 51 dogs in a loop, assert only 50 `.dog` nodes in DOM

### Visual / Manual Checks

- Custom cursor visible in all four target browsers
- No horizontal scrollbar at 320 px and 2560 px viewport widths
- 60 fps confirmed via browser DevTools Performance tab during heavy interaction (50 dogs active)
- Each reaction visually distinguishable from the others
