# Implementation Plan: Dog Click Website

## Overview

Build a single HTML file with inline CSS and JavaScript that renders an interactive dog-character experience. The implementation proceeds bottom-up: HTML/CSS skeleton first, then the JavaScript modules (InputStateMachine → DogEntity → DogPool → AnimationController → CursorController), then wiring everything together.

---

## Tasks

- [x] 1. Create the HTML/CSS skeleton and base styles
  - [x] 1.1 Create `index.html` with `#stage` full-viewport container and `<style>` / `<script>` stubs
    - Add `<!DOCTYPE html>`, `<meta charset>`, viewport meta, `<title>Dog Click</title>`
    - Add `#stage` with `width: 100vw; height: 100vh; overflow: hidden; position: relative`
    - Add placeholder `<style>` and `<script>` blocks (empty for now)
    - _Requirements: 6.4, 7.2_

  - [x] 1.2 Define `.dog` base styles and the four CSS animation classes
    - `.dog` — `position: absolute; width: 32px; height: 32px; transform: translate(-50%, -50%)`
    - `.dog__body` — pure-CSS or inline SVG shape visually distinguishable from white page background
    - `@keyframes` for `dog--idle` (looping, 1–4 s cycle), `dog--click`, `dog--hold` (looping), `dog--drag`
    - Each reaction keyframe must differ from the others in at least one observable visual property
    - _Requirements: 1.4, 2.4, 3.5, 4.4, 6.3_

  - [x] 1.3 Add responsive layout guard and custom cursor stub on `#stage`
    - Ensure no horizontal overflow at 320 px – 2560 px viewport widths (test with `min-width: 320px` media query if needed)
    - Add `cursor: none` on `#stage` as a placeholder (CursorController will refine this later)
    - _Requirements: 6.2, 6.4_

- [ ] 2. Implement `AnimationController`
  - [x] 2.1 Write `AnimationController` as an inline JS object with `playOnce`, `playLoop`, and `stop` methods
    - `playOnce(el, className, onDone)` — adds class, listens for `animationend` (once), removes class, calls `onDone`; includes fallback `setTimeout` at animation-duration + 50 ms in case `animationend` never fires
    - `playLoop(el, className)` — adds class; no automatic removal
    - `stop(el, className)` — removes class
    - _Requirements: 2.2, 2.3, 6.3, 7.4_

  - [-] 2.2 Write unit tests for `AnimationController`
    - Mock `animationend` event; verify `onDone` is called after class is removed
    - Verify fallback `setTimeout` triggers `onDone` when `animationend` never fires
    - Verify `stop` removes the class immediately
    - _Requirements: 2.2, 2.3_

- [ ] 3. Implement `DogEntity`
  - [-] 3.1 Write the `DogEntity` constructor — creates `.dog > .dog__body` DOM node, positions it at `(x, y)`, appends to `#stage`, sets `dog--idle` class
    - Store `id`, `el`, `x`, `y`, `animState` on the instance
    - `moveTo(x, y)` updates `el.style.left` / `el.style.top` and clamps to stage bounds
    - `destroy()` removes the DOM node and nullifies all references
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.3_

  - [~] 3.2 Implement the `DogEntity` animation methods using `AnimationController`
    - `playClick()` — remove all reaction classes, use `AnimationController.playOnce` with `dog--click`; on done, apply `dog--idle`; if already in `dog--click`, restart (remove + re-add) per Req 2.5
    - `playHold()` — remove `dog--idle`, use `AnimationController.playLoop` with `dog--hold`
    - `stopHold()` — `AnimationController.stop('dog--hold')`, apply `dog--idle`
    - `startDrag()` — remove `dog--idle` and `dog--hold`, use `AnimationController.playLoop` with `dog--drag`
    - `stopDrag()` — `AnimationController.stop('dog--drag')`, apply `dog--idle`
    - Ensure mutual exclusivity: each method removes all other reaction classes before applying its own
    - _Requirements: 2.1, 2.3, 2.5, 3.1, 3.3, 3.4, 4.1, 4.3, 5.1, 5.2, 6.3_

  - [~] 3.3 Write property test for `DogEntity` animation mutual exclusivity
    - **Property 4: Mutual exclusivity of animation states**
    - **Validates: Requirements 5.1**
    - Generate arbitrary sequences of `playClick` / `playHold` / `stopHold` / `startDrag` / `stopDrag` calls; assert at most one of `{dog--click, dog--hold, dog--drag}` is present on `el.classList` at any point

  - [~] 3.4 Write property test for `DogEntity` idle lifecycle
    - **Property 11: Idle animation lifecycle**
    - **Validates: Requirements 6.3**
    - For any transition into an idle state, assert `dog--idle` is applied within 16 ms; for any transition out of idle, assert `dog--idle` is removed within 16 ms

  - [~] 3.5 Write property test for `DogEntity` spawn dimensions
    - **Property 12: Dog minimum spawn dimensions**
    - **Validates: Requirements 1.4**
    - Generate spawn at arbitrary `(x, y)` coordinates; assert `getBoundingClientRect()` returns `width ≥ 32` and `height ≥ 32` throughout the entity lifecycle

