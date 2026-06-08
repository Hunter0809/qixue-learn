# -*- coding: utf-8 -*-
"""Educational Video Crawler for Bilibili - 高质量学科视频爬虫"""
import json
import os
import sys
import time
import re
import urllib.request
import urllib.parse
import random
import http.cookiejar

sys.stdout.reconfigure(encoding="utf-8")

# ============================================================
# 学科关键词配置 — 中小学 + 大学专业分类
# ============================================================
SUBJECT_KEYWORDS = {
    # ---- 中小学 ----
    "数学": [
        "高中数学 函数导数 高考", "高中数学 圆锥曲线 解析几何",
        "初中数学 二次函数 中考", "初中数学 几何证明 全等三角形",
        "小学数学 应用题 解题技巧", "高等数学 微积分 大学",
        "数学竞赛 奥数 思维训练", "高考数学 压轴题 精讲"
    ],
    "语文": [
        "高中语文 古诗词鉴赏 高考", "高中语文 文言文翻译 实词虚词",
        "初中语文 阅读理解 答题技巧", "初中语文 作文写作 高分素材",
        "小学语文 看图写话 基础", "高考语文 作文 议论文"
    ],
    "英语": [
        "高中英语 语法填空 高考", "高中英语 阅读理解 完形填空",
        "初中英语 语法精讲 时态", "初中英语 单词速记 词汇",
        "小学英语 自然拼读 发音", "大学英语 四级 六级 备考",
        "高考英语 作文模板 高分"
    ],
    "物理": [
        "高中物理 力学 受力分析 高考", "高中物理 电磁学 电场磁场",
        "初中物理 电学 电路分析 中考", "初中物理 力学 浮力压强",
        "大学物理 力学 电磁学", "高考物理 实验题 真题精讲"
    ],
    "化学": [
        "高中化学 有机化学 官能团 高考", "高中化学 氧化还原 离子反应",
        "初中化学 酸碱盐 中考", "初中化学 化学方程式 计算",
        "高考化学 工艺流程 实验", "大学化学 无机化学 有机化学"
    ],
    "生物": [
        "高中生物 遗传 孟德尔定律 高考", "高中生物 细胞分裂 光合呼吸",
        "初中生物 人体生理 中考", "高考生物 基因工程 大题",
        "大学生物 分子生物学 细胞生物学"
    ],
    "历史": [
        "高中历史 中国古代史 高考", "高中历史 世界近代史 工业革命",
        "初中历史 朝代顺序 中考", "高考历史 大题模板 答题技巧"
    ],
    "地理": [
        "高中地理 自然地理 大气环流 高考", "高中地理 人文地理 区位因素",
        "初中地理 中国地理 世界地理 中考", "高考地理 综合题 答题模板"
    ],
    "政治": [
        "高中政治 哲学 唯物辩证法 高考", "高中政治 经济生活 市场经济",
        "高中政治 政治生活 法治", "高考政治 大题模板 时政热点"
    ],
    # ---- 大学专业分类 ----
    "计算机类": [
        "计算机科学 数据结构 算法 考研", "计算机 编程入门 C语言 Python",
        "计算机组成原理 操作系统 考研", "计算机网络 TCP/IP 协议分析",
        "数据结构 链表 栈 队列 二叉树", "算法 排序 动态规划 贪心算法",
        "数据库 SQL MySQL 关系数据库", "软件工程 设计模式 面向对象"
    ],
    "电子信息类": [
        "电路分析 模拟电路 数字电路", "信号与系统 傅里叶变换 考研",
        "通信原理 调制解调 信道编码", "嵌入式系统 单片机 STM32",
        "数字信号处理 DSP 滤波器", "自动控制原理 PID 控制系统"
    ],
    "机械类": [
        "机械设计 机械原理 齿轮机构", "工程力学 理论力学 材料力学",
        "机械制图 CAD 三维建模", "材料科学基础 金属材料 热处理",
        "机械制造工艺 公差配合", "液压与气压传动 流体力学"
    ],
    "土木建筑类": [
        "土木工程 结构力学 混凝土结构", "建筑学 建筑设计 建筑历史",
        "工程测量 施工技术 项目管理", "钢结构 抗震设计 高层建筑",
        "岩土工程 地基基础 土力学", "材料力学 结构力学 考研"
    ],
    "医学类": [
        "系统解剖学 人体解剖 医学考研", "生理学 病理学 药理学",
        "内科学 外科学 临床医学", "生物化学 医学免疫学 微生物",
        "诊断学 医学影像 病理生理学", "中医基础理论 中药学 方剂学"
    ],
    "经济管理类": [
        "微观经济学 宏观经济学 考研", "管理学原理 组织行为学 人力资源管理",
        "会计学基础 财务管理 中级会计", "统计学 计量经济学 数据分析",
        "市场营销 消费者行为 品牌管理", "金融学 证券投资 公司理财"
    ],
    "法学类": [
        "法理学 宪法学 民法 刑法", "刑事诉讼法 民事诉讼法 行政法",
        "合同法 知识产权法 经济法", "法律职业资格考试 法考 精讲",
        "国际法 国际私法 国际经济法", "商法 公司法 票据法"
    ],
    "外语类": [
        "英语翻译 笔译 口译 CATTI", "日语 五十音 日语语法 N2 N1",
        "法语 基础法语 法语语法 DELF", "德语 基础德语 德语语法 TestDaF",
        "俄语 基础俄语 俄语语法", "韩语 韩语入门 TOPIK 韩语语法"
    ],
    "化学与化工类": [
        "物理化学 热力学 动力学", "有机化学 反应机理 合成",
        "分析化学 仪器分析 色谱", "化工原理 传质 传热 反应工程",
        "高分子化学 高分子物理", "化学工程 化工设计 分离工程"
    ],
    "物理学类": [
        "量子力学 波函数 薛定谔方程", "电动力学 麦克斯韦方程组 电磁波",
        "热力学与统计物理 热力学定律", "原子物理 原子核物理 粒子物理",
        "光学 几何光学 波动光学", "固体物理 晶体结构 能带理论"
    ],
}

