"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Shuffle, X } from "lucide-react";
import {
  DIFFICULTY_OPTIONS,
  GRADE_OPTIONS,
  REGION_OPTIONS,
  SYSTEM_AVATARS,
  addCustomSchool,
  generateRandomNickname,
  getCitiesForProvince,
  getProvinces,
  importCustomSchools,
  loginUser,
  provinceFromRegion,
  registerUser,
  schoolsForRegionAndGrade,
  stageForGrade,
  type StoredUser
} from "@/lib/profile-storage";
import type { DifficultyPreference } from "@/lib/types";
import { AvatarCropper } from "@/components/avatar-cropper";
import {
  loadOfficialSchoolCatalog,
  officialSchoolsForRegion,
  type OfficialSchoolCatalog
} from "@/lib/school-catalog";

export function LoginModal({
  onClose,
  onDone,
  onGuest,
  blocking = false
}: {
  onClose: () => void;
  onDone: (user: StoredUser) => void;
  onGuest?: () => void;
  blocking?: boolean;
}) {
  const initialRegion = REGION_OPTIONS[0];
  const initialGrade = GRADE_OPTIONS[8];
  const EMPTY_SCHOOL = "未填写学校";
  const initialProvince = provinceFromRegion(initialRegion);
  const initialCity = initialRegion.split(" ").slice(1).join(" ");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState(generateRandomNickname());
  const [avatarUrl, setAvatarUrl] = useState(`text:${SYSTEM_AVATARS[0]}`);
  const [region, setRegion] = useState(initialRegion);
  const [selectedProvince, setSelectedProvince] = useState(initialProvince);
  const [selectedCity, setSelectedCity] = useState(initialCity);
  const [grade, setGrade] = useState(initialGrade);
  const [school, setSchool] = useState(schoolsForRegionAndGrade(initialRegion, initialGrade)[0] || EMPTY_SCHOOL);
  const [difficulty, setDifficulty] = useState<DifficultyPreference>("同步");
  const [error, setError] = useState("");
  const [schoolImport, setSchoolImport] = useState("");
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [officialCatalog, setOfficialCatalog] = useState<OfficialSchoolCatalog | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [schoolOptions, setSchoolOptions] = useState(() => schoolsForRegionAndGrade(region, grade));

  useEffect(() => {
    const official = officialSchoolsForRegion(officialCatalog, region, grade);
    const custom = schoolsForRegionAndGrade(region, grade);
    const schools = Array.from(new Set([...official, ...custom]));
    setSchoolOptions(schools);
    if (!schools.includes(school)) setSchool(schools[0] || EMPTY_SCHOOL);
  }, [officialCatalog, region, grade, school]);

  useEffect(() => {
    void loadOfficialSchoolCatalog().then(setOfficialCatalog);
  }, []);

  function handleAvatar(file?: File) {
    if (!file) return;
    setCropFile(file);
  }

  function changeProvince(province: string) {
    setSelectedProvince(province);
    const cities = getCitiesForProvince(province);
    const city = cities[0] || "";
    setSelectedCity(city);
    setRegion(city ? `${province} ${city}` : province);
  }

  function changeCity(city: string) {
    setSelectedCity(city);
    setRegion(city ? `${selectedProvince} ${city}` : selectedProvince);
  }

  function saveImportedSchools() {
    const nextSchools = importCustomSchools(region, grade, schoolImport);
    setSchoolOptions(nextSchools);
    const firstImported = schoolImport.split(/\r?\n|,|，|;|；|\t/).map((item) => item.trim()).find(Boolean);
    if (firstImported) {
      addCustomSchool(region, grade, firstImported);
      setSchool(firstImported);
    }
    setSchoolImport("");
  }

  function submit() {
    const key = username.trim();
    if (!key) {
      setError("请输入用户名");
      return;
    }
    if (mode === "login") {
      const user = loginUser(key);
      if (user) onDone(user);
      else {
        setNickname(key);
        setMode("register");
        setError("");
      }
      return;
    }
    if (!nickname.trim() || !region.trim() || !grade.trim()) {
      setError("请补全昵称、地区和年级");
      return;
    }
    onDone(registerUser(key, {
      nickname: nickname.trim(),
      avatarUrl,
      school: school.trim() || EMPTY_SCHOOL,
      grade,
      region,
      difficulty
    }));
  }

  return (
    <div className="modal-backdrop" onClick={blocking ? undefined : onClose}>
      <section className="modal-panel learner-modal" onClick={(event) => event.stopPropagation()}>
        {!blocking ? (
          <button className="icon-button secondary modal-close" onClick={onClose} type="button" aria-label="关闭">
            <X size={16} />
          </button>
        ) : null}
        <span className="eyebrow">{mode === "login" ? "Login" : "Register"}</span>
        <h2 className="card-title">{mode === "login" ? "登录" : "注册学习档案"}</h2>
        <div className="field">
          <label htmlFor="loginUsername">用户名</label>
          <input className="input" id="loginUsername" value={username} onChange={(event) => setUsername(event.target.value)} />
        </div>
        {mode === "register" ? (
          <>
            <div className="avatar-editor">
              <div className="avatar preview">
                {avatarUrl.startsWith("data:") ? <img alt="头像" src={avatarUrl} /> : <span>{avatarUrl.slice(5)}</span>}
              </div>
              <div>
                <button className="button secondary" onClick={() => fileRef.current?.click()} type="button">
                  <Camera size={16} /> 上传头像
                </button>
                <input hidden ref={fileRef} type="file" accept="image/*" onChange={(event) => handleAvatar(event.target.files?.[0])} />
                <div className="avatar-preset-row">
                  {SYSTEM_AVATARS.map((item) => (
                    <button className="avatar-preset" key={item} onClick={() => setAvatarUrl(`text:${item}`)} type="button">
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field">
              <label htmlFor="nickname">昵称</label>
              <div className="inline-control">
                <input className="input" id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} />
                <button className="icon-button secondary" onClick={() => setNickname(generateRandomNickname())} type="button" aria-label="随机昵称">
                  <Shuffle size={16} />
                </button>
              </div>
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="registerProvince">省份</label>
                <select className="select" id="registerProvince" value={selectedProvince} onChange={(event) => changeProvince(event.target.value)}>
                  {getProvinces().map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="registerCity">城市</label>
                <select className="select" id="registerCity" value={selectedCity} onChange={(event) => changeCity(event.target.value)}>
                  {getCitiesForProvince(selectedProvince).map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="grade">年级</label>
                <select className="select" id="grade" value={grade} onChange={(event) => setGrade(event.target.value)}>
                  {GRADE_OPTIONS.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="school">学校（{stageForGrade(grade)}）</label>
                <select className="select" id="school" value={school} onChange={(event) => setSchool(event.target.value)}>
                  {schoolOptions.length ? schoolOptions.map((item) => <option key={item}>{item}</option>) : <option value={EMPTY_SCHOOL}>未匹配到学校，可在个人中心补充</option>}
                </select>
              </div>
              <div className="field">
                <label htmlFor="difficulty">资源难度</label>
                <select className="select" id="difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value as DifficultyPreference)}>
                  {DIFFICULTY_OPTIONS.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="schoolImport">学校未找到时导入</label>
              <textarea className="textarea school-import" id="schoolImport" value={schoolImport} onChange={(event) => setSchoolImport(event.target.value)} placeholder="每行一个学校名称，也支持逗号分隔。" />
              <button className="button secondary" disabled={!schoolImport.trim()} onClick={saveImportedSchools} type="button">导入学校</button>
            </div>
          </>
        ) : null}
        {error ? <p className="error-text">{error}</p> : null}
        <div className="modal-actions">
          {mode === "login" && onGuest ? (
            <button className="button secondary" onClick={onGuest} type="button">游客进入</button>
          ) : null}
          <button className="button secondary" onClick={() => setMode(mode === "login" ? "register" : "login")} type="button">
            {mode === "login" ? "注册" : "返回登录"}
          </button>
          <button className="button" onClick={submit} type="button">{mode === "login" ? "下一步" : "完成注册"}</button>
        </div>
      </section>
      {cropFile ? (
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(dataUrl) => {
            setAvatarUrl(dataUrl);
            setCropFile(null);
          }}
        />
      ) : null}
    </div>
  );
}
