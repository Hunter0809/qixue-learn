"use client";

import type { DifficultyPreference, HomeworkRequest, HomeworkResponse, LearnerProfile } from "@/lib/types";

const USERS_KEY = "qixue_users";
const CURRENT_USER_KEY = "qixue_current_user";
const GUEST_KEY = "qixue_guest_session";
const HISTORY_KEY = "qixue_learning_history";
const TASKS_KEY = "qixue_today_tasks";
const LOGIN_DAYS_KEY = "qixue_login_days";
const CUSTOM_SCHOOLS_KEY = "qixue_custom_schools";
const WEAK_POINTS_KEY = "qixue_weak_points";
const RESOURCE_FEED_KEY = "qixue_resource_feed";
const REVIEW_PLAN_CACHE_KEY = "qixue_review_plan_cache";
const ANON_USER = "__anonymous__";

export type SchoolStage = "小学" | "初中" | "高中" | "大学";

export type StoredUser = LearnerProfile & {
  username: string;
  nickname: string;
  avatarUrl: string;
  createdAt: number;
  school: string;
  grade: string;
  region: string;
  difficulty: DifficultyPreference;
};

export type LearningHistoryRecord = {
  id: string;
  ownerKey: string;
  feature: HomeworkRequest["feature"];
  title: string;
  subject: string;
  input: string;
  response: HomeworkResponse;
  createdAt: number;
  updatedAt: number;
};

export type StoredTodayTask = {
  id: string;
  ownerKey: string;
  title: string;
  knowledge: string;
  exercises: number;
  minutes: number;
  status: "todo" | "done";
  createdAt: number;
  updatedAt: number;
};

export const SYSTEM_AVATARS = ["学", "问", "思", "知", "勤", "明", "策", "行"];

export const GRADE_OPTIONS = [
  "小学一年级",
  "小学二年级",
  "小学三年级",
  "小学四年级",
  "小学五年级",
  "小学六年级",
  "初一",
  "初二",
  "初三",
  "高一",
  "高二",
  "高三",
  "大学一年级",
  "大学二年级",
  "大学三年级",
  "大学四年级",
  "研究生"
];

export const DIFFICULTY_OPTIONS: DifficultyPreference[] = ["基础", "同步", "提高", "竞赛"];

export const REGION_OPTIONS = [
  "北京 北京市",
  "上海 上海市",
  "江苏 南京市",
  "江苏 苏州市",
  "浙江 杭州市",
  "广东 广州市",
  "广东 深圳市",
  "湖北 武汉市",
  "四川 成都市",
  "陕西 西安市"
];

