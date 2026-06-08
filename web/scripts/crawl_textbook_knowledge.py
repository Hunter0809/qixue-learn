import argparse
import hashlib
import json
import re
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DB = ROOT / "public" / "data" / "textbook-knowledge.json"
RUNTIME_DB = ROOT / "lib" / "generated-textbook-knowledge.json"
SMARTEDU_INDEXES = [
    "https://r1-ndr.ykt.cbern.com.cn/edu_product/esp/assets_document/pkg/义务教育.json",
    "https://r1-ndr.ykt.cbern.com.cn/edu_product/esp/assets_document/pkg/普通高中.json",
]
KNOWN_SMARTEDU_CONTENT_IDS = [
    "bdc00134-465d-454b-a541-dcd0cec4d86e",
    "bd9bb1d9-3f3d-3b64-57b6-de27fe319865",
    "ed5f6a59-0cc5-47e9-adc3-0033711700ea",
    "1c73b348-e8b6-47d6-84b0-6dbacbe28268",
    "b9b62fbb-f770-4294-906f-12d5aa5d9705",
    "453025ca-58bd-442e-8543-5ef5222d50c6",
    "e63909e2-df0e-42b7-805a-9be3280e7027",
]
TEXTBOOK_TOC_PAGES = [
    "https://news.zxxk.com/article/1017929.html",
    "https://news.zxxk.com/article/1032249.html",
]
RENJIAOSHE_CATALOGS = {
    "primary": {
        "语文": "https://www.renjiaoshe.com/xiaoxueyuwen.html",
        "数学": "https://www.renjiaoshe.com/xiaoxueshuxue.html",
        "英语": "https://www.renjiaoshe.com/xiaoxueyingyu.html",
    },
    "middle": {
        "语文": "https://www.renjiaoshe.com/chuzhongyuwen.html",
        "数学": "https://www.renjiaoshe.com/chuzhongshuxue.html",
        "英语": "https://www.renjiaoshe.com/chuzhongyingyu.html",
        "物理": "https://www.renjiaoshe.com/chuzhongwuli.html",
        "化学": "https://www.renjiaoshe.com/chuzhonghuaxue.html",
        "生物": "https://www.renjiaoshe.com/chuzhongshengwu.html",
        "历史": "https://www.renjiaoshe.com/chuzhonglishi.html",
        "地理": "https://www.renjiaoshe.com/chuzhongdili.html",
        "道德与法治": "https://www.renjiaoshe.com/chuzhongzhengzhi.html",
    },
    "high": {
        "语文": "https://www.renjiaoshe.com/gaozhongyuwen.html",
        "数学": "https://www.renjiaoshe.com/gaozhongshuxue.html",
        "英语": "https://www.renjiaoshe.com/gaozhongyingyu.html",
        "物理": "https://www.renjiaoshe.com/gaozhongwuli.html",
        "化学": "https://www.renjiaoshe.com/gaozhonghuaxue.html",
        "生物": "https://www.renjiaoshe.com/gaozhongshengwu.html",
        "历史": "https://www.renjiaoshe.com/gaozhonglishi.html",
        "地理": "https://www.renjiaoshe.com/gaozhongdili.html",
        "政治": "https://www.renjiaoshe.com/gaozhongzhengzhi.html",
    },
}

SUBJECTS = [
    "数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "政治", "道德与法治",
    "科学", "信息科技", "计算机类", "电子信息类", "机械类", "土木建筑类", "医学类",
    "经济管理类", "法学类", "外语类"
]

