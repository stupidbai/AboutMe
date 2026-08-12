# 白云飞商业合作介绍

这是一个无需构建工具和第三方运行依赖的静态商业合作介绍站点，面向企业客户、方案商、AI 产品团队及产业生态伙伴。

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

## 文件约定

- `index.html`：当前商业合作介绍页的唯一维护入口。
- `server.mjs`：零第三方依赖的本地静态文件服务器。
- `白云飞_AI_ToB_解决方案负责人_简历.html`：与当前 `index.html` 同步的命名交付副本。
- `白云飞_AI_ToB_解决方案负责人_简历 - 副本.html`：与当前 `index.html` 同步的备用交付副本。
- `versions/`：不可覆盖的已发布 HTML 版本快照和校验清单。
- `*.pdf`：既有 PDF 简历版本，作为历史交付物保留。

更新网页内容时只修改 `index.html`，定稿后再同步到两个命名 HTML 副本。PDF 文件是既有求职简历历史交付物，并不会随 HTML 自动更新。

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
| 当前版 | 企业 AI 商业合作伙伴介绍（精简背书标签） | `versions/index-v2.0.1-商业合作版.html` | `v2.0.1` |

`v1.0.0` 与 `v1.1.0` 的 `index.html` 内容相同，因此只保留一份物理快照；两个 Git 标签仍完整存在。

常用流程：

```powershell
git status
git add index.html CHANGELOG.md
git commit -m "更新简历内容"
git tag -a v2.1.0 -m "发布 v2.1.0"
```

查看已有版本：

```powershell
git log --oneline --decorate
git tag -n
```