# ============================================================
# 排除规则 - 去除娱乐/无关内容
# ============================================================
EXCLUDE_RE = re.compile(
    r'游戏|手游|端游|LOL|王者荣耀|原神|英雄联盟|崩坏|鬼畜|翻唱|MV|'
    r'演唱会|综艺|直播|带货|美食|旅行|探店|测评|化妆|穿搭|明星|网红|偶像|'
    r'电影|电视剧|动漫|搞笑|娱乐|整活|开箱|vlog|日常|沙雕|离谱|震惊|'
    r'吃播|开黑|陪玩|代练|抽卡|氪金|充值|皮肤|装备|副本|BOSS',
    re.IGNORECASE
)

# ============================================================
# 教育相关正则 - 识别教学类视频
# ============================================================
EDUCATION_RE = re.compile(
    r'教学|讲解|知识点|公式|定理|例题|解题|考点|课堂|学习|教程|入门|'
    r'基础|总结|归纳|考试|真题|模拟|练习|复习|预习|名师|公开课|'
    r'优质课|课堂实录|说课|精讲|必修|选修|教材|网课|直播课|'
    r'微课|慕课|MOOC|考研|专升本|高考|中考|期末|备考|'
    r'冲刺|一轮|二轮|总复习|专题|题型|方法|技巧|秒杀|速解',
    re.IGNORECASE
)