UNIVERSITY_SEEDS = {
    "计算机类": [
        "数据结构", "算法分析", "时间复杂度", "线性表", "栈", "队列", "树", "图", "排序算法", "查找算法",
        "操作系统进程", "线程", "内存管理", "文件系统", "计算机网络分层模型", "TCP", "IP", "数据库范式",
        "SQL查询", "事务", "编译原理词法分析", "语法分析"
    ],
    "电子信息类": ["电路分析", "基尔霍夫定律", "节点电压法", "网孔电流法", "模拟电路", "数字电路", "信号与系统", "傅里叶变换"],
    "机械类": ["理论力学", "材料力学", "应力", "应变", "弯矩", "机械原理", "齿轮传动", "机械设计"],
    "土木建筑类": ["结构力学", "混凝土结构", "钢结构", "土力学", "工程测量", "施工组织", "地基基础"],
    "医学类": ["系统解剖学", "生理学", "病理学", "药理学", "诊断学", "内科学", "外科学"],
    "经济管理类": ["微观经济学", "需求曲线", "供给曲线", "边际成本", "宏观经济学", "会计要素", "财务报表"],
    "法学类": ["法理学", "宪法基本原则", "民法总则", "物权", "合同", "刑法构成要件", "诉讼程序"],
    "外语类": ["语音学", "形态学", "句法学", "翻译理论", "跨文化交际", "学术写作"]
}
UNIVERSITY_CORE_COURSES = {
    "计算机类": {
        "《数据结构（C语言版）》": ["线性表", "顺序表", "链表", "栈", "队列", "串", "二叉树", "树与森林", "图的存储", "图的遍历", "最小生成树", "最短路径", "拓扑排序", "查找表", "散列表", "内部排序"],
        "《计算机组成原理》": ["数据表示", "定点数运算", "浮点数运算", "指令系统", "CPU数据通路", "控制器", "存储层次结构", "Cache映射", "虚拟存储器", "总线", "输入输出系统"],
        "《操作系统概念》": ["进程管理", "线程", "CPU调度", "进程同步", "死锁", "内存管理", "虚拟内存", "文件系统", "磁盘调度", "I/O管理"],
        "《计算机网络》": ["OSI参考模型", "TCP/IP体系结构", "数据链路层", "以太网", "IP协议", "路由算法", "TCP可靠传输", "拥塞控制", "DNS", "HTTP"],
        "《数据库系统概论》": ["关系模型", "关系代数", "SQL查询", "完整性约束", "数据库设计", "范式", "事务", "并发控制", "恢复技术", "索引"]
    },
    "电子信息类": {
        "《电路》": ["基尔霍夫定律", "电阻电路等效", "节点电压法", "网孔电流法", "戴维南定理", "诺顿定理", "一阶电路", "二阶电路", "正弦稳态分析", "三相电路"],
        "《模拟电子技术基础》": ["半导体二极管", "晶体管放大电路", "场效应管", "反馈放大电路", "功率放大电路", "运算放大器", "有源滤波器", "稳压电源"],
        "《数字电子技术基础》": ["逻辑代数", "门电路", "组合逻辑电路", "触发器", "时序逻辑电路", "计数器", "寄存器", "A/D转换", "D/A转换"],
        "《信号与系统》": ["连续时间信号", "离散时间信号", "卷积", "傅里叶级数", "傅里叶变换", "拉普拉斯变换", "Z变换", "系统稳定性"]
    },
    "机械类": {
        "《理论力学》": ["静力学公理", "力系简化", "平面任意力系", "摩擦", "点的运动学", "刚体平面运动", "动量定理", "动量矩定理", "达朗贝尔原理"],
        "《材料力学》": ["轴向拉压", "剪切", "扭转", "弯曲内力", "弯曲应力", "弯曲变形", "应力状态", "强度理论", "压杆稳定"],
        "《机械原理》": ["机构结构分析", "平面连杆机构", "凸轮机构", "齿轮机构", "轮系", "机械平衡", "机械效率", "速度波动调节"],
        "《机械设计》": ["螺纹连接", "键连接", "带传动", "链传动", "齿轮传动", "蜗杆传动", "轴", "滚动轴承", "联轴器"]
    },
    "土木建筑类": {
        "《结构力学》": ["几何组成分析", "静定梁", "静定刚架", "三铰拱", "桁架", "影响线", "位移计算", "力法", "位移法", "矩阵位移法"],
        "《混凝土结构设计原理》": ["混凝土材料性能", "受弯构件正截面", "斜截面承载力", "受压构件", "受拉构件", "裂缝控制", "预应力混凝土"],
        "《土力学》": ["土的物理性质", "土中应力", "土的压缩性", "地基沉降", "土的抗剪强度", "土压力", "边坡稳定", "地基承载力"]
    },
    "医学类": {
        "《系统解剖学》": ["骨学", "关节学", "肌学", "消化系统", "呼吸系统", "泌尿系统", "生殖系统", "心血管系统", "神经系统"],
        "《生理学》": ["细胞膜转运", "神经兴奋", "血液", "循环生理", "呼吸生理", "消化吸收", "能量代谢", "尿生成", "内分泌"],
        "《病理学》": ["细胞损伤", "炎症", "修复", "血栓形成", "栓塞", "梗死", "肿瘤", "心血管系统疾病", "呼吸系统疾病"],
        "《药理学》": ["药物效应动力学", "药物代谢动力学", "传出神经系统药物", "局部麻醉药", "抗高血压药", "抗菌药物", "抗肿瘤药物"]
    },
    "经济管理类": {
        "《西方经济学（微观部分）》": ["需求", "供给", "均衡价格", "弹性", "消费者选择", "生产函数", "成本理论", "完全竞争市场", "垄断市场", "外部性"],
        "《西方经济学（宏观部分）》": ["国民收入核算", "IS-LM模型", "AD-AS模型", "失业", "通货膨胀", "经济增长", "财政政策", "货币政策"],
        "《管理学》": ["管理职能", "组织环境", "决策", "计划", "组织结构", "领导", "激励", "沟通", "控制"],
        "《会计学原理》": ["会计要素", "会计等式", "借贷记账法", "会计凭证", "会计账簿", "财产清查", "财务报表"]
    },
    "法学类": {
        "《法理学》": ["法的概念", "法的渊源", "法律关系", "法律责任", "法律解释", "法治", "权利与义务"],
        "《宪法学》": ["宪法基本原则", "国家性质", "政权组织形式", "公民基本权利", "国家机构", "宪法监督"],
        "《民法学》": ["民事法律关系", "民事主体", "民事法律行为", "代理", "物权", "债权", "合同", "侵权责任"],
        "《刑法学》": ["犯罪构成", "正当防卫", "紧急避险", "故意犯罪形态", "共同犯罪", "刑罚体系", "量刑制度"]
    }
}


