/*
 * Shared settings for the content script and the popup.
 * Stored as a single object in chrome.storage.local (no write quota, so slider
 * drags can be previewed live through chrome.storage.onChanged).
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'biliAmbientSettings';

  // Every tunable value with its range, so the popup and the clamp logic share one source of truth.
  const SCHEMA = {
    enabled: { type: 'bool', default: true },
    // How far the light reaches outside the video, in % of half the video's longest side.
    spread: { type: 'num', default: 260, min: 0, max: 400, step: 1 },
    // Step between stacked video copies (smaller = smoother edge extension, more draw calls).
    edge: { type: 'num', default: 8, min: 2, max: 50, step: 1 },
    // Blur strength, relative to the video size.
    blur: { type: 'num', default: 60, min: 0, max: 100, step: 1 },
    // Where the fade to the page background starts, in % of the spread distance.
    fadeStart: { type: 'num', default: 60, min: 0, max: 100, step: 1 },
    // Fade curve exponent * 100 (100 = linear, higher = faster falloff).
    fadeCurve: { type: 'num', default: 200, min: 50, max: 400, step: 10 },
    brightness: { type: 'num', default: 95, min: 0, max: 200, step: 1 },
    saturation: { type: 'num', default: 120, min: 0, max: 200, step: 1 },
    contrast: { type: 'num', default: 100, min: 0, max: 200, step: 1 },
    // 0 = follow the video frame rate.
    fps: { type: 'num', default: 0, min: 0, max: 144, step: 1 },
    // Output resolution of the light canvas in % (lower = cheaper, blurrier).
    resolution: { type: 'num', default: 100, min: 25, max: 200, step: 25 },
    barDetection: { type: 'bool', default: true },
    // Opt in to excluding only the homepage; all other pages retain their behavior.
    excludeHome: { type: 'bool', default: false },
    darkTheme: { type: 'bool', default: true },
    // Opacity of translucent card/button backgrounds when the dark theme is forced.
    cardOpacity: { type: 'num', default: 8, min: 0, max: 60, step: 1 },
    headerTransparent: { type: 'bool', default: true },
    textShadow: { type: 'bool', default: true },
    // Dithering noise overlay against color banding in dark gradients.
    debanding: { type: 'num', default: 30, min: 0, max: 100, step: 1 },
    backgroundColor: { type: 'color', default: '#000000' },
  };

  const DEFAULTS = Object.freeze(
    Object.fromEntries(Object.entries(SCHEMA).map(([k, v]) => [k, v.default]))
  );

  const HEX_COLOR = /^#[0-9a-f]{6}$/i;

  /** Coerces unknown/partial storage data into a complete, valid settings object. */
  function sanitize(raw) {
    const out = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return out;
    for (const [key, def] of Object.entries(SCHEMA)) {
      if (!(key in raw)) continue;
      const value = raw[key];
      if (def.type === 'bool') {
        out[key] = Boolean(value);
      } else if (def.type === 'num') {
        const n = Number(value);
        if (Number.isFinite(n)) out[key] = Math.min(def.max, Math.max(def.min, n));
      } else if (def.type === 'color') {
        if (typeof value === 'string' && HEX_COLOR.test(value)) out[key] = value;
      }
    }
    return out;
  }

  // chrome.storage is missing when the scripts are injected manually into a page (debugging).
  const AREA_NAME = 'local';
  const storageArea = () => globalThis.chrome?.storage?.[AREA_NAME] ?? null;

  async function load() {
    const area = storageArea();
    if (!area) return { ...DEFAULTS };
    try {
      const data = await area.get(STORAGE_KEY);
      return sanitize(data?.[STORAGE_KEY]);
    } catch (err) {
      console.warn('[BiliAmbient] Failed to load settings, using defaults', err);
      return { ...DEFAULTS };
    }
  }

  async function save(settings) {
    const clean = sanitize(settings);
    const area = storageArea();
    if (area) await area.set({ [STORAGE_KEY]: clean });
    return clean;
  }

  function onChange(callback) {
    const onChanged = globalThis.chrome?.storage?.onChanged;
    if (!onChanged) return () => {};
    const listener = (changes, areaName) => {
      if (areaName !== AREA_NAME || !changes[STORAGE_KEY]) return;
      callback(sanitize(changes[STORAGE_KEY].newValue));
    };
    onChanged.addListener(listener);
    return () => onChanged.removeListener(listener);
  }

  globalThis.BiliAmbientSettings = Object.freeze({
    SCHEMA,
    DEFAULTS,
    sanitize,
    load,
    save,
    onChange,
  });
})();
