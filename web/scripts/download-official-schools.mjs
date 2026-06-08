import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const sources = [
  {
    type: "普通高等学校",
    url: "https://www.moe.gov.cn/jyb_xxgk/s5743/s5744/A03/202406/W020240621412769813275.xls",
    file: "moe-2024-regular-higher-education.xls"
  },
  {
    type: "成人高等学校",
    url: "https://www.moe.gov.cn/jyb_xxgk/s5743/s5744/A03/202406/W020240621412769848577.xls",
    file: "moe-2024-adult-higher-education.xls"
  }
];

const outputDir = path.join(process.cwd(), "public", "schools");
fs.mkdirSync(outputDir, { recursive: true });

async function download(source) {
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`Failed to download ${source.url}: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const target = path.join(outputDir, source.file);
  fs.writeFileSync(target, buffer);
  return target;
}

function normalizeCell(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseWorkbook(file, source) {
  const workbook = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    defval: ""
  });
  const headerIndex = rows.findIndex((row) => row.some((cell) => ["学校名称", "学校（机构）名称"].includes(normalizeCell(cell))));
  if (headerIndex < 0) return [];
  const header = rows[headerIndex].map(normalizeCell);
  const nameIndex = header.findIndex((item) => item === "学校名称" || item === "学校（机构）名称");
  const codeIndex = header.findIndex((item) => item === "学校标识码" || item === "学校（机构）标识码");
  const ownerIndex = header.indexOf("主管部门");
  const cityIndex = header.findIndex((item) => item === "所在地" || item === "所在地区");
  const levelIndex = header.indexOf("办学层次");
  const noteIndex = header.indexOf("备注");

  const items = [];
  let currentCity = "";
  for (const row of rows.slice(headerIndex + 1)) {
    const first = normalizeCell(row[0]);
    const section = first.match(/^(.+?)（\d+所）$/);
    if (section) {
      currentCity = section[1];
      continue;
    }
    const name = normalizeCell(row[nameIndex]);
    const city = cityIndex >= 0 ? normalizeCell(row[cityIndex]) : currentCity;
    if (!name || !city) continue;
    items.push({
      name,
      code: normalizeCell(row[codeIndex]),
      owner: normalizeCell(row[ownerIndex]),
      city,
      stage: "大学",
      level: levelIndex >= 0 ? normalizeCell(row[levelIndex]) : "成人高等学校",
      note: noteIndex >= 0 ? normalizeCell(row[noteIndex]) : "",
      sourceType: source.type
    });
  }
  return items;
}

const files = [];
for (const source of sources) {
  files.push({ source, file: await download(source) });
}

const schools = files.flatMap(({ file, source }) => parseWorkbook(file, source));
const cities = Array.from(new Set(schools.map((school) => school.city))).sort((a, b) => a.localeCompare(b, "zh-CN"));
const byCity = Object.fromEntries(cities.map((city) => [
  city,
  schools
    .filter((school) => school.city === city)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
]));

const catalog = {
  updatedAt: new Date().toISOString(),
  source: {
    name: "中华人民共和国教育部《全国高等学校名单》（截至2024年6月20日）",
    page: "https://www.moe.gov.cn/jyb_xxgk/s5743/s5744/202406/t20240621_1136990.html",
    files: sources.map(({ type, url }) => ({ type, url })),
    note: "教育部公开 Excel 覆盖全国普通高等学校和成人高等学校，不含港澳台地区高等学校。中小学全量名录需从学校（机构）代码管理信息系统或各省市教育主管部门公开文件导入。"
  },
  cities,
  byCity
};

fs.writeFileSync(path.join(outputDir, "school-catalog.json"), JSON.stringify(catalog, null, 2));
console.log(`Downloaded and parsed ${schools.length} official school records in ${cities.length} cities.`);