@dataclass
class Textbook:
    stage: str
    subject: str
    title: str
    publisher: str
    grade: str
    source_url: str
    pdf_url: str | None


def fetch_json(url: str, timeout: int = 30) -> Any:
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 textbook-knowledge-crawler"})
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_bytes(url: str, timeout: int = 60) -> bytes:
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 textbook-knowledge-crawler"})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


def stable_id(*parts: str) -> str:
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"tk_{digest}"


def infer_stage(text: str) -> str:
    if "小学" in text or re.search(r"[一二三四五六]年级", text):
        return "primary"
    if "初中" in text or re.search(r"[七八九]年级", text):
        return "middle"
    if "高中" in text or "必修" in text or "选择性必修" in text:
        return "high"
    return "university"


def infer_subject(text: str) -> str:
    for subject in SUBJECTS:
      if subject in text:
          return subject
    return "综合"


def clean_topic(value: str) -> str | None:
    value = re.sub(r"\s+", "", value)
    value = re.sub(r"^\d+(?:\.\d+)*[、.\s]*", "", value)
    value = re.sub(r"^[第\d一二三四五六七八九十百]+[章节课单元编篇部分]*", "", value)
    value = re.sub(r"[.。:：、\-_—]+$", "", value)
    value = value.strip()
    if not (2 <= len(value) <= 30):
        return None
    if re.search(r"目录|前言|后记|附录|版权|出版|活动|复习|练习|测试|综合与实践", value):
        return None
    if not re.search(r"[\u4e00-\u9fa5A-Za-z0-9]", value):
        return None
    return value


