# 白云飞个人知识与合作门户

> 当前版本：**v4.2.2** ｜ 面向企业客户、方案商、AI 产品团队与产业生态伙伴的个人合作、知识与社区门户。

这不是一张连续下滑的简历，而是一套可运营的网站系统：访客可以了解职业经历、合作方向、案例与知识；注册用户可参与评论和论坛；管理员可以在网页端维护内容、案例、知识库、AI 问答、用户与运营数据。

## 1. 项目定位与当前成果

| 维度 | 当前状态 |
| --- | --- |
| 站点形态 | VitePress + Vue 3 前端；Node.js 业务服务；SQLite 持久化数据 |
| 页面组织 | 首页、履历、合作、案例、洞察、知识库、论坛、生活、联系等独立路由，避免把所有内容堆在长页面中 |
| 案例资产 | 10 个案例，覆盖企业 AI 交付、产教与社群、渠道与生态；包含 WaytoAGI 徐州负责人高清活动图与 AAIA AIGC 委员会理事聘书 |
| 内容资产 | 12 条可运营方法卡；17 条本地历史知识归档，其中 14 篇本人原创全文与 3 个第三方资料本地引用页 |
| 运营能力 | 站点内容、案例、知识、AI 接口、用户、社区审核、隐私监控均可在管理端配置 |
| 交付方式 | Windows / Linux 安装包、Docker Compose、Nginx 反向代理；GitHub Pages 仅承载静态预览 |

### v4.x 重要更新

| 版本 | 核心更新 |
| --- | --- |
| v4.2.2 | 新增 AAIA AIGC 委员会理事案例；WaytoAGI 徐州活动图替换为 1440×960 高清原图；案例总数增至 10 个 |
| v4.2.0 | 新增第一方匿名访问监控、PV/UV/会话与来源、转化、性能分析仪表盘及隐私/保留期配置 |
| v4.1.0 | 完善注册安全、邮箱验证/找回、Turnstile、论坛运营漏斗与内容互动闭环 |
| v4.0.0 | 新增注册用户、文章评论、点赞、论坛、后台审核和 SQLite 社区数据层 |
| v3.8–v3.9 | 新增可配置知识库、MiniSearch 本地 RAG、OpenAI 兼容模型接入、加密 API Key 与问答运营统计 |
| v3.6–v3.7 | SQLite 配置持久化、ETag 并发保护、自动备份、跨平台安装包与 Docker 容器化 |

完整演进记录见 [CHANGELOG.md](CHANGELOG.md)。早期静态简历快照保留在 [versions/README.md](versions/README.md)，不会被新版门户覆盖。

## 2. 功能地图

### 对外门户

- **首页与合作导航**：以目录化路径引导访客了解经历、合作场景、案例、知识和联系入口。
- **履历与合作页**：呈现职业时间线、企业 AI / 可信数字化 / FDE / 生态合作方向及合作推进方式。
- **案例页**：按产品与工程交付、社群与人才、渠道与生态分类展示；案例可配置 NAS 或项目资料地址，公众仅可访问、不可修改。
- **知识库**：支持分类、检索、详情页、当前方法卡与本地历史归档；站内资料不依赖跳转到原知识站点。
- **洞察、生活与联系**：补充主题观点、个人内容账号、上海 / 徐州合作覆盖与微信二维码。

### 用户与社区

- 访客可浏览公开内容；注册用户可使用用户名或邮箱登录、维护资料和密码。
- 知识条目支持评论、回复和点赞；论坛支持发帖、回帖、搜索、分页、置顶、精选和本人删除。
- 后台支持用户搜索、角色与版主设置、账号停用/删除，以及评论、帖子、回复的审核、隐藏、恢复和锁定。
- 注册、登录及写操作具备同源校验、频率限制、蜜罐字段、强密码提示与状态检查；密码只保存加盐 scrypt 哈希。

### 知识库 RAG 与 AI 问答

- 通过 MiniSearch 对已发布知识和本地历史文章分段检索，支持中文单字/双字切分、标题权重、英文前缀与拼写容错。
- 未配置模型时，仍可返回相关的本地资料与引用；不会把问题发送给第三方。
- 管理端可配置 OpenAI Chat Completions 兼容接口、模型、配额、温度、召回数量、系统提示词，并可测试已保存的接口。
- API Key、SMTP 密码及 Turnstile 服务端密钥使用 AES-256-GCM 加密后保存；默认阻断模型接口访问回环和内网地址。

### 访问监控与数据分析

- 管理端提供近 7 / 30 / 90 天 PV、UV、会话、互动率、回访、页面表现、来源、设备、行动转化与性能 P95。
- 使用第一方匿名 Cookie 的单向摘要完成访客和 30 分钟会话去重；不保存 IP、账号标识、完整 User-Agent 或完整来源 URL。
- 可配置采集开关、DNT 尊重模式与 30–1825 天数据保留期；管理端、API、爬虫和 DNT 访问默认不计入。

