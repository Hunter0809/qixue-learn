"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Flame, LayoutGrid, List, Loader2, Plus, Star, Target, X } from "lucide-react";
import type { PlanResponse, ProfileResponse, TodayTask } from "@/lib/types";
import { useLearningStore, getWeakPoints, getWeakPointProgress, decayWeakPoints, deleteWeakPoint, type WeakPoint } from "@/lib/store";
import { preGenerateResources, getCachedResources, deleteResource } from "@/lib/resource-cache";
import { getCachedReviewPlan, isGeneratingReviewPlan, preGenerateReviewPlans } from "@/lib/review-plan-cache";
import { ProgressRing } from "@/components/progress-ring";
import { TaskCard } from "@/components/task-card";
import { WeakHeatmap } from "@/components/weak-heatmap";
import { ResourceCategoryCard, groupResourcesBySubject } from "@/components/resource-card";
import { buildProfileFromActualData, streakMotto } from "@/lib/learning-analytics";
import { LearningVideoCard, type VideoResource } from "@/components/learning-video-card";
import { loadEducationalVideos } from "@/lib/video-resources";
import { isGuestSession, loadCurrentUserProfile, logoutUser } from "@/lib/profile-storage";
import { createTodayTask, markCurrentLoginDay, updateTodayTask } from "@/lib/profile-storage";
import { startTracking, getActivityStats } from "@/lib/activity-tracker";
import { GoalsSection } from "@/components/goals-section";
import { MotivationalQuote } from "@/components/motivational-quote";
import { LoginModal } from "@/components/login-modal";
import { ConfirmPopup, type ConfirmAction } from "@/components/confirm-popup";

const emptyDraft = { title: "", knowledge: "", exercises: 1, minutes: 20 };

function ReviewPlanSection({ weakPoints }: { weakPoints: WeakPoint[] }) {
  const [plans, setPlans] = useState<Record<string, PlanResponse | null>>({});
  const [loadingSubjects, setLoadingSubjects] = useState<Record<string, boolean>>({});
  const planListRef = useRef<HTMLDivElement>(null);
  const [planPage, setPlanPage] = useState(0);
  const [planPageSize, setPlanPageSize] = useState(3);
  const subjects = [...new Set(weakPoints.map((w) => w.subject))];
  const preview = weakPoints.slice(0, 5).map((w) => `${w.subject}: ${w.knowledge}`);
  const planTotalPages = Math.ceil(subjects.length / planPageSize);
  const pagedSubjects = subjects.slice(planPage * planPageSize, (planPage + 1) * planPageSize);
  const planPlaceholderCount = planPage < planTotalPages - 1 ? Math.max(0, planPageSize - pagedSubjects.length) : 0;

  useEffect(() => {
    const nextPlans: Record<string, PlanResponse | null> = {};
    const nextLoading: Record<string, boolean> = {};
    subjects.forEach((subject) => {
      const subjectPoints = weakPoints.filter((point) => point.subject === subject);
      nextPlans[subject] = getCachedReviewPlan(subject, subjectPoints);
      nextLoading[subject] = isGeneratingReviewPlan(subject, subjectPoints);
    });
    setPlans(nextPlans);
    setLoadingSubjects(nextLoading);

    function reloadPlans() {
      const refreshedPlans: Record<string, PlanResponse | null> = {};
      const refreshedLoading: Record<string, boolean> = {};
      subjects.forEach((subject) => {
        const subjectPoints = weakPoints.filter((point) => point.subject === subject);
        refreshedPlans[subject] = getCachedReviewPlan(subject, subjectPoints);
        refreshedLoading[subject] = isGeneratingReviewPlan(subject, subjectPoints);
      });
      setPlans(refreshedPlans);
      setLoadingSubjects(refreshedLoading);
    }

    window.addEventListener("qixue:review-plan-generating", reloadPlans);
    window.addEventListener("qixue:review-plan-ready", reloadPlans);
    return () => {
      window.removeEventListener("qixue:review-plan-generating", reloadPlans);
      window.removeEventListener("qixue:review-plan-ready", reloadPlans);
    };
  }, [weakPoints]);

  useEffect(() => {
    function updatePlanPageSize() {
      const list = planListRef.current;
      if (!list) return;
      const height = list.clientHeight;
      const nextSize = Math.max(1, Math.floor(height / 142));
      setPlanPageSize(nextSize);
      setPlanPage((page) => Math.min(page, Math.max(0, Math.ceil(subjects.length / nextSize) - 1)));
    }
    updatePlanPageSize();
    window.addEventListener("resize", updatePlanPageSize);
    return () => window.removeEventListener("resize", updatePlanPageSize);
  }, [subjects.length]);

  if (!weakPoints.length) return null;

  return (
    <section className="section">
      <Link className="card review-plan-card" href="/review-plan">
        <div className="panel-heading">
          <h2 className="card-title">复习计划</h2>
          <span className="pill">自动生成</span>
        </div>
        {Object.values(plans).every((plan) => !plan) && Object.values(loadingSubjects).every((loading) => !loading) ? (
          <div className="review-plan-preview">
            <p className="muted">已检测到薄弱点，正在准备对应复习计划。</p>
            <p>{preview.join(" / ")}</p>
            <span className="pill">涉及 {subjects.length} 个学科</span>
          </div>
        ) : (
          <>
          <div className="review-plan-subjects review-plan-subjects-fill" ref={planListRef}>
            {pagedSubjects.map((subject) => (
              <div className="review-plan-subject compact-review-plan-subject" key={subject}>
                <div className="panel-heading">
                  <h3 className="card-title">{subject}</h3>
                  <span className="pill">{plans[subject] ? "已生成" : loadingSubjects[subject] ? "生成中" : "等待"}</span>
                </div>
                {loadingSubjects[subject] && !plans[subject] ? (
                  <p className="muted">正在自动生成 {subject} 复习计划...</p>
                ) : plans[subject] ? (
                  <div className="review-plan-preview compact-review-plan-preview">
                    <strong>{plans[subject]?.summary}</strong>
                    <p>{plans[subject]?.days.slice(0, 2).map((day) => `第${day.day}天 ${day.title}`).join(" / ")}</p>
                  </div>
                ) : (
                  <p className="muted">等待生成 {subject} 复习计划。</p>
                )}
              </div>
            ))}
            {Array.from({ length: planPlaceholderCount }).map((_, index) => (
              <div className="review-plan-subject compact-review-plan-subject review-plan-placeholder" key={`plan_placeholder_${index}`} aria-hidden />
            ))}
          </div>
          {planTotalPages > 1 ? (
            <div className="pagination compact-pagination">
              <button className="button secondary" disabled={planPage === 0} onClick={(event) => { event.preventDefault(); setPlanPage((page) => page - 1); }} type="button">上一页</button>
              <span className="muted">{planPage + 1} / {planTotalPages}</span>
              <button className="button secondary" disabled={planPage >= planTotalPages - 1} onClick={(event) => { event.preventDefault(); setPlanPage((page) => page + 1); }} type="button">下一页</button>
            </div>
          ) : null}
          </>
        )}
      </Link>
    </section>
  );
}