# ============================================================
# 学科相关词族 — 用于交叉验证
# ============================================================
SUBJECT_FAMILIES = {
    "数学": ["数学", "函数", "方程", "几何", "概率", "统计", "代数", "微积分", "导数", "极限", "数列", "不等式", "三角", "向量", "矩阵"],
    "语文": ["语文", "阅读", "作文", "古诗", "文言文", "诗词", "写作", "文学", "散文", "小说"],
    "英语": ["英语", "english", "语法", "单词", "听力", "口语", "四级", "六级", "雅思", "托福", "考研英语"],
    "物理": ["物理", "力学", "电磁", "光学", "热学", "牛顿", "电路", "磁场", "电场", "能量"],
    "化学": ["化学", "有机", "无机", "方程式", "元素", "酸碱", "氧化", "还原", "分子", "原子"],
    "生物": ["生物", "细胞", "遗传", "基因", "蛋白质", "光合", "呼吸", "DNA", "RNA", "酶"],
    "历史": ["历史", "朝代", "近代史", "古代史", "革命", "战争", "文明", "工业革命"],
    "地理": ["地理", "地形", "气候", "河流", "山脉", "经纬", "洋流", "季风", "地图"],
    "政治": ["政治", "哲学", "经济", "法治", "道德", "马克思", "唯物", "辩证法"],
    "计算机类": ["计算机", "编程", "算法", "数据结构", "操作系统", "网络", "数据库", "软件", "程序", "代码"],
    "电子信息类": ["电路", "信号", "通信", "电子", "电磁", "模拟", "数字", "嵌入式", "单片机", "控制"],
    "机械类": ["机械", "力学", "材料", "设计", "制造", "制图", "传动", "工程", "液压"],
    "土木建筑类": ["土木", "建筑", "结构", "施工", "混凝土", "钢结构", "测量", "岩土", "地基"],
    "医学类": ["医学", "解剖", "生理", "病理", "药理", "临床", "诊断", "内科", "外科", "中医"],
    "经济管理类": ["经济", "管理", "会计", "金融", "财务", "市场", "营销", "统计", "审计", "税务"],
    "法学类": ["法学", "法律", "宪法", "民法", "刑法", "诉讼", "合同", "知识产权"],
    "外语类": ["外语", "英语", "日语", "法语", "德语", "翻译", "口语", "语法", "词汇"],
    "化学与化工类": ["化学", "化工", "反应", "合成", "分析", "物理化学", "有机化学", "仪器"],
    "物理学类": ["物理", "量子", "力学", "电磁", "热力学", "光学", "原子", "固体", "统计物理"],
}


def create_opener():
    """创建支持Cookie的HTTP opener"""
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def get_cookies(opener):
    """获取B站Cookie"""
    req = urllib.request.Request(
        'https://www.bilibili.com',
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'zh-CN,zh;q=0.9',
        }
    )
    try:
        opener.open(req, timeout=15)
    except Exception:
        pass


def search_bili(opener, keyword, page=1):
    """搜索B站视频，按播放量排序"""
    params = urllib.parse.urlencode({
        'search_type': 'video',
        'keyword': keyword,
        'page': page,
        'pagesize': 30,
        'order': 'click'  # 按播放量排序
    })
    url = f'https://api.bilibili.com/x/web-interface/search/type?{params}'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://search.bilibili.com/',
        'Origin': 'https://search.bilibili.com',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with opener.open(req, timeout=15) as resp:
            raw = resp.read()
            data = json.loads(raw.decode('utf-8'))
            if data.get('code') == 0:
                return data.get('data', {}).get('result', []) or []
    except Exception:
        pass
    return []


def clean_title(text):
    """清理标题中的HTML标签和HTML实体编码"""
    text = re.sub(r'<[^>]*>', '', text)
    # 先处理包含&的其他实体，最后处理&避免双重替换
    text = text.replace('<', '<').replace('>', '>')
    text = text.replace('"', '"').replace('&#39;', "'")
    text = text.replace('&#x27;', "'").replace('&#x2F;', "/")
    text = text.replace('&nbsp;', ' ')
    text = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))), text)
    text = text.replace('&', '&')
    return text.strip()


def is_educational(title, tag, author, description=""):
    """判断是否是教育类内容"""
    text = f'{title} {tag} {author} {description}'
    if EXCLUDE_RE.search(text):
        return False
    # 检查是否包含教育类关键词
    edu_matches = EDUCATION_RE.findall(text)
    if len(edu_matches) >= 2:
        return True
    return bool(EDUCATION_RE.search(text))


