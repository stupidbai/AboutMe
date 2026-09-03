# 安装与部署

本系统使用 Node.js 内置 SQLite。运行时不需要额外数据库服务，Windows、Linux 与 Docker 使用相同的数据结构和管理 API。v4.2.1 包含第一方匿名访问监控与数据分析：按日计算 PV、UV、会话、互动、来源、设备、转化和浏览器性能，并提供可配置的隐私和数据保留控制。

## 系统要求

- Node.js 22.16 或更高版本。
- 默认端口 4173。
- 首次启动会将 config/cases.json 中的 9 个案例无损迁移到 data/portal.sqlite。
- 案例管理：http://127.0.0.1:4173/admin/cases
- 站点管理：http://127.0.0.1:4173/admin/site
- 知识与 AI 管理：http://127.0.0.1:4173/admin/knowledge
- 用户与社区管理：http://127.0.0.1:4173/admin/users
- 访问监控与数据分析：http://127.0.0.1:4173/admin/analytics
- 交流论坛：http://127.0.0.1:4173/forum

## Windows 安装包

1. 解压 bai-yunfei-portal-v4.2.1.zip。
2. 在 PowerShell 中运行：

~~~powershell
powershell -ExecutionPolicy Bypass -File .\install\windows\install.ps1
~~~

3. 启动：

~~~powershell
& "$env:LOCALAPPDATA\BaiYunfeiPortal\bin\start-windows.cmd"
~~~

自定义安装目录或端口：

~~~powershell
.\install\windows\install.ps1 -InstallDir 'D:\BaiYunfeiPortal' -Port 4173 -AdminPassword 'admin123'
~~~

升级安装默认保留 .env.local 与 data/，只有传入 -ForceConfig 才会重写管理配置。

## Linux 安装包

~~~bash
tar -xzf bai-yunfei-portal-v4.2.1.tar.gz
cd bai-yunfei-portal-v4.2.1
chmod +x install/linux/install.sh
./install/linux/install.sh
~/.local/share/bai-yunfei-portal/bin/start-linux.sh
~~~

自定义参数：

~~~bash
INSTALL_DIR=/opt/bai-yunfei-portal \
CASE_ADMIN_PASSWORD=admin123 \
CASE_ADMIN_PORT=4173 \
./install/linux/install.sh
~~~

## Docker Compose

项目根目录已提供 Dockerfile 和 compose.yaml：

~~~bash
export CASE_ADMIN_PASSWORD='replace-with-a-strong-random-password'
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f portal
~~~

停止或重启：

~~~bash
docker compose restart portal
docker compose down
~~~

数据库和自动生成的加密密钥保存在命名卷 bai-yunfei-portal-data 中，重新构建镜像或删除容器不会丢失案例、知识、用户、评论、论坛、站点配置与访问分析事件。除非明确要删除所有业务数据，不要执行 docker compose down -v。Compose 要求显式设置 `CASE_ADMIN_PASSWORD`，不再使用默认弱密码。

默认端口只绑定本机。需要供局域网访问时，将 compose.yaml 的端口绑定由 127.0.0.1 改为 0.0.0.0，并在防火墙中仅放行可信网段。面向公网时应放在 HTTPS 反向代理之后，并把 CASE_ADMIN_PASSWORD 改为强随机密码。

## 数据库与备份

