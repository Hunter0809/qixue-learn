"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, LogOut, Pencil, Save, Trash2 } from "lucide-react";
import { LoginModal } from "@/components/login-modal";
import { PersonalizedGate } from "@/components/personalized-gate";
import {
  DIFFICULTY_OPTIONS,
  GRADE_OPTIONS,
  REGION_OPTIONS,
  addCustomSchool,
  deleteLearningHistory,
  getCitiesForProvince,
  getProvinces,
  importCustomSchools,
  loadCurrentUserProfile,
  loadLearningHistory,
  logoutUser,
  provinceFromRegion,
  cityFromRegion,
  schoolsForRegionAndGrade,
  stageForGrade,
  updateCurrentUserProfile,
  type LearningHistoryRecord,
  type StoredUser
} from "@/lib/profile-storage";
import type { DifficultyPreference } from "@/lib/types";
import { AvatarCropper } from "@/components/avatar-cropper";
import { clearSiteData, type SiteDataClearResult } from "@/lib/site-data-clear";
import {
  loadOfficialSchoolCatalog,
  officialSchoolsForRegion,
  type OfficialSchoolCatalog
} from "@/lib/school-catalog";

function AvatarView({ user }: { user: StoredUser | null }) {
  if (!user) return <span>未</span>;
  if (user.avatarUrl.startsWith("data:")) return <img alt="头像" src={user.avatarUrl} />;
  return <span>{user.avatarUrl.startsWith("text:") ? user.avatarUrl.slice(5) : user.nickname.slice(0, 1)}</span>;
}