- [~] 4. Checkpoint — Core entity layer
  - Ensure all tests pass for `AnimationController` and `DogEntity`, ask the user if questions arise.

- [ ] 5. Implement `DogPool`
  - [~] 5.1 Write `DogPool` as an inline JS object managing an insertion-ordered array of `DogEntity` instances
    - `spawn(x, y)` — if `dogs.length === 50`, call `evictOldest()` first; create new `DogEntity(x, y)`, push to tail, return entity
    - `evictOldest()` — call `dogs[0].destroy()`, splice index 0 from array
    - `size()` — return `dogs.length`
    - _Requirements: 1.5, 1.6_

  - [~] 5.2 Write property test for `DogPool` LRU eviction invariant
    - **Property 6: Dog pool LRU eviction invariant**
    - **Validates: Requirements 1.5, 1.6**
    - Generate `N ∈ [51, 200]` sequential spawn calls; assert `pool.size() ≤ 50` after every call and that the entity with the smallest spawn index is removed on each overflow

  - [~] 5.3 Write unit tests for `DogPool` boundary behavior
    - 49 spawns → size = 49; 50th spawn → size = 50; 51st spawn → size still = 50, oldest entity destroyed
    - _Requirements: 1.5, 1.6_

- [ ] 6. Implement `InputStateMachine`
  - [~] 6.1 Write `InputStateMachine.init(containerEl)` — registers `mousedown`, `mousemove` (on `document`), `mouseup` (on `document`), and `contextmenu` / `selectstart` suppression handlers
    - Initialize internal state: `{ phase: 'IDLE', startX: 0, startY: 0, holdTimer: null, activeEntity: null }`
    - _Requirements: 5.1, 6.1_

  - [~] 6.2 Implement `mousedown` handler — transitions `IDLE → PENDING`
    - Record `startX`/`startY` from `clientX`/`clientY`
    - Call `DogPool.spawn(x, y)` and store reference in `activeEntity`
    - Start `holdTimer` with 300 ms delay; on fire: if still `PENDING`, transition to `HOLDING`, dispatch `dog:holdstart` on container
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 5.3_

  - [~] 6.3 Implement `mousemove` handler — handles `PENDING → DRAGGING` and `HOLDING → DRAGGING` transitions
    - Compute Euclidean distance from `(startX, startY)` to `(clientX, clientY)`
    - `PENDING` + Δ ≥ 10 px → `clearTimeout(holdTimer)`, transition to `DRAGGING`, dispatch `dog:dragstart`
    - `HOLDING` + Δ ≥ 10 px → transition to `DRAGGING`, dispatch `dog:dragstart`
    - `DRAGGING` → dispatch `dog:dragmove`
    - Suppress `contextmenu` and `selectstart` defaults when phase ≠ `IDLE`
    - _Requirements: 3.2, 4.1, 5.2, 5.4, 6.1_

  - [~] 6.4 Implement `mouseup` handler — handles all terminal transitions back to `IDLE`
    - `PENDING` + Δ < 10 px + t < 300 ms → `clearTimeout(holdTimer)`, dispatch `dog:click`, transition to `IDLE`
    - `PENDING` + Δ ≥ 10 px → `clearTimeout(holdTimer)`, dispatch `dog:dragend`, transition to `IDLE`
    - `HOLDING` → dispatch `dog:holdend`, transition to `IDLE`
    - `DRAGGING` → dispatch `dog:dragend`, transition to `IDLE`
    - Reset `activeEntity` to `null`
    - _Requirements: 2.1, 3.4, 4.3, 5.3, 5.5_

  - [~] 6.5 Write property test for click classification
    - **Property 1: Click classification and response**
    - **Validates: Requirements 1.1, 2.1, 5.1, 5.5**
    - Generate `(Δpx ∈ [0,9], Δms ∈ [0,299], random x/y)`; assert `dog:click` emitted and NOT `dog:holdstart` / `dog:dragstart`

  - [~] 6.6 Write property test for hold classification
    - **Property 2: Hold classification and response**
    - **Validates: Requirements 1.2, 3.1, 5.1**
    - Generate `(Δpx ∈ [0,9], Δms ∈ [300,2000], random x/y)`; assert `dog:holdstart` emitted and NOT `dog:click` / `dog:dragstart`

  - [~] 6.7 Write property test for drag classification
    - **Property 3: Drag classification and response**
    - **Validates: Requirements 1.3, 3.2, 4.1, 5.1, 5.4**
    - Generate `(Δpx ∈ [10,500], Δms ∈ [0,2000], random x/y)`; assert `dog:dragstart` emitted and NOT `dog:click` / `dog:holdstart`

  - [~] 6.8 Write property test for hold timer cancellation
    - **Property 9: Hold timer cancellation**
    - **Validates: Requirements 5.3**
    - Generate `mouseup` at `Δms ∈ [0,299]`; assert `dog--hold` class is never applied to the spawned dog

  - [~] 6.9 Write property test for hold-to-drag transition
    - **Property 5: Hold-to-Drag mid-interaction transition**
    - **Validates: Requirements 5.2**
    - Generate hold (≥300 ms) then movement ≥10 px; assert `dog--drag` active, `dog--hold` absent, transition within 100 ms