- 主数据库：data/portal.sqlite
- 写前日志：data/portal.sqlite-wal
- 自动备份：data/backups/
- 默认保留最近 10 份备份，可通过 CASE_BACKUP_LIMIT 调整。
- 数据库启用 WAL、外键、事务、唯一约束与查询索引。
- 每次管理端保存前先创建 SQLite 一致性备份，再在单一事务中更新案例或站点配置。
- 管理 API 使用 ETag/If-Match 防止两个管理页面互相覆盖。
- AI API Key、SMTP 密码和 Turnstile 服务端密钥使用 AES-256-GCM 加密后写入 SQLite。配置 `PORTAL_ENCRYPTION_KEY` 时使用该值；省略时会在数据目录生成权限受限的 `.portal-encryption-key`，部署后不要删除或修改。
- RAG 索引由 MiniSearch 在进程内构建并缓存，包含已发布的动态知识条目和安装包内的历史知识 HTML，不依赖外部向量数据库。
- SQLite v7 保存注册用户、哈希后的社区会话、单次邮箱令牌、文章评论、点赞、论坛板块/帖子/回复、产品事件、审核日志及匿名访问事件；密码只保存 scrypt 哈希，不保存明文。
- 问答日志只保存问答编号、脱敏访问来源、问题、响应模式、命中数量、耗时与反馈，不保存访问者姓名或联系方式。
- 评论和论坛 Markdown 先解析再按严格白名单清洗；社区写操作要求同源请求、有效的签名 CSRF 令牌，并执行账号与来源频率限制。
- 访问事件只保存第一方 Cookie 的访客/会话单向摘要、公开页面路径、来源域名（不含完整 URL）及渠道分类、设备分类、行动类型与浏览器性能数值；不保存 IP、账号标识、原始 User-Agent 或完整来源 URL。

健康检查：

~~~text
GET /api/health
~~~

该接口会返回数据库连接、架构版本、案例数量、修订号和运行平台，不返回密码或文件路径。

## 访问监控与数据分析

在 `/admin/analytics` 使用站点管理员账号登录后，可查看近 7、30 或 90 天的数据。统计口径如下：

| 指标 | 口径 |
| --- | --- |
| 页面浏览（PV） | 每次公开页面的 `page_view` 事件。 |
| 独立访客（UV） | 在统计日内去重后的第一方匿名访客摘要。 |
| 访问会话 | 由 30 分钟有效期的第一方匿名会话 Cookie 去重。 |
| 互动率 | 至少停留 15 秒的会话数 ÷ 访问会话数。 |
| 联系意向 | 访客点击标记为联系意向的站内行动次数；仪表盘同时显示相对 UV 的转化率。 |
| 性能 | 浏览器 Navigation Timing/Paint 数据的平均加载、TTFB、FCP 与 P95 加载时间。 |

默认启用监控、默认尊重浏览器的 DNT 偏好、默认保留 365 天。管理员可在同一页面暂停或恢复采集，并将事件保留期调整为 30–1825 天；新设置生效后，服务在后续访问事件写入时自动清理过期数据。

监控只针对 Node/Docker 服务提供的动态站点生效。GitHub Pages 是纯静态站点，不能写入分析 API；管理端与 `/api/` 地址、已识别爬虫以及 DNT 访问不会产生事件。有关 Cookie 和处理边界请参阅站内[隐私说明](/privacy)。

## 生成安装包

在源码目录执行：

~~~powershell
npm run package:release
~~~

生成内容位于 release/，包括 Windows ZIP、Linux/macOS 可读取的 tar.gz、可直接安装的目录和 SHA256SUMS.txt。

## 配置项

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| CASE_ADMIN_USERNAME | admin | 管理账号 |
| CASE_ADMIN_PASSWORD | 无 | 管理密码，至少 8 位 |
| CASE_ADMIN_HOST | 127.0.0.1 | 监听地址 |
| CASE_ADMIN_PORT | 4173 | 监听端口 |
| CASE_DATA_DIR | data | SQLite 与备份目录 |
| CASE_BACKUP_LIMIT | 10 | 自动备份保留数量 |
| CASE_SESSION_HOURS | 8 | 管理会话有效小时数 |
| COMMUNITY_SESSION_DAYS | 30 | 注册用户会话有效天数，范围 1-90 |
| PORTAL_ENCRYPTION_KEY | 自动生成到数据目录 | AI API Key 加密密钥；安装脚本会自动生成，生产环境必须长期保持稳定 |

邮箱验证、密码找回、注册开关、公开站点地址、SMTP 与 Turnstile 均在“用户与社区管理”页面配置。默认关闭邮箱验证与 Turnstile；启用前应先保存 SMTP 后执行连接测试，并确保公开站点地址可从邮件收件端访问。

AI 接口默认禁止访问回环地址和内网地址，以降低服务端请求伪造风险。只有明确连接本地模型服务时，才在知识管理页开启“允许 AI 接口连接本机或内网地址”。