export default function ProfilePage() {
  const initialRegion = REGION_OPTIONS[0];
  const initialGrade = GRADE_OPTIONS[8];
  const initialProvince = provinceFromRegion(initialRegion);
  const initialCity = cityFromRegion(initialRegion);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [draft, setDraft] = useState({
    nickname: "",
    region: initialRegion,
    grade: initialGrade,
    school: "",
    difficulty: "同步" as DifficultyPreference
  });
  const [selectedProvince, setSelectedProvince] = useState(initialProvince);
  const [selectedCity, setSelectedCity] = useState(initialCity);
  const [editing, setEditing] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [history, setHistory] = useState<LearningHistoryRecord[]>([]);
  const [schoolImport, setSchoolImport] = useState("");
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheClearResult, setCacheClearResult] = useState<SiteDataClearResult | null>(null);
  const [officialCatalog, setOfficialCatalog] = useState<OfficialSchoolCatalog | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [schoolOptions, setSchoolOptions] = useState(() => schoolsForRegionAndGrade(draft.region, draft.grade));
  const schoolListId = "profile-school-options";

  function schoolsForDraft(region: string, grade: string) {
    return Array.from(new Set([
      ...officialSchoolsForRegion(officialCatalog, region, grade),
      ...schoolsForRegionAndGrade(region, grade)
    ])).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  function refresh() {
    const nextUser = loadCurrentUserProfile();
    const nextRegion = nextUser?.region || initialRegion;
    const nextGrade = nextUser?.grade || initialGrade;
    const schools = schoolsForDraft(nextRegion, nextGrade);
    setSchoolOptions(schools);
    setUser(nextUser);
    setDraft({
      nickname: nextUser?.nickname || "",
      region: nextRegion,
      grade: nextGrade,
      school: nextUser?.school || "",
      difficulty: nextUser?.difficulty || "同步"
    });
    setSelectedProvince(provinceFromRegion(nextRegion));
    setSelectedCity(cityFromRegion(nextRegion));
    setHistory(loadLearningHistory());
  }

  useEffect(() => refresh(), []);

  useEffect(() => {
    void loadOfficialSchoolCatalog().then((catalog) => {
      setOfficialCatalog(catalog);
      if (catalog) {
        const schools = Array.from(new Set([
          ...officialSchoolsForRegion(catalog, draft.region, draft.grade),
          ...schoolsForRegionAndGrade(draft.region, draft.grade)
        ])).sort((a, b) => a.localeCompare(b, "zh-CN"));
        setSchoolOptions(schools);
      }
    });
  }, []);

  function changeProvince(province: string) {
    setSelectedProvince(province);
    const cities = getCitiesForProvince(province);
    const city = cities[0] || "";
    setSelectedCity(city);
    const region = city ? `${province} ${city}` : province;
    const schools = schoolsForDraft(region, draft.grade);
    setSchoolOptions(schools);
    setDraft({ ...draft, region, school: "" });
  }

  function changeCity(city: string) {
    setSelectedCity(city);
    const region = `${selectedProvince} ${city}`;
    const schools = schoolsForDraft(region, draft.grade);
    setSchoolOptions(schools);
    setDraft({ ...draft, region, school: "" });
  }


  function changeGrade(grade: string) {
    const schools = schoolsForDraft(draft.region, grade);
    setSchoolOptions(schools);
    setDraft({ ...draft, grade, school: "" });
  }

  function saveProfile() {
    const next = updateCurrentUserProfile({
      nickname: draft.nickname.trim() || user?.nickname,
      school: draft.school.trim(),
      grade: draft.grade,
      region: draft.region,
      difficulty: draft.difficulty
    });
    if (next) setUser(next);
    setEditing(false);
  }

  function uploadAvatar(file?: File) {
    if (!file) return;
    setCropFile(file);
  }

  function saveImportedSchools() {
    const nextSchools = importCustomSchools(draft.region, draft.grade, schoolImport);
    setSchoolOptions(nextSchools);
    const firstImported = schoolImport.split(/\r?\n|,|，|;|；|\t/).map((item) => item.trim()).find(Boolean);
    if (firstImported) {
      addCustomSchool(draft.region, draft.grade, firstImported);
      setDraft({ ...draft, school: firstImported });
    }
    setSchoolImport("");
  }

  async function clearCurrentSiteCache() {
    setClearingCache(true);
    try {
      const [site] = await Promise.all([
        clearSiteData(),
        fetch("/api/cache/clear", { method: "POST", cache: "no-store" }).catch(() => null)
      ]);
      setCacheClearResult(site);
      refresh();
    } finally {
      setClearingCache(false);
    }
  }

  return (
    <PersonalizedGate>
      <header className="profile-strip clean-top">
        <div className="profile-id">
          <div className="avatar profile-avatar"><AvatarView user={user} /></div>
          <div>
            <span className="eyebrow">Account Center</span>
            <h1 className="page-title">{user?.nickname || "未登录用户"}</h1>
            <p className="page-kicker">{user ? `${user.region} · ${user.school} · ${user.grade} · ${user.difficulty}` : ""}</p>
          </div>
        </div>
        {user ? (
          <button className="button secondary" onClick={() => { logoutUser(); refresh(); }} type="button">
            <LogOut size={16} /> 退出登录
          </button>
        ) : (
          <button className="button" onClick={() => setLoginOpen(true)} type="button">登录 / 注册</button>
        )}
      </header>

      <section className="section profile-grid">
        <article className="card profile-panel">
          <div className="panel-heading">
            <h2 className="card-title">个人信息</h2>
            {editing ? (
              <button className="button" disabled={!user} onClick={saveProfile} type="button"><Save size={16} /> 保存</button>
            ) : (
              <button className="button secondary" disabled={!user} onClick={() => setEditing(true)} type="button"><Pencil size={16} /> 编辑</button>
            )}
          </div>
          <div className="avatar-editor">
            <div className="avatar preview"><AvatarView user={user} /></div>
            <div className="list">
              <button className="button secondary" disabled={!user} onClick={() => fileRef.current?.click()} type="button">
                <Camera size={16} /> 设置头像
              </button>
              <input hidden ref={fileRef} type="file" accept="image/*" onChange={(event) => uploadAvatar(event.target.files?.[0])} />
            </div>
          </div>
          <div className="form-grid two">
            <div className="field">
              <label>昵称</label>
              <input className="input" disabled={!editing} value={draft.nickname} onChange={(event) => setDraft({ ...draft, nickname: event.target.value })} />
            </div>
            <div className="field">
              <label>省份</label>
              <select className="select" disabled={!editing} value={selectedProvince} onChange={(event) => changeProvince(event.target.value)}>
                {getProvinces().map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="field">
              <label>城市</label>
              <select className="select" disabled={!editing} value={selectedCity} onChange={(event) => changeCity(event.target.value)}>
                {getCitiesForProvince(selectedProvince).map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="field">
              <label>年级</label>
              <select className="select" disabled={!editing} value={draft.grade} onChange={(event) => changeGrade(event.target.value)}>
                {GRADE_OPTIONS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="field">
              <label>学校（{stageForGrade(draft.grade)}）</label>
              <input
                className="input school-picker"
                disabled={!editing}
                list={schoolListId}
                value={draft.school}
                onChange={(event) => setDraft({ ...draft, school: event.target.value })}
                placeholder={schoolOptions.length ? "输入学校名称搜索" : "未找到学校，可在下方导入"}
              />
              <datalist id={schoolListId}>
                {schoolOptions.map((item) => <option key={item} value={item} />)}
              </datalist>
              <span className="field-hint">{schoolOptions.length} 所可选学校</span>
            </div>
            <div className="field">
              <label>资源难度</label>
              <select className="select" disabled={!editing} value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value as DifficultyPreference })}>
                {DIFFICULTY_OPTIONS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="field school-import-field">
              <label>学校未找到时导入</label>
              <textarea className="textarea school-import" disabled={!editing} value={schoolImport} onChange={(event) => setSchoolImport(event.target.value)} placeholder="每行一个学校名称，也支持逗号分隔。" />
              <button className="button secondary" disabled={!editing || !schoolImport.trim()} onClick={saveImportedSchools} type="button">导入学校</button>
            </div>
          </div>
        </article>

        <article className="card profile-panel profile-history-panel">
          <div className="panel-heading">
            <h2 className="card-title">学习历史</h2>
            <span className="pill">{history.length} 条</span>
          </div>
          {history.length === 0 ? null : (
            <div className="history-list">
              {history.map((record) => (
                <div className="history-item" key={record.id}>
                  <div>
                    <strong>{record.title}</strong>
                    <span>{record.subject} · {new Date(record.updatedAt).toLocaleString("zh-CN")}</span>
                  </div>
                  <button className="icon-button secondary" onClick={() => { deleteLearningHistory(record.id); refresh(); }} type="button" aria-label="删除历史">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="card profile-panel profile-cache-panel">
          <div className="panel-heading">
            <h2 className="card-title">页面缓存</h2>
            <button className="button secondary" disabled={clearingCache} onClick={clearCurrentSiteCache} type="button">
              <Trash2 size={16} /> {clearingCache ? "清理中" : "清空缓存"}
            </button>
          </div>
          <p className="muted">清除当前浏览器中的站点缓存、登录状态、本地学习档案和后端临时响应缓存。</p>
          {cacheClearResult ? (
            <p className="muted">
              已清除 {cacheClearResult.localStorageKeys} 个本地键、{cacheClearResult.sessionStorageKeys} 个会话键、{cacheClearResult.cacheBuckets} 个缓存桶、{cacheClearResult.cookies} 个 Cookie。
            </p>
          ) : null}
        </article>
      </section>

      {loginOpen ? <LoginModal onClose={() => setLoginOpen(false)} onDone={() => { setLoginOpen(false); refresh(); }} /> : null}
      {cropFile ? (
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(dataUrl) => {
            const next = updateCurrentUserProfile({ avatarUrl: dataUrl });
            if (next) setUser(next);
            setCropFile(null);
          }}
        />
      ) : null}
    </PersonalizedGate>
  );
}