def topics_from_pdf_outline(pdf_bytes: bytes) -> list[str]:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = Path(tmp.name)
    try:
        reader = PdfReader(str(tmp_path))
        topics: list[str] = []

        def walk(outline: Any) -> None:
            for item in outline:
                if isinstance(item, list):
                    walk(item)
                else:
                    title = getattr(item, "title", "")
                    topic = clean_topic(str(title))
                    if topic:
                        topics.append(topic)

        try:
            walk(reader.outline)
        except Exception:
            pass

        if topics:
            return topics

        text = "\n".join((reader.pages[i].extract_text() or "") for i in range(min(12, len(reader.pages))))
        candidates = []
        for line in text.splitlines():
            line = line.strip()
            if re.match(r"^(第[一二三四五六七八九十百\d]+[章节课单元]|[一二三四五六七八九十百\d]+[、.])", line):
                topic = clean_topic(line)
                if topic:
                    candidates.append(topic)
        return candidates
    finally:
        try:
            tmp_path.unlink()
        except OSError:
            pass


def iter_smartedu_textbooks() -> list[Textbook]:
    textbooks: list[Textbook] = []
    for index_url in SMARTEDU_INDEXES:
        try:
            payload = fetch_json(index_url)
        except Exception:
            continue
        stack = [payload]
        while stack:
            item = stack.pop()
            if isinstance(item, dict):
                title = str(item.get("title") or item.get("name") or item.get("res_name") or "")
                text = json.dumps(item, ensure_ascii=False)
                pdf_url = item.get("pdf") or item.get("downloadUrl") or item.get("fileUrl") or item.get("url")
                if title and (pdf_url or "教材" in text):
                    stage = infer_stage(text + title)
                    textbooks.append(Textbook(
                        stage=stage,
                        subject=infer_subject(text + title),
                        title=title,
                        publisher=str(item.get("publisher") or item.get("edition") or ""),
                        grade=str(item.get("grade") or item.get("bookName") or ""),
                        source_url=index_url,
                        pdf_url=urljoin(index_url, pdf_url) if isinstance(pdf_url, str) else None,
                    ))
                stack.extend(item.values())
            elif isinstance(item, list):
                stack.extend(item)
    unique = {}
    for book in textbooks:
        unique[(book.stage, book.subject, book.title, book.pdf_url or book.source_url)] = book
    return list(unique.values())


def text_from_i18n(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("zh-CN") or next(iter(value.values()), ""))
    return str(value or "")


def pdf_candidates(content_id: str) -> list[str]:
    hosts = ["r1-ndr", "r2-ndr", "r3-ndr"]
    kinds = ["assets_document", "assets"]
    return [
        f"https://{host}.ykt.cbern.com.cn/edu_product/esp/{kind}/{content_id}.pkg/pdf.pdf"
        for host in hosts
        for kind in kinds
    ]


def iter_known_smartedu_textbooks() -> list[Textbook]:
    textbooks: list[Textbook] = []
    for content_id in KNOWN_SMARTEDU_CONTENT_IDS:
        url = f"https://s-file-2.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/{content_id}.json"
        try:
            payload = fetch_json(url)
        except Exception:
            continue
        title = text_from_i18n(payload.get("global_title"))
        labels = " ".join(text_from_i18n(item) for item in (payload.get("global_label") or {}).values()) if isinstance(payload.get("global_label"), dict) else ""
        text = f"{title} {labels} {json.dumps(payload.get('custom_properties', {}), ensure_ascii=False)}"
        textbooks.append(Textbook(
            stage=infer_stage(text),
            subject=infer_subject(text),
            title=title or content_id,
            publisher="国家中小学智慧教育平台",
            grade="",
            source_url=f"https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId={content_id}&catalogType=tchMaterial&subCatalog=tchMaterial",
            pdf_url=pdf_candidates(content_id)[0],
        ))
    return textbooks


