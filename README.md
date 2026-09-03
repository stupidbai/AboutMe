# 白云飞个人知识与合作门户

这是一个基于 VitePress、Vue 3、Node.js 和 SQLite 的数据驱动个人网站，面向企业客户、方案商、AI 产品团队及产业生态伙伴。网站将职业履历、合作方向、项目案例、主题方法、原创知识库、交流论坛、个人侧面和联系方式拆分为独立入口，并提供站内搜索、访客浏览、用户注册、文章评论、社区互动和管理后台。

## 本地启动

需要 Node.js 22.16 或更高版本。在项目目录执行：

```powershell
npm start
```

然后访问 <http://127.0.0.1:8000/>。

检查内容数据、关键事实、本地素材引用并执行生产构建：

```powershell
npm run check
```

生成生产站点：

```powershell
npm run build
```

## 网站结构

- `site/index.md`：个人门户首页与目录。
- `site/profile.md`：职业时间线、能力底座与专业背书。
- `site/cooperation.md`：合作匹配、四类方向与推进方式。
- `site/cases.md`：九个产品交付、人才、渠道与生态案例。
- `site/admin/cases.md`：受账号保护的案例配置管理页，不出现在公开导航和搜索中。
- `site/admin/site.md`：受账号保护的站点内容管理页，可配置身份、首页、联系、目录、履历和合作内容。
- `site/admin/knowledge.md`：知识条目、RAG 和 AI 接口配置管理页。
- `site/admin/users.md`：注册用户、角色、状态以及社区内容审核管理页。
- `site/account.md`：社区账号注册、登录、资料与密码管理。
- `site/forum.md`：可发帖、回复、搜索和点赞的站内交流论坛。
- `site/insights.md`：企业 AI、可信数字化、FDE 与生态建设主题地图。
- `site/knowledge.md`：知识库与 AI 问答入口，包含 12 条当前原创方法卡。
- `site/knowledge/archive.md`：独立的 17 条历史知识归档入口，避免总览页过长。
- `site/kb/`：从 Arch3rPro 原知识库迁入的 14 篇本人原创全文及 3 个第三方引用页。
- `site/life.md`：户外影像、兴趣与内容账号。
- `site/contact.md`：电话、邮箱、微信二维码与沟通建议。
- `site/data/`：首页、案例、时间线、知识库和生活内容的数据源。
- `docs/knowledge-migration-manifest.json`：源仓库提交、迁移边界、路径映射和 SHA-256 清单。
- `scripts/import-arch3rpro-knowledge.mjs`：从指定源仓库快照重新生成历史知识归档。
- `scripts/serve-with-admin.mjs`：提供静态站点、用户认证、评论、论坛以及受保护的管理 API。
- `scripts/database.mjs`：SQLite 架构、事务、索引、版本控制、用户/社区数据、问答统计和轮换备份。
- `scripts/community-service.mjs`：注册字段校验、scrypt 密码哈希、Markdown 解析和 HTML 安全清洗。
- `scripts/rag-service.mjs`：基于 MiniSearch 的中文分段全文检索和 OpenAI 兼容问答编排。
- `THIRD_PARTY_NOTICES.md`：集成开源组件的项目、版本、用途与许可说明。
- `config/cases.json`、`config/site-config.json`、`config/knowledge.json`：首次启动和静态构建使用的案例、站点与知识种子数据。
- `data/portal.sqlite`：运行时案例、站点、知识与加密 AI 配置数据库，由服务自动创建且不提交到 Git。
- `Dockerfile`、`compose.yaml`：跨平台容器构建、健康检查和持久化卷配置。
- `install/`、`bin/`：Windows/Linux 安装与启动脚本。
- `docs/DEPLOYMENT.md`：安装包、Docker、数据与升级操作手册。
- `site/.vitepress/theme/`：Vue 组件与响应式主题。
- `site/public/`：部署使用的本地图片、二维码和品牌素材。
- `.github/workflows/deploy.yml`：GitHub Pages 自动构建与发布。
- `index.html`、`pages/`、`assets/`：v2.3.2 静态站原始文件，继续保留用于历史追溯。
- `versions/`：不可覆盖的早期版本快照和校验清单。

更新文字与卡片时优先修改 `site/data/` 和对应 Markdown 页面；更新公共视觉时修改 `site/.vitepress/theme/styles.css`。旧版静态站和既有 PDF / HTML 档案不会随新版构建自动改变。

## 版本管理

- 主分支：`main`
- 版本号：遵循语义化版本 `v主版本.次版本.修订号`
- 更新记录：维护在 `CHANGELOG.md`
- 每个可正式交付的版本创建一个带说明的 Git 标签

### 已保留版本

| 版本 | 定位 | 直接打开的快照 | Git 标签 |
| --- | --- | --- | --- |
| 上一版 | AI 技术总监 / AI 应用架构师求职简历 | `versions/index-v1.1.0-求职简历.html` | `v1.1.0` |
| 商业合作初版 | 企业 AI 商业合作伙伴介绍 | `versions/index-v2.0.0-商业合作版.html` | `v2.0.0` |
| 精简版 | 企业 AI 商业合作伙伴介绍（精简背书标签） | `versions/index-v2.0.1-商业合作版.html` | `v2.0.1` |
| 单页归档版 | 上海莲证科技 CIO 商业合作介绍 | `versions/index-v2.1.0-CIO商业合作版.html` | `v2.1.0` |
| 多页面静态版 | 九案例图文商业合作主页 | `index.html` + `pages/` | `v2.3.2` |
| 当前工作版 | 安全账号 + 可运营社区 + SQLite RAG 的个人知识门户 | `site/` | 本地版本 `v4.1.0` |