- [~] 7. Checkpoint — State machine layer
  - Ensure all tests pass for `InputStateMachine`, ask the user if questions arise.

- [ ] 8. Wire gesture events to `DogEntity` reactions
  - [~] 8.1 Add `dog:click` event listener on `#stage` — call `activeEntity.playClick()`
    - Listener is attached after `InputStateMachine.init()` to ensure events are routed
    - _Requirements: 2.1, 2.5_

  - [~] 8.2 Add `dog:holdstart` and `dog:holdend` event listeners on `#stage`
    - `dog:holdstart` → `activeEntity.playHold()`
    - `dog:holdend` → `activeEntity.stopHold()`
    - _Requirements: 3.1, 3.4_

  - [~] 8.3 Add `dog:dragstart`, `dog:dragmove`, and `dog:dragend` event listeners on `#stage`
    - `dog:dragstart` → `activeEntity.startDrag()`
    - `dog:dragmove` → `activeEntity.moveTo(e.detail.x, e.detail.y)` (with clamping)
    - `dog:dragend` → `activeEntity.stopDrag()`
    - _Requirements: 4.1, 4.2, 4.3_

  - [~] 8.4 Write property test for drag position tracking
    - **Property 10: Drag position tracking**
    - **Validates: Requirements 4.2**
    - Generate a sequence of `(x, y)` `mousemove` events during drag; assert `el.style.left` and `el.style.top` match each event's coordinates within 16 ms

  - [~] 8.5 Write property test for click reaction time bound and idle return
    - **Property 7: Click reaction time bound and idle return**
    - **Validates: Requirements 2.2, 2.3**
    - For any click interaction, assert the dog transitions back to `dog--idle` within 1000 ms of `mouseup`

  - [~] 8.6 Write property test for click reaction restart on re-click
    - **Property 8: Click reaction restart on re-click**
    - **Validates: Requirements 2.5**
    - Generate a click on a dog already in `dog--click` state; assert `dog--click` class is removed and re-added within 100 ms of the second `mouseup`

