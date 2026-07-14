# Storage ByAFR

Modern cloud storage web application — fast, secure, and scalable.  
Built with **Next.js 16**, **Drizzle ORM**, **Cloudflare R2**, and **Redis**.

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

# Terminal 2: Background worker (thumbnail, compression)
npm run worker
```

Access at **http://localhost:3000**.

> **Note:** Without Redis, set `REDIS_DISABLED=true` in `.env` — do not run `npm run worker`.

### Redis via Docker (optional)

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

---

## 🐳 Docker Deployment (Production)

### Docker Structure

```
docker/
├── docker-compose.yml       # Production stack
├── docker-compose.dev.yml   # Redis for local dev
├── Dockerfile               # Next.js app (multi-stage)
├── Dockerfile.worker        # Background worker
├── nginx.conf               # Reverse proxy config
└── r2-cors.json             # R2 CORS template
```

### Build & Run

```bash
cd docker
docker compose up -d --build
```

This starts 4 services:

| Service | Port | Role |
|---------|------|------|
| `app` | 3000 | Next.js server |
| `worker` | — | BullMQ background job processor |
| `redis` | 6379 | Cache + job queue |
| `nginx` | 80/443 | Reverse proxy with SSL |

---

## 🖥️ VPS Deployment

### Option 1: One-command Docker deploy (Recommended)

**Requirements:** Ubuntu 22.04+, Docker, Docker Compose plugin. External services: **Neon Postgres** + **Cloudflare R2**.

```bash
# 1. SSH into VPS + install Docker
ssh user@vps-ip
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # then re-login

# 2. Clone repo → configure env → deploy
git clone <repo-url> /opt/storage-by-afr
cd /opt/storage-by-afr
cp .env.example .env && nano .env
# Required: DATABASE_URL, R2_*, SESSION_SECRET, MASTER_PASSWORD, NEXT_PUBLIC_APP_URL

chmod +x scripts/vps-deploy.sh
./scripts/vps-deploy.sh
# or: npm run deploy:vps
```

What the script does:
1. Validates `.env` (rejects empty/placeholder values)
2. `docker compose -f docker/docker-compose.yml up -d --build`
3. Runs the `setup` profile (`db:push` + master bootstrap)

Useful follow-ups:
```bash
npm run deploy:logs    # live logs
npm run deploy:down    # stop stack
```

### Option 2: Manual compose / PM2

```bash
cd /opt/storage-by-afr
cp .env.example .env && nano .env
docker compose -f docker/docker-compose.yml up -d --build
docker compose -f docker/docker-compose.yml --profile setup run --rm setup
```

**PM2 (without Docker)** — Node.js 20+, Redis, Nginx:

```bash
cd /opt/storage-by-afr
npm install --production
npm install sharp  # native module
npm run build
```

```js
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "storage-by-afr",
      script: "node_modules/.bin/next",
      args: "start",
      env: { PORT: 3000, NODE_ENV: "production" },
      instances: 2,
      exec_mode: "cluster",
    },
    {
      name: "worker",
      script: "node_modules/.bin/tsx",
      args: "workers/index.ts",
      env: { NODE_ENV: "production" },
    },
  ],
};
```

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Nginx Configuration

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

### Login fails after deployment

1. Ensure bootstrap was run: `npm run bootstrap`
2. Reset master password to match `.env`: `npm run reset-master-password`
3. Login with `MASTER_USERNAME` and `MASTER_PASSWORD` from `.env`

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
npm run worker                # Start BullMQ worker
```

---

## License

Private — All rights reserved.
