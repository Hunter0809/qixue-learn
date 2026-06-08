"use client";

const APP_STORAGE_PREFIX = "qixue_";
const SESSION_KEYS = ["shownQuoteIds"];
const PERSISTED_USER_DATA_KEYS = new Set([
  "qixue_users",
  "qixue_current_user",
  "qixue_weak_points",
  "qixue_resource_feed",
  "qixue_resource_cache",
  "qixue_learning_history",
  "qixue_today_tasks",
  "qixue_login_days",
  "qixue_goals"
]);

export type SiteDataClearResult = {
  localStorageKeys: number;
  sessionStorageKeys: number;
  cacheBuckets: number;
  cookies: number;
  serviceWorkers: number;
};

function removeMatchingStorage(storage: Storage, shouldRemove: (key: string) => boolean) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => key !== null && shouldRemove(key));
  keys.forEach((key) => storage.removeItem(key));
  return keys.length;
}

function clearCookies() {
  if (typeof document === "undefined") return 0;
  const cookies = document.cookie
    .split(";")
    .map((cookie) => cookie.split("=")[0]?.trim())
    .filter((name): name is string => Boolean(name));
  cookies.forEach((name) => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  });
  return cookies.length;
}

async function clearCacheBuckets() {
  if (typeof caches === "undefined") return 0;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
  return keys.length;
}

async function unregisterServiceWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return 0;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  return registrations.length;
}

export async function clearSiteData(): Promise<SiteDataClearResult> {
  const result: SiteDataClearResult = {
    localStorageKeys: 0,
    sessionStorageKeys: 0,
    cacheBuckets: 0,
    cookies: 0,
    serviceWorkers: 0
  };

  if (typeof localStorage !== "undefined") {
    result.localStorageKeys = removeMatchingStorage(
      localStorage,
      (key) => key.startsWith(APP_STORAGE_PREFIX) && !PERSISTED_USER_DATA_KEYS.has(key)
    );
  }

  if (typeof sessionStorage !== "undefined") {
    result.sessionStorageKeys = removeMatchingStorage(
      sessionStorage,
      (key) => key.startsWith(APP_STORAGE_PREFIX) || SESSION_KEYS.includes(key)
    );
  }

  result.cookies = clearCookies();
  result.cacheBuckets = await clearCacheBuckets();
  result.serviceWorkers = await unregisterServiceWorkers();

  window.dispatchEvent(new Event("auth-changed"));
  window.dispatchEvent(new Event("storage"));

  return result;
}
