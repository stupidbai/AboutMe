# 白云飞商业合作介绍

这是一个无需构建工具和第三方运行依赖的多页面商业合作介绍站点，面向企业客户、方案商、AI 产品团队及产业生态伙伴。

## 本地启动

需要 Node.js 18 或更高版本。在项目目录执行：

```powershell
npm start
```

然后访问 <http://127.0.0.1:8000/>。

如需使用其他端口：

```powershell
$env:PORT = 4173
npm start
```

## 网站结构

- `index.html`：合作主页，只呈现核心定位、数据和目录大纲。
- `pages/profile.html`：职业时间线、能力底座和专业背书。
- `pages/cooperation.html`：合作匹配、四类方向与推进方式。
- `pages/cases.html`：代表性项目和结果证明。
- `pages/life.html`：户外影像、兴趣和内容账号。
- `pages/resources.html`：PDF、命名版 HTML 和历史版本入口。
- `pages/contact.html`：电话、邮箱、微信二维码与沟通建议。
- `assets/site.css`、`assets/site.js`：全部页面共用的样式和导航逻辑。
- `docs/`：既有 PDF 与 HTML 历史交付物。
- `爱好/`：户外照片与公众号、视频号二维码原始素材。
- `versions/`：不可覆盖的已发布 HTML 版本快照和校验清单。
- `server.mjs`：零第三方依赖的本地静态文件服务器。

更新公共视觉或导航时修改 `assets/` 中的共用文件；更新具体内容时修改对应的 `pages/` 页面。PDF 文件是既有历史交付物，不会随网页自动更新。

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
| 长页归档版 | 上海莲证科技 CIO 商业合作介绍 | `versions/index-v2.1.0-CIO商业合作版.html` | `v2.1.0` |
| 当前工作版 | 多页面商业合作主页 | `index.html` + `pages/` | 待发布 `v2.2.0` |

`v1.0.0` 与 `v1.1.0` 的 `index.html` 内容相同，因此只保留一份物理快照；两个 Git 标签仍完整存在。

常用流程：

```powershell
git status
git add index.html pages assets/site.css assets/site.js CHANGELOG.md README.md package.json
git commit -m "更新简历内容"
git tag -a v2.2.0 -m "发布 v2.2.0"
```

查看已有版本：

```powershell
git log --oneline --decorate
git tag -n
```
