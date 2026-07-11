import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { canonicalizeKnowledge } from "@/lib/knowledge-catalog";
import type { HomeworkRequest, HomeworkResponse, LearnerProfile, PlanResponse, Resource } from "@/lib/types";

const WORKSPACE_ROOT = path.basename(process.cwd()) === "web" ? path.dirname(process.cwd()) : process.cwd();
const DB_DIR = path.join(WORKSPACE_ROOT, "database");
const DB_PATH = path.join(DB_DIR, "qixue.sqlite");
const LEGACY_DB_PATH = path.join(WORKSPACE_ROOT, ".data", "qixue.sqlite");

let db: DatabaseSync | null = null;
let pg: NeonQueryFunction<false, false> | null = null;
let pgReady: Promise<void> | null = null;

function usePostgres() {
  return Boolean(process.env.DATABASE_URL);
}

function getPg() {
  if (!pg) {
    pg = neon(process.env.DATABASE_URL!);
  }
  return pg;
}

async function ensurePgSchema() {
  if (!usePostgres()) return;
  if (!pgReady) {
    const sql = getPg();
    const statements = [
      `CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL DEFAULT '',
        knowledge TEXT NOT NULL,
        type TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        content TEXT,
        profile_key TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_resources_knowledge ON resources (knowledge)",
      "CREATE INDEX IF NOT EXISTS idx_resources_knowledge_profile ON resources (knowledge, profile_key)",
      "CREATE INDEX IF NOT EXISTS idx_resources_subject ON resources (subject)",
      `CREATE TABLE IF NOT EXISTS weak_points (
        owner TEXT NOT NULL,
        subject TEXT NOT NULL,
        knowledge TEXT NOT NULL,
        weight DOUBLE PRECISION NOT NULL,
        source TEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (owner, subject, knowledge)
      )`,
      `CREATE TABLE IF NOT EXISTS user_profiles (
        owner TEXT PRIMARY KEY,
        nickname TEXT NOT NULL DEFAULT '',
        avatar_url TEXT NOT NULL DEFAULT '',
        school TEXT NOT NULL DEFAULT '',
        grade TEXT NOT NULL DEFAULT '',
        region TEXT NOT NULL DEFAULT '',
        difficulty TEXT NOT NULL DEFAULT '',
        updated_at BIGINT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS learning_records (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        feature TEXT NOT NULL,
        subject TEXT NOT NULL,
        input TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_learning_records_owner ON learning_records (owner, updated_at)",
      `CREATE TABLE IF NOT EXISTS review_plans (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        subject TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_review_plans_owner_subject ON review_plans (owner, subject, updated_at)",
      `CREATE TABLE IF NOT EXISTS learning_behaviors (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        subject TEXT NOT NULL,
        knowledge TEXT NOT NULL,
        source TEXT NOT NULL,
        weight DOUBLE PRECISION NOT NULL,
        created_at BIGINT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_learning_behaviors_owner_knowledge ON learning_behaviors (owner, subject, knowledge, created_at)",
      `CREATE TABLE IF NOT EXISTS dictionary_entries (
        language TEXT NOT NULL,
        term TEXT NOT NULL,
        normalized_term TEXT NOT NULL,
        phonetic TEXT NOT NULL DEFAULT '',
        translation TEXT NOT NULL DEFAULT '',
        definition TEXT NOT NULL DEFAULT '',
        combinations_json TEXT NOT NULL DEFAULT '[]',
        examples_json TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL DEFAULT '',
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (language, normalized_term)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_dictionary_language_term ON dictionary_entries (language, normalized_term)",
      `CREATE TABLE IF NOT EXISTS dictionary_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS learning_videos (
        id TEXT PRIMARY KEY,
        bvid TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        play INTEGER NOT NULL DEFAULT 0,
        duration TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        tag TEXT NOT NULL DEFAULT '',
        keyword TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '',
        level TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_learning_videos_keyword ON learning_videos (keyword, updated_at)",
      "CREATE INDEX IF NOT EXISTS idx_learning_videos_subject ON learning_videos (subject, updated_at)",
      "CREATE INDEX IF NOT EXISTS idx_learning_videos_subject_level ON learning_videos (subject, level, updated_at)",
      `CREATE TABLE IF NOT EXISTS fixed_responses (
        cache_key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_fixed_responses_expires ON fixed_responses (expires_at)"
    ];
    pgReady = (async () => {
      for (const statement of statements) {
        await sql.query(statement);
      }
    })();
  }
  await pgReady;
}

export type StoredDictionaryEntry = {
  language: "en" | "zh";
  term: string;
  phonetic: string;
  translation: string;
  definition: string;
  combinations: string[];
  examples: string[];
  source: string;
};

export type StoredLearningVideo = {
  id: string;
  bvid: string;
  title: string;
  author: string;
  play: number;
  duration: string;
  description: string;
  tag: string;
  keyword: string;
  subject: string;
  level: string;
  url: string;
};

export type StoredWeakPoint = {
  owner: string;
  subject: string;
  knowledge: string;
  weight: number;
  source: string;
  updatedAt: number;
};

export type StoredUserProfile = LearnerProfile & {
  owner: string;
  avatarUrl?: string;
  updatedAt: number;
};

const ECDICT_PATH = path.join(process.cwd(), "public", "dictionaries", "ecdict.csv");

const CHINESE_DICTIONARY_SEED: StoredDictionaryEntry[] = [
  {
    language: "zh",
    term: "学习",
    phonetic: "xue xi",
    translation: "study; learn",
    definition: "通过阅读、听讲、研究、实践等方式获得知识或技能。",
    combinations: ["学习方法", "自主学习", "合作学习", "学习计划"],
    examples: ["制定清晰的学习计划可以提高复习效率。"],
    source: "qixue-built-in"
  },
  {
    language: "zh",
    term: "复习",
    phonetic: "fu xi",
    translation: "review; revise",
    definition: "再次学习已经学过的内容，以巩固记忆、发现遗漏并提升掌握程度。",
    combinations: ["课后复习", "阶段复习", "错题复习", "复习计划"],
    examples: ["考试前应按知识点安排分层复习。"],
    source: "qixue-built-in"
  },
  {
    language: "zh",
    term: "阅读",
    phonetic: "yue du",
    translation: "read; reading",
    definition: "看文字、符号并理解其意义的过程。",
    combinations: ["阅读理解", "课外阅读", "精读", "泛读"],
    examples: ["阅读说明文时要先抓住中心句和段落结构。"],
    source: "qixue-built-in"
  },
  {
    language: "zh",
    term: "写作",
    phonetic: "xie zuo",
    translation: "writing; composition",
    definition: "运用语言文字表达思想、叙述事情、说明事理或抒发情感。",
    combinations: ["写作素材", "写作结构", "议论文写作", "记叙文写作"],
    examples: ["写作前先列提纲可以让文章结构更清楚。"],
    source: "qixue-built-in"
  },
  {
    language: "zh",
    term: "词语",
    phonetic: "ci yu",
    translation: "word; expression",
    definition: "词和短语的合称，是语言表达意义的基本单位之一。",
    combinations: ["词语积累", "词语辨析", "关联词语", "四字词语"],
    examples: ["做阅读题时要结合语境理解重点词语。"],
    source: "qixue-built-in"
  }
];

function normalizeDictionaryTerm(term: string) {
  return term.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseCsvLine(line: string) {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      value += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      fields.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields;
}

function parseExchange(exchange: string) {
  const labels: Record<string, string> = {
    p: "过去式",
    d: "过去分词",
    i: "现在分词",
    "3": "第三人称单数",
    r: "比较级",
    t: "最高级",
    s: "复数"
  };
  return exchange
    .split("/")
    .map((item) => {
      const [key, value] = item.split(":");
      if (!key || !value || !labels[key]) return "";
      return `${labels[key]}：${value}`;
    })
    .filter(Boolean);
}

function tableHasColumn(database: DatabaseSync, table: string, column: string) {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function storedResourceSubject(row: { subject?: string; knowledge: string }) {
  if (row.subject) return row.subject;
  return canonicalizeKnowledge(row.knowledge, "")?.subject || undefined;
}

function getDb() {
  if (db) return db;
  mkdirSync(DB_DIR, { recursive: true });
  if (!existsSync(DB_PATH) && existsSync(LEGACY_DB_PATH)) {
    copyFileSync(LEGACY_DB_PATH, DB_PATH);
  }
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL DEFAULT '',
      knowledge TEXT NOT NULL,
      type TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT,
      profile_key TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_resources_knowledge ON resources (knowledge);
    CREATE INDEX IF NOT EXISTS idx_resources_knowledge_profile ON resources (knowledge, profile_key);

    CREATE TABLE IF NOT EXISTS weak_points (
      owner TEXT NOT NULL,
      subject TEXT NOT NULL,
      knowledge TEXT NOT NULL,
      weight REAL NOT NULL,
      source TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner, subject, knowledge)
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      owner TEXT PRIMARY KEY,
      nickname TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      school TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      difficulty TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS learning_records (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      feature TEXT NOT NULL,
      subject TEXT NOT NULL,
      input TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_learning_records_owner ON learning_records (owner, updated_at);

    CREATE TABLE IF NOT EXISTS review_plans (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      subject TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_review_plans_owner_subject ON review_plans (owner, subject, updated_at);

    CREATE TABLE IF NOT EXISTS learning_behaviors (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      subject TEXT NOT NULL,
      knowledge TEXT NOT NULL,
      source TEXT NOT NULL,
      weight REAL NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_learning_behaviors_owner_knowledge ON learning_behaviors (owner, subject, knowledge, created_at);

    CREATE TABLE IF NOT EXISTS dictionary_entries (
      language TEXT NOT NULL,
      term TEXT NOT NULL,
      normalized_term TEXT NOT NULL,
      phonetic TEXT NOT NULL DEFAULT '',
      translation TEXT NOT NULL DEFAULT '',
      definition TEXT NOT NULL DEFAULT '',
      combinations_json TEXT NOT NULL DEFAULT '[]',
      examples_json TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (language, normalized_term)
    );
    CREATE INDEX IF NOT EXISTS idx_dictionary_language_term ON dictionary_entries (language, normalized_term);

    CREATE TABLE IF NOT EXISTS dictionary_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS learning_videos (
      id TEXT PRIMARY KEY,
      bvid TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      play INTEGER NOT NULL DEFAULT 0,
      duration TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      tag TEXT NOT NULL DEFAULT '',
      keyword TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_learning_videos_keyword ON learning_videos (keyword, updated_at);
    CREATE INDEX IF NOT EXISTS idx_learning_videos_subject ON learning_videos (subject, updated_at);

    CREATE TABLE IF NOT EXISTS fixed_responses (
      cache_key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fixed_responses_expires ON fixed_responses (expires_at);
  `);
  if (!tableHasColumn(db, "resources", "subject")) {
    db.exec("ALTER TABLE resources ADD COLUMN subject TEXT NOT NULL DEFAULT ''");
  }
  if (!tableHasColumn(db, "learning_videos", "level")) {
    db.exec("ALTER TABLE learning_videos ADD COLUMN level TEXT NOT NULL DEFAULT ''");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_resources_subject ON resources (subject)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_learning_videos_subject_level ON learning_videos (subject, level, updated_at)");
  return db;
}

function ensureDictionarySeeded(database = getDb()) {
  const englishSeeded = database.prepare("SELECT value FROM dictionary_meta WHERE key = ?").get("ecdict_seeded") as { value?: string } | undefined;
  if (!englishSeeded?.value && existsSync(ECDICT_PATH)) {
    const lines = readFileSync(ECDICT_PATH, "utf8").split(/\r?\n/);
    const header = parseCsvLine(lines[0] || "");
    const indexes = Object.fromEntries(header.map((name, index) => [name, index]));
    const stmt = database.prepare(`
      INSERT OR IGNORE INTO dictionary_entries
        (language, term, normalized_term, phonetic, translation, definition, combinations_json, examples_json, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    database.exec("BEGIN");
    try {
      for (const line of lines.slice(1)) {
        if (!line) continue;
        const fields = parseCsvLine(line);
        const term = fields[indexes.word] || "";
        const normalized = normalizeDictionaryTerm(term);
        if (!normalized) continue;
        stmt.run(
          "en",
          term,
          normalized,
          fields[indexes.phonetic] || "",
          fields[indexes.translation] || "",
          fields[indexes.definition] || "",
          JSON.stringify(parseExchange(fields[indexes.exchange] || "")),
          "[]",
          "skywind3000/ECDICT",
          now
        );
      }
      database.prepare("INSERT OR REPLACE INTO dictionary_meta (key, value) VALUES (?, ?)").run("ecdict_seeded", String(now));
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  const chineseSeeded = database.prepare("SELECT value FROM dictionary_meta WHERE key = ?").get("chinese_seeded") as { value?: string } | undefined;
  if (!chineseSeeded?.value) {
    const stmt = database.prepare(`
      INSERT OR IGNORE INTO dictionary_entries
        (language, term, normalized_term, phonetic, translation, definition, combinations_json, examples_json, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    database.exec("BEGIN");
    try {
      CHINESE_DICTIONARY_SEED.forEach((entry) => {
        stmt.run(
          entry.language,
          entry.term,
          normalizeDictionaryTerm(entry.term),
          entry.phonetic,
          entry.translation,
          entry.definition,
          JSON.stringify(entry.combinations),
          JSON.stringify(entry.examples),
          entry.source,
          now
        );
      });
      database.prepare("INSERT OR REPLACE INTO dictionary_meta (key, value) VALUES (?, ?)").run("chinese_seeded", String(now));
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

function parseJsonArray(value: string) {
  const parsed = JSON.parse(value || "[]") as unknown;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function lookupDictionarySeed(raw: string, subject?: string, limit = 8): StoredDictionaryEntry[] {
  const language: "en" | "zh" = subject === "璇枃" || /[\u4e00-\u9fa5]/.test(raw) && !/[A-Za-z]/.test(raw) ? "zh" : "en";
  const term = language === "en"
    ? raw.trim().split(/\s+/)[0]?.replace(/[^A-Za-z'-]/g, "")
    : raw.trim().match(/[\u4e00-\u9fa5]+/)?.[0] || "";
  const normalized = normalizeDictionaryTerm(term);
  if (!normalized) return [];

  if (language === "zh") {
    return CHINESE_DICTIONARY_SEED
      .filter((entry) => normalizeDictionaryTerm(entry.term).startsWith(normalized))
      .slice(0, limit);
  }

  if (!existsSync(ECDICT_PATH)) return [];
  const lines = readFileSync(ECDICT_PATH, "utf8").split(/\r?\n/);
  const header = parseCsvLine(lines[0] || "");
  const indexes = Object.fromEntries(header.map((name, index) => [name, index]));
  const exact: StoredDictionaryEntry[] = [];
  const prefix: StoredDictionaryEntry[] = [];

  for (const line of lines.slice(1)) {
    if (!line || exact.length + prefix.length >= limit * 3) continue;
    const fields = parseCsvLine(line);
    const word = fields[indexes.word] || "";
    const rowNormalized = normalizeDictionaryTerm(word);
    if (rowNormalized !== normalized && !rowNormalized.startsWith(normalized)) continue;
    const entry: StoredDictionaryEntry = {
      language: "en",
      term: word,
      phonetic: fields[indexes.phonetic] || "",
      translation: fields[indexes.translation] || "",
      definition: fields[indexes.definition] || "",
      combinations: parseExchange(fields[indexes.exchange] || ""),
      examples: [],
      source: "skywind3000/ECDICT"
    };
    if (rowNormalized === normalized) exact.push(entry);
    else prefix.push(entry);
  }

  return [...exact, ...prefix].slice(0, limit);
}

export async function lookupStoredDictionary(raw: string, subject?: string, limit = 8): Promise<StoredDictionaryEntry[]> {
  if (usePostgres()) {
    await ensurePgSchema();
    const language: "en" | "zh" = subject === "璇枃" || /[\u4e00-\u9fa5]/.test(raw) && !/[A-Za-z]/.test(raw) ? "zh" : "en";
    const term = language === "en"
      ? raw.trim().split(/\s+/)[0]?.replace(/[^A-Za-z'-]/g, "")
      : raw.trim().match(/[\u4e00-\u9fa5]+/)?.[0] || "";
    const normalized = normalizeDictionaryTerm(term);
    if (!normalized) return [];
    const rows = await getPg().query(`
      SELECT language, term, phonetic, translation, definition, combinations_json, examples_json, source
      FROM dictionary_entries
      WHERE language = $1 AND (normalized_term = $2 OR normalized_term LIKE $3)
      ORDER BY CASE WHEN normalized_term = $2 THEN 0 ELSE 1 END, length(normalized_term), term
      LIMIT $4
    `, [language, normalized, `${normalized}%`, limit]) as Array<Record<string, string>>;

    const entries = rows.map((row) => ({
      language: row.language as "en" | "zh",
      term: row.term,
      phonetic: row.phonetic,
      translation: row.translation,
      definition: row.definition,
      combinations: parseJsonArray(row.combinations_json),
      examples: parseJsonArray(row.examples_json),
      source: row.source
    }));
    return entries.length ? entries : lookupDictionarySeed(raw, subject, limit);
  }
  const database = getDb();
  ensureDictionarySeeded(database);
  const language: "en" | "zh" = subject === "语文" || /[\u4e00-\u9fa5]/.test(raw) && !/[A-Za-z]/.test(raw) ? "zh" : "en";
  const term = language === "en"
    ? raw.trim().split(/\s+/)[0]?.replace(/[^A-Za-z'-]/g, "")
    : raw.trim().match(/[\u4e00-\u9fa5]+/)?.[0] || "";
  const normalized = normalizeDictionaryTerm(term);
  if (!normalized) return [];
  const rows = database.prepare(`
    SELECT language, term, phonetic, translation, definition, combinations_json, examples_json, source
    FROM dictionary_entries
    WHERE language = ? AND (normalized_term = ? OR normalized_term LIKE ?)
    ORDER BY CASE WHEN normalized_term = ? THEN 0 ELSE 1 END, length(normalized_term), term
    LIMIT ?
  `).all(language, normalized, `${normalized}%`, normalized, limit) as Array<Record<string, string>>;

  return rows.map((row) => ({
    language: row.language as "en" | "zh",
    term: row.term,
    phonetic: row.phonetic,
    translation: row.translation,
    definition: row.definition,
    combinations: parseJsonArray(row.combinations_json),
    examples: parseJsonArray(row.examples_json),
    source: row.source
  }));
}

function profileKey(profile: unknown, owner?: string) {
  if (!profile || typeof profile !== "object") return "";
  const p = profile as { region?: string; school?: string; grade?: string; difficulty?: string };
  const profileParts = [p.region, p.school, p.grade, p.difficulty].map((item) => item || "");
  const contextKey = profileParts.join("|");
  const ownerKey = owner?.trim().toLowerCase() || "";
  if (ownerKey && !contextKey) return ownerKey;
  return [ownerKey, contextKey].filter(Boolean).join("|");
}

export async function getStoredResources(knowledge: string, profile?: unknown, owner?: string): Promise<Resource[]> {
  if (usePostgres()) {
    await ensurePgSchema();
    const key = profileKey(profile, owner);
    const rows = await getPg().query(`
      SELECT id, title, type, subject, knowledge, difficulty, summary, content
      FROM resources
      WHERE knowledge = $1 AND (profile_key = $2 OR profile_key = '')
      ORDER BY CASE WHEN profile_key = $2 THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 12
    `, [knowledge, key]) as Array<Record<string, string>>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type as Resource["type"],
      subject: storedResourceSubject({ subject: row.subject, knowledge: row.knowledge }),
      knowledge: row.knowledge,
      difficulty: row.difficulty as Resource["difficulty"],
      summary: row.summary,
      content: row.content || undefined
    }));
  }
  const database = getDb();
  const key = profileKey(profile, owner);
  const rows = database.prepare(`
    SELECT id, title, type, subject, knowledge, difficulty, summary, content
    FROM resources
    WHERE knowledge = ? AND (profile_key = ? OR profile_key = '')
    ORDER BY CASE WHEN profile_key = ? THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 12
  `).all(knowledge, key, key) as Array<Record<string, string>>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type as Resource["type"],
    subject: storedResourceSubject({ subject: row.subject, knowledge: row.knowledge }),
    knowledge: row.knowledge,
    difficulty: row.difficulty as Resource["difficulty"],
    summary: row.summary,
    content: row.content || undefined
  }));
}

export async function saveStoredResources(resources: Resource[], profile?: unknown, owner?: string) {
  if (usePostgres()) {
    await ensurePgSchema();
    const key = profileKey(profile, owner);
    const now = Date.now();
    const sql = getPg();
    await Promise.all(resources.map((item) => sql.query(`
      INSERT INTO resources (id, subject, knowledge, type, difficulty, title, summary, content, profile_key, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT(id) DO UPDATE SET
        subject = EXCLUDED.subject,
        knowledge = EXCLUDED.knowledge,
        type = EXCLUDED.type,
        difficulty = EXCLUDED.difficulty,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        content = EXCLUDED.content,
        profile_key = EXCLUDED.profile_key,
        updated_at = EXCLUDED.updated_at
    `, [item.id, item.subject || "", item.knowledge, item.type, item.difficulty, item.title, item.summary, item.content || "", key, now, now])));
    return;
  }
  const database = getDb();
  const key = profileKey(profile, owner);
  const now = Date.now();
  const stmt = database.prepare(`
    INSERT INTO resources (id, subject, knowledge, type, difficulty, title, summary, content, profile_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      subject = excluded.subject,
      knowledge = excluded.knowledge,
      type = excluded.type,
      difficulty = excluded.difficulty,
      title = excluded.title,
      summary = excluded.summary,
      content = excluded.content,
      profile_key = excluded.profile_key,
      updated_at = excluded.updated_at
  `);
  database.exec("BEGIN");
  try {
    resources.forEach((item) => {
      stmt.run(item.id, item.subject || "", item.knowledge, item.type, item.difficulty, item.title, item.summary, item.content || "", key, now, now);
    });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export async function deleteStoredResource(resourceId: string) {
  if (usePostgres()) {
    await ensurePgSchema();
    await getPg().query("DELETE FROM resources WHERE id = $1", [resourceId]);
    return;
  }
  getDb().prepare("DELETE FROM resources WHERE id = ?").run(resourceId);
}

export async function getStoredResourceFeed(limit = 80, owner = ""): Promise<Resource[]> {
  if (usePostgres()) {
    await ensurePgSchema();
    const key = owner.trim().toLowerCase();
    const rows = await getPg().query(`
      SELECT id, title, type, subject, knowledge, difficulty, summary, content
      FROM resources
      WHERE ($2 = '' OR profile_key = $2 OR profile_key = '')
      ORDER BY updated_at DESC
      LIMIT $1
    `, [limit, key]) as Array<Record<string, string>>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type as Resource["type"],
      subject: storedResourceSubject({ subject: row.subject, knowledge: row.knowledge }),
      knowledge: row.knowledge,
      difficulty: row.difficulty as Resource["difficulty"],
      summary: row.summary,
      content: row.content || undefined
    }));
  }
  const key = owner.trim().toLowerCase();
  const rows = getDb().prepare(`
    SELECT id, title, type, subject, knowledge, difficulty, summary, content
    FROM resources
    WHERE (? = '' OR profile_key = ? OR profile_key = '')
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(key, key, limit) as Array<Record<string, string>>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type as Resource["type"],
    subject: storedResourceSubject({ subject: row.subject, knowledge: row.knowledge }),
    knowledge: row.knowledge,
    difficulty: row.difficulty as Resource["difficulty"],
    summary: row.summary,
    content: row.content || undefined
  }));
}

export async function saveStoredWeakPoint(input: {
  owner: string;
  subject: string;
  knowledge: string;
  weight: number;
  source: string;
}) {
  if (usePostgres()) {
    await ensurePgSchema();
    await getPg().query(`
      INSERT INTO weak_points (owner, subject, knowledge, weight, source, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(owner, subject, knowledge) DO UPDATE SET
        weight = EXCLUDED.weight,
        source = EXCLUDED.source,
        updated_at = EXCLUDED.updated_at
    `, [input.owner, input.subject, input.knowledge, input.weight, input.source, Date.now()]);
    return;
  }
  getDb().prepare(`
    INSERT INTO weak_points (owner, subject, knowledge, weight, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner, subject, knowledge) DO UPDATE SET
      weight = excluded.weight,
      source = excluded.source,
      updated_at = excluded.updated_at
  `).run(input.owner, input.subject, input.knowledge, input.weight, input.source, Date.now());
}

export async function deleteStoredWeakPoint(owner: string, subject: string, knowledge: string) {
  if (usePostgres()) {
    await ensurePgSchema();
    await getPg().query("DELETE FROM weak_points WHERE owner = $1 AND subject = $2 AND knowledge = $3", [owner, subject, knowledge]);
    return;
  }
  getDb().prepare("DELETE FROM weak_points WHERE owner = ? AND subject = ? AND knowledge = ?").run(owner, subject, knowledge);
}

export async function getStoredWeakPoints(owner: string, limit = 24): Promise<StoredWeakPoint[]> {
  if (usePostgres()) {
    await ensurePgSchema();
    const rows = await getPg().query(`
      SELECT owner, subject, knowledge, weight, source, updated_at
      FROM weak_points
      WHERE owner = $1
      ORDER BY weight DESC, updated_at DESC
      LIMIT $2
    `, [owner, limit]) as Array<Record<string, string | number>>;

    return rows.map((row) => ({
      owner: String(row.owner),
      subject: String(row.subject),
      knowledge: String(row.knowledge),
      weight: Number(row.weight),
      source: String(row.source),
      updatedAt: Number(row.updated_at)
    }));
  }
  const rows = getDb().prepare(`
    SELECT owner, subject, knowledge, weight, source, updated_at
    FROM weak_points
    WHERE owner = ?
    ORDER BY weight DESC, updated_at DESC
    LIMIT ?
  `).all(owner, limit) as Array<Record<string, string | number>>;

  return rows.map((row) => ({
    owner: String(row.owner),
    subject: String(row.subject),
    knowledge: String(row.knowledge),
    weight: Number(row.weight),
    source: String(row.source),
    updatedAt: Number(row.updated_at)
  }));
}

export async function saveStoredLearningRecord(input: {
  owner: string;
  request: HomeworkRequest;
  response: HomeworkResponse;
}) {
  const owner = input.owner.trim().toLowerCase() || "__anonymous__";
  const now = Date.now();
  const id = `${owner}_${input.request.feature}_${now}`;
  if (usePostgres()) {
    await ensurePgSchema();
    await getPg().query(`
      INSERT INTO learning_records (id, owner, feature, subject, input, response_json, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT(id) DO UPDATE SET
        response_json = EXCLUDED.response_json,
        updated_at = EXCLUDED.updated_at
    `, [
      id,
      owner,
      input.request.feature,
      input.request.subject,
      input.request.content,
      JSON.stringify(input.response),
      now,
      now
    ]);
    return;
  }
  getDb().prepare(`
    INSERT INTO learning_records (id, owner, feature, subject, input, response_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      response_json = excluded.response_json,
      updated_at = excluded.updated_at
  `).run(id, owner, input.request.feature, input.request.subject, input.request.content, JSON.stringify(input.response), now, now);
}

export async function getStoredLearningRecords(owner: string, limit = 120): Promise<Array<{
  id: string;
  ownerKey: string;
  feature: HomeworkRequest["feature"];
  title: string;
  subject: string;
  input: string;
  response: HomeworkResponse;
  createdAt: number;
  updatedAt: number;
}>> {
  const normalizedOwner = owner.trim().toLowerCase() || "__anonymous__";
  const mapRow = (row: Record<string, string | number>) => {
    const response = JSON.parse(String(row.response_json)) as HomeworkResponse;
    return {
      id: String(row.id),
      ownerKey: String(row.owner),
      feature: String(row.feature) as HomeworkRequest["feature"],
      title: response.title || String(row.feature),
      subject: String(row.subject),
      input: String(row.input || ""),
      response,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    };
  };

  if (usePostgres()) {
    await ensurePgSchema();
    const rows = await getPg().query(`
      SELECT id, owner, feature, subject, input, response_json, created_at, updated_at
      FROM learning_records
      WHERE owner = $1
      ORDER BY updated_at DESC
      LIMIT $2
    `, [normalizedOwner, limit]) as Array<Record<string, string | number>>;
    return rows.map(mapRow);
  }
  const rows = getDb().prepare(`
    SELECT id, owner, feature, subject, input, response_json, created_at, updated_at
    FROM learning_records
    WHERE owner = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(normalizedOwner, limit) as Array<Record<string, string | number>>;
  return rows.map(mapRow);
}

export async function saveStoredReviewPlan(input: {
  owner: string;
  subject: string;
  plan: PlanResponse;
}) {
  const owner = input.owner.trim().toLowerCase() || "__anonymous__";
  const now = Date.now();
  const id = `${owner}_${input.subject}_${input.plan.planId}`;
  if (usePostgres()) {
    await ensurePgSchema();
    await getPg().query(`
      INSERT INTO review_plans (id, owner, subject, plan_json, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(id) DO UPDATE SET
        plan_json = EXCLUDED.plan_json,
        updated_at = EXCLUDED.updated_at
    `, [id, owner, input.subject, JSON.stringify(input.plan), now, now]);
    return;
  }
  getDb().prepare(`
    INSERT INTO review_plans (id, owner, subject, plan_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      plan_json = excluded.plan_json,
      updated_at = excluded.updated_at
  `).run(id, owner, input.subject, JSON.stringify(input.plan), now, now);
}

export async function getStoredReviewPlans(owner: string, limit = 12): Promise<Array<{ subject: string; plan: PlanResponse; updatedAt: number }>> {
  const normalizedOwner = owner.trim().toLowerCase() || "__anonymous__";
  if (usePostgres()) {
    await ensurePgSchema();
    const rows = await getPg().query(`
      SELECT subject, plan_json, updated_at
      FROM review_plans
      WHERE owner = $1
      ORDER BY updated_at DESC
      LIMIT $2
    `, [normalizedOwner, limit]) as Array<Record<string, string | number>>;
    return rows.map((row) => ({
      subject: String(row.subject),
      plan: JSON.parse(String(row.plan_json)) as PlanResponse,
      updatedAt: Number(row.updated_at)
    }));
  }
  const rows = getDb().prepare(`
    SELECT subject, plan_json, updated_at
    FROM review_plans
    WHERE owner = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(normalizedOwner, limit) as Array<Record<string, string | number>>;
  return rows.map((row) => ({
    subject: String(row.subject),
    plan: JSON.parse(String(row.plan_json)) as PlanResponse,
    updatedAt: Number(row.updated_at)
  }));
}

export async function saveStoredLearningBehavior(input: {
  owner: string;
  subject: string;
  knowledge: string;
  source: string;
  weight: number;
}) {
  const owner = input.owner.trim().toLowerCase() || "__anonymous__";
  const now = Date.now();
  const id = `${owner}_${input.source}_${now}_${Math.random().toString(36).slice(2, 8)}`;
  if (usePostgres()) {
    await ensurePgSchema();
    await getPg().query(`
      INSERT INTO learning_behaviors (id, owner, subject, knowledge, source, weight, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, owner, input.subject, input.knowledge, input.source, input.weight, now]);
    return;
  }
  getDb().prepare(`
    INSERT INTO learning_behaviors (id, owner, subject, knowledge, source, weight, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, owner, input.subject, input.knowledge, input.source, input.weight, now);
}

export async function getStoredLearningBehaviorWeight(input: {
  owner: string;
  subject: string;
  knowledge: string;
}): Promise<number> {
  const owner = input.owner.trim().toLowerCase() || "__anonymous__";
  if (usePostgres()) {
    await ensurePgSchema();
    const rows = await getPg().query(`
      SELECT COALESCE(SUM(weight), 0) AS total
      FROM learning_behaviors
      WHERE owner = $1 AND subject = $2 AND knowledge = $3
    `, [owner, input.subject, input.knowledge]) as Array<Record<string, string | number>>;
    return Number(rows[0]?.total || 0);
  }
  const row = getDb().prepare(`
    SELECT COALESCE(SUM(weight), 0) AS total
    FROM learning_behaviors
    WHERE owner = ? AND subject = ? AND knowledge = ?
  `).get(owner, input.subject, input.knowledge) as { total?: number } | undefined;
  return Number(row?.total || 0);
}

export async function saveStoredUserProfile(profile: StoredUserProfile) {
  if (usePostgres()) {
    await ensurePgSchema();
    await getPg().query(`
      INSERT INTO user_profiles (owner, nickname, avatar_url, school, grade, region, difficulty, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT(owner) DO UPDATE SET
        nickname = EXCLUDED.nickname,
        avatar_url = EXCLUDED.avatar_url,
        school = EXCLUDED.school,
        grade = EXCLUDED.grade,
        region = EXCLUDED.region,
        difficulty = EXCLUDED.difficulty,
        updated_at = EXCLUDED.updated_at
    `, [profile.owner, profile.nickname || "", profile.avatarUrl || "", profile.school || "", profile.grade || "", profile.region || "", profile.difficulty || "", Date.now()]);
    return;
  }
  getDb().prepare(`
    INSERT INTO user_profiles (owner, nickname, avatar_url, school, grade, region, difficulty, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner) DO UPDATE SET
      nickname = excluded.nickname,
      avatar_url = excluded.avatar_url,
      school = excluded.school,
      grade = excluded.grade,
      region = excluded.region,
      difficulty = excluded.difficulty,
      updated_at = excluded.updated_at
  `).run(
    profile.owner,
    profile.nickname || "",
    profile.avatarUrl || "",
    profile.school || "",
    profile.grade || "",
    profile.region || "",
    profile.difficulty || "",
    Date.now()
  );
}

export async function getStoredUserProfile(owner: string): Promise<StoredUserProfile | null> {
  if (usePostgres()) {
    await ensurePgSchema();
    const rows = await getPg().query(`
      SELECT owner, nickname, avatar_url, school, grade, region, difficulty, updated_at
      FROM user_profiles
      WHERE owner = $1
    `, [owner]) as Array<Record<string, string | number>>;
    const row = rows[0];
    if (!row) return null;
    return {
      owner: String(row.owner),
      nickname: String(row.nickname || ""),
      avatarUrl: String(row.avatar_url || ""),
      school: String(row.school || ""),
      grade: String(row.grade || ""),
      region: String(row.region || ""),
      difficulty: String(row.difficulty || "") as StoredUserProfile["difficulty"],
      updatedAt: Number(row.updated_at)
    };
  }
  const row = getDb().prepare(`
    SELECT owner, nickname, avatar_url, school, grade, region, difficulty, updated_at
    FROM user_profiles
    WHERE owner = ?
  `).get(owner) as Record<string, string | number> | undefined;

  if (!row) return null;
  return {
    owner: String(row.owner),
    nickname: String(row.nickname || ""),
    avatarUrl: String(row.avatar_url || ""),
    school: String(row.school || ""),
    grade: String(row.grade || ""),
    region: String(row.region || ""),
    difficulty: String(row.difficulty || "") as StoredUserProfile["difficulty"],
    updatedAt: Number(row.updated_at)
  };
}

export async function saveStoredLearningVideos(videos: StoredLearningVideo[]) {
  if (!videos.length) return;
  if (usePostgres()) {
    await ensurePgSchema();
    const now = Date.now();
    const sql = getPg();
    await Promise.all(videos.map((video) => sql.query(`
      INSERT INTO learning_videos
        (id, bvid, title, author, play, duration, description, tag, keyword, subject, level, url, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT(bvid) DO UPDATE SET
        title = EXCLUDED.title,
        author = EXCLUDED.author,
        play = EXCLUDED.play,
        duration = EXCLUDED.duration,
        description = EXCLUDED.description,
        tag = EXCLUDED.tag,
        keyword = EXCLUDED.keyword,
        subject = EXCLUDED.subject,
        level = EXCLUDED.level,
        url = EXCLUDED.url,
        updated_at = EXCLUDED.updated_at
    `, [
      video.id,
      video.bvid,
      video.title,
      video.author,
      video.play,
      video.duration,
      video.description,
      video.tag,
      video.keyword,
      video.subject,
      video.level,
      video.url,
      now,
      now
    ])));
    return;
  }
  const database = getDb();
  const now = Date.now();
  const stmt = database.prepare(`
    INSERT INTO learning_videos
      (id, bvid, title, author, play, duration, description, tag, keyword, subject, level, url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bvid) DO UPDATE SET
      title = excluded.title,
      author = excluded.author,
      play = excluded.play,
      duration = excluded.duration,
      description = excluded.description,
      tag = excluded.tag,
      keyword = excluded.keyword,
      subject = excluded.subject,
      level = excluded.level,
      url = excluded.url,
      updated_at = excluded.updated_at
  `);
  database.exec("BEGIN");
  try {
    videos.forEach((video) => {
      stmt.run(
        video.id,
        video.bvid,
        video.title,
        video.author,
        video.play,
        video.duration,
        video.description,
        video.tag,
        video.keyword,
        video.subject,
        video.level,
        video.url,
        now,
        now
      );
    });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export async function getStoredLearningVideos(input: { keyword: string; subject: string; level?: string; limit: number }): Promise<StoredLearningVideo[]> {
  if (usePostgres()) {
    await ensurePgSchema();
    const keywordLike = `%${input.keyword.trim()}%`;
    const rows = await getPg().query(`
      SELECT id, bvid, title, author, play, duration, description, tag, keyword, subject, level, url
      FROM learning_videos
      WHERE ($1 = '' OR keyword LIKE $2 OR title LIKE $2 OR description LIKE $2 OR tag LIKE $2)
        AND ($3 = '' OR subject = $3)
        AND ($4 = '' OR level = $4)
      ORDER BY updated_at DESC, play DESC
      LIMIT $5
    `, [input.keyword.trim(), keywordLike, input.subject, input.level || "", input.limit]) as Array<Record<string, string | number>>;

    return rows.map((row) => ({
      id: String(row.id),
      bvid: String(row.bvid),
      title: String(row.title),
      author: String(row.author),
      play: Number(row.play),
      duration: String(row.duration),
      description: String(row.description),
      tag: String(row.tag),
      keyword: String(row.keyword),
      subject: String(row.subject),
      level: String(row.level || ""),
      url: String(row.url)
    }));
  }
  const database = getDb();
  const keywordLike = `%${input.keyword.trim()}%`;
  const rows = database.prepare(`
    SELECT id, bvid, title, author, play, duration, description, tag, keyword, subject, level, url
    FROM learning_videos
    WHERE (? = '' OR keyword LIKE ? OR title LIKE ? OR description LIKE ? OR tag LIKE ?)
      AND (? = '' OR subject = ?)
      AND (? = '' OR level = ?)
    ORDER BY updated_at DESC, play DESC
    LIMIT ?
  `).all(
    input.keyword.trim(),
    keywordLike,
    keywordLike,
    keywordLike,
    keywordLike,
    input.subject,
    input.subject,
    input.level || "",
    input.level || "",
    input.limit
  ) as Array<Record<string, string | number>>;

  return rows.map((row) => ({
    id: String(row.id),
    bvid: String(row.bvid),
    title: String(row.title),
    author: String(row.author),
    play: Number(row.play),
    duration: String(row.duration),
    description: String(row.description),
    tag: String(row.tag),
    keyword: String(row.keyword),
    subject: String(row.subject),
    level: String(row.level || ""),
    url: String(row.url)
  }));
}

export async function getStoredFixedResponse(cacheKey: string, now = Date.now()): Promise<unknown | null> {
  if (usePostgres()) {
    await ensurePgSchema();
    const sql = getPg();
    await sql.query("DELETE FROM fixed_responses WHERE expires_at <= $1", [now]);
    const rows = await sql.query("SELECT value_json FROM fixed_responses WHERE cache_key = $1 AND expires_at > $2", [cacheKey, now]) as Array<{ value_json?: string }>;
    if (!rows[0]?.value_json) return null;
    return JSON.parse(rows[0].value_json) as unknown;
  }
  const database = getDb();
  database.prepare("DELETE FROM fixed_responses WHERE expires_at <= ?").run(now);
  const row = database.prepare("SELECT value_json FROM fixed_responses WHERE cache_key = ? AND expires_at > ?").get(cacheKey, now) as { value_json?: string } | undefined;
  if (!row?.value_json) return null;
  return JSON.parse(row.value_json) as unknown;
}

export async function setStoredFixedResponse(cacheKey: string, value: unknown, expiresAt: number) {
  if (usePostgres()) {
    await ensurePgSchema();
    await getPg().query(`
      INSERT INTO fixed_responses (cache_key, value_json, expires_at, updated_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(cache_key) DO UPDATE SET
        value_json = EXCLUDED.value_json,
        expires_at = EXCLUDED.expires_at,
        updated_at = EXCLUDED.updated_at
    `, [cacheKey, JSON.stringify(value), expiresAt, Date.now()]);
    return;
  }
  getDb().prepare(`
    INSERT INTO fixed_responses (cache_key, value_json, expires_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      value_json = excluded.value_json,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).run(cacheKey, JSON.stringify(value), expiresAt, Date.now());
}

export async function clearStoredFixedResponses() {
  if (usePostgres()) {
    await ensurePgSchema();
    const result = await getPg().query("DELETE FROM fixed_responses RETURNING cache_key") as Array<{ cache_key: string }>;
    return result.length;
  }
  const result = getDb().prepare("DELETE FROM fixed_responses").run();
  return Number(result.changes || 0);
}