const INITIAL_VISIBLE_VIDEOS = 50;
const LOAD_MORE_VIDEOS = 10;
const VIDEO_TARGET_PER_STAGE = 1000;

const IRRELEVANT_KEYWORDS = /游戏|手游|端游|LOL|王者荣耀|原神|英雄联盟|崩坏|三国杀|吃鸡|永劫|绝地求生|和平精英|第五人格|明日方舟|阴阳师|崩坏星穹|我的世界|迷你世界|摩尔庄园|蛋仔派对|暗区突围|鬼畚|搞笑|娱乐|整活/i;
const NON_EDUCATIONAL = /直播|带货|市场|投资|理财|股票|培训|养生|美食|旅行|探店|测评|搭配|服装|化妆|美妆|发型|美甲|美食|美容|发型|美发|美体|美胸|美背|美妆|护肤|彩妆|穿搭|时尚|潮流|品牌|好物|开箱|种草|拔草|安利|测评|种草机|好物推荐|好物分享|好物种草|好物安利好物分享|好物推荐|好物安利/i;

function educationStageFromGrade(grade?: string): "小学" | "初中" | "高中" | "大学" {
  if (!grade) return "高中";
  if (grade.includes("小学")) return "小学";
  if (grade.includes("初")) return "初中";
  if (grade.includes("高")) return "高中";
  if (grade.includes("大学") || grade.includes("研究生")) return "大学";
  return "高中";
}

function buildSearchKeywords(userProfile: ReturnType<typeof loadCurrentUserProfile>, weakPoints: WeakPoint[]): string[] {
  var stageSubjectMap: Record<string, string[]> = {
    "小学": ["小学数学", "小学语文", "小学英语", "小学科学"],
    "初中": ["初中数学", "初中语文", "初中英语", "初中物理", "初中化学", "初中生物"],
    "高中": ["高中数学", "高中语文", "高中英语", "高中物理", "高中化学", "高中生物"],
    "大学": ["高等数学", "线性代数", "信息论与编码", "大学英语", "大学物理", "程序设计", "数据结构", "计算机类", "电子信息类", "机械类", "土木建筑类", "经济管理类", "法学类", "医学类"]
  };
  var stage = educationStageFromGrade(userProfile?.grade || undefined);
  var base = stageSubjectMap[stage];
  if (weakPoints && weakPoints.length > 0) {
    var sw = weakPoints.slice(0, 5).map(function(wp) { return wp.subject + " " + wp.knowledge; });
    return sw.concat(base).slice(0, 6);
  }
  return base.slice(0, 4);
}