## 3. 技术架构

```text
浏览器
  ├─ VitePress / Vue 3：公开页面、搜索、响应式主题、管理界面
  └─ Node.js 服务（完整运行模式）
       ├─ 管理会话、用户会话、评论、论坛、RAG、遥测 API
       ├─ SQLite：内容配置、案例、知识、用户、社区、统计、审计与备份
       └─ 本地 dist/：构建后的静态页面与图片素材

Docker Compose（可选）
  └─ 非 root、只读根文件系统、健康检查、持久化数据卷
       └─ Nginx（生产环境建议）→ HTTPS / 域名 → 容器 4173 端口
```

| 分层 | 关键实现 |
| --- | --- |
| 前端 | VitePress 1.6、Vue 3、TypeScript、响应式主题与本地搜索 |
| 业务服务 | 原生 Node.js HTTP 服务，提供内容、案例、账号、社区、RAG、监控及管理 API |
| 数据 | Node.js 内置 SQLite；WAL、外键、事务、索引、ETag 版本冲突保护、自动轮换备份 |
| 安全 | HttpOnly Cookie、SameSite、登录限速、同源校验、受限 Markdown + HTML 清洗、敏感配置加密 |
| 运维 | Docker、Docker Compose、健康检查、Windows/Linux 安装脚本、版本化安装包 |

## 4. 目录与职责

```text
site/                         VitePress 页面、主题组件与构建时数据
├─ admin/                     案例、站点、知识、用户、分析管理页面
├─ kb/                        本地历史知识文章与资源
├─ data/                      公开页的构建期回退数据
├─ public/                    图片、二维码、案例素材
└─ .vitepress/theme/          Vue 组件、RAG/社区/监控前端逻辑

scripts/                      数据库、RAG、服务、导入、校验、测试与打包脚本
config/                       案例、站点、知识的初始种子配置
data/                         运行时 SQLite、密钥与备份（不提交 Git）
docs/                         部署手册与知识迁移清单
install/、bin/                Windows / Linux 安装、启动脚本
versions/                     不可覆盖的旧版静态简历快照
```

关键文件：

- [config/cases.json](config/cases.json)：10 个案例的静态种子和 GitHub Pages 回退数据。
- [config/site-config.json](config/site-config.json)：身份、首页、联系、时间线与合作内容种子。
- [config/knowledge.json](config/knowledge.json)：当前知识方法卡种子。
- [scripts/serve-with-admin.mjs](scripts/serve-with-admin.mjs)：完整门户服务和受保护 API。
- [scripts/database.mjs](scripts/database.mjs)：SQLite 架构、迁移、查询、审计与备份。
- [scripts/rag-service.mjs](scripts/rag-service.mjs)：本地检索与模型问答编排。
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)：安装、升级、备份、容器和反向代理说明。

## 5. 本地开发与完整运行

### 环境要求

- Node.js **22.16+**
- npm 11（仓库使用 `package-lock.json` 锁定依赖）
- 完整门户模式需要设置管理员密码，推荐使用高强度随机密码

首次安装依赖：

```powershell
npm ci
```

### 仅预览静态页面

适用于写作、样式和构建期页面检查；不提供登录、评论、论坛、RAG API、持久化管理或访问统计。

```powershell
npm start
```

访问 <http://127.0.0.1:8000/>。

### 运行完整门户

完整模式由 Node.js 服务托管构建产物和 API，默认地址为 <http://127.0.0.1:4173/>。

```powershell
Copy-Item .env.example .env.local
# 编辑 .env.local，至少设置 CASE_ADMIN_PASSWORD 为高强度随机密码
npm run admin
```

常用地址：

| 页面 | 本地地址 |
| --- | --- |
| 首页 | <http://127.0.0.1:4173/> |
| 案例 | <http://127.0.0.1:4173/cases> |
| 知识库 | <http://127.0.0.1:4173/knowledge> |
| 论坛 | <http://127.0.0.1:4173/forum> |
| 账号 | <http://127.0.0.1:4173/account> |
| 案例管理 | <http://127.0.0.1:4173/admin/cases> |
| 站点内容管理 | <http://127.0.0.1:4173/admin/site> |
| 知识与 AI 管理 | <http://127.0.0.1:4173/admin/knowledge> |
| 用户与社区管理 | <http://127.0.0.1:4173/admin/users> |
| 访问分析 | <http://127.0.0.1:4173/admin/analytics> |

`.env.local` 与运行时 `data/` 已被 Git 忽略。不要把真实密码、密钥、数据库或备份提交到仓库。

## 6. 内容与运营配置

