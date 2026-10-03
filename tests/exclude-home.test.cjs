const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element(parentElement = null) {
  const attrs = new Map(), vars = new Map();
  return {
    parentElement, attrs, vars,
    hasAttribute: key => attrs.has(key),
    getAttribute: key => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, String(value)),
    removeAttribute: key => attrs.delete(key),
    style: { getPropertyValue: key => vars.get(key) ?? '', setProperty: (key, value) => vars.set(key, value), removeProperty: key => vars.delete(key) },
  };
}
async function setup(pathname = '/') {
  const html = element(), body = element(html), wrapper = element(body), player = element(wrapper);
  const video = element(player);
  class HTMLVideoElement {}
  Object.setPrototypeOf(video, HTMLVideoElement.prototype);
  video.closest = () => player;
  video.addEventListener = video.removeEventListener = () => {};
  let storageCallback, pollCallback;
  const context = vm.createContext({
    console, HTMLVideoElement, HTMLCanvasElement: class {}, location: { pathname },
    document: { documentElement: html, body, fullscreenElement: null, addEventListener: () => {}, querySelector: () => video },
    addEventListener: () => {}, setInterval: fn => { pollCallback = fn; },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} unobserve() {} },
    chrome: { storage: { local: { get: async () => ({}) }, onChanged: { addListener: fn => { storageCallback = fn; } } } },
    BiliAmbientRenderer: class {
      static createNoiseDataUrl() { return ''; }
      setSettings() {} setNoiseUrl() {} setSource() {} invalidate() {} requestRender() {}
      mount() { this.mounted = true; } unmount() { this.stop(); this.mounted = false; }
      start() { this.running = true; } stop() { this.running = false; }
    },
  });
  for (const file of ['settings.js', 'content.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'), context);
  }
  await new Promise(resolve => setImmediate(resolve));
  const controller = context.__biliAmbientController;
  return {
    context, controller, html, wrapper, player,
    setExcludeHome(value) { storageCallback({ biliAmbientSettings: { newValue: { excludeHome: value } } }, 'local'); },
    navigate(next) { context.location.pathname = next; pollCallback(); },
  };
}
test('new and existing saved settings default to unrestricted page behavior', async () => {
  const { context, controller } = await setup('/');
  assert.equal(context.BiliAmbientSettings.DEFAULTS.excludeHome, false);
  assert.equal(context.BiliAmbientSettings.sanitize({ spread: 150 }).excludeHome, false);
  assert.equal(context.BiliAmbientSettings.sanitize({ videoOnly: true }).excludeHome, false);
  assert.equal(context.BiliAmbientSettings.sanitize({ excludeHome: true }).excludeHome, true);
  assert.equal(controller.pageActive, true);
  assert.equal(controller.lightActive, true);
});
test('restricting the homepage stops rendering and clears all page styling', async () => {
  const s = await setup('/');
  assert.equal(s.html.getAttribute('data-bal'), 'on');
  s.setExcludeHome(true);
  assert.equal(s.controller.pageActive, false);
  assert.equal(s.controller.lightActive, false);
  assert.equal(s.controller.renderer.running, false);
  assert.equal(s.controller.renderer.mounted, false);
  for (const attr of ['data-bal', 'data-bal-light', 'data-bal-dark', 'data-bal-header', 'data-bal-shadow']) assert.equal(s.html.hasAttribute(attr), false);
  assert.equal(s.html.vars.size, 0);
  assert.equal(s.wrapper.hasAttribute('data-bal-clear'), false);
  assert.equal(s.player.hasAttribute('data-bal-clear'), false);
  s.setExcludeHome(false);
  assert.equal(s.controller.pageActive, true);
  assert.equal(s.controller.renderer.running, true);
});
test('only the homepage is excluded, and all other SPA routes remain enabled', async () => {
  const s = await setup('/video/BV1xx411c7mD/');
  s.setExcludeHome(true);
  assert.equal(s.controller.pageActive, true);
  for (const route of ['/video/BV2', '/bangumi/play/ep1', '/list/123', '/video', '/videos/BV1', '/foo/video/BV1']) {
    s.navigate(route);
    assert.equal(s.controller.pageActive, true, route);
    assert.equal(s.controller.renderer.running, true, route);
    assert.equal(s.html.getAttribute('data-bal'), 'on', route);
    s.navigate('/');
    assert.equal(s.controller.pageActive, false, route);
    assert.equal(s.controller.renderer.running, false, route);
    assert.equal(s.html.hasAttribute('data-bal'), false, route);
  }
  s.navigate('/video/BV2');
  s.controller.settings.enabled = false;
  s.controller.update();
  assert.equal(s.controller.pageActive, false);
});
