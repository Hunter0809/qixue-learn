import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const schoolsDir = path.join(ROOT, "public", "schools");
const departmentFile = path.join(schoolsDir, "provincial-education-departments.json");
const outputFile = path.join(schoolsDir, "official-k12-source-candidates.json");

const departments = JSON.parse(fs.readFileSync(departmentFile, "utf8"));
const keywords = [
  "中小学名单",
  "中小学名录",
  "学校名单",
  "义务教育学校名单",
  "普通高中学校名单",
  "中等职业学校名单",
  "学校名录"
];

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeUrl(raw) {
  try {
    const url = new URL(decodeHtml(raw));
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function hostMatches(url, domains) {
  try {
    const host = new URL(url).hostname;
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function titleFromHtml(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1].replace(/\s+/g, " ").trim()) : "";
}

function extractSearchLinks(html, domains) {
  const links = new Map();
  for (const match of html.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<\/item>/gi)) {
    const title = decodeHtml(match[1].replace(/\s+/g, " ").trim());
    const url = normalizeUrl(match[2].trim());
    if (!url || !hostMatches(url, domains)) continue;
    if (!keywords.some((keyword) => `${title} ${url}`.includes(keyword))) continue;
    links.set(url, title);
  }
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = decodeHtml(match[1]);
    if (href.startsWith("/")) continue;
    if (href.includes("bing.com/ck/a")) {
      const urlParam = href.match(/[?&]u=([^&]+)/)?.[1];
      if (urlParam) {
        try {
          href = Buffer.from(decodeURIComponent(urlParam).replace(/^a1/, ""), "base64").toString("utf8");
        } catch {}
      }
    }
    const url = normalizeUrl(href);
    if (!url || !hostMatches(url, domains)) continue;
    const text = decodeHtml(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!keywords.some((keyword) => `${text} ${url}`.includes(keyword))) continue;
    links.set(url, text);
  }
  return Array.from(links, ([url, title]) => ({ url, title }));
}

function extractAttachments(html, pageUrl, domains) {
  const attachments = [];
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+\.(?:xls|xlsx|csv|zip|rar|pdf)(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = normalizeUrl(new URL(decodeHtml(match[1]), pageUrl).toString());
    if (!hostMatches(url, domains)) continue;
    const title = decodeHtml(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    attachments.push({ title, url });
  }
  return attachments;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 qixue-official-school-source-discovery"
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function searchDepartment(department) {
  const candidates = [];
  for (const domain of department.domains) {
    for (const keyword of keywords) {
      const searchUrl = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(`site:${domain} ${keyword}`)}`;
      try {
        const html = await fetchText(searchUrl);
        candidates.push(...extractSearchLinks(html, department.domains).map((item) => ({
          ...item,
          province: department.province,
          department: department.name,
          searchKeyword: keyword,
          sourceType: "省级教育主管部门"
        })));
      } catch (error) {
        candidates.push({
          province: department.province,
          department: department.name,
          url: searchUrl,
          title: "",
          searchKeyword: keyword,
          sourceType: "搜索失败",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  const unique = Array.from(new Map(candidates.filter((item) => !item.error).map((item) => [item.url, item])).values());
  for (const candidate of unique) {
    try {
      const html = await fetchText(candidate.url);
      candidate.pageTitle = titleFromHtml(html);
      candidate.attachments = extractAttachments(html, candidate.url, department.domains);
      candidate.verifiedOfficialDomain = true;
    } catch (error) {
      candidate.attachments = [];
      candidate.error = error instanceof Error ? error.message : String(error);
    }
  }

  return [...unique, ...candidates.filter((item) => item.error)];
}

const all = [];
for (const department of departments) {
  console.log(`Searching ${department.province} ${department.name}`);
  all.push(...await searchDepartment(department));
}

const output = {
  updatedAt: new Date().toISOString(),
  rule: "Only pages and attachments under configured official provincial education department domains are accepted.",
  keywords,
  departments,
  candidates: Array.from(new Map(all.map((item) => [`${item.province}:${item.url}`, item])).values())
};

fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
console.log(`Wrote ${output.candidates.length} candidates to ${outputFile}`);
