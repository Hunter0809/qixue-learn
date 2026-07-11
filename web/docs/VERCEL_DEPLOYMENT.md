# Vercel 生产部署

## 必填环境变量

在 Vercel 项目的 Production、Preview（按需）环境分别配置：

```text
DATABASE_URL
AGENT_API_BASE_URL=https://api.xiaomimimo.com/v1
AGENT_API_TOKEN
AGENT_VISION_MODEL=mimo-v2.5
DEEPSEEK_API_KEY
AGENT_MODEL
```

`DATABASE_URL` 应使用 Neon/Postgres 的 SSL 连接串。应用会在首次请求时创建用户档案、学习记录、薄弱点、复习计划、资源和行为表；Vercel 环境没有该变量时会拒绝使用临时 SQLite，避免用户数据丢失。

## CLI 配置

在已登录并已链接本项目的目录执行以下命令，命令会交互式要求输入密钥，不要把真实值写入仓库：

```bash
vercel env add DATABASE_URL production
vercel env add AGENT_API_BASE_URL production
vercel env add AGENT_API_TOKEN production
vercel env add AGENT_VISION_MODEL production
vercel env add DEEPSEEK_API_KEY production
vercel env add AGENT_MODEL production
vercel --prod
```

学校目录和学习空间视频是 `public/schools/school-catalog.json`、`public/data/educational-videos.json`，随构建部署，不依赖开发机路径。
