# 云端部署指南

把 CHAOS.COLLAGE 部署到自己的 Linux 服务器，开放注册，工程自动保存到云端。服务端只用 Python 标准库，镜像里不装任何第三方包；HTTPS 由 Caddy 自动申请证书。

## 1. 准备

- 一台 Linux 服务器（1 核 1 GB 内存即可起步，磁盘按「用户数 × 配额」估算）。
- 已安装 Docker 和 Docker Compose 插件：`docker compose version` 能输出版本号。没装的话可用官方脚本：`curl -fsSL https://get.docker.com | sh`。
- 一个域名，添加 **A 记录**指向服务器公网 IP（如 `collage.example.com`）。
- 防火墙 / 云厂商安全组放行 **80** 和 **443**（TCP，443 另加 UDP 用于 HTTP/3）。
- 中国大陆的服务器使用域名对外提供网站服务需要先完成 ICP 备案，否则 80 / 443 端口会被拦截。

## 2. 首次部署

```bash
git clone https://github.com/LioraRndr/ChaosCollege.git
cd ChaosCollege
cp .env.example .env
nano .env                    # 至少把 CC_DOMAIN 改成你的域名
docker compose up -d --build
```

查看状态和日志：

```bash
docker compose ps
docker compose logs -f app      # 应用日志（每个请求一行）
docker compose logs -f caddy    # 证书申请情况
```

证书通常在一分钟内签发完成，之后访问 `https://你的域名`，第一个页面就是登录 / 注册。

## 3. 配置项（.env）

| 变量 | 默认 | 说明 |
|---|---|---|
| `CC_DOMAIN` | 无（必填） | 站点域名，Caddy 用它申请 HTTPS 证书 |
| `CC_ALLOW_SIGNUP` | `1` | `1` 开放注册；`0` 关闭注册，只能由管理员创建账号 |
| `CC_INVITE_CODE` | 空 | 设置后，注册时必须填写这个邀请码 |
| `CC_MAX_USERS` | `0` | 账号总数上限，`0` 为不限 |
| `CC_USER_QUOTA_MB` | `500` | 每个账号的云端空间（工程 + 图片 + 缩略图 + 字体） |
| `CC_MAX_UPLOAD_MB` | `40` | 单张图片 / 单个字体的上传上限 |
| `CC_SESSION_DAYS` | `30` | 登录有效期（天），使用期间自动续期 |

修改后执行 `docker compose up -d` 生效。

## 4. 账号管理

管理命令在容器里运行：

```bash
docker compose exec app python3 server/chaos_server.py admin list                      # 账号、用量、状态
docker compose exec app python3 server/chaos_server.py admin create 用户名              # 创建账号（会提示输入密码）
docker compose exec app python3 server/chaos_server.py admin reset-password 用户名      # 重置密码，并让其所有设备下线
docker compose exec app python3 server/chaos_server.py admin disable 用户名             # 停用（enable 恢复）
docker compose exec app python3 server/chaos_server.py admin quota 用户名 2000          # 单独设置配额（MB），default 恢复默认
docker compose exec -it app python3 server/chaos_server.py admin delete 用户名          # 删除账号及其全部数据
```

本站不收集邮箱，用户忘记密码时由管理员用 `reset-password` 重置。

## 5. 备份与恢复

所有数据都在 Docker 卷 `chaos-collage-data` 里（`chaos.db` 是账号和工程索引，`users/` 下是工程 JSON、图片、缩略图和字体）。

```bash
# 备份（建议加到 crontab 每天执行）
docker run --rm -v chaos-collage-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/chaos-backup-$(date +%F).tgz -C /data .

# 恢复（先停服务）
docker compose stop app
docker run --rm -v chaos-collage-data:/data -v "$PWD":/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/chaos-backup-日期.tgz -C /data"
docker compose start app
```

## 6. 升级

```bash
cd ChaosCollege
git pull
docker compose up -d --build
```

数据在独立的卷里，升级、重建容器都不会丢。

## 7. 还没有域名：HTTP 试用

```bash
docker compose -f deploy/docker-compose.http.yml up -d --build
```

然后访问 `http://服务器IP:8080`（需放行 8080 端口）。**HTTP 下密码和登录凭据是明文传输的**，只适合短期自己试用；有了域名后停掉它（`docker compose -f deploy/docker-compose.http.yml down`），改用上面的 HTTPS 部署，数据卷是同一个，工程会保留。

## 8. 不用 Docker

服务端只依赖 Python 3.9+ 标准库：

```bash
CC_DATA=/var/lib/chaos-collage python3 server/chaos_server.py --host 127.0.0.1 --port 8080
```

再用 Nginx / Caddy 反向代理到 `127.0.0.1:8080` 并配置 HTTPS，同时设置环境变量 `CC_TRUST_PROXY=1`，让服务端读取代理传来的真实 IP 和 HTTPS 状态。只在服务端**只能被反向代理访问**时开启这个选项。

一个 systemd 服务示例（`/etc/systemd/system/chaos-collage.service`）：

```ini
[Unit]
Description=CHAOS.COLLAGE
After=network.target

[Service]
User=chaos
WorkingDirectory=/opt/ChaosCollege
Environment=CC_DATA=/var/lib/chaos-collage
Environment=CC_TRUST_PROXY=1
ExecStart=/usr/bin/python3 server/chaos_server.py --host 127.0.0.1 --port 8080
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## 安全设计

- 密码使用 scrypt 加盐哈希；登录凭据是 HttpOnly、SameSite=Lax 的 Cookie，HTTPS 下带 Secure。
- 所有写操作要求自定义请求头并校验来源，防止跨站请求伪造。
- 登录、注册、改密码按 IP 和账号限流；用户名不存在时也执行一次哈希计算，避免通过响应时间探测账号。
- 只对外提供编辑器自身的静态文件；`docs/`、`server/`、`.git` 等目录一律 404。
- 页面带严格的内容安全策略（只允许本站脚本）、`X-Frame-Options: DENY`、`nosniff`；用户上传的文件不会以网页或 SVG 的形式返回。
- 每个账号有空间配额，单个上传有大小上限；注册可关闭、可要求邀请码、可限制总数。

## 常见问题

- **打开域名没反应 / 证书申请失败**：检查 DNS 是否已指向服务器、80 / 443 是否放行（`docker compose logs caddy` 会写原因）。
- **提示「云端空间已满」**：删除不用的工程，或用 `admin quota` 提高该账号配额。
- **想迁移本机版的工程**：在本机版里用「文件 → 另存为工程文件」导出 `.chaos`，登录云端版后用「打开工程文件」导入。
