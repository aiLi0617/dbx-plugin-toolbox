import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { constrainCrop } from '../src/lib/cropGeometry.js';
const source = readFileSync(new URL('../src/lib/CropSelection.svelte', import.meta.url), 'utf8');
function editor(overrides = {}) {
  let focused = false, captured = false;
  const target = { focus() { focused = true; }, setPointerCapture() { captured = true; }, hasPointerCapture() { return captured; }, releasePointerCapture() { captured = false; } };
  const state = { width: 100, height: 80, x: 10, y: 10, cropWidth: 40, cropHeight: 30, disabled: false, drag: null, constrainCrop, onchange() {}, surface: { getBoundingClientRect: () => ({ width: 500, height: 400 }) }, ...overrides };
  vm.createContext(state);
  vm.runInContext(source.slice(source.indexOf('  function apply('), source.indexOf('  $effect(')) + source.slice(source.indexOf('  function start('), source.indexOf('</script>')), state);
  const event = (extra = {}) => ({ currentTarget: target, pointerId: 1, button: 0, clientX: 100, clientY: 100, preventDefault() {}, stopPropagation() {}, ...extra });
  return { state, event, focused: () => focused, captured: () => captured };
}
test('pointer drag focuses and captures the crop, using source pixels at 5x preview scale', () => {
  const e = editor();
  e.state.start(e.event());
  assert.equal(e.focused(), true); assert.equal(e.captured(), true);
  e.state.move(e.event({ clientX: 150, clientY: 125 }));
  assert.equal(e.state.x, 20); assert.equal(e.state.y, 15);
  e.state.finish(e.event()); assert.equal(e.captured(), false);
  e.state.move(e.event({ clientX: 250 })); assert.equal(e.state.x, 20);
});
test('bottom-right drag resizes without moving the crop origin', () => {
  const e = editor(); e.state.start(e.event(), true);
  e.state.move(e.event({ clientX: 150, clientY: 125 }));
  assert.equal(e.state.cropWidth, 50); assert.equal(e.state.cropHeight, 35);
  assert.equal(e.state.x, 10); assert.equal(e.state.y, 10);
});
test('arrows move, Alt resizes and Shift changes the source-pixel step to ten', () => {
  const e = editor();
  e.state.key(e.event({ key: 'ArrowRight' })); assert.equal(e.state.x, 11);
  e.state.key(e.event({ key: 'ArrowDown', shiftKey: true })); assert.equal(e.state.y, 20);
  e.state.key(e.event({ key: 'ArrowLeft', altKey: true })); assert.equal(e.state.cropWidth, 39);
  e.state.key(e.event({ key: 'ArrowUp', altKey: true, shiftKey: true })); assert.equal(e.state.cropHeight, 20);
  assert.equal(e.state.x, 11); assert.equal(e.state.y, 20);
});
test('full-image selection can be shrunk before moving', () => {
  const e = editor({ x: 0, y: 0, cropWidth: 100, cropHeight: 80 });
  e.state.key(e.event({ key: 'ArrowRight' })); assert.equal(e.state.x, 0);
  e.state.key(e.event({ key: 'ArrowLeft', altKey: true, shiftKey: true }));
  e.state.key(e.event({ key: 'ArrowRight' })); assert.equal(e.state.x, 1);
});
test('unrelated pointers and disabled interactions do not change the selection', () => {
  const e = editor(); e.state.start(e.event());
  e.state.move(e.event({ pointerId: 2, clientX: 200 })); assert.equal(e.state.x, 10);
  e.state.disabled = true;
  e.state.move(e.event({ clientX: 200 })); e.state.key(e.event({ key: 'ArrowRight' }));
  assert.equal(e.state.x, 10);
});
test('crop stops moving after pointer capture is lost', () => {
  const e = editor(); e.state.start(e.event()); e.state.finish(e.event());
  assert.equal(e.state.drag, null);
  assert.match(source, /onlostpointercapture=\{finish\}/);
});