var SUBJECT_NAMES = ["全部", "数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "政治", "科学", "计算机类", "电子信息类", "机械类", "土木建筑类", "医学类", "经济管理类", "法学类", "外语类", "化学与化工类", "物理学类"];

var SUBJECT_RELATED: Record<string, string[]> = {
  "数学": ["数学", "公式", "定理", "方程", "函数", "几何", "概率", "统计", "代数", "计算", "三角", "向量", "微积分", "导数", "极限", "数列", "不等式", "解析几何", "圆锥曲线", "矩阵", "线性代数", "高数", "考研数学"],
  "语文": ["语文", "阅读", "作文", "古诗", "文言文", "诗词", "阅读理解", "写作", "文学", "散文", "小说", "议论文", "记叙文", "说明文", "名著", "背诵", "默写", "高考语文"],
  "英语": ["英语", "听力", "口语", "阅读", "写作", "语法", "单词", "词汇", "翻译", "四六级", "雅思", "托福", "GRE", "考研英语", "高考英语"],
  "物理": ["物理", "力学", "电磁学", "光学", "热学", "原子", "牛顿", "能量", "动量", "电路", "磁场", "电场", "波动", "量子", "相对论", "实验"],
  "化学": ["化学", "有机", "无机", "元素", "化学反应", "分子", "原子", "化学键", "氧化", "还原", "酸碱", "盐", "溶液", "电解", "化学方程式"],
  "生物": ["生物", "细胞", "基因", "遗传", "DNA", "RNA", "蛋白质", "生态系统", "进化", "光合作用", "呼吸作用", "减数分裂", "有丝分裂", "孟德尔"],
  "历史": ["历史", "朝代", "战争", "革命", "改革", "经济", "文化", "世界史", "中国史", "近代史", "古代史", "二战", "一战"],
  "地理": ["地理", "地形", "气候", "地图", "地球", "经纬", "洋流", "季风", "人口", "城市", "农业", "工业", "自然地理", "人文地理"],
  "政治": ["政治", "马克思主义", "哲学", "经济", "法律", "道德", "政治生活", "文化生活", "唯物论", "辩证法", "认识论"],
  "科学": ["科学", "实验", "物理", "化学", "生物", "天文", "地理", "探索", "自然"],
  "计算机类": ["计算机", "编程", "算法", "数据结构", "操作系统", "网络", "数据库", "C语言", "Python", "Java", "编程语言", "软件开发", "前端", "后端", "计算机科学"],
  "电子信息类": ["电路", "信号", "通信", "电子", "电磁", "模拟", "数字", "嵌入式", "单片机", "电子技术", "集成电路", "射频", "自动控制"],
  "机械类": ["机械", "力学", "材料", "设计", "制造", "制图", "传动", "机械设计", "工程力学", "材料力学", "理论力学", "液压", "气压", "机械原理"],
  "土木建筑类": ["土木", "建筑", "结构", "施工", "混凝土", "测量", "岩土", "建筑工程", "土木工程", "建筑设计", "钢结构", "地基", "抗震"],
  "医学类": ["医学", "解剖", "生理", "病理", "药理", "临床", "诊断", "内科", "外科", "药学", "护理", "医学考研", "中医", "西医"],
  "经济管理类": ["经济", "管理", "会计", "金融", "市场", "营销", "统计", "财务管理", "工商管理", "经济学", "管理学", "审计", "税务"],
  "法学类": ["法学", "法律", "宪法", "民法", "刑法", "诉讼", "合同法", "知识产权", "法考", "法律职业资格", "公司法", "经济法"],
  "外语类": ["外语", "英语", "日语", "法语", "德语", "翻译", "西班牙语", "韩语", "俄语", "口译", "笔译", "CATTI"],
  "化学与化工类": ["化学", "化工", "反应", "合成", "分析", "物理化学", "有机化学", "仪器分析", "化学工程", "高分子", "材料化学"],
  "物理学类": ["物理", "量子", "力学", "电磁", "热力学", "光学", "原子", "固体物理", "统计物理", "粒子物理", "凝聚态"],
};

function isVideoSubjectRelevant(title: string, description: string, subject: string): boolean {
  if (subject === "全部") return true;
  var related = SUBJECT_RELATED[subject];
  if (!related) return true;
  var text = (title + " " + (description || "")).toLowerCase();
  var hasSubjectWord = related.some(function(kw) { return text.includes(kw.toLowerCase()); });
  if (!hasSubjectWord) return false;
  var OTHER_SUBJECTS: string[] = [];
  Object.keys(SUBJECT_RELATED).forEach(function(s) {
    if (s !== subject && s !== "科学") OTHER_SUBJECTS = OTHER_SUBJECTS.concat(SUBJECT_RELATED[s]);
  });
  var otherCount = OTHER_SUBJECTS.filter(function(kw) { return text.includes(kw.toLowerCase()); }).length;
  var subjectCount = related.filter(function(kw) { return text.includes(kw.toLowerCase()); }).length;
  return subjectCount > otherCount;
}

function importanceStars(weight: number) {
  if (weight >= 85) return 5;
  if (weight >= 65) return 4;
  if (weight >= 45) return 3;
  if (weight >= 25) return 2;
  return 1;
}



function LearningSpaceSection() {
  var _videos = useState<VideoResource[]>([]);
  var videos = _videos[0], setVideos = _videos[1];
  var _loading = useState(true);
  var loading = _loading[0], setLoading = _loading[1];
  var _page = useState(0);
  var page = _page[0], setPage = _page[1];
  var _visibleVideoCount = useState(INITIAL_VISIBLE_VIDEOS);
  var visibleVideoCount = _visibleVideoCount[0], setVisibleVideoCount = _visibleVideoCount[1];
  var _layout = useState("grid");
  var layout = _layout[0], setLayout = _layout[1];
  var _kw = useState("");
  var searchKeyword = _kw[0], setSearchKeyword = _kw[1];
  var _videoQuery = useState("");
  var videoQuery = _videoQuery[0], setVideoQuery = _videoQuery[1];
  var _total = useState(0);
  var totalResults = _total[0], setTotalResults = _total[1];
  var _broadSearching = useState(false);
  var broadSearching = _broadSearching[0], setBroadSearching = _broadSearching[1];
  var _activeSubject = useState("全部");
  var activeSubject = _activeSubject[0], setActiveSubject = _activeSubject[1];
  var _allFetched = useState<VideoResource[]>([]);
  var allFetched = _allFetched[0], setAllFetched = _allFetched[1];
  var _searchResults = useState<VideoResource[]>([]);
  var searchResults = _searchResults[0], setSearchResults = _searchResults[1];
  var user = loadCurrentUserProfile();
  var stage = educationStageFromGrade(user?.grade || undefined);
  var level = stage;

  var stageSubjectMap: Record<string, string[]> = {
    "小学": ["小学数学", "小学语文", "小学英语", "小学科学"],
    "初中": ["初中数学", "初中语文", "初中英语", "初中物理", "初中化学", "初中生物"],
    "高中": ["高中数学", "高中语文", "高中英语", "高中物理", "高中化学", "高中生物", "高中历史", "高中地理", "高中政治"],
    "大学": ["高等数学", "线性代数", "信息论与编码", "大学英语", "大学物理", "程序设计", "数据结构", "计算机类", "电子信息类", "机械类", "土木建筑类", "经济管理类", "法学类", "医学类"]
  };

  async function fetchSubjectVideos(subject: string, maxPages: number, cancelledRef: { v: boolean }, broad?: boolean): Promise<VideoResource[]> {
    var results: VideoResource[] = [];
    for (var pi = 1; pi <= maxPages; pi++) {
      if (cancelledRef.v) return results;
      try {
        var resp = await fetch("/api/video-search", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({keyword: subject + " 教学", level, page: pi, pageSize: 50, broad: !!broad})
        });
        var data = await resp.json();
        if (!data.videos || !data.videos.length) break;
        for (var vi = 0; vi < data.videos.length; vi++) {
          var v = data.videos[vi];
          if (IRRELEVANT_KEYWORDS.test(v.title) || IRRELEVANT_KEYWORDS.test(v.description || "")) continue;
          var mainSubject = subject.replace(/小学|初中|高中|高考|大学|考研/g, "");
          if (!isVideoSubjectRelevant(v.title, v.description || "", mainSubject)) continue;
          var exists = results.some(function(r) { return r.url.includes(v.bvid); });
          if (exists) continue;
          results.push({
            id: "bili_" + v.bvid,
            title: v.title,
            subject,
            knowledge: v.description || v.title,
            url: "https://www.bilibili.com/video/" + v.bvid,
            source: "bilibili",
            publisher: v.author,
            duration: v.duration,
            level: level
          });
        }
        if ((data.videos || []).length < 20) break;
      } catch (e) { break; }
    }
    return results;
  }

  useEffect(function() {
    var cancelledRef = { v: false };
    async function searchAllSubjects() {
      setLoading(true);
      try {
        var subjects = stageSubjectMap[stage] || stageSubjectMap["高中"];
        var allResults: VideoResource[] = [];
        for (var si = 0; si < subjects.length; si++) {
          var subject = subjects[si];
          if (cancelledRef.v) return;
          var pageVideos = await fetchSubjectVideos(subject, 5, cancelledRef);
          for (var vi = 0; vi < pageVideos.length; vi++) {
            var pv = pageVideos[vi];
            var exists = allResults.some(function(r) { return r.url.includes(pv.id.replace("bili_", "")); });
            if (!exists && allResults.length < VIDEO_TARGET_PER_STAGE) allResults.push(pv);
          }
          if (allResults.length >= VIDEO_TARGET_PER_STAGE) break;
        }
        if (!cancelledRef.v) {
          if (allResults.length > 0) {
            setAllFetched(allResults);
            setVideos(allResults);
            setTotalResults(allResults.length);
            setSearchKeyword(stage + " 学习视频");
          } else {
            // 使用爬取的数据作为后备
            try {
              var remote = await loadEducationalVideos();
              var fallbackVideos = remote.filter(function(v) { return v.level === level; });
              if (fallbackVideos.length > 0) {
                setAllFetched(fallbackVideos);
                setVideos(fallbackVideos);
                setTotalResults(fallbackVideos.length);
                setSearchKeyword(level + " 精选视频");
              }
            } catch (_e) { /* ignore */ }
          }
        }
      } finally {
        if (!cancelledRef.v) setLoading(false);
      }
    }
    searchAllSubjects();
    return function() { cancelledRef.v = true; };
  }, []);

  function handleSubjectChange(subject: string) {
    setActiveSubject(subject);
    setPage(0);
    setVisibleVideoCount(INITIAL_VISIBLE_VIDEOS);
    setSearchResults([]);
    setSearchKeyword(stage + " 学习视频");
    if (subject === "全部") {
      setVideos(allFetched);
    } else {
      setVideos(allFetched.filter(function(v) { return v.subject === subject; }));
    }
  }

  async function searchBroadWebResults() {
    if (!videoQuery.trim()) return;
    setBroadSearching(true);
    try {
      var subjectPrefix = activeSubject === "全部" ? "" : activeSubject;
      var searchKeywordText = [subjectPrefix, videoQuery.trim()].filter(Boolean).join(" ");
      var results = await fetchSubjectVideos(searchKeywordText, 20, { v: false }, true);
      setSearchResults(results);
      setPage(0);
      setVisibleVideoCount(INITIAL_VISIBLE_VIDEOS);
      setSearchKeyword((subjectPrefix ? subjectPrefix + " " : "") + videoQuery.trim() + " 全网结果");
    } finally {
      setBroadSearching(false);
    }
  }

  var categoryTabs = ["全部"].concat(
    Array.from(new Set(allFetched.map(function(video) { return video.subject; })))
  );

  var filteredVideos = videos.filter(function(video) {
    var query = videoQuery.trim().toLowerCase();
    if (!query) return true;
    return [video.title, video.knowledge, video.publisher || "", video.subject]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  var visibleVideos = filteredVideos.slice(0, visibleVideoCount);

  async function loadMoreVisibleVideos() {
    var nextCount = visibleVideoCount + LOAD_MORE_VIDEOS;
    setVisibleVideoCount(nextCount);
    if (filteredVideos.length >= nextCount) return;
    var targetSubject = activeSubject === "全部" ? (stageSubjectMap[stage] || stageSubjectMap["高中"])[0] : activeSubject;
    var more = await fetchSubjectVideos(targetSubject, Math.ceil(nextCount / 50) + 1, { v: false }, true);
    setAllFetched(function(prev) {
      var merged = prev.slice();
      more.forEach(function(video) {
        if (!merged.some(function(item) { return item.id === video.id || item.url === video.url; })) merged.push(video);
      });
      return merged;
    });
    setVideos(function(prev) {
      var merged = prev.slice();
      more.forEach(function(video) {
        if (!merged.some(function(item) { return item.id === video.id || item.url === video.url; })) merged.push(video);
      });
      return activeSubject === "全部" ? merged : merged.filter(function(video) { return video.subject === activeSubject; });
    });
  }

  return (
    <section className="section">
      <div className="card learning-space-card">
        <div className="panel-heading">
          <h2 className="card-title">{"学习空间"} · {activeSubject}</h2>
          <div className="learning-space-controls">
            <button className={"icon-button secondary" + (layout === "grid" ? " active" : "")} style={{"minWidth": 32, "minHeight": 32, "padding": 0}} onClick={function() { setPage(0); setLayout("grid"); }} type="button"><LayoutGrid size={16} /></button>
            <button className={"icon-button secondary" + (layout === "list" ? " active" : "")} style={{"minWidth": 32, "minHeight": 32, "padding": 0}} onClick={function() { setPage(0); setLayout("list"); }} type="button"><List size={16} /></button>
            <input className="input learning-space-search" value={videoQuery} onChange={function(event) { setVideoQuery(event.target.value); setPage(0); }} placeholder="搜索视频标题、发布者或知识点" />
          </div>
        </div>
        <div className="learning-space-subject-tabs learning-space-category-cards">
          {categoryTabs.map(function(s) {
            var count = s === "全部" ? allFetched.length : allFetched.filter(function(v) { return v.subject === s; }).length;
            return count > 0 ? (
              <button key={s} className={"learning-space-subject-card" + (activeSubject === s ? " active" : "")} onClick={function() { handleSubjectChange(s); }} type="button">
                <strong>{s}</strong>
                <span>{count} 个视频</span>
              </button>
            ) : null;
          })}
        </div>
        {loading ? (
          <div className="learning-space-loading"><Loader2 className="spin" size={24} /> <span className="muted" style={{"marginLeft": 8}}>{"搜索学习视频中..."}</span></div>
        ) : (
          <>
            {filteredVideos.length === 0 && videoQuery.trim() ? (
              <div className="inline-panel learning-space-empty-search">
                <span className="muted">当前分类没有匹配结果。</span>
                <button className="button secondary" disabled={broadSearching} onClick={searchBroadWebResults} type="button">
                  {broadSearching ? "搜全网中" : "搜全网结果"}
                </button>
              </div>
            ) : null}
            {searchResults.length > 0 ? (
              <div className="card learning-space-search-results-card">
                <div className="panel-heading">
                  <h3 className="card-title">{searchKeyword || "全网结果"}</h3>
                  <span className="pill">{searchResults.length} 个视频</span>
                </div>
                <div className={"learning-space-grid" + (layout === "list" ? " list-layout" : "")}>
                  {searchResults.map(function(video) { return <LearningVideoCard key={video.id} video={video} />; })}
                </div>
              </div>
            ) : null}
            <div className={"learning-space-grid" + (layout === "list" ? " list-layout" : "")}>
              {visibleVideos.map(function(video) { return <LearningVideoCard key={video.id} video={video} />; })}
              <button className="learning-space-add-more" onClick={loadMoreVisibleVideos} type="button" aria-label="添加更多视频">
                <span><Plus size={26} /></span>
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
export default function HomePage() {
  const setProfile = useLearningStore((state) => state.setProfile);
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [tasks, setTasks] = useState<TodayTask[]>([]);
  const [editing, setEditing] = useState<TodayTask | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);

  const [weakPoints, setWeakPoints] = useState<WeakPoint[]>([]);
  const [weakPage, setWeakPage] = useState(0);
  const [resourcePage, setResourcePage] = useState(0);
  const weakListRef = useRef<HTMLDivElement>(null);
  const resourceListRef = useRef<HTMLDivElement>(null);
  const [weakPageSize, setWeakPageSize] = useState(5);
  const resourcePageSize = 2;
  const [canUsePersonalizedResources, setCanUsePersonalizedResources] = useState(false);
  const [resourceLoginOpen, setResourceLoginOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  function refresh() {
    const canPersonalize = Boolean(loadCurrentUserProfile()) && !isGuestSession();
    setCanUsePersonalizedResources(canPersonalize);
    markCurrentLoginDay();
    decayWeakPoints();
    const next = buildProfileFromActualData();
    setProfile(next);
    setData(next);
    setTasks(next.today_tasks);
    setWeakPoints(getWeakPoints());
  }

  const [activityStats, setActivityStats] = useState({ totalMinutes: 0, sessionsCount: 0 });

  useEffect(() => {
    refresh();
    startTracking();
    setActivityStats(getActivityStats());
    function preGenerateWeakPointResources() {
      if (!loadCurrentUserProfile() || isGuestSession()) return;
      getWeakPoints().forEach(function(wp) {
        if (!getCachedResources(`${wp.subject} ${wp.knowledge}`)) {
          preGenerateResources(wp.knowledge, wp.subject);
        }
      });
    }
    function preGenerateWeakPointPlans() {
      if (!loadCurrentUserProfile() || isGuestSession()) return;
      preGenerateReviewPlans(getWeakPoints());
    }
    preGenerateWeakPointResources();
    preGenerateWeakPointPlans();
    function handleWeakPointUpdated() {
      refresh();
      preGenerateWeakPointResources();
      preGenerateWeakPointPlans();
    }
    function handleResourcesReady() {
      refresh();
    }
    function handleReviewPlanReady() {
      refresh();
    }
    window.addEventListener("qixue:weak-point-updated", handleWeakPointUpdated);
    window.addEventListener("qixue:resources-ready", handleResourcesReady);
    window.addEventListener("qixue:review-plan-ready", handleReviewPlanReady);
    const id = setInterval(() => setActivityStats(getActivityStats()), 10000);
    return () => {
      clearInterval(id);
      window.removeEventListener("qixue:weak-point-updated", handleWeakPointUpdated);
      window.removeEventListener("qixue:resources-ready", handleResourcesReady);
      window.removeEventListener("qixue:review-plan-ready", handleReviewPlanReady);
    };
  }, []);

  const visibleWeakPoints = weakPoints
    .filter((wp) => wp.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const weakTotalPages = Math.ceil(visibleWeakPoints.length / weakPageSize);
  const pagedWeakPoints = visibleWeakPoints.slice(weakPage * weakPageSize, (weakPage + 1) * weakPageSize);
  const weakPlaceholderCount = weakPage < weakTotalPages - 1 ? Math.max(0, weakPageSize - pagedWeakPoints.length) : 0;
  const recommendedResources = data?.recommended_resources || [];
  const recommendedResourceCategories = groupResourcesBySubject(recommendedResources);
  const resourceTotalPages = Math.ceil(recommendedResourceCategories.length / resourcePageSize);
  const pagedRecommendedResourceCategories = recommendedResourceCategories.slice(resourcePage * resourcePageSize, (resourcePage + 1) * resourcePageSize);
  const resourcePlaceholderCount = resourcePage < resourceTotalPages - 1 ? Math.max(0, resourcePageSize - pagedRecommendedResourceCategories.length) : 0;

  useEffect(() => {
    function updateWeakPageSize() {
      const list = weakListRef.current;
      if (!list) return;
      const height = list.clientHeight;
      const nextSize = Math.max(1, Math.floor(height / 56));
      setWeakPageSize(nextSize);
      setWeakPage((page) => Math.min(page, Math.max(0, Math.ceil(visibleWeakPoints.length / nextSize) - 1)));
    }
    updateWeakPageSize();
    window.addEventListener("resize", updateWeakPageSize);
    return () => window.removeEventListener("resize", updateWeakPageSize);
  }, [visibleWeakPoints.length]);

  useEffect(() => {
    setResourcePage((page) => Math.min(page, Math.max(0, Math.ceil(recommendedResourceCategories.length / resourcePageSize) - 1)));
  }, [recommendedResourceCategories.length]);

  if (!data) return null;

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft);
    setTaskEditorOpen(true);
  }

  function openEdit(task: TodayTask) {
    setEditing(task);
    setDraft({ title: task.title, knowledge: task.knowledge, exercises: task.exercises, minutes: task.minutes });
    setTaskEditorOpen(true);
  }

  function saveTask() {
    if (!draft.title.trim() || !draft.knowledge.trim()) return;
    if (editing) updateTodayTask(editing.id, draft);
    else createTodayTask(draft);
    setEditing(null);
    setDraft(emptyDraft);
    setTaskEditorOpen(false);
    refresh();
  }

  function removeWeakPoint(point: WeakPoint, event?: React.MouseEvent) {
    const x = event ? event.clientX : window.innerWidth / 2;
    const y = event ? event.clientY : window.innerHeight / 2;
    setConfirmAction({
      message: `删除薄弱点“${point.subject} ${point.knowledge}”？`,
      x, y,
      onConfirm: () => {
        deleteWeakPoint(point);
        refresh();
        setConfirmAction(null);
      }
    });
  }

  function removeResource(resourceId: string, event?: React.MouseEvent) {
    const x = event ? event.clientX : window.innerWidth / 2;
    const y = event ? event.clientY : window.innerHeight / 2;
    setConfirmAction({
      message: "删除该个性化资源？",
      x, y,
      onConfirm: () => {
        deleteResource(resourceId);
        refresh();
        setConfirmAction(null);
      }
    });
  }

  return (
    <>
      <section className="section home-overview clean-top">
        <div className="card progress-card">
          <ProgressRing value={data.progress} label="知识点进度" />
          <div className="row">
            <span className="muted">{data.completedKnowledge}/{data.totalKnowledge} 已完成</span>
            <span className="pill"><Target size={14} /> 本周</span>
          </div>
        </div>
        <div className="card task-panel">
          <div className="panel-heading">
            <h2 className="card-title">今日任务</h2>
            <div className="task-panel-actions">
              <span className="pill">{tasks.filter((task) => task.status === "todo").length} 项</span>
              <button className="icon-button secondary" onClick={openCreate} type="button" aria-label="新建任务">
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div className="list">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={(id) => {
                  const current = tasks.find((item) => item.id === id);
                  if (current) updateTodayTask(id, { status: current.status === "done" ? "todo" : "done" });
                  refresh();
                }}
                onEdit={openEdit}
              />
            ))}
            {tasks.length === 0 ? <p className="muted">还没有任务，点击右上角新建。</p> : null}
          </div>
        </div>
        <div className="card continuity-card">
          <h2 className="card-title">连续学习</h2>
          <div className="metric">
            <Flame size={22} />
            <strong>{data.streakDays} 天</strong>
          </div>
          <p className="streak-motto">{streakMotto(data.streakDays)}</p>
          <div className="rhythm-bar" aria-hidden>
            {Array.from({ length: 7 }).map((_, itemIndex) => (
              <span key={itemIndex} className={itemIndex < Math.min(data.streakDays, 7) ? "active" : ""} />
            ))}
          </div>
          <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-3)" }}>
            <span className="muted">学习时长: {Math.round(activityStats.totalMinutes)}分钟</span>
            <span className="muted">会话: {activityStats.sessionsCount}次</span>
          </div>
        </div>
      </section>

      <MotivationalQuote />

      <section className="section grid two insight-grid">
        <div className="card insight-panel">
          <div className="panel-heading">
            <h2 className="card-title">薄弱知识点 <span className="pill">{weakPoints.filter((wp) => wp.weight > 0).length} 个</span></h2>
            
          </div>
          <div className="list weak-point-list-fill" ref={weakListRef}>
            {pagedWeakPoints
              .map((wp, i) => (
                <div
                  className="weak-point-row weak-point-line"
                  key={`${wp.id}:${wp.subject}:${wp.knowledge}`}
                  onContextMenu={(event) => { event.preventDefault(); removeWeakPoint(wp, event); }}
                  title="右键删除该薄弱点"
                >
                  <div className="weak-point-info">
                    <span className="pill weak-subject-pill">{wp.subject}</span>
                    <strong className="weak-knowledge-name">{wp.knowledge}</strong>
                    <span className="weak-star-rating" title={`重要程度 ${importanceStars(wp.weight)} 星`}>
                      {Array.from({ length: importanceStars(wp.weight) }).map((_, starIndex) => (
                        <Star key={starIndex} size={14} fill="#e6a817" color="#e6a817" />
                      ))}
                    </span>
                  </div>
                  <div className="weak-point-bar">
                    <div className="weak-progress-bar">
                      <div className="weak-progress-fill" style={{ width: `${getWeakPointProgress(wp)}%` }} />
                    </div>
                    <span className="muted">{Math.round(getWeakPointProgress(wp))}%</span>
                  </div>
                </div>
              ))}
            {Array.from({ length: weakPlaceholderCount }).map((_, index) => (
              <div className="weak-point-row weak-point-line weak-point-placeholder" key={`weak_placeholder_${index}`} aria-hidden />
            ))}
            {weakPoints.filter((wp) => wp.weight > 0).length === 0 ? <p className="muted">暂无薄弱点记录</p> : null}
          </div>
          {weakTotalPages > 1 ? (
            <div className="pagination compact-pagination">
              <button className="button secondary" disabled={weakPage === 0} onClick={() => setWeakPage((page) => page - 1)} type="button">上一页</button>
              <span className="muted">{weakPage + 1} / {weakTotalPages}</span>
              <button className="button secondary" disabled={weakPage >= weakTotalPages - 1} onClick={() => setWeakPage((page) => page + 1)} type="button">下一页</button>
            </div>
          ) : null}
        </div>
        <div className="card insight-panel resource-insight-panel">
          <h2 className="card-title">推荐资源 <span className="pill">{canUsePersonalizedResources ? recommendedResourceCategories.length : 0} 个类别</span></h2>
          {canUsePersonalizedResources ? (
            <div className="list resource-list-fill" ref={resourceListRef}>
              {pagedRecommendedResourceCategories.map((category) => (
                <ResourceCategoryCard key={category.key} category={category} />
              ))}
              {Array.from({ length: resourcePlaceholderCount }).map((_, index) => (
                <div className="resource-placeholder" key={`resource_placeholder_${index}`} aria-hidden />
              ))}
            </div>
          ) : (
            <div className="personalized-resource-notice compact-resource-notice">
              <div>
                <strong>登录 / 注册后查看个性化资源</strong>
                <p className="muted">游客或未登录状态仅可查看已有薄弱点，不会生成新的薄弱点或个性化资源。</p>
              </div>
              <button className="button" onClick={() => { logoutUser(); setResourceLoginOpen(true); }} type="button">登录 / 注册</button>
            </div>
          )}
          {canUsePersonalizedResources && resourceTotalPages > 1 ? (
            <div className="pagination compact-pagination">
              <button className="button secondary" disabled={resourcePage === 0} onClick={() => setResourcePage((page) => page - 1)} type="button">上一页</button>
              <span className="muted">{resourcePage + 1} / {resourceTotalPages}</span>
              <button className="button secondary" disabled={resourcePage >= resourceTotalPages - 1} onClick={() => setResourcePage((page) => page + 1)} type="button">下一页</button>
            </div>
          ) : null}
        </div>
      </section>
      <GoalsSection />
      <ReviewPlanSection weakPoints={weakPoints} />
      <LearningSpaceSection />

      {taskEditorOpen ? (
        <div className="modal-backdrop" onClick={() => { setEditing(null); setDraft(emptyDraft); setTaskEditorOpen(false); }}>
          <section className="modal-panel task-modal" onClick={(event) => event.stopPropagation()}>
            <button className="icon-button secondary modal-close" onClick={() => { setEditing(null); setDraft(emptyDraft); setTaskEditorOpen(false); }} type="button" aria-label="关闭">
              <X size={16} />
            </button>
            <h2 className="card-title">{editing ? "编辑任务" : "新建任务"}</h2>
            <div className="field">
              <label>任务标题</label>
              <input className="input" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </div>
            <div className="field">
              <label>知识点</label>
              <input className="input" value={draft.knowledge} onChange={(event) => setDraft({ ...draft, knowledge: event.target.value })} />
            </div>
            <div className="form-grid two">
              <div className="field">
                <label>题数</label>
                <input className="input" min={0} type="number" value={draft.exercises} onChange={(event) => setDraft({ ...draft, exercises: Number(event.target.value) })} />
              </div>
              <div className="field">
                <label>分钟</label>
                <input className="input" min={1} type="number" value={draft.minutes} onChange={(event) => setDraft({ ...draft, minutes: Number(event.target.value) })} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={saveTask} type="button">保存</button>
            </div>
          </section>
        </div>
      ) : null}
      {resourceLoginOpen ? (
        <LoginModal
          onClose={() => setResourceLoginOpen(false)}
          onDone={() => { setResourceLoginOpen(false); refresh(); }}
        />
      ) : null}
      {confirmAction ? (
        <ConfirmPopup action={confirmAction} onClose={() => setConfirmAction(null)} />
      ) : null}
    </>
  );
}
