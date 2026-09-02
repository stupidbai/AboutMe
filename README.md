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
- `site/insights.md`：企业 AI、可信数字化、FDE 与生态建设主题地图。
- `site/knowledge.md`：原创知识库入口，支持关键词搜索与分类筛选。
- `site/life.md`：户外影像、兴趣与内容账号。
- `site/contact.md`：电话、邮箱、微信二维码与沟通建议。
- `site/data/`：首页、案例、时间线、知识库和生活内容的数据源。
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
| 当前工作版 | VitePress 个人知识、合作与原创知识库门户 | `site/` | 待发布 `v3.1.0` |

`v1.0.0` 与 `v1.1.0` 的 `index.html` 内容相同，因此只保留一份物理快照；两个 Git 标签仍完整存在。

常用流程：

```powershell
git status
git add site scripts .github package.json package-lock.json CHANGELOG.md README.md
git commit -m "重构个人知识与合作门户"
git tag -a v3.0.0 -m "发布 v3.0.0"
```

查看已有版本：

```powershell
git log --oneline --decorate
git tag -n
```
