import fs from "node:fs";
import path from "node:path";

const catalogPath = path.join(process.cwd(), "public", "schools", "school-catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const supplemental = {
  "北京市": {
    "小学": ["北京市中关村第一小学", "北京市史家小学", "北京小学", "清华大学附属小学", "北京第二实验小学"],
    "初中": ["中国人民大学附属中学", "北京市第四中学", "北京师范大学附属实验中学", "北京市第八中学", "清华大学附属中学"],
    "高中": ["中国人民大学附属中学", "北京市第四中学", "北京师范大学附属实验中学", "北京市第十一学校", "清华大学附属中学"]
  },
  "上海市": {
    "小学": ["上海市第一师范学校附属小学", "上海市实验学校小学部", "上海市明珠小学", "上海市静安区第一中心小学"],
    "初中": ["上海市实验学校", "上海市市北初级中学", "上海市延安初级中学", "上海外国语大学附属外国语学校"],
    "高中": ["上海中学", "华东师范大学第二附属中学", "复旦大学附属中学", "上海交通大学附属中学"]
  },
  "南京市": {
    "小学": ["南京市拉萨路小学", "南京市力学小学", "南京市北京东路小学", "南京师范大学附属小学"],
    "初中": ["南京外国语学校", "南京师范大学附属中学树人学校", "南京市金陵汇文学校"],
    "高中": ["南京师范大学附属中学", "金陵中学", "南京外国语学校", "南京市第一中学"]
  },
  "苏州市": {
    "小学": ["苏州市实验小学校", "苏州工业园区星海小学", "苏州高新区实验小学校"],
    "初中": ["苏州中学园区校", "苏州工业园区星海实验中学", "苏州市立达中学校"],
    "高中": ["江苏省苏州中学校", "苏州大学附属中学", "苏州市第一中学校", "苏州市第十中学校"]
  },
  "杭州市": {
    "小学": ["杭州市学军小学", "杭州市胜利小学", "杭州市天长小学", "杭州市文三街小学"],
    "初中": ["杭州文澜中学", "杭州市建兰中学", "杭州采荷实验学校"],
    "高中": ["杭州第二中学", "杭州学军中学", "杭州高级中学", "杭州外国语学校"]
  },
  "广州市": {
    "小学": ["华南师范大学附属小学", "广州市东风东路小学", "广州市文德路小学", "广州市朝天小学"],
    "初中": ["华南师范大学附属中学", "广东实验中学", "广州市第二中学", "广州市执信中学"],
    "高中": ["华南师范大学附属中学", "广东实验中学", "广州市第二中学", "广州市执信中学"]
  },
  "深圳市": {
    "小学": ["深圳实验学校小学部", "深圳小学", "深圳市南山实验教育集团麒麟小学", "深圳市福田区荔园小学"],
    "初中": ["深圳实验学校初中部", "深圳中学初中部", "深圳外国语学校初中部", "深圳高级中学初中部"],
    "高中": ["深圳中学", "深圳实验学校高中部", "深圳外国语学校", "深圳高级中学"]
  },
  "武汉市": {
    "小学": ["武汉小学", "武汉市育才小学", "武汉市水果湖第一小学", "华中师范大学附属小学"],
    "初中": ["武汉外国语学校", "华中师范大学第一附属中学初中部", "武汉市武珞路中学"],
    "高中": ["华中师范大学第一附属中学", "武汉外国语学校", "湖北省武昌实验中学", "武汉市第二中学"]
  },
  "成都市": {
    "小学": ["成都市泡桐树小学", "成都市龙江路小学", "成都市实验小学", "成都师范附属小学"],
    "初中": ["成都七中育才学校", "成都树德实验中学", "成都石室联合中学"],
    "高中": ["成都七中", "成都石室中学", "成都树德中学", "四川师范大学附属中学"]
  },
  "西安市": {
    "小学": ["西安小学", "西安市实验小学", "陕西师范大学附属小学", "西安高新第一小学"],
    "初中": ["西安高新第一中学初中校区", "西安铁一中分校", "陕西师范大学附属中学"],
    "高中": ["西安高新第一中学", "西北工业大学附属中学", "西安交通大学附属中学", "西安市铁一中学"]
  }
};

const sourceType = "内置中小学扩展目录";

for (const [city, stages] of Object.entries(supplemental)) {
  catalog.byCity[city] = catalog.byCity[city] || [];
  if (!catalog.cities.includes(city)) catalog.cities.push(city);
  const existing = new Set(catalog.byCity[city].map((school) => `${school.stage}:${school.name}`));
  for (const [stage, names] of Object.entries(stages)) {
    for (const name of names) {
      const key = `${stage}:${name}`;
      if (existing.has(key)) continue;
      catalog.byCity[city].push({
        name,
        code: "",
        owner: "",
        city,
        stage,
        level: stage,
        note: "扩展目录",
        sourceType
      });
      existing.add(key);
    }
  }
  catalog.byCity[city].sort((a, b) => a.stage.localeCompare(b.stage, "zh-CN") || a.name.localeCompare(b.name, "zh-CN"));
}

catalog.cities = Array.from(new Set(catalog.cities)).sort((a, b) => a.localeCompare(b, "zh-CN"));
catalog.source.note = `${catalog.source.note} 已合并主要城市中小学扩展目录，sourceType=${sourceType}。`;

fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log("Augmented school catalog with supplemental K12 schools.");