export const PROVINCE_CITIES: Record<string, string[]> = {
  "北京": ["北京市"],
  "上海": ["上海市"],
  "天津": ["天津市"],
  "重庆": ["重庆市"],
  "河北": ["石家庄市","唐山市","秦皇岛市","邯郸市","邢台市","保定市","张家口市","承德市","沧州市","廊坊市","衡水市"],
  "山西": ["太原市","大同市","阳泉市","长治市","晋城市","晋中市","运城市","忻州市","临汾市","吕梁市","朔州市"],
  "内蒙古": ["呼和浩特市","包头市","乌海市","赤峰市","通辽市","鄂尔多斯市","呼伦贝尔市","巴彦淙尔市","乌兰察市","兴安盟","锡林郭勒盟","阿拉善盟"],
  "辽宁": ["沈阳市","大连市","鞍山市","抚顺市","本溪市","丹东市","锦州市","营口市","阜新市","辽阳市","盘锦市","铁岭市","朝阳市","葫芦岛市"],
  "吉林": ["长春市","吉林市","四平市","辽源市","通化市","白山市","松原市","白城市","延边朝鲜族自治州"],
  "黑龙江": ["哈尔滨市","齐齐哈尔市","鸡西市","鹤岗市","双鸭山市","大庆市","伊春市","佳木斯市","七台河市","牡丹江市","黑河市","绥化市","大兴安岭地区"],
  "江苏": ["南京市","苏州市","无锡市","常州市","南通市","徐州市","盐城市","扬州市","泰州市","镇江市","淮安市","连云港市","宿迁市"],
  "浙江": ["杭州市","宁波市","温州市","嘉兴市","湖州市","绍兴市","金华市","衢州市","舟山市","台州市","丽水市"],
  "安徽": ["合肥市","芜湖市","蚌埠市","淮南市","马鞍山市","淮北市","铜陵市","安庆市","黄山市","滁州市","阜阳市","宿州市","六安市","亳州市","池州市","宣城市"],
  "福建": ["福州市","厦门市","泉州市","莆田市","漳州市","龙岩市","三明市","南平市","宁德市"],
  "江西": ["南昌市","景德镇市","蓝乡市","九江市","上饶市","抚州市","宜春市","吉安市","萍乡市","新余市","鹰潭市","赣州市"],
  "山东": ["济南市","青岛市","淄博市","枣庄市","东营市","烟台市","潍坊市","济宁市","泰安市","威海市","日照市","临沂市","德州市","聊城市","滨州市","菏泽市"],
  "河南": ["郑州市","开封市","洛阳市","平顶山市","安阳市","鹤壁市","新乡市","焦作市","濮阳市","许昌市","漯河市","三门峡市","南阳市","商丘市","信阳市","周口市","驻马店市","济源市"],
  "湖北": ["武汉市","黄石市","十堰市","宜昌市","襄阳市","鄂州市","荆门市","孝感市","荆州市","黄冈市","咸宁市","随州市","恩施土家族苗族自治州","仙桃市","潜江市","天门市"],
  "湖南": ["长沙市","株洲市","湘潭市","衡阳市","邵阳市","岳阳市","常德市","张家界市","益阳市","永州市","怀化市","婀底市","郴州市","湘西土家族苗族自治州"],
  "广东": ["广州市","深圳市","佛山市","东莞市","珠海市","中山市","惠州市","江门市","潎头市","湛江市","肇庆市","茂名市","梅州市","清远市","揭阳市","潮州市","韶关市","河源市","阳江市","汕尾市","云浮市"],
  "广西": ["南宁市","柳州市","桂林市","梧州市","北海市","防城港市","钦州市","贵港市","玉林市","百色市","河池市","来宾市","崇左市","贺州市"],
  "海南": ["海口市","三亚市","东方市","琼海市","文昌市","陵水黎族自治县"],
  "四川": ["成都市","绵阳市","德阳市","宜宾市","泸州市","自贡市","内江市","乐山市","遂宁市","南充市","眉山市","广安市","达州市","雅安市","巴中市","资阳市","攀枝花市","凉山彝族自治州","甘孜藏族自治州","阿坝藏族羌族自治州","西昌市"],
  "贵州": ["贵阳市","遵义市","六盘水市","安顺市","毕节市","铜仁市","黔东南苗族侗族自治州","黔南布依族苗族自治州","黔西南布依族苗族自治州"],
  "云南": ["昆明市","曲靖市","玉溪市","保山市","昭通市","丽江市","普洱市","临沧市","楚雄彝族自治州","红河哈尼族彝族自治州","文山壮族苗族自治州","西双版纳傣族自治州","大理白族自治州","德宏傣族景颇族自治州","迪庆藏族自治州","怒江傈僳族自治州"],
  "西藏": ["拉萨市","日喀则市","昌都市","林芝市","山南市","那曲市","里可地区"],
  "陕西": ["西安市","宝鸡市","咸阳市","铜川市","渭南市","延安市","汉中市","榆林市","安康市","商洛市"],
  "甘肃": ["兰州市","嘉峪关市","金昌市","白银市","天水市","武威市","庆阳市","平凉市","酒泉市","张掖市","定西市","陇南市","临夏州","甘南藏族自治州"],
  "青海": ["西宁市","海东市","海西蒙古族藏族自治州"],
  "宁夏": ["银川市","石嘴山市","吴忠市","固原市","中卫市"],
  "新疆": ["乌鲁木齐市","克拉玛依市","哈密市","吐鲁番市","昌吉回族自治州","巴音郭楞蒙古自治州","阿克苏地区","喀什地区","伊犁哈萨克自治州","塔城地区","和田地区","阿勒泰地区","博尔塔拉蒙古自治州"]
};

export function getProvinces(): string[] {
  return Object.keys(PROVINCE_CITIES);
}

export function getCitiesForProvince(province: string): string[] {
  return PROVINCE_CITIES[province] || [];
}

export function provinceFromRegion(region: string): string {
  return region.split(" ")[0] || "";
}

export function cityFromRegion(region: string): string {
  return region.split(" ").slice(1).join(" ") || "";
}

