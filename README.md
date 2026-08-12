# 白云飞个人简历

这是一个无需构建工具和第三方运行依赖的静态 HTML 简历项目。

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

- `index.html`：当前网页简历的唯一维护入口。
- `server.mjs`：零第三方依赖的本地静态文件服务器。
- `白云飞_AI_ToB_解决方案负责人_简历.html`：首版命名副本，保留用于追溯。
- `白云飞_AI_ToB_解决方案负责人_简历 - 副本.html`：原始副本，保留用于追溯。
- `*.pdf`：既有 PDF 简历版本，作为历史交付物保留。

更新网页内容时只修改 `index.html`。如需生成新的命名交付版，应在确认内容后另行导出，避免多个文件同时维护造成版本漂移。

## 版本管理

- 主分支：`main`
- 版本号：遵循语义化版本 `v主版本.次版本.修订号`
- 更新记录：维护在 `CHANGELOG.md`
- 每个可正式交付的版本创建一个带说明的 Git 标签

常用流程：

```powershell
git status
git add index.html CHANGELOG.md
git commit -m "更新简历内容"
git tag -a v1.1.0 -m "发布 v1.1.0"
```

查看已有版本：

```powershell
git log --oneline --decorate
git tag -n
```
