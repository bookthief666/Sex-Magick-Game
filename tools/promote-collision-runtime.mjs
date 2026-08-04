import { readFile, writeFile } from 'node:fs/promises';

const INDEX_PATH = 'index.html';
const BROWSER_TEST_PATH = 'tools/browser-fixed-step-test.mjs';
const COLLISION_SCRIPT = '    <script src="tools/collision-runtime.js"></script>';
const COLLISION_TEST_MARKER = 'async function testCollisionTruthAndTouch(client) {';

function replaceExactlyOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first === -1) throw new Error(`Promotion pattern not found: ${label}`);
  if (source.indexOf(search, first + search.length) !== -1) {
    throw new Error(`Promotion pattern is ambiguous: ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

async function promoteIndex() {
  let source = await readFile(INDEX_PATH, 'utf8');
  if (source.includes(COLLISION_SCRIPT)) return false;

  source = replaceExactlyOnce(
    source,
    '    <script src="tools/fixed-step-prototype.js"></script>\n',
    `    <script src="tools/fixed-step-prototype.js"></script>\n${COLLISION_SCRIPT}\n`,
    'fixed-step runtime script'
  );

  await writeFile(INDEX_PATH, source);
  return true;
}

function addBrowserCollisionTest(source) {
  if (source.includes(COLLISION_TEST_MARKER)) return source;

  const testFunction = String.raw`
async function testCollisionTruthAndTouch(client) {
  await client.send('Network.setBlockedURLs', { urls: EXTERNAL_BLOCKED_URLS });
  await navigate(client, \`${BASE_URL}/index.html?collisionQa=${Date.now()}#debug\`, {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true
  });
  await waitForExpression(client, \`!!globalThis.__SEX_MAGICK_COLLISION__ && !!globalThis.__SEX_MAGICK_TIMING__\`);

  const result = await evaluate(client, \`
    (() => {
      AudioSys.pause = () => {};
      AudioSys.resume = () => {};
      AudioSys.play = () => {};
      AudioSys.stop = () => {};
      SFX.playTone = async () => {};
      Haptics.jump = () => {};
      Haptics.collect = () => {};
      Haptics.crash = () => {};
      Haptics.levelUp = () => {};
      Haptics.start = () => {};

      const pillar = new Pillar(0, 180);
      pillar.x = 200;
      pillar.w = 80;
      pillar.top = 220;
      pillar.baseTop = 220;
      pillar.gap = 180;
      pillar.hasWarning = false;

      const rects = pillar.getCollisionRects(844);
      const safeGap = !pillar.collides(220, 240, 221, 399);
      const topCollision = pillar.collides(220, 240, 210, 230);
      const bottomCollision = pillar.collides(220, 240, 390, 410);
      const edgeTouchSafe = !pillar.collides(220, 240, 220, 230);

      __SEX_MAGICK_COLLISION__.setDebug(true);
      game.obstacles = [pillar];
      game.state = GameState.PLAYING;

      let jumpCount = 0;
      game.player = {
        x: 100,
        y: 300,
        r: CONFIG.PLAYER_RADIUS,
        vy: 0,
        jump() { jumpCount += 1; },
        update() {},
        draw() {}
      };

      const canvasTouch = new Event('touchstart', { bubbles: true, cancelable: true });
      game.canvas.dispatchEvent(canvasTouch);
      const afterUpperScreenTouch = jumpCount;

      const controlTouch = new Event('touchstart', { bubbles: true, cancelable: true });
      document.getElementById('pauseBtn').dispatchEvent(controlTouch);
      const afterControlTouch = jumpCount;

      let deathCount = 0;
      let obstacleUpdates = 0;
      game.gameOver = () => {
        deathCount += 1;
        game.state = GameState.GAMEOVER;
      };
      game.player = {
        x: 220,
        y: 210,
        r: CONFIG.PLAYER_RADIUS,
        vy: 0,
        update() {},
        draw() {}
      };
      pillar.update = () => { obstacleUpdates += 1; };
      pillar.marked = true;
      game.obstacles = [pillar];
      game.collectibles = [];
      game.pentagrams = [];
      game.particles = [];
      game.hitStop = 0;
      game.voidMode = false;
      game.state = GameState.PLAYING;
      game.fixedStepClock.reset(0);
      game.fixedStepClock.advance(100, () => {
        if (game.state === GameState.PLAYING) game.runFixedSimulationStep();
      });

      return {
        rects,
        safeGap,
        topCollision,
        bottomCollision,
        edgeTouchSafe,
        debugEnabled: __SEX_MAGICK_COLLISION__.isDebugEnabled(),
        touchPolicy: __SEX_MAGICK_COLLISION__.getSnapshot().touchPolicy,
        indicatorText: document.querySelector('.mobile-jump-indicator')?.textContent,
        jumpAreaPointerEvents: getComputedStyle(document.querySelector('.mobile-jump-area')).pointerEvents,
        afterUpperScreenTouch,
        afterControlTouch,
        canvasTouchPrevented: canvasTouch.defaultPrevented,
        controlTouchPrevented: controlTouch.defaultPrevented,
        deathCount,
        obstacleUpdates,
        stateAfterCatchUp: game.state
      };
    })()
  \`);

  assert.equal(result.safeGap, true, 'the canonical gap must be collision-free');
  assert.equal(result.topCollision, true, 'penetration into the top pillar must collide');
  assert.equal(result.bottomCollision, true, 'penetration into the bottom pillar must collide');
  assert.equal(result.edgeTouchSafe, true, 'touching the boundary without penetration must be safe');
  assert.equal(result.debugEnabled, true, 'collision overlay must be programmatically toggleable');
  assert.equal(result.touchPolicy, 'full-screen-gameplay-excluding-controls');
  assert.equal(result.indicatorText, 'TAP ANYWHERE');
  assert.equal(result.jumpAreaPointerEvents, 'none', 'instruction overlay must not steal touches');
  assert.equal(result.afterUpperScreenTouch, 1, 'upper-screen gameplay touch must jump');
  assert.equal(result.afterControlTouch, 1, 'touching a real control must not jump');
  assert.equal(result.canvasTouchPrevented, true, 'gameplay touch should suppress synthetic mouse input');
  assert.equal(result.controlTouchPrevented, false, 'control touch must remain available for click synthesis');
  assert.equal(result.deathCount, 1, 'multi-step catch-up must trigger one death transition');
  assert.equal(result.obstacleUpdates, 1, 'simulation work must stop after the death state change');
  assert.equal(result.stateAfterCatchUp, 'gameover');

  return result;
}

`;

  return replaceExactlyOnce(source, 'async function main() {', `${testFunction}async function main() {`, 'browser main function');
}

function addBrowserCollisionInvocation(source) {
  if (source.includes("console.log('PASS collision truth and touch policy'")) return source;

  const insertion = [
    "    const collision = await testCollisionTruthAndTouch(client);",
    "    console.log('PASS collision truth and touch policy', JSON.stringify(collision, null, 2));",
    '',
    '    assert.equal(exceptions.length, 0, `Browser emitted ${exceptions.length} uncaught exception(s)`);'
  ].join('\n');

  return replaceExactlyOnce(
    source,
    '    assert.equal(exceptions.length, 0, `Browser emitted ${exceptions.length} uncaught exception(s)`);',
    insertion,
    'browser final exception assertion'
  );
}

async function promoteBrowserTest() {
  const original = await readFile(BROWSER_TEST_PATH, 'utf8');
  let source = addBrowserCollisionTest(original);
  source = addBrowserCollisionInvocation(source);
  if (source === original) return false;
  await writeFile(BROWSER_TEST_PATH, source);
  return true;
}

const indexChanged = await promoteIndex();
const browserTestChanged = await promoteBrowserTest();

console.log(JSON.stringify({ indexChanged, browserTestChanged }));
