'use strict';

const CACHE = 'jalsah-v3-2';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './bank.js',
  './questions.js', './trivia-world.js', './trivia-science.js', './trivia-culture.js',
  './trivia-extra.js', './letters-bank.js', './icon.svg', './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('jalsah-') && key !== CACHE).map(key => caches.delete(key))
  )));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok && ASSETS.some(asset => new URL(asset, self.registration.scope).href === url.href)) {
        await cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      return await cache.match(event.request) ??
        (event.request.mode === 'navigate' ? await cache.match('./index.html') : undefined) ??
        Response.error();
    }
  })());
});
