const CACHE_NAME = "rowan-floor-planner-v5";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/floorplan.jpg",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
]; // closes cached asset list

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_ASSETS);
    }) // closes cache-open callback
  );
  self.skipWaiting();
}); // closes install listener

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key !== CACHE_NAME;
        }).map(function (key) {
          return caches.delete(key);
        }) // closes old-cache delete map
      );
    }) // closes cache-key callback
  );
  self.clients.claim();
}); // closes activate listener

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") {
    return;
  } // closes non-GET branch

  event.respondWith(
    fetch(event.request).then(function (response) {
      const copy = response.clone();

      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(event.request, copy);
      }); // closes runtime-cache callback

      return response;
    }).catch(function () {
      return caches.match(event.request).then(function (cached) {
        return cached || caches.match("./index.html");
      }); // closes offline cache lookup callback
    }) // closes network-first fallback
  );
}); // closes fetch listener
