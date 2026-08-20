const IMAGE_CACHE = "beau-school-images-v2";
const MAX_RUNTIME_IMAGES = 180;

const CORE_IMAGES = [
  "/school/announcements-title.webp",
  "/school/announcements-underline.webp",
  "/school/announcement-view.webp",
  "/school/announcement-listen.webp",
  "/school/announcement-got-it.webp",
  "/school/assignment-details-play.webp",
  "/school/assignment-details-pause.webp",
  "/school/menu-button.webp",
  "/school/logout-button.webp",
  "/school/menu-todo.webp",
  "/school/menu-classes.webp",
  "/school/menu-inbox.webp",
  "/school/menu-calendar.webp",
  "/school/menu-alarms.webp",
  "/school/menu-chat.webp",
  "/school/menu-inspiration.webp",
  "/school/menu-resources.webp",
  "/school/menu-stats.webp",
  "/school/menu-admin.webp",
  "/school/due-today-banner.webp",
  "/school/due-tomorrow-banner.webp",
  "/school/this-week-banner.webp",
  "/school/beau-profile.webp",
  "/school/cathy-profile.webp",
  "/school/mom-profile.webp",
  "/school/dad-profile.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(IMAGE_CACHE)
      .then((cache) => Promise.allSettled(CORE_IMAGES.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("beau-school-images-") && key !== IMAGE_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_RUNTIME_IMAGES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_RUNTIME_IMAGES).map((request) => cache.delete(request)));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.destination !== "image") return;
  event.respondWith((async () => {
    const cache = await caches.open(IMAGE_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok || response.type === "opaque") {
        event.waitUntil(cache.put(request, response.clone()).then(() => trimCache(cache)));
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});