def is_subject_relevant(title, tag, description, subject):
    """判断内容是否与学科相关"""
    text = f'{title} {tag} {description}'.lower()
    # 检查学科名是否出现在文本中
    if subject.lower() in text:
        return True
    # 检查学科词族
    family = SUBJECT_FAMILIES.get(subject, [])
    match_count = sum(1 for kw in family if kw.lower() in text)
    return match_count >= 2


def crawl():
    """主爬虫函数"""
    opener = create_opener()
    print("正在获取Cookie...")
    get_cookies(opener)
    time.sleep(1.5)

    all_videos = {}
    seen_bvids = set()
    # 最大播放量门槛 - 根据学科动态调整
    MIN_PLAY = 8000

    for subject, keywords in SUBJECT_KEYWORDS.items():
        print(f'\n=== {subject} ===')
        subject_videos = []

        for keyword in keywords:
            print(f'  搜索: {keyword}', end='', flush=True)
            results = search_bili(opener, keyword)

            if not results:
                print(' -> 无结果')
                continue

            valid_count = 0
            for item in results:
                bv = item.get('bvid', '')
                if not bv or bv in seen_bvids:
                    continue

                title = clean_title(item.get('title', ''))
                tag = item.get('tag', '') or ''
                author = item.get('author', '') or ''
                description = item.get('description', '') or ''
                play = item.get('play', 0) or 0
                duration = item.get('duration', '') or ''

                # 长度和质量门槛
                if len(title) < 6 or play < MIN_PLAY:
                    continue

                # 教育相关性验证
                if not is_educational(title, tag, author, description):
                    continue

                # 学科相关性验证
                if not is_subject_relevant(title, tag, description, subject):
                    continue

                seen_bvids.add(bv)
                valid_count += 1

                subject_videos.append({
                    'id': f'bili_{bv}',
                    'title': title,
                    'subject': subject,
                    'knowledge': tag or title[:60],
                    'url': f'https://www.bilibili.com/video/{bv}',
                    'source': 'bilibili',
                    'publisher': author,
                    'duration': duration,
                    'play': play,
                    'level': ''
                })

            print(f' -> 获取 {valid_count} 个有效视频')
            time.sleep(random.uniform(0.8, 1.5))

            # 每个学科最多收集15个高质量视频
            if len(subject_videos) >= 15:
                break

        # 按播放量排序，取前10个
        subject_videos.sort(key=lambda v: v.get('play', 0), reverse=True)
        for v in subject_videos[:10]:
            all_videos[v['id']] = v

        top_play = subject_videos[0]['play'] if subject_videos else 0
        print(f'  该学科共获取 {min(len(subject_videos), 10)} 个视频 (最高播放: {top_play})')

    result = list(all_videos.values())

    # 自动分级
    for v in result:
        title = v['title']
        if any(k in title for k in ['小学', '一年级', '二年级', '三年级', '四年级', '五年级', '六年级']):
            v['level'] = '小学'
        elif any(k in title for k in ['初中', '初一', '初二', '初三', '中考', '九年级']):
            v['level'] = '初中'
        elif any(k in title for k in ['大学', '高等', '考研', '专升本', '本科', '研究生']):
            v['level'] = '大学'
        else:
            v['level'] = '高中'

    return result


if __name__ == '__main__':
    print("=" * 60)
    print("B站学科教育视频爬虫")
    print("=" * 60)
    videos = crawl()

    out_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'public', 'data')
    os.makedirs(out_dir, exist_ok=True)
    output_path = os.path.join(out_dir, 'educational-videos.json')

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(videos, f, ensure_ascii=False, indent=2)

    print(f'\n保存 {len(videos)} 个视频到 {output_path}')

    # 按学科统计
    subjects = {}
    for v in videos:
        s = v['subject']
        subjects[s] = subjects.get(s, 0) + 1
    print('\n各学科视频数:')
    for s, count in sorted(subjects.items(), key=lambda x: -x[1]):
        print(f'  {s}: {count}个')
