'use strict';

/**
 * The arbiter that makes the transient-notice slot hold exactly one message.
 *
 * D-060, D-062, D-063 and D-064 each tried to keep four independently-positioned
 * notices out of the play field and each failed differently. D-065 removes the
 * possibility instead: one shared offset, and this module guaranteeing one
 * visible notice. These tests pin the guarantee itself - the geometry is pinned
 * separately in `tests/cross-screen.spec.ts`.
 */

const assert = require('node:assert/strict');

// A DOM stub small enough to be obviously correct: the module only ever calls
// document.getElementById and reads/writes `.hidden`.
function makeDom(ids) {
  const elements = new Map(ids.map(id => [id, { id, hidden: true }]));
  globalThis.document = {
    getElementById(id) { return elements.get(id) || null; }
  };
  return elements;
}

function freshSlot() {
  delete require.cache[require.resolve('./notice-slot.js')];
  return require('./notice-slot.js');
}

// --- registration ---------------------------------------------------------
{
  const slot = freshSlot();
  makeDom([]);
  slot.resetForTest();

  assert.deepEqual(slot.getRegistered(), [], 'starts empty');
  assert.equal(slot.register('a'), true);
  assert.equal(slot.register('b'), true);
  assert.deepEqual(slot.getRegistered(), ['a', 'b']);

  // Runtimes rebuild their notices and re-register; that must not accumulate.
  slot.register('a');
  assert.deepEqual(slot.getRegistered(), ['a', 'b'], 're-registering is idempotent');

  assert.equal(slot.register(''), false, 'an empty id is not a notice');
  assert.equal(slot.register(null), false);
  assert.equal(slot.register(undefined), false);
  assert.deepEqual(slot.getRegistered(), ['a', 'b'], 'rejected ids are not stored');
}

// --- exactly one visible --------------------------------------------------
{
  const slot = freshSlot();
  const elements = makeDom(['telegraph', 'banner', 'missions', 'powerups']);
  slot.resetForTest();
  for (const id of elements.keys()) slot.register(id);

  // All four try to speak at once - the situation that produced every previous
  // overlap report.
  for (const element of elements.values()) element.hidden = false;

  const hidden = slot.claim('banner');
  assert.deepEqual(
    hidden.sort(),
    ['missions', 'powerups', 'telegraph'],
    'claiming hides every other registered notice'
  );
  assert.equal(elements.get('banner').hidden, false, 'the claimant stays visible');
  const visible = [...elements.values()].filter(element => !element.hidden);
  assert.equal(visible.length, 1, 'exactly one notice may be on screen');

  // Handing the slot on hides the previous holder.
  slot.claim('telegraph');
  assert.equal(elements.get('banner').hidden, true, 'the previous holder yields');
}

// --- claim reports only what it actually hid ------------------------------
{
  const slot = freshSlot();
  const elements = makeDom(['a', 'b']);
  slot.resetForTest();
  slot.register('a');
  slot.register('b');

  assert.deepEqual(slot.claim('a'), [], 'nothing visible means nothing to hide');
  elements.get('b').hidden = false;
  assert.deepEqual(slot.claim('a'), ['b'], 'reports the one it hid');
  assert.deepEqual(slot.claim('a'), [], 'and does not report it twice');
}

// --- never throws on the gameplay path ------------------------------------
{
  const slot = freshSlot();
  slot.resetForTest();

  // Registered before the element exists: the runtimes build notices lazily, so
  // this is the normal early-boot state, not an error.
  makeDom([]);
  slot.register('not-built-yet');
  assert.deepEqual(slot.claim('other'), [], 'a missing element is skipped quietly');

  // An element whose `hidden` setter throws must not take down the announce
  // that was trying to use the slot.
  globalThis.document = {
    getElementById() {
      return { get hidden() { return false; }, set hidden(_value) { throw new Error('detached'); } };
    }
  };
  slot.resetForTest();
  slot.register('hostile');
  assert.deepEqual(slot.claim('other'), [], 'a throwing element is swallowed, not propagated');

  // No document at all (the module is also loaded under Node by this test).
  delete globalThis.document;
  slot.resetForTest();
  slot.register('x');
  assert.deepEqual(slot.claim('y'), [], 'no DOM is not a crash');
}

// --- claiming with no id is still safe ------------------------------------
{
  const slot = freshSlot();
  const elements = makeDom(['a']);
  slot.resetForTest();
  slot.register('a');
  elements.get('a').hidden = false;

  // No id means nothing is being kept, so everything hides - a defensible
  // "clear the slot" and, importantly, not a throw.
  assert.deepEqual(slot.claim(), ['a']);
  assert.equal(elements.get('a').hidden, true);
}

delete globalThis.document;
console.log('notice slot: one message at a time, and never a thrown announce');
