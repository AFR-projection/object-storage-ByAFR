# Storage ByAFR

Modern cloud storage web application — fast, secure, and scalable.  
Built with **Next.js 16**, **Drizzle ORM**, **Cloudflare R2**, and **Redis**.

**Quick links:** [Local dev](#-local-development) · [Deploy VPS (5 langkah)](#deploy-ke-vps-panduan-lengkap) · [Troubleshooting](#troubleshooting)

---

## Features

- **File Management** — Upload, download, rename, duplicate, favorite, drag-and-drop folder organization
- **Folder Upload** — Preserve full directory structure via File System Access API with `webkitdirectory` fallback
- **Virtual Scrolling** — Render thousands of files without performance degradation (`@tanstack/react-virtual`)
- **Multi-Select & Batch Actions** — Bulk download, favorite, and delete with parallel `Promise.all`
- **Type Filtering** — Quick filters: All / Images / Videos / Audio / Documents / Archives
- **Sortable Columns** — Sort by Name, Size, Modified date, or Type
- **File Preview** — Inline preview for images, video, audio, PDF, Office documents, SVG, and syntax-highlighted text
- **Rich Text Notes** — Tiptap editor with auto-save
- **Image Editor** — Built-in crop, rotate, and flip tools
- **Share Links** — Create shareable links with expiration, access limits, permissions (view/edit), and full access logging (IP, device, browser, OS, location)
- **Recycle Bin** — Soft-delete with time grouping (Today / Yesterday / This Week / This Month / Older), batch restore and permanent delete
- **Favorites** — Bookmark files for quick access
- **Search** — Full-text search across all files
- **Admin Panel** — User management, impersonation, Shares Center, storage analytics (30d growth + MIME charts), real-time monitoring, activity logs
- **Enterprise security** — TOTP 2FA + recovery codes, forced password reset (`mustChangePassword`), stronger password policy (min 10, 3 character classes), account suspension with reason, session management
- **Platform APIs** — API keys, webhooks, folder collaboration, file versions, bandwidth quotas, client-side encryption hooks
- **Realtime feedback** — SSE live events, connection status, system toasts, page progress
- **Background Jobs** — Thumbnail generation, image compression, media processing, webhook delivery via BullMQ
- **Dark / Light Mode** — Custom theming with localStorage persistence
- **Responsive Design** — Desktop-first with premium UI (Framer Motion, gradients, glow effects)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16.2.10 (App Router) |
| **Language** | TypeScript 5 |
| **Database** | Neon PostgreSQL + Drizzle ORM 0.45 |
| **Storage** | Cloudflare R2 (S3-compatible, presigned URLs) |
| **Cache & Queue** | Redis + BullMQ 5 |
| **Authentication** | Session-based (Argon2id via `@node-rs/argon2`) |
| **UI** | Tailwind CSS v4 + Framer Motion + Radix UI + Lucide Icons |
| **File Upload** | React Dropzone |
| **Image Cropping** | React Easy Crop |
| **Virtual Scroll** | @tanstack/react-virtual |
| **Rich Text** | Tiptap |
| **Drag & Drop** | @dnd-kit |
| **PDF** | react-pdf + pdfjs-dist |
| **Charts** | Recharts |
| **Deployment** | Docker Compose (multi-stage, Nginx reverse proxy) |

---

## Prerequisites

- **Node.js** ≥ 20.x
- **npm** ≥ 10.x
- **PostgreSQL** (Neon — serverless, or local via Docker)
- **Cloudflare R2 bucket** (or any S3-compatible provider)
- **Redis** (optional — can be disabled for development)
- **Docker** (optional, for deployment)

---

## 🚀 Local Development

### 1. Clone & Install

```bash
git clone <repo-url>
cd storage-by-afr
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `R2_ACCOUNT_ID` | ✅ | Cloudflare R2 Account ID |
| `R2_ACCESS_KEY_ID` | ✅ | R2 Access Key |
| `R2_SECRET_ACCESS_KEY` | ✅ | R2 Secret Access Key |
| `R2_BUCKET_NAME` | ✅ | R2 bucket name |
| `R2_PUBLIC_URL` | ✅ | Bucket public URL (dev: `https://pub-<hash>.r2.dev`) |
| `SESSION_SECRET` | ✅ | Minimum 64 random characters |
| `MASTER_USERNAME` | ✅ | Master admin username |
| `MASTER_PASSWORD` | ✅ | Master admin password |
| `NEXT_PUBLIC_APP_URL` | ✅ | `http://localhost:3000` (dev) |
| `REDIS_URL` | ✅ | `redis://localhost:6379` |
| `REDIS_DISABLED` | ❌ | Set `true` to run without Redis |
| `MAX_FILE_SIZE_BYTES` | ❌ | Default 5GB (`5368709120`) |
| `UPLOAD_URL_EXPIRY_SECONDS` | ❌ | Default 900 (15 minutes) |
| `DOWNLOAD_URL_EXPIRY_SECONDS` | ❌ | Default 60 (1 minute) |
| `RATE_LIMIT_LOGIN_MAX` | ❌ | Default 5 attempts |
| `RATE_LIMIT_LOGIN_WINDOW_MS` | ❌ | Default 900000 (15 minutes) |

### 3. Database Setup

```bash
# Push schema to database
npm run db:push

# Create master admin (first time only)
npm run bootstrap

# (Optional) Reset master password
npm run reset-master-password
```

### 4. R2 CORS Configuration

Access Cloudflare Dashboard → R2 → Bucket → Settings → CORS.  
Use the configuration from [`docker/r2-cors.json`](docker/r2-cors.json).

Or via Wrangler:

```bash
wrangler r2 bucket cors set strogebyafr --file docker/r2-cors.json
```

### 5. Start Development

```bash
# Terminal 1: Next.js dev server
npm run dev

# Terminal 2: Background worker (thumbnail, compression, scheduled cleanup)
npm run worker
```

Access at **http://localhost:3000**.

> **Note:** Without Redis, set `REDIS_DISABLED=true` in `.env` — do not run `npm run worker`.
> Auto-cleanup (trash, file lifetime, activity logs) from Admin Settings **requires Redis + the worker**.

### Redis via Docker (optional)

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

---

---

## Deploy ke VPS (Panduan Lengkap)

> **Jawaban singkat:** Ya, website ini **siap deploy ke VPS mana pun** (Ubuntu/Debian recommended).  
> Stack production sudah ada: **Docker Compose + Nginx + Redis + Worker** — cukup **1 command** setelah `.env` diisi.

### Yang kamu butuhkan (sebelum mulai)

| Layanan | Wajib? | Fungsi | Gratis tier? |
|---------|--------|--------|--------------|
| **VPS** (Ubuntu 22.04+) | ✅ | Jalankan app | Vultr, DigitalOcean, Hetzner, dll. |
| **Neon PostgreSQL** | ✅ | Database | ✅ Free tier |
| **Cloudflare R2** | ✅ | Storage file | ✅ Free tier |
| **Domain** | ❌ | Bisa pakai IP VPS dulu | — |

VPS **tidak perlu** install Node.js manual — semua jalan di dalam Docker.

---

### Deploy dalam 5 langkah

#### Langkah 1 — Siapkan VPS

SSH ke VPS, lalu install Docker:

```bash
ssh root@IP-VPS-KAMU

# Install Docker (pilih salah satu)
curl -fsSL https://get.docker.com | sh
# atau dari repo:
git clone <repo-url> /opt/storage-by-afr
cd /opt/storage-by-afr
sudo bash scripts/vps-install.sh
```

Logout & login lagi SSH jika pakai user non-root (supaya grup `docker` aktif).

#### Langkah 2 — Clone project

```bash
git clone <repo-url> /opt/storage-by-afr
cd /opt/storage-by-afr
```

#### Langkah 3 — Isi file `.env`

```bash
cp .env.example .env
nano .env
```

**Wajib diisi sebelum deploy:**

| Variable | Contoh |
|----------|--------|
| `DATABASE_URL` | `postgresql://...@ep-xxx.neon.tech/storage?sslmode=require` |
| `R2_ACCOUNT_ID` | Dari Cloudflare R2 dashboard |
| `R2_ACCESS_KEY_ID` | R2 API token |
| `R2_SECRET_ACCESS_KEY` | R2 API token |
| `R2_BUCKET_NAME` | `storage-by-afr` |
| `R2_PUBLIC_URL` | `https://pub-xxxx.r2.dev` |
| `MASTER_PASSWORD` | Password admin kuat |
| `SESSION_SECRET` | Random 64+ karakter (auto-generate saat deploy pertama) |
| `NEXT_PUBLIC_APP_URL` | `http://IP-VPS` atau `https://domain.com` |

> **Penting:** `NEXT_PUBLIC_APP_URL` harus **persis** URL yang user buka di browser (termasuk `http://` atau `https://`).

#### Langkah 4 — Deploy (1 command)

```bash
chmod +x scripts/vps-deploy.sh scripts/vps-update.sh
./scripts/vps-deploy.sh
# atau: npm run deploy:vps
```

Script otomatis:
1. Validasi `.env`
2. Build & start: **app**, **worker**, **redis**, **nginx**
3. Tunggu app healthy
4. Jalankan **db:push** + **bootstrap** (master admin)

#### Langkah 5 — Buka website

- **Via Nginx (port 80):** `http://IP-VPS-KAMU`
- Login: `MASTER_USERNAME` / `MASTER_PASSWORD` dari `.env`

---

### Setelah deploy — checklist

- [ ] **R2 CORS** — Cloudflare Dashboard → R2 → Bucket → CORS  
  Edit [`docker/r2-cors.json`](docker/r2-cors.json), ganti `your-domain.com` dengan domain/IP VPS, lalu:
  ```bash
  wrangler r2 bucket cors set NAMA-BUCKET --file docker/r2-cors.json
  ```
- [ ] **Firewall VPS** — buka port **80** (dan **443** jika pakai SSL):
  ```bash
  sudo ufw allow 80
  sudo ufw allow 443
  sudo ufw enable
  ```
- [ ] **HTTPS (Let's Encrypt)** — lihat bagian SSL di bawah

---

### Perintah VPS sehari-hari

```bash
cd /opt/storage-by-afr

npm run deploy:logs      # Lihat log semua service
npm run deploy:down      # Stop semua container
npm run deploy:up        # Start ulang (tanpa setup DB)
./scripts/vps-update.sh  # git pull + rebuild (update versi)
npm run deploy:setup     # Ulang DB push + bootstrap (jika perlu)
```

---

### SSL / HTTPS (Let's Encrypt)

**Opsi A — Certbot di host (recommended, nginx tetap di Docker port 80/443):**

Stop nginx container sementara, atau proxy certbot via host nginx. Cara paling simpel — pasang certbot di VPS dan arahkan domain ke IP VPS:

```bash
sudo apt update && sudo apt install -y certbot
# Stop nginx docker dulu agar port 80 bebas:
docker compose -f docker/docker-compose.yml stop nginx

sudo certbot certonly --standalone -d storage.domain.com

# Copy cert ke folder docker:
sudo cp /etc/letsencrypt/live/storage.domain.com/fullchain.pem docker/certs/
sudo cp /etc/letsencrypt/live/storage.domain.com/privkey.pem docker/certs/
```

Uncomment block HTTPS di [`docker/nginx.conf`](docker/nginx.conf), update `server_name`, lalu:

```bash
docker compose -f docker/docker-compose.yml up -d nginx
```

Update `.env`: `NEXT_PUBLIC_APP_URL=https://storage.domain.com` → rebuild app:
```bash
docker compose -f docker/docker-compose.yml up -d --build app
```

**Opsi B — Tanpa domain (IP saja):** cukup `http://IP-VPS` — upload tetap jalan jika R2 CORS sudah benar.

---

### Arsitektur Docker di VPS

```
docker/
├── docker-compose.yml    # Production stack (app + worker + redis + nginx)
├── docker-compose.dev.yml
├── Dockerfile            # Next.js app (multi-stage standalone)
├── Dockerfile.worker     # Background jobs (thumbnail, cleanup)
├── Dockerfile.setup      # One-shot: db:push + bootstrap
├── nginx.conf            # Reverse proxy, upload max 5GB
├── r2-cors.json          # Template CORS untuk R2
└── certs/                # SSL certs (HTTPS)
```

| Service | Port | Fungsi |
|---------|------|--------|
| `nginx` | **80**, 443 | Reverse proxy (akses user) |
| `app` | 3000 | Next.js server |
| `worker` | — | Thumbnail, cleanup, webhooks |
| `redis` | 6379 (internal) | Cache + job queue |
| `setup` | — | One-shot DB setup (profile) |

---

### Opsi deploy alternatif (tanpa Docker)

Kalau VPS sudah punya Node.js 20 + Redis + Nginx:

```bash
cd /opt/storage-by-afr
cp .env.example .env && nano .env
# Set REDIS_DISABLED=false dan REDIS_URL=redis://127.0.0.1:6379

npm ci
npm run build
npm run db:push
npm run bootstrap

# PM2
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

Nginx di host → proxy ke `127.0.0.1:3000` (config di bawah).

---

### Opsi 2: Manual Docker Compose

```bash
cd /opt/storage-by-afr
cp .env.example .env && nano .env
docker compose -f docker/docker-compose.yml up -d --build
docker compose -f docker/docker-compose.yml --profile setup run --rm setup
```

---

## 🖥️ VPS Deployment (English summary)

**One-command deploy** after configuring `.env`:

```bash
git clone <repo-url> /opt/storage-by-afr && cd /opt/storage-by-afr
cp .env.example .env && nano .env
chmod +x scripts/vps-deploy.sh && ./scripts/vps-deploy.sh
```

Requires: Ubuntu 22.04+, Docker, Neon Postgres, Cloudflare R2.  
See Indonesian guide above for SSL, CORS, firewall, and daily commands.

---

### Nginx di host (opsi PM2 / tanpa Docker nginx)

Create `/etc/nginx/sites-available/storage-by-afr`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 10G;
    proxy_request_buffering off;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeout for large uploads
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
    }

    # Cache static assets
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/storage-by-afr /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 🔧 Environment Variables Reference

File `.env.example` contains a complete template. Here is the full reference:

```env
# ── Database ──────────────────────────────────────────────
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# ── Cloudflare R2 ─────────────────────────────────────────
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=your-bucket
R2_PUBLIC_URL=https://pub-xxxx.r2.dev

# ── Redis ─────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379
REDIS_DISABLED=true              # Set true if running without Redis

# ── Session ───────────────────────────────────────────────
SESSION_SECRET=change-this-to-a-random-64-character-string

# ── Master Admin ──────────────────────────────────────────
MASTER_USERNAME=ByAFR
MASTER_PASSWORD=your-strong-password

# ── App ───────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Limits ────────────────────────────────────────────────
MAX_FILE_SIZE_BYTES=5368709120   # 5GB
UPLOAD_URL_EXPIRY_SECONDS=900    # 15 minutes
DOWNLOAD_URL_EXPIRY_SECONDS=60   # 1 minute

# ── Rate Limiting ─────────────────────────────────────────
RATE_LIMIT_LOGIN_MAX=5
RATE_LIMIT_LOGIN_WINDOW_MS=900000
```

---

## 📁 Project Architecture

```
storage-by-afr/
├── app/
│   ├── (app)/              # Route group (no additional layout)
│   ├── (auth)/             # Route group for authentication
│   ├── (shell)/            # Route group with AppShell (sidebar)
│   ├── admin/              # Admin pages + API routes
│   ├── api/                # REST API routes
│   ├── dashboard/          # Dashboard page
│   ├── favorites/          # Favorites page
│   ├── files/              # File browser page
│   ├── login/              # Login page
│   ├── recycle-bin/        # Recycle bin page
│   ├── shared/             # Public share page
│   └── shares/             # Share management
├── components/
│   ├── admin/              # Admin UI components
│   ├── editors/            # Image editor, Note editor, PDF viewer
│   ├── files/              # File browser, grid, preview, share dialog, upload panel
│   ├── folders/            # Droppable folder (dnd-kit)
│   ├── layout/             # AppShell, Sidebar, CommandPalette, ThemeProvider
│   ├── media-viewers/      # Image, video, audio, PDF, SVG, text, office viewers
│   └── ui/                 # Button, Card, Input (shadcn-style)
├── lib/
│   ├── api/                # Client fetch + server response helpers
│   ├── auth/               # Session, password, permissions, audit log
│   ├── cache/              # Redis cache layer (with fallback)
│   ├── db/                 # Drizzle schema + connection
│   ├── queue/              # BullMQ job queue
│   ├── security/           # Rate limiting, CSRF, file validation, suspicious activity
│   └── storage/            # Cloudflare R2 client
├── workers/                # Background job worker
├── scripts/                # CLI utilities (bootstrap, reset password)
└── docker/                 # Docker Compose + config
```

### Upload Data Flow

```
Browser ──presigned URL──► Cloudflare R2 ──complete──► Next.js API ──► Neon DB
    │                                                            │
    └──(optional)────────────────────────────► BullMQ ──► Worker ──► Thumbnail
```

### Layered Security

1. **Middleware** — Bot detection, session validation, security headers (CSP, HSTS, etc.)
2. **CSRF** — Token validation on every mutation
3. **Rate Limiting** — Login attempt throttling, API abuse detection
4. **File Validation** — Magic byte verification (not just extension check)
5. **Suspicious Activity** — Pattern-based anomaly detection
6. **Argon2id** — Password hashing with automatic salt
7. **Presigned URLs** — Files are not directly accessible; temporary URLs only

---

## Troubleshooting

### Redis Error `[ioredis] Unhandled error event`

Redis is not running. Choose one:

- **Option A (quick):** Set `REDIS_DISABLED=true` in `.env` — cache & queue are disabled, app still works
- **Option B:** Start Redis via Docker:
  ```bash
  docker compose -f docker/docker-compose.dev.yml up -d
  ```
  Then remove `REDIS_DISABLED` from `.env`

### Upload fails / CORS error

Cloudflare R2 requires **CORS** configuration for browser uploads.  
Configure via R2 Dashboard → bucket → Settings → CORS.  
Use [`docker/r2-cors.json`](docker/r2-cors.json) and add your origin domain.

### Worker error `ENOTFOUND redis`

The worker uses the hostname `redis` (only valid inside Docker network).  
For local development: set `REDIS_DISABLED=true` in `.env` — do not run `npm run worker`.

### Build Error `Type 'Redis' is not assignable to type 'ConnectionOptions'`

Type incompatibility between `ioredis` and `bullmq`.  
Fix: `lib/queue/index.ts` already uses `as unknown as import("bullmq").ConnectionOptions`.

### Login gagal setelah deploy

1. Pastikan setup jalan: `npm run deploy:setup`
2. Reset password master: `npm run reset-master-password` (di host dengan `.env`, atau via setup container)
3. Login pakai `MASTER_USERNAME` / `MASTER_PASSWORD` dari `.env`

### Deploy VPS: container tidak start

```bash
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs app --tail 100
```

Penyebab umum: `.env` belum lengkap, `DATABASE_URL` salah, atau port 80 sudah dipakai service lain.

### Upload gagal setelah deploy VPS

1. `NEXT_PUBLIC_APP_URL` di `.env` harus match URL browser
2. R2 CORS harus include domain/IP VPS (lihat `docker/r2-cors.json`)
3. `R2_PUBLIC_URL` harus diisi

### Folder upload does not preserve structure

`webkitRelativePath` excludes the parent folder name.  
Modern browsers (Chrome/Edge) use `showDirectoryPicker()` which handles this correctly.  
The fallback assigns a timestamp-based folder name.

---

## Development Commands

```bash
npm run dev                   # Development server
npm run build                 # Production build
npm run start                 # Start production server
npm run lint                  # ESLint check
npm run db:generate           # Generate Drizzle migration
npm run db:migrate            # Run migration
npm run db:push               # Push schema (dev)
npm run db:studio             # Drizzle Studio (GUI database)
npm run bootstrap             # Create master admin
npm run reset-master-password # Reset master password
npm run deploy:vps              # Deploy ke VPS (one-command)
npm run deploy:update           # Update VPS (git pull + rebuild)
npm run deploy:install          # Install Docker di VPS (root)
npm run deploy:up               # Start Docker stack
npm run deploy:down             # Stop Docker stack
npm run deploy:logs             # Docker logs
npm run deploy:setup            # DB push + bootstrap (Docker)
npm run worker                  # Start BullMQ worker (local dev)
```

---

## License

Private — All rights reserved.
