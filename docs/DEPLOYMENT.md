# 安装与部署

本系统使用 Node.js 内置 SQLite。运行时不需要额外数据库服务，Windows、Linux 与 Docker 使用相同的数据结构和管理 API。v3.8.0 支持知识库配置、本地 RAG 检索与 OpenAI 兼容 AI 问答。

## 系统要求

- Node.js 22.16 或更高版本。
- 默认端口 4173。
- 首次启动会将 config/cases.json 中的 9 个案例无损迁移到 data/portal.sqlite。
- 案例管理：http://127.0.0.1:4173/admin/cases
- 站点管理：http://127.0.0.1:4173/admin/site
- 知识与 AI 管理：http://127.0.0.1:4173/admin/knowledge

## Windows 安装包

1. 解压 bai-yunfei-portal-v3.8.0.zip。
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
tar -xzf bai-yunfei-portal-v3.8.0.tar.gz
cd bai-yunfei-portal-v3.8.0
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

数据库保存在命名卷 bai-yunfei-portal-data 中，重新构建镜像或删除容器不会丢失案例和站点配置。除非明确要删除所有业务数据，不要执行 docker compose down -v。

默认端口只绑定本机。需要供局域网访问时，将 compose.yaml 的端口绑定由 127.0.0.1 改为 0.0.0.0，并在防火墙中仅放行可信网段。面向公网时应放在 HTTPS 反向代理之后，并把 CASE_ADMIN_PASSWORD 改为强随机密码。

## 数据库与备份

- 主数据库：data/portal.sqlite
- 写前日志：data/portal.sqlite-wal
- 自动备份：data/backups/
- 默认保留最近 10 份备份，可通过 CASE_BACKUP_LIMIT 调整。
- 数据库启用 WAL、外键、事务、唯一约束与查询索引。
- 每次管理端保存前先创建 SQLite 一致性备份，再在单一事务中更新案例或站点配置。
- 管理 API 使用 ETag/If-Match 防止两个管理页面互相覆盖。
- AI API Key 使用 `PORTAL_ENCRYPTION_KEY` 经 AES-256-GCM 加密后写入 SQLite。部署后不要随意修改该密钥。
- RAG 索引包含已发布的动态知识条目和安装包内的历史知识 HTML，不依赖外部向量数据库。

健康检查：

~~~text
GET /api/health
~~~

该接口会返回数据库连接、架构版本、案例数量、修订号和运行平台，不返回密码或文件路径。

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
| PORTAL_ENCRYPTION_KEY | 回退为管理密码 | AI API Key 加密密钥；安装脚本会自动生成，生产环境必须长期保持稳定 |
