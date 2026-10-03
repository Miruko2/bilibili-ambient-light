/*
 * Bilibili integration: finds the player, decides when the light should be visible and
 * switches the page into its "immersive" state (transparent backgrounds, dark theme).
 *
 * Page state lives on <html> attributes so all styling in content.css is opt-in:
 *   data-bal="on"      enabled and a video player is on the page (theme + transparent page)
 *   data-bal-light     light is drawn (player is inline: normal / wide mode)
 *   data-bal-dark      force the dark palette
 *   data-bal-header    translucent header bar
 *   data-bal-shadow    text shadows for readability
 */
(() => {
  'use strict';

  if (globalThis.__biliAmbientController) return; // Guard against double injection.

  const Settings = globalThis.BiliAmbientSettings;
  const AmbientRenderer = globalThis.BiliAmbientRenderer;
  if (!Settings || !AmbientRenderer) {
    console.error('[BiliAmbient] Missing settings.js or ambient.js');
    return;
  }

  const VIDEO_SELECTORS = [
    '.bpx-player-video-wrap video',
    '.bpx-player-video-wrap bwp-video',
    '#bilibili-player video',
    '#bilibili-player bwp-video',
  ];
  const PLAYER_SELECTOR = '.bpx-player-container';
  // Player modes where the video sits inside the page. In web fullscreen / fullscreen the video
  // covers the page, in mini mode it floats in a corner: the light is hidden there.
  const INLINE_SCREENS = new Set(['', 'normal', 'wide']);
  const POLL_INTERVAL_MS = 1000;
  const VIDEO_EVENTS = ['loadeddata', 'seeked', 'resize', 'play', 'pause'];

  const html = document.documentElement;

  function setAttr(elem, name, value) {
    if (value === null || value === false) {
      if (elem.hasAttribute(name)) elem.removeAttribute(name);
    } else {
      const str = value === true ? '' : String(value);
      if (elem.getAttribute(name) !== str) elem.setAttribute(name, str);
    }
  }

  function setVar(elem, name, value) {
    if (value === null) {
      elem.style.removeProperty(name);
    } else if (elem.style.getPropertyValue(name) !== value) {
      elem.style.setProperty(name, value);
    }
  }

  /** <bwp-video> is Bilibili's custom player element; it renders into an inner video or canvas. */
  function resolveSource(elem) {
    if (!elem) return null;
    if (elem instanceof HTMLVideoElement || elem instanceof HTMLCanvasElement) return elem;
    return elem.shadowRoot?.querySelector('video, canvas') ?? elem.querySelector('video, canvas') ?? null;
  }

  function getNoiseUrl() {
    const runtime = globalThis.chrome?.runtime;
    if (runtime?.id && typeof runtime.getURL === 'function') return runtime.getURL('assets/noise.png');
    return AmbientRenderer.createNoiseDataUrl(); // Injected manually for debugging.
  }

  class BiliAmbient {
    constructor() {
      this.settings = { ...Settings.DEFAULTS };
      this.renderer = new AmbientRenderer();
      this.host = null; // Element found in the DOM (<video> or <bwp-video>)
      this.source = null; // Drawable element (<video> or <canvas>)
      this.player = null;
      this.pageActive = false;
      this.lightActive = false;
      this.clearedElems = new Map();

      this.screenObserver = new MutationObserver(() => this.update());
      this.resizeObserver = new ResizeObserver(() => this.renderer.invalidate());
    }

    async init() {
      this.settings = await Settings.load();
      this.renderer.setSettings(this.settings);
      this.renderer.setNoiseUrl(getNoiseUrl());

      Settings.onChange((settings) => {
        this.settings = settings;
        this.renderer.setSettings(settings);
        this.update();
      });

      // Capture phase also catches scrolling of inner containers.
      addEventListener('scroll', () => this.renderer.requestRender(), { passive: true, capture: true });
      addEventListener('resize', () => this.renderer.invalidate(), { passive: true });
      document.addEventListener('fullscreenchange', () => this.update());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.renderer.requestRender();
      });

      // Bilibili is a SPA and recreates the player on navigation; polling is simple and robust.
      this.poll();
      setInterval(() => this.poll(), POLL_INTERVAL_MS);
    }

    poll() {
      let host = null;
      let source = null;
      for (const selector of VIDEO_SELECTORS) {
        host = document.querySelector(selector);
        source = resolveSource(host);
        if (source) break;
      }
      if (source !== this.source) this.bindSource(host, source);

      const player = this.host?.closest(PLAYER_SELECTOR) ?? null;
      if (player !== this.player) this.bindPlayer(player);

      this.update();
    }

    bindSource(host, source) {
      if (this.source) {
        for (const type of VIDEO_EVENTS) this.source.removeEventListener(type, this.onVideoEvent);
        this.source.removeEventListener('emptied', this.onVideoEmptied);
        this.resizeObserver.unobserve(this.source);
      }
      this.host = source ? host : null;
      this.source = source;
      if (source) {
        for (const type of VIDEO_EVENTS) source.addEventListener(type, this.onVideoEvent);
        source.addEventListener('emptied', this.onVideoEmptied);
        this.resizeObserver.observe(source);
      }
      this.renderer.setSource(source);
    }

    onVideoEvent = () => this.renderer.invalidate();

    // The same <video> element is reused when switching parts/episodes.
    onVideoEmptied = () => this.renderer.resetSourceState();

    bindPlayer(player) {
      this.screenObserver.disconnect();
      this.player = player;
      if (player) {
        this.screenObserver.observe(player, { attributes: true, attributeFilter: ['data-screen'] });
      }
    }

    update() {
      const s = this.settings;
      const pageAllowed = !s.excludeHome || location.pathname !== '/';
      const pageActive = Boolean(s.enabled && pageAllowed && this.source && document.body);
      const screen = this.player?.getAttribute('data-screen') ?? '';
      const lightActive = pageActive && INLINE_SCREENS.has(screen) && !document.fullscreenElement;

      if (pageActive) {
        this.applyPageState(lightActive);
        this.renderer.mount();
      } else if (this.pageActive) {
        this.renderer.unmount();
        this.clearPageState();
      }

      if (lightActive) {
        if (!this.lightActive) this.renderer.start();
        else this.renderer.requestRender();
      } else if (this.lightActive) {
        this.renderer.stop();
      }

      this.pageActive = pageActive;
      this.lightActive = lightActive;
    }

    applyPageState(lightActive) {
      const s = this.settings;
      setAttr(html, 'data-bal', 'on');
      setAttr(html, 'data-bal-light', lightActive);
      setAttr(html, 'data-bal-dark', s.darkTheme);
      setAttr(html, 'data-bal-header', s.headerTransparent);
      setAttr(html, 'data-bal-shadow', s.textShadow);
      setVar(html, '--bal-card-alpha', String(s.cardOpacity / 100));
      setVar(html, '--bal-bg', s.backgroundColor);
      this.markAncestors();
    }

    /**
     * Every ancestor of the video gets a transparent background so the light behind the page is
     * visible, whatever the page layout is (video, bangumi, list, festival pages).
     * Ancestors inside the player are only cleared while the light is drawn, so the player keeps
     * its black background in web fullscreen / mini mode.
     */
    markAncestors() {
      const chain = new Map();
      const playerRoot = this.host?.closest(`${PLAYER_SELECTOR}, #bilibili-player`);
      let insidePlayer = Boolean(playerRoot);
      for (let el = this.host?.parentElement; el && el !== document.body && el !== html; el = el.parentElement) {
        chain.set(el, insidePlayer ? 'player' : 'page');
        if (el === playerRoot) insidePlayer = false;
      }
      for (const el of this.clearedElems.keys()) {
        if (!chain.has(el)) el.removeAttribute('data-bal-clear');
      }
      for (const [el, kind] of chain) setAttr(el, 'data-bal-clear', kind);
      this.clearedElems = chain;
    }

    clearPageState() {
      for (const name of ['data-bal', 'data-bal-light', 'data-bal-dark', 'data-bal-header', 'data-bal-shadow']) {
        setAttr(html, name, null);
      }
      setVar(html, '--bal-card-alpha', null);
      setVar(html, '--bal-bg', null);
      for (const el of this.clearedElems.keys()) el.removeAttribute('data-bal-clear');
      this.clearedElems.clear();
    }
  }

  const controller = new BiliAmbient();
  globalThis.__biliAmbientController = controller;
  controller.init().catch((err) => console.error('[BiliAmbient] Failed to start', err));
})();
