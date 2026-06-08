import { clearStoredFixedResponses, getStoredFixedResponse, setStoredFixedResponse } from "@/lib/server-db";

const CACHE_TTL_MS = 1000 * 60 * 8;

const responseCache = new Map<string, { expiresAt: number; value: unknown }>();

export async function getCachedHomeworkResponse(key: string, now = Date.now()) {
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) {
    responseCache.delete(key);
  }
  const stored = await getStoredFixedResponse(key, now);
  if (!stored) return null;
  responseCache.set(key, { expiresAt: now + CACHE_TTL_MS, value: stored });
  return stored;
}

export async function setCachedHomeworkResponse(key: string, value: unknown, now = Date.now()) {
  const expiresAt = now + CACHE_TTL_MS;
  responseCache.set(key, { expiresAt, value });
  await setStoredFixedResponse(key, value, expiresAt);
}

export async function clearHomeworkResponseCache() {
  const entries = responseCache.size;
  responseCache.clear();
  return entries + await clearStoredFixedResponses();
}