// 硬编码学校名单已移除 — 改为使用教育部官方名单
// 可通过 loadOfficialSchoolCatalog() 加载 /schools/school-catalog.json
// 自定义学校可通过 importCustomSchools() 添加
const SCHOOL_BY_REGION_STAGE: Record<string, Record<SchoolStage, string[]>> = {};

export function stageForGrade(grade: string): SchoolStage {
  if (grade.startsWith("小学")) return "小学";
  if (grade.startsWith("初")) return "初中";
  if (grade.startsWith("高")) return "高中";
  return "大学";
}

export function schoolsForRegionAndGrade(region: string, grade: string) {
  return mergeSchools(SCHOOL_BY_REGION_STAGE[region]?.[stageForGrade(grade)] || [], loadCustomSchools(region, stageForGrade(grade)));
}

export function schoolsForRegion(region: string) {
  const stages = SCHOOL_BY_REGION_STAGE[region];
  const builtIn = stages ? [...stages["小学"], ...stages["初中"], ...stages["高中"], ...stages["大学"]] : [];
  const custom = (["小学", "初中", "高中", "大学"] as SchoolStage[]).flatMap((stage) => loadCustomSchools(region, stage));
  return mergeSchools(builtIn, custom);
}

function available() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function loadUsers(): Record<string, StoredUser> {
  if (!available()) return {};
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "{}") as Record<string, StoredUser>;
  } catch {
    return {};
  }
}

function saveUsers(users: Record<string, StoredUser>) {
  if (!available()) return;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function syncUserProfileToBackend(user: StoredUser) {
  if (!available()) return;
  void fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: user.username,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      school: user.school,
      grade: user.grade,
      region: user.region,
      difficulty: user.difficulty
    })
  }).catch(() => undefined);
}

function applyRemoteArchive(owner: string, archive: {
  profile?: {
    nickname?: string;
    avatarUrl?: string;
    school?: string;
    grade?: string;
    region?: string;
    difficulty?: DifficultyPreference;
  } | null;
  learningRecords?: Array<{
    id: string;
    ownerKey: string;
    feature: HomeworkRequest["feature"];
    title: string;
    subject: string;
    input: string;
    response: HomeworkResponse;
    createdAt: number;
    updatedAt: number;
  }>;
  weakPoints?: Array<{
    owner?: string;
    subject: string;
    knowledge: string;
    weight: number;
    source?: string;
    updatedAt?: number;
  }>;
  reviewPlans?: Array<{
    subject: string;
    plan: { planId: string; summary: string; days: Array<{ day: number; title: string; minutes: number; priority: number; knowledge: string[]; resources: string[] }> };
    updatedAt: number;
  }>;
  resources?: Array<{
    id: string;
    title: string;
    type: "lecture" | "exercise" | "diagram" | "analogy";
    subject?: string;
    knowledge: string;
    difficulty: "easy" | "medium" | "hard";
    summary: string;
    content?: string;
  }>;
}) {
  if (!available()) return;
  const users = loadUsers();
  const existing = users[owner];
  if (existing && archive.profile) {
    users[owner] = {
      ...existing,
      ...archive.profile,
      username: existing.username,
      createdAt: existing.createdAt
    };
    saveUsers(users);
  }
  if (archive.learningRecords?.length) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(archive.learningRecords));
  }
  if (archive.weakPoints?.length) {
    const weakPoints = archive.weakPoints.map((point) => ({
      id: `wp_${point.subject}_${point.knowledge}`,
      subject: point.subject,
      knowledge: point.knowledge,
      weight: point.weight,
      masteryProgress: Math.max(0, 100 - point.weight),
      lastUpdated: point.updatedAt || Date.now(),
      history: [{ date: point.updatedAt || Date.now(), correct: false, source: point.source || "backend-archive" }]
    }));
    localStorage.setItem(WEAK_POINTS_KEY, JSON.stringify(weakPoints));
  }
  if (archive.reviewPlans?.length) {
    const nextCache = Object.fromEntries(
      archive.reviewPlans.map((entry) => [
        entry.subject,
        {
          signature: entry.plan.planId,
          plan: entry.plan,
          timestamp: entry.updatedAt
        }
      ])
    );
    localStorage.setItem(REVIEW_PLAN_CACHE_KEY, JSON.stringify(nextCache));
  }
  if (archive.resources?.length) {
    localStorage.setItem(RESOURCE_FEED_KEY, JSON.stringify(archive.resources));
  }
}

