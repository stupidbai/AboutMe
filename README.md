# 白云飞个人知识与合作门户

这是一个基于 VitePress、Vue 3 和 TypeScript 的数据驱动个人网站，面向企业客户、方案商、AI 产品团队及产业生态伙伴。网站将职业履历、合作方向、项目案例、主题方法、原创知识库、个人侧面和联系方式拆分为独立入口，并提供站内搜索、页面目录、明暗主题和 GitHub Pages 自动部署。

## 本地启动

需要 Node.js 18 或更高版本。在项目目录执行：

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
- `site/insights.md`：企业 AI、可信数字化、FDE 与生态建设主题地图。
- `site/knowledge.md`：知识库总入口，包含 12 条当前原创方法卡和 17 条历史知识归档。
- `site/kb/`：从 Arch3rPro 原知识库迁入的 14 篇本人原创全文及 3 个第三方引用页。
- `site/life.md`：户外影像、兴趣与内容账号。
- `site/contact.md`：电话、邮箱、微信二维码与沟通建议。
- `site/data/`：首页、案例、时间线、知识库和生活内容的数据源。
- `docs/knowledge-migration-manifest.json`：源仓库提交、迁移边界、路径映射和 SHA-256 清单。
- `scripts/import-arch3rpro-knowledge.mjs`：从指定源仓库快照重新生成历史知识归档。
- `scripts/serve-with-admin.mjs`：提供静态站点、案例公开读取 API 与受保护的管理 API。
- `config/cases.json`：案例内容、图片与 NAS 链接的服务端持久化配置。
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
| 当前工作版 | VitePress 个人知识、合作与案例管理门户 | `site/` | 待发布 `v3.5.0` |

`v1.0.0` 与 `v1.1.0` 的 `index.html` 内容相同，因此只保留一份物理快照；两个 Git 标签仍完整存在。

常用流程：

```powershell
git status
git add site scripts config .env.example .gitignore .github package.json package-lock.json CHANGELOG.md README.md
git commit -m "重构个人知识与合作门户"
git tag -a v3.5.0 -m "发布 v3.5.0"
```

## 案例配置管理

案例页对公众只读，不提供任何修改入口。管理员可在独立管理页新增、删除、排序和编辑案例，并配置完整的 `http://` 或 `https://` NAS 地址。

首次使用时，将 `.env.example` 复制为 `.env.local`，设置至少 12 位的管理员密码，然后运行：

```powershell
npm run admin
```

- 公开案例页：<http://127.0.0.1:4173/cases>
- 独立管理页：<http://127.0.0.1:4173/admin/cases>
- 管理端使用服务端会话认证，登录 Cookie 设置为 `HttpOnly` 与 `SameSite=Strict`，并限制连续登录失败次数。
- 保存后写入 `config/cases.json`，同时生成忽略提交的 `config/cases.json.bak` 作为最近一次备份。
- 默认仅监听本机 `127.0.0.1`。如需在 NAS 或局域网部署，可在 `.env.local` 将 `CASE_ADMIN_HOST` 改为 `0.0.0.0`，并建议通过 HTTPS 反向代理开放管理端。
- GitHub Pages 是纯静态部署，只会展示构建时的案例快照，不提供在线管理 API。

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
