const baseUrl = process.env.QIXUE_WEB_BASE_URL || "http://localhost:3000";

const routes = [
  "/",
  "/ai-answer",
  "/photo-search",
  "/photo-translate",
  "/homework",
  "/language-tools",
  "/organize-tools",
  "/review-plan",
  "/resources",
  "/report",
  "/profile",
  "/quiz",
  "/mistakes",
  "/goals",
  "/pomodoro"
];

const failures = [];

for (const route of routes) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      method: "HEAD",
      signal: controller.signal
    });
    if (!response.ok) {
      failures.push(`${route} -> HTTP ${response.status}`);
    } else {
      console.log(`OK ${route}`);
    }
  } catch (error) {
    failures.push(`${route} -> ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

if (failures.length) {
  console.error("Route smoke test failed:");
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Route smoke test passed for ${routes.length} routes.`);