- [ ] 9. Implement `CursorController` and finalize visual polish
  - [~] 9.1 Implement `CursorController.init(containerEl)` — apply custom cursor to `#stage`
    - Embed cursor image as a CSS `url(data:image/...)` data URI, or use `cursor: none` + a `<div class="cursor">` that tracks `mousemove`
    - _Requirements: 6.2_

  - [~] 9.2 Suppress default browser drag behavior during interactions
    - In `InputStateMachine` handlers, call `e.preventDefault()` on `mousedown`, `mousemove` (during PENDING/HOLDING/DRAGGING), and on `contextmenu` / `selectstart` events
    - _Requirements: 6.1_

  - [~] 9.3 Verify responsive layout — no horizontal scroll at 320 px and 2560 px
    - Confirm `#stage` and `.dog` elements do not cause horizontal overflow at narrow and wide viewports
    - Add edge clamping: `clampedX = Math.max(16, Math.min(stageW - 16, x))` in `moveTo`
    - _Requirements: 6.4_

- [~] 10. Checkpoint — Integration wiring
  - Ensure all event listeners fire correctly end-to-end; run all unit and property tests, ask the user if questions arise.

- [ ] 11. Performance and compatibility verification
  - [~] 11.1 Audit CSS keyframe animations for layout-triggering properties
    - Ensure all `@keyframes` use only compositor-friendly properties (`transform`, `opacity`) to maintain 60 fps
    - _Requirements: 7.4_

  - [~] 11.2 Write integration/smoke test — load page, simulate interactions, assert DOM state
    - Simulate click → assert `.dog--click` appears within 100 ms
    - Simulate hold (300 ms) → assert `.dog--hold` appears
    - Simulate drag → assert dog position updates
    - Spawn 51 dogs in a loop → assert only 50 `.dog` nodes in DOM
    - _Requirements: 1.5, 1.6, 2.1, 3.1, 4.2, 7.3_

  - [~] 11.3 Verify single-file self-containment
    - Confirm no external script or stylesheet `<link>` / `<script src>` tags reference remote resources
    - _Requirements: 7.2_

- [~] 12. Final checkpoint — All tests pass
  - Run all tests (unit, property, integration). Ensure no uncaught exceptions. Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- The design specifies vanilla JS modules as inline IIFE or ES module objects — no `import`/`export` across files; everything goes in `index.html`
- Property tests reference the design document's numbered properties (P1–P12) for traceability
- Use fake/mock timers (e.g., via a minimal timer shim) to control the 300 ms hold threshold in tests without real wall-clock waits
- All animation timing (`animationend` fallback, 1000 ms click bound) must be exercised with mocked timers in tests
- Checkpoints at tasks 4, 7, 10, and 12 provide natural integration breaks

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5"] },
    { "id": 4, "tasks": ["5.1", "6.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.2"] },
    { "id": 6, "tasks": ["6.3"] },
    { "id": 7, "tasks": ["6.4", "6.5", "6.6", "6.7", "6.8", "6.9"] },
    { "id": 8, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 9, "tasks": ["8.4", "8.5", "8.6", "9.1", "9.2", "9.3"] },
    { "id": 10, "tasks": ["11.1", "11.2", "11.3"] }
  ]
}
```