async function syncUserArchiveFromBackend(owner: string) {
  if (!available()) return;
  try {
    const resp = await fetch(`/api/profile/archive?owner=${encodeURIComponent(owner)}`);
    if (!resp.ok) return;
    const archive = await resp.json() as Parameters<typeof applyRemoteArchive>[1];
    applyRemoteArchive(owner, archive);
  } catch {
    return;
  }
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
}

function mergeSchools(first: string[], second: string[]) {
  return Array.from(new Set([...first, ...second].map((item) => item.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function loadCustomSchoolMap(): Record<string, Record<SchoolStage, string[]>> {
  if (!available()) return {};
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_SCHOOLS_KEY) || "{}") as Record<string, Record<SchoolStage, string[]>>;
  } catch {
    return {};
  }
}

function loadCustomSchools(region: string, stage: SchoolStage) {
  return loadCustomSchoolMap()[region]?.[stage] || [];
}

export function importCustomSchools(region: string, grade: string, rawText: string) {
  if (!available()) return [];
  const stage = stageForGrade(grade);
  const names = rawText
    .split(/\r?\n|,|，|;|；|\t/)
    .map((item) => item.trim())
    .filter(Boolean);
  const map = loadCustomSchoolMap();
  map[region] = map[region] || { "小学": [], "初中": [], "高中": [], "大学": [] };
  map[region][stage] = mergeSchools(map[region][stage] || [], names);
  localStorage.setItem(CUSTOM_SCHOOLS_KEY, JSON.stringify(map));
  return schoolsForRegionAndGrade(region, grade);
}

export function addCustomSchool(region: string, grade: string, school: string) {
  return importCustomSchools(region, grade, school);
}

function recordLoginDayForOwner(owner: string) {
  if (!available()) return;
  const all = loadLoginDaysMap();
  const days = new Set(all[owner] || []);
  days.add(todayKey());
  all[owner] = Array.from(days).sort();
  localStorage.setItem(LOGIN_DAYS_KEY, JSON.stringify(all));
}

function loadLoginDaysMap(): Record<string, string[]> {
  if (!available()) return {};
  try {
    return JSON.parse(localStorage.getItem(LOGIN_DAYS_KEY) || "{}") as Record<string, string[]>;
  } catch {
    return {};
  }
}

export function markCurrentLoginDay() {
  recordLoginDayForOwner(ownerKey());
}

export function getLearningStreakDays() {
  const days = new Set(loadLoginDaysMap()[ownerKey()] || []);
  if (!days.size) return 0;
  let cursor = new Date();
  let streak = 0;
  while (days.has(todayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return streak;
}

export function getLearningActiveDates() {
  return (loadLoginDaysMap()[ownerKey()] || []).sort((a, b) => parseDateKey(a) - parseDateKey(b));
}

export function generateRandomNickname() {
  const prefix = ["清朗", "沉稳", "敏捷", "专注", "自律", "温和", "明亮", "从容"];
  const suffix = ["学习者", "解题家", "探索者", "小先生", "规划师", "思考者"];
  return `${prefix[Math.floor(Math.random() * prefix.length)]}${suffix[Math.floor(Math.random() * suffix.length)]}`;
}

export function loadCurrentUsername() {
  if (!available()) return null;
  return localStorage.getItem(CURRENT_USER_KEY);
}

export function isGuestSession() {
  if (!available()) return false;
  return localStorage.getItem(GUEST_KEY) === "1";
}

export function hasActiveSession() {
  return Boolean(loadCurrentUsername()) || isGuestSession();
}

export function enterGuestSession() {
  if (!available()) return;
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.setItem(GUEST_KEY, "1");
  recordLoginDayForOwner(ANON_USER);
}

export function loadCurrentUserProfile(): StoredUser | null {
  const username = loadCurrentUsername();
  if (!username) return null;
  return loadUsers()[username] || null;
}

export function getLearnerProfile(): LearnerProfile | undefined {
  const user = loadCurrentUserProfile();
  if (!user) return undefined;
  return {
    nickname: user.nickname,
    school: user.school,
    grade: user.grade,
    region: user.region,
    difficulty: user.difficulty
  };
}

export function loginUser(username: string): StoredUser | null {
  const key = username.trim().toLowerCase();
  const user = loadUsers()[key];
  if (!user || !available()) return null;
  localStorage.removeItem(GUEST_KEY);
  localStorage.setItem(CURRENT_USER_KEY, key);
  recordLoginDayForOwner(key);
  syncUserProfileToBackend(user);
  void syncUserArchiveFromBackend(key);
  return user;
}

export function registerUser(username: string, profile: {
  nickname: string;
  avatarUrl: string;
  school: string;
  grade: string;
  region: string;
  difficulty: DifficultyPreference;
}) {
  const key = username.trim().toLowerCase();
  const users = loadUsers();
  const user: StoredUser = {
    username: key,
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl,
    school: profile.school,
    grade: profile.grade,
    region: profile.region,
    difficulty: profile.difficulty,
    createdAt: Date.now()
  };
  users[key] = user;
  saveUsers(users);
  syncUserProfileToBackend(user);
  void syncUserArchiveFromBackend(key);
  if (available()) {
    localStorage.removeItem(GUEST_KEY);
    localStorage.setItem(CURRENT_USER_KEY, key);
    recordLoginDayForOwner(key);
  }
  return user;
}

export function updateCurrentUserProfile(patch: Partial<Pick<StoredUser, "nickname" | "avatarUrl" | "school" | "grade" | "region" | "difficulty">>) {
  const username = loadCurrentUsername();
  if (!username) return null;
  const users = loadUsers();
  if (!users[username]) return null;
  users[username] = { ...users[username], ...patch };
  saveUsers(users);
  syncUserProfileToBackend(users[username]);
  return users[username];
}

export function logoutUser() {
  if (!available()) return;
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(GUEST_KEY);
}

function ownerKey() {
  return loadCurrentUsername() || ANON_USER;
}

function loadAllHistory(): LearningHistoryRecord[] {
  if (!available()) return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as LearningHistoryRecord[];
  } catch {
    return [];
  }
}

export function loadLearningHistory() {
  const owner = ownerKey();
  return loadAllHistory().filter((record) => record.ownerKey === owner).sort((a, b) => b.updatedAt - a.updatedAt);
}

function loadAllTasks(): StoredTodayTask[] {
  if (!available()) return [];
  try {
    return JSON.parse(localStorage.getItem(TASKS_KEY) || "[]") as StoredTodayTask[];
  } catch {
    return [];
  }
}

function saveAllTasks(tasks: StoredTodayTask[]) {
  if (!available()) return;
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

export function loadTodayTasks() {
  const owner = ownerKey();
  return loadAllTasks().filter((task) => task.ownerKey === owner).sort((a, b) => a.createdAt - b.createdAt);
}

export function createTodayTask(input: Omit<StoredTodayTask, "id" | "ownerKey" | "status" | "createdAt" | "updatedAt"> & { status?: StoredTodayTask["status"] }) {
  const now = Date.now();
  const task: StoredTodayTask = {
    ...input,
    id: `task_${now}`,
    ownerKey: ownerKey(),
    status: input.status || "todo",
    createdAt: now,
    updatedAt: now
  };
  saveAllTasks([...loadAllTasks(), task]);
  return task;
}

export function updateTodayTask(id: string, patch: Partial<Pick<StoredTodayTask, "title" | "knowledge" | "exercises" | "minutes" | "status">>) {
  const owner = ownerKey();
  const tasks = loadAllTasks();
  const next = tasks.map((task) => task.id === id && task.ownerKey === owner ? { ...task, ...patch, updatedAt: Date.now() } : task);
  saveAllTasks(next);
  return next.find((task) => task.id === id && task.ownerKey === owner) || null;
}

export function saveLearningHistory(input: HomeworkRequest, response: HomeworkResponse) {
  if (!available() || isGuestSession()) return null;
  const now = Date.now();
  const record: LearningHistoryRecord = {
    id: `${input.feature}_${now}`,
    ownerKey: ownerKey(),
    feature: input.feature,
    title: response.title,
    subject: input.subject,
    input: input.content,
    response,
    createdAt: now,
    updatedAt: now
  };
  const owner = ownerKey();
  const all = loadAllHistory();
  const others = all.filter((item) => item.ownerKey !== owner);
  const mine = [record, ...all.filter((item) => item.ownerKey === owner)].slice(0, 120);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([...others, ...mine]));
  return record;
}

export function deleteLearningHistory(id: string) {
  if (!available()) return;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(loadAllHistory().filter((record) => record.id !== id)));
}