`v1.0.0` 与 `v1.1.0` 的 `index.html` 内容相同，因此只保留一份物理快照；两个 Git 标签仍完整存在。

常用流程：

```powershell
git status
git add site scripts config install bin docs Dockerfile compose.yaml .dockerignore .env.example .gitignore .github package.json package-lock.json CHANGELOG.md README.md
git commit -m "重构个人知识与合作门户"
git tag -a v4.1.0 -m "发布 v4.1.0"
```

## 案例配置管理

案例页对公众只读，不提供任何修改入口。管理员可在独立管理页新增、删除、排序和编辑案例，并配置完整的 `http://` 或 `https://` NAS 地址。

首次使用时，将 `.env.example` 复制为 `.env.local`，设置至少 8 位的管理员密码（面向局域网或公网时建议使用更长的随机密码），然后运行：

```powershell
npm run admin
```

- 公开案例页：<http://127.0.0.1:4173/cases>
- 独立管理页：<http://127.0.0.1:4173/admin/cases>
- 站点内容管理页：<http://127.0.0.1:4173/admin/site>
- 知识库与 AI 管理页：<http://127.0.0.1:4173/admin/knowledge>
- 用户与社区管理页：<http://127.0.0.1:4173/admin/users>
- 管理端使用服务端会话认证，登录 Cookie 设置为 `HttpOnly` 与 `SameSite=Strict`，并限制连续登录失败次数。
- 首次启动自动把案例与站点默认配置迁移到 SQLite；用户、数据库会话、评论、论坛及后续配置全部写入 `data/portal.sqlite`。
- 案例、标签、合作伙伴采用关联表存储；启用 WAL、外键、唯一约束、事务和查询索引。
- 每次保存前生成一致性数据库备份，并用 ETag 防止多个管理页面互相覆盖。
- 默认仅监听本机 `127.0.0.1`。如需在 NAS 或局域网部署，可在 `.env.local` 将 `CASE_ADMIN_HOST` 改为 `0.0.0.0`，并建议通过 HTTPS 反向代理开放管理端。
- GitHub Pages 是纯静态部署，只展示构建时的默认配置，不提供注册、评论、论坛或管理 API；完整社区功能需通过 Node/Docker 运行。

## 用户、评论与论坛

- 访客可浏览公开知识、文章评论和论坛内容；注册用户可评论、点赞、发帖和回复。
- 用户密码由 `@noble/hashes` 的 scrypt 实现加盐哈希，服务器不保存密码明文；用户会话只保存令牌摘要。
- 评论、帖子和回复支持受限 Markdown，使用 `marked` 解析并由 `sanitize-html` 严格清洗，不允许图片、脚本或危险 URL 协议。
- 注册、登录和社区写操作均有同源检查与频率限制；停用用户会立即注销其全部会话。
- 管理员可在 `/admin/users` 搜索用户、授予版主、停用/删除账号，以及恢复、隐藏、锁定或删除内容。

## 知识库 RAG 与 AI 问答

知识库页面的问答通过 MiniSearch 7.2.0 对 SQLite 已发布知识和 `dist/kb/` 本地历史文章进行分段全文检索，再根据配置决定是否调用外部模型。检索支持标题/摘要权重、中文单字与双字切分、英文前缀和拼写容错；未启用模型时仍会显示相关资料，不会把浏览器问题直接发送给第三方。

在 <http://127.0.0.1:4173/admin/knowledge> 中配置 OpenAI Chat Completions 兼容接口、模型、API Key 和每日配额，保存后可先执行“测试已保存的接口”。API Key 使用持久化密钥加密保存：设置 `PORTAL_ENCRYPTION_KEY` 时使用该值，否则服务首次启动会在数据目录自动生成 `.portal-encryption-key`。默认阻止 AI 接口连接本机和内网地址；只有接入本地模型时才应显式开启。

管理页支持批量导入 Markdown/TXT 为未发布草稿、导出不含 API Key 的完整配置、查看近 30 天问答命中/耗时/反馈统计。访客可在回答下提交“有帮助/没帮助”反馈。

## 跨平台安装与 Docker

生成 Windows ZIP、Linux tar.gz 和 SHA-256 校验文件：

```powershell
npm run package:release
```

打包脚本只替换当前版本文件，不删除 `release/` 中的旧版本安装包。

使用 Docker Compose：

```powershell
$env:CASE_ADMIN_PASSWORD = '请替换为高强度随机密码'
docker compose build
docker compose up -d
docker compose ps
```

也可在项目根目录创建已被 `.gitignore` 排除的 `.env` 文件写入 `CASE_ADMIN_PASSWORD`；Compose 不再提供默认弱密码。`PORTAL_ENCRYPTION_KEY` 可选，省略时会安全生成并保存在数据卷。

容器数据保存在命名卷 `bai-yunfei-portal-data`。完整安装、升级、备份和局域网部署方法见 `docs/DEPLOYMENT.md`。

重新生成 Arch3rPro 历史知识归档：

```powershell
npm run import:knowledge -- <Arch3rPro仓库路径>
npm run check
```

迁移规则：原仓库中本人原创文章保留全文、日期和本地资源；明确标记为 `isOriginal: false` 的条目只生成本地摘要引用页并保留原作者。知识库内的外部地址以不可跳转文本写入本地清单。

查看已有版本：

```powershell
git log --oneline --decorate
git tag -n
```