def strip_html(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", "\n", html, flags=re.I)
    text = re.sub(r"<[^>]+>", "\n", html)
    return re.sub(r"[ \t\xa0]+", " ", text)


def nodes_from_toc_pages() -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    for url in TEXTBOOK_TOC_PAGES:
        try:
            req = Request(url, headers={"User-Agent": "Mozilla/5.0 textbook-knowledge-crawler"})
            html = urlopen(req, timeout=20).read().decode("utf-8", errors="ignore")
        except Exception:
            continue
        text = strip_html(html)
        title_match = re.search(r"([\u4e00-\u9fa5（）（）0-9A-Za-z·]+电子课本)", text)
        title = title_match.group(1) if title_match else url
        subject = infer_subject(title + text[:500])
        stage = infer_stage(title + text[:500])
        for line in text.splitlines():
            topic = clean_topic(line.strip())
            if not topic:
                continue
            if re.match(r"^(第[一二三四五六七八九十百\d]+[章节课单元]|[一二三四五六七八九十百\d]+[.、])", line.strip()):
                nodes.append({
                    "id": stable_id(stage, subject, title, topic),
                    "subject": subject,
                    "name": topic,
                    "aliases": [],
                    "stage": [stage],
                    "publisher": "学科网杏坛荟/国家中小学智慧教育平台链接页",
                    "textbook": title,
                    "sourceUrl": url,
                })
    return nodes


def nodes_from_book(book: Textbook, download_pdf: bool) -> list[dict[str, Any]]:
    topics: list[str] = []
    if download_pdf and book.pdf_url:
        try:
            topics = topics_from_pdf_outline(fetch_bytes(book.pdf_url))
            time.sleep(0.2)
        except Exception:
            topics = []
    if not topics:
        title_topic = clean_topic(book.title)
        topics = [title_topic] if title_topic else []
    nodes = []
    for topic in dict.fromkeys(topics):
        nodes.append({
            "id": stable_id(book.stage, book.subject, book.title, topic),
            "subject": book.subject,
            "name": topic,
            "aliases": [],
            "stage": [book.stage],
            "grade": book.grade,
            "publisher": book.publisher,
            "textbook": book.title,
            "sourceUrl": book.source_url,
        })
    return nodes


def university_nodes() -> list[dict[str, Any]]:
    nodes = []
    for subject, topics in UNIVERSITY_SEEDS.items():
        for topic in topics:
            nodes.append({
                "id": stable_id("university", subject, topic),
                "subject": subject,
                "name": topic,
                "aliases": [],
                "stage": ["university"],
                "publisher": "university-curriculum-seed",
                "textbook": subject,
                "sourceUrl": "local-university-mainstream-curriculum",
            })
    for subject, textbooks in UNIVERSITY_CORE_COURSES.items():
        for textbook, topics in textbooks.items():
            for topic in topics:
                nodes.append({
                    "id": stable_id("university", subject, textbook, topic),
                    "subject": subject,
                    "name": topic,
                    "aliases": [],
                    "stage": ["university"],
                    "publisher": "mainstream-university-core-textbook",
                    "textbook": textbook,
                    "sourceUrl": "local-university-core-course-catalog",
                })
    return nodes


class CatalogHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.stack: list[str] = []
        self.current_book: str | None = None
        self.current_text: list[str] = []
        self.items: list[tuple[str, str]] = []
        self._in_heading = False
        self._in_li = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.stack.append(tag)
        if tag in {"h2", "h3", "h4"}:
            self._in_heading = True
            self.current_text = []
        elif tag == "li":
            self._in_li = True
            self.current_text = []

    def handle_endtag(self, tag: str) -> None:
        text = re.sub(r"\s+", " ", "".join(self.current_text)).strip()
        if tag in {"h2", "h3", "h4"} and self._in_heading:
            if "目录" in text and "人教版" in text:
                self.current_book = re.sub(r"目录.*$", "", text).strip()
            self._in_heading = False
            self.current_text = []
        elif tag == "li" and self._in_li:
            if self.current_book and text:
                self.items.append((self.current_book, text))
            self._in_li = False
            self.current_text = []
        if self.stack:
            self.stack.pop()

    def handle_data(self, data: str) -> None:
        if self._in_heading or self._in_li:
            self.current_text.append(data)


def nodes_from_renjiaoshe_catalogs() -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    for stage, subjects in RENJIAOSHE_CATALOGS.items():
        for subject, url in subjects.items():
            try:
                raw = fetch_bytes(url, timeout=25)
                text = raw.decode("gb18030", errors="ignore")
            except Exception:
                continue
            parser = CatalogHTMLParser()
            parser.feed(text)
            for book, item in parser.items:
                topic = clean_topic(item)
                if not topic:
                    continue
                nodes.append({
                    "id": stable_id(stage, subject, book, topic),
                    "subject": subject,
                    "name": topic,
                    "aliases": [],
                    "stage": [stage],
                    "grade": "",
                    "publisher": "人教版",
                    "textbook": book,
                    "sourceUrl": url,
                })
    return nodes


def merge_nodes(existing: list[dict[str, Any]], incoming: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def merge_text_values(*values: str | None) -> str:
        parts: set[str] = set()
        for value in values:
            if not value:
                continue
            parts.update(part.strip() for part in str(value).split(";") if part.strip())
        return "; ".join(sorted(parts))

    merged: dict[tuple[str, str, str], dict[str, Any]] = {}
    for node in [*existing, *incoming]:
        key = (node["subject"], node["name"], ",".join(sorted(node["stage"])))
        if key in merged:
            prev = merged[key]
            prev["aliases"] = sorted(set(prev.get("aliases", [])) | set(node.get("aliases", [])))
            prev["publisher"] = merge_text_values(prev.get("publisher"), node.get("publisher"))
            prev["textbook"] = merge_text_values(prev.get("textbook"), node.get("textbook"))
        else:
            merged[key] = node
    return sorted(merged.values(), key=lambda item: (item["stage"][0], item["subject"], item["name"]))


def read_existing() -> list[dict[str, Any]]:
    for path in (PUBLIC_DB, RUNTIME_DB):
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8")).get("items", [])
    return []


def write_database(items: list[dict[str, Any]]) -> None:
    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "sourcePolicy": "Accumulated from textbook directory crawlers and university curriculum sources.",
        "items": items,
    }
    PUBLIC_DB.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_DB.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    RUNTIME_DB.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--include-pdf", action="store_true", help="Download textbook PDFs and extract outlines/TOC.")
    parser.add_argument("--max-books", type=int, default=0, help="Limit K12 books for smoke runs. 0 means all.")
    args = parser.parse_args()

    books = [*iter_smartedu_textbooks(), *iter_known_smartedu_textbooks()]
    if args.max_books:
        books = books[:args.max_books]
    incoming: list[dict[str, Any]] = []
    for book in books:
        incoming.extend(nodes_from_book(book, args.include_pdf))
    incoming.extend(nodes_from_renjiaoshe_catalogs())
    incoming.extend(nodes_from_toc_pages())
    incoming.extend(university_nodes())
    items = merge_nodes(read_existing(), incoming)
    write_database(items)
    print(json.dumps({
        "books": len(books),
        "incoming": len(incoming),
        "total": len(items),
        "public": str(PUBLIC_DB),
        "runtime": str(RUNTIME_DB),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