| 配置对象 | 管理入口 | 持久化位置 | 说明 |
| --- | --- | --- | --- |
| 案例、标签、NAS 链接 | `/admin/cases` | SQLite | 支持新增、删除、排序、编辑、保存并生效 |
| 首页、履历、合作、联系、目录 | `/admin/site` | SQLite | 保存后公开页无需重新构建即可生效 |
| 方法卡、发布状态、AI 接口 | `/admin/knowledge` | SQLite | 支持 Markdown/TXT 导入草稿、脱敏导出与接口测试 |
| 用户、审核、注册/邮件/验证码设置 | `/admin/users` | SQLite | 支持账号与社区内容的运营管理 |
| 采集与隐私、数据保留期 | `/admin/analytics` | SQLite | 只对 Node/Docker 的完整运行模式有效 |

种子 JSON 用于首次迁移和静态部署回退。完整门户首次启动后，配置写入 `data/portal.sqlite`；管理端保存前会备份，并使用 ETag 防止并发页面互相覆盖。

如需从已授权的 Arch3rPro 源仓库快照重新生成本地历史知识归档：

```powershell
npm run import:knowledge -- <Arch3rPro 仓库路径>
npm run check
```

迁移时，本人原创内容可保留正文与本地资源；明确标为第三方的资料只生成本地引用页并保留来源记录。

## 7. 数据、备份与安全边界

- SQLite、自动生成的加密密钥和轮换备份位于 `data/`；升级时必须保留该目录或 Docker 数据卷。
- `PORTAL_ENCRYPTION_KEY` 一旦用于生产数据，必须长期稳定；丢失后无法解密已有的 AI、SMTP 等敏感配置。
- Docker 默认仅映射 `127.0.0.1:4173`。公网访问应使用 Nginx 等 HTTPS 反向代理，不直接暴露管理端口。
- 兼容弱密码仅用于已确认的本机测试；非本机监听时，服务会拒绝常见弱管理员密码，除非显式开启兼容开关。公网部署不得依赖此兼容模式。
- GitHub Pages 是静态构建发布：可展示公开页面和种子数据，但**没有**管理 API、注册、评论、论坛、RAG、数据库和访问分析。完整功能必须部署 Node/Docker 服务。

详细变量、升级、恢复与安全建议见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 8. Docker 与跨平台安装

### Docker Compose

在项目根目录创建 `.env`（不提交），至少设置管理员密码后运行：

```powershell
docker compose build
docker compose up -d
docker compose ps
```

容器提供健康检查，业务数据保存在命名卷 `bai-yunfei-portal-data`。除非明确要销毁所有业务数据，不要执行 `docker compose down -v`。

### 生成安装包

```powershell
npm run package:release
```

输出到 `release/`：Windows ZIP、Linux tar.gz、可安装目录和 `SHA256SUMS.txt`。已有历史安装包会保留，不会被新打包覆盖。

## 9. 校验与测试

提交前运行完整校验：

```powershell
npm run check
```

该命令依次执行：内容与素材校验、生产构建、社区安全测试、SQLite 测试、RAG 测试和管理 API 测试。

按需运行：

```powershell
npm run build
npm run test:community
npm run test:database
npm run test:rag
npm run test:admin
```

生产发布还应验证：`/api/health` 返回成功、公开案例数量为 10、最新高清图片可访问、管理登录和配置保存可用，以及手机端关键表单可提交。

## 10. 版本与双端发布规范

### 版本管理

- 主分支为 `main`；开发改动在功能分支完成、校验后再合并。
- 使用语义化版本 `v主版本.次版本.修订号`；重要版本在 [CHANGELOG.md](CHANGELOG.md) 写明变更并创建 Git 标签。
- `versions/` 中的早期 HTML 快照只增不改；当前门户的历史以 Git 提交与标签为准。

### 每次更新的发布标准

后续每一次对外更新必须将**同一 Git 提交**同时发布到 GitHub `main` 与生产服务器，不能只更新其中一端：

1. 在功能分支完成修改，执行 `npm run check`，确认工作区无意外文件。
2. 提交并合并到 GitHub `main`，随后重新拉取或查询远端，确认 `main` 已包含目标提交和文件。
3. 使用该提交的源码构建/部署生产容器，保留部署前备份与运行时数据卷。
4. 通过健康检查和公网页面验证服务器已运行相同版本；检查关键页面、图片与配置读写。
5. 仅当 GitHub `main` 与生产服务器都验证通过时，才将本次更新标记为“已发布”。

GitHub Actions 会在 `main` 的站点文件变化后构建 GitHub Pages 静态站；它不替代服务器上的完整 Node/Docker 发布。

## 11. 开源组件与资料边界

项目使用 MiniSearch、@noble/hashes、marked、sanitize-html、Nodemailer 与 zxcvbn-ts 等开源组件，许可证和用途见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

历史知识迁移保留原始资料边界：本人原创内容可本地保留全文；明确属于第三方的资料仅保留本地摘要引用页与来源记录。迁移映射及文件哈希见 [docs/knowledge-migration-manifest.json](docs/knowledge-migration-manifest.json)。
