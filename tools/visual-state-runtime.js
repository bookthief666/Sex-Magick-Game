(function attachSexMagickVisualState(root) {
  'use strict';

  const QUERY_KEY = 'visualQa';
  const QUERY_VALUE = '1';
  const INSTALL_TIMEOUT_MS = 12_000;
  let installed = false;
  let installTimer = null;
  let rafQueue = [];
  let nextRafId = 1;

  function queryEnabled(locationLike = root.location) {
    try {
      return new URLSearchParams(locationLike?.search || '').get(QUERY_KEY) === QUERY_VALUE;
    } catch (_error) {
      return false;
    }
  }

  function dependenciesReady() {
    return (
      typeof game !== 'undefined' && Boolean(game) &&
      typeof GameState !== 'undefined' &&
      typeof Pillar !== 'undefined'
    );
  }

  function installStyle() {
    if (document.getElementById('sex-magick-visual-qa-style')) return;
    const style = document.createElement('style');
    style.id = 'sex-magick-visual-qa-style';
    style.textContent = `
      html.sex-magick-visual-qa *,
      html.sex-magick-visual-qa *::before,
      html.sex-magick-visual-qa *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      html.sex-magick-visual-qa body {
        font-family: Arial, Helvetica, sans-serif !important;
      }
      html.sex-magick-visual-qa .title-text,
      html.sex-magick-visual-qa .level-indicator,
      html.sex-magick-visual-qa .score-display,
      html.sex-magick-visual-qa .mystic-btn,
      html.sex-magick-visual-qa .instructions,
      html.sex-magick-visual-qa .stats-panel,
      html.sex-magick-visual-qa #gate-slice-hud,
      html.sex-magick-visual-qa #gate-slice-telegraph {
        font-family: Arial, Helvetica, sans-serif !important;
      }
      html.sex-magick-visual-qa .scanlines { opacity: .26 !important; }
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add('sex-magick-visual-qa');
  }

  function installRafController() {
    root.requestAnimationFrame = callback => {
      const id = nextRafId++;
      rafQueue.push({ id, callback });
      return id;
    };
    root.cancelAnimationFrame = id => {
      rafQueue = rafQueue.filter(entry => entry.id !== id);
    };
  }

  function silenceRuntime() {
    try {
      for (const key of ['pause', 'resume', 'play', 'stop', 'switchToGameMusic', 'switchToGameOverMusic', 'switchToMenuMusic']) {
        if (root.AudioSys && typeof root.AudioSys[key] === 'function') root.AudioSys[key] = () => {};
      }
      for (const key of ['jump', 'collect', 'crash', 'levelUp', 'voidEnter', 'playTone']) {
        if (root.SFX && typeof root.SFX[key] === 'function') root.SFX[key] = () => {};
      }
      for (const key of ['jump', 'collect', 'crash', 'levelUp', 'start']) {
        if (root.Haptics && typeof root.Haptics[key] === 'function') root.Haptics[key] = () => {};
      }
      if (root.Leaderboard) {
        root.Leaderboard.submit = async () => ({ visualQa: true });
      }
    } catch (_error) {}

    game.settings.music = false;
    game.settings.sfx = false;
    game.settings.vibration = false;
  }

  function setHidden(id, hidden) {
    const element = document.getElementById(id);
    if (!element) return;
    element.classList.toggle('hidden', Boolean(hidden));
  }

  function resetUi() {
    for (const id of ['startScreen', 'gameOverScreen', 'pauseScreen', 'settingsScreen']) setHidden(id, true);
    for (const id of ['scoreUi', 'pauseBtn', 'instructions', 'mobileControls']) setHidden(id, true);
    const telegraph = document.getElementById('gate-slice-telegraph');
    if (telegraph) telegraph.hidden = true;
  }

  function stabilizeGame() {
    silenceRuntime();
    game.frames = 180;
    game.shake = 0;
    game.hitStop = 0;
    game.glitchEffect = false;
    game.glitchTimer = 0;
    game.screenFlash = null;
    game.particles = [];
    game.collectibles = [];
    game.pentagrams = [];
    if (game.player) {
      game.player.y = Math.round(game.canvas.height * 0.48);
      game.player.vy = 0;
      game.player.rot = 0.35;
      game.player.scaleX = 1;
      game.player.scaleY = 1;
      game.player.jumpCooldown = 0;
      game.player.trail = [
        { x: game.player.x - 18, y: game.player.y + 4, r: game.player.r, life: .55, rot: .22, scaleX: 1, scaleY: 1 },
        { x: game.player.x - 9, y: game.player.y + 2, r: game.player.r, life: .78, rot: .28, scaleX: 1, scaleY: 1 }
      ];
      game.player.update = () => {};
    }
  }

  function createPillar(xRatio, topRatio, gap, rotation) {
    const pillar = new Pillar(0, gap);
    pillar.x = Math.round(game.canvas.width * xRatio);
    pillar.top = Math.round(game.canvas.height * topRatio);
    pillar.baseTop = pillar.top;
    pillar.gap = gap;
    pillar.rotation = rotation;
    pillar.innerPattern = Math.round(rotation * 10) % 3;
    pillar.hasWarning = false;
    pillar.warningAlpha = 0;
    pillar.marked = false;
    pillar.patternFamily = xRatio > .8 ? 'pressure' : 'safe';
    pillar.update = () => {};
    pillar.collides = () => false;
    return pillar;
  }

  function drawNow() {
    if (typeof game.drawScene === 'function') game.drawScene();
    if (typeof root.__SEX_MAGICK_GATE_SLICE__?.getSnapshot === 'function') {
      const hud = document.getElementById('gate-slice-hud');
      if (hud && game.gateSliceState) hud.hidden = false;
    }
  }

  function prepareGameplay(options = {}) {
    resetUi();
    game.gameMode = 'HEX';
    game.startGame();
    game.state = GameState.PLAYING;
    stabilizeGame();

    const gap = Math.max(145, Math.min(220, Math.round(game.canvas.height * .28)));
    game.obstacles = [
      createPillar(.62, .19, gap, .31),
      createPillar(.88, .42, gap, .58)
    ];
    game.score = Number(options.score ?? 7);
    document.getElementById('scoreUi').textContent = String(game.score);
    setHidden('scoreUi', false);
    setHidden('pauseBtn', false);
    setHidden('instructions', false);
    setHidden('mobileControls', true);
    setHidden('startScreen', true);
    setHidden('gameOverScreen', true);
    drawNow();
    return snapshot();
  }

  function showMenu() {
    resetUi();
    game.state = GameState.START;
    setHidden('startScreen', false);
    setHidden('menuButtons', false);
    setHidden('loadingMsg', true);
    setHidden('scoreUi', true);
    setHidden('pauseBtn', true);
    drawNow();
    return snapshot('menu');
  }

  function showGameplay() {
    prepareGameplay({ score: 7 });
    return snapshot('gameplay');
  }

  function showDeath() {
    prepareGameplay({ score: 13 });
    game.gameOver();
    game.state = GameState.GAMEOVER;
    game.screenFlash = null;
    game.shake = 0;
    setHidden('gameOverScreen', false);
    setHidden('scoreUi', true);
    setHidden('pauseBtn', true);
    document.getElementById('finalScore').textContent = '13';
    document.getElementById('uploadStatus').textContent = 'VISUAL QA · LOCAL ONLY';
    drawNow();
    return snapshot('death');
  }

  function showRetry() {
    showDeath();
    game.restartGame();
    game.state = GameState.PLAYING;
    stabilizeGame();
    const gap = Math.max(145, Math.min(220, Math.round(game.canvas.height * .28)));
    game.obstacles = [createPillar(.72, .28, gap, .42)];
    game.score = 0;
    document.getElementById('scoreUi').textContent = '0';
    setHidden('gameOverScreen', true);
    setHidden('scoreUi', false);
    setHidden('pauseBtn', false);
    setHidden('instructions', false);
    drawNow();
    return snapshot('retry');
  }

  function requireGateSlice() {
    if (!root.__SEX_MAGICK_GATE_SLICE__ || !game.gateSliceState) {
      throw new Error('Gate slice is unavailable. Open with ?gateSlice=1&visualQa=1.');
    }
  }

  function showGateOffer() {
    prepareGameplay({ score: 21 });
    requireGateSlice();
    root.__SEX_MAGICK_GATE_SLICE__.forceGnosis(10);
    root.__SEX_MAGICK_GATE_SLICE__.spawnGateNow();
    game.gateSliceOffer.x = Math.round(game.canvas.width * .72);
    game.gateSliceOffer.y = Math.round(game.canvas.height * .38);
    game.gateSliceOffer.pulse = 0;
    drawNow();
    return snapshot('gate-offer');
  }

  function showGateBank() {
    showGateOffer();
    game.player.update = () => {};
    game.obstacles = [];
    game.gateSliceOffer.y = game.player.y + 180;
    game.gateSliceOffer.x = game.player.x - game.gateSliceOffer.outerRadius - game.player.r - game.gameSpeed - 4;
    game.updateGameObjects();
    drawNow();
    return snapshot('gate-bank');
  }

  function showVoid() {
    prepareGameplay({ score: 34 });
    requireGateSlice();
    root.__SEX_MAGICK_GATE_SLICE__.forceGnosis(10);
    root.__SEX_MAGICK_GATE_SLICE__.spawnGateNow();
    game.player.update = () => {};
    game.obstacles = [];
    game.gateSliceOffer.x = game.player.x + game.gameSpeed;
    game.gateSliceOffer.y = game.player.y;
    game.updateGameObjects();
    game.voidTimer = 300;
    game.frames = 360;
    drawNow();
    return snapshot('void');
  }

  function showState(name) {
    switch (String(name || '').toLowerCase()) {
      case 'menu': return showMenu();
      case 'gameplay': return showGameplay();
      case 'death': return showDeath();
      case 'retry': return showRetry();
      case 'gate-offer': return showGateOffer();
      case 'gate-bank': return showGateBank();
      case 'void': return showVoid();
      default: throw new Error(`Unknown visual QA state: ${name}`);
    }
  }

  function visibleLayer() {
    for (const id of ['settingsScreen', 'pauseScreen', 'gameOverScreen', 'startScreen']) {
      const element = document.getElementById(id);
      if (element && !element.classList.contains('hidden')) return id;
    }
    return 'gameplay';
  }

  function snapshot(label = null) {
    const gate = root.__SEX_MAGICK_GATE_SLICE__?.getSnapshot?.() || null;
    const canvas = document.getElementById('gameCanvas');
    return {
      label,
      state: game.state,
      layer: visibleLayer(),
      score: Number(game.score || 0),
      frames: Number(game.frames || 0),
      viewport: [root.innerWidth, root.innerHeight],
      logicalCanvas: [Number(canvas?.dataset.smLogicalWidth || canvas?.width || 0), Number(canvas?.dataset.smLogicalHeight || canvas?.height || 0)],
      gate: gate ? {
        active: gate.active,
        offer: Boolean(gate.offer),
        voidActive: gate.voidActive,
        gnosis: gate.state?.gnosis ?? null,
        banks: gate.state?.gateBanks ?? null,
        entries: gate.state?.gateEntries ?? null
      } : null,
      rafQueueLength: rafQueue.length
    };
  }

  function install() {
    if (installed || !queryEnabled() || !dependenciesReady()) return root.__SEX_MAGICK_VISUAL_QA__ || null;
    installed = true;
    installStyle();
    installRafController();
    silenceRuntime();

    root.__SEX_MAGICK_VISUAL_QA__ = Object.freeze({
      mode: 'deterministic-visual-state-controller',
      version: 1,
      states: Object.freeze(['menu', 'gameplay', 'death', 'retry', 'gate-offer', 'gate-bank', 'void']),
      showState,
      showMenu,
      showGameplay,
      showDeath,
      showRetry,
      showGateOffer,
      showGateBank,
      showVoid,
      snapshot,
      clearRafQueue() { rafQueue = []; return 0; }
    });

    console.info('[SEX MAGICK] Visual QA controller installed', {
      query: `${QUERY_KEY}=${QUERY_VALUE}`,
      states: root.__SEX_MAGICK_VISUAL_QA__.states
    });
    return root.__SEX_MAGICK_VISUAL_QA__;
  }

  function scheduleInstall() {
    if (!queryEnabled() || installed || installTimer) return;
    const startedAt = Date.now();
    installTimer = setInterval(() => {
      if (dependenciesReady()) {
        clearInterval(installTimer);
        installTimer = null;
        install();
      } else if (Date.now() - startedAt > INSTALL_TIMEOUT_MS) {
        clearInterval(installTimer);
        installTimer = null;
        console.error('[SEX MAGICK] Visual QA dependencies did not become ready');
      }
    }, 20);
  }

  if (typeof document !== 'undefined') scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this);
