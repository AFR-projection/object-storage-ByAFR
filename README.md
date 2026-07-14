# Storage ByAFR

Modern cloud storage web application — fast, secure, and scalable.  
Built with **Next.js 16**, **Drizzle ORM**, **Cloudflare R2**, and **Redis**.

**Quick links:** [Local dev](#local-development) · **[Deploy VPS → DEPLOY.md](DEPLOY.md)** · [Troubleshooting](#troubleshooting)

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

**Local development:** Node.js ≥ 20, npm ≥ 10, Neon Postgres, Cloudflare R2, Redis optional (`REDIS_DISABLED=true`).

**Production VPS:** Ubuntu 22.04+, Docker — lihat **[DEPLOY.md](DEPLOY.md)**.

---

## Local Development

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

## Production Deployment (VPS)

Deploy production **tidak** dijelaskan di file ini — semua ada di **[DEPLOY.md](DEPLOY.md)**.

| Script | Fungsi |
|--------|--------|
| `./install.sh` | Install pertama — wizard interaktif, SSL, deploy, health check |
| `./deploy.sh` | Deploy ulang (pakai `.env` yang sudah ada) |
| `./update.sh` | Update aman — backup, pull, rebuild, migrate |

```bash
git clone <repo-url> /opt/storage-by-afr && cd /opt/storage-by-afr
chmod +x install.sh update.sh deploy.sh
./install.sh
```

Wizard otomatis membuat `.env` — tidak perlu edit manual.  
Untuk requirement server, firewall, SSL, R2 CORS, backup, update, dan troubleshooting production → **[DEPLOY.md](DEPLOY.md)**.

---

## Environment Variables

Template lengkap: [`.env.example`](.env.example)

| Variable | Dev | Production |
|----------|-----|------------|
| `DATABASE_URL` | Neon / local Postgres | Neon (via wizard) |
| `R2_*` | Cloudflare R2 | Cloudflare R2 (via wizard) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `https://domain.com` (auto) |
| `REDIS_DISABLED` | `true` OK | `false` (Docker Redis) |
| `COOKIE_SECURE` | `false` | `true` (auto via wizard) |

---

## Project Architecture

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
├── scripts/                # CLI + deploy (see scripts/deploy/)
├── install.sh              # Production installer entry point
└── docker/                 # Docker Compose + nginx template
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

### Local development

**Redis `[ioredis] Unhandled error event`**

- Set `REDIS_DISABLED=true` in `.env`, or start Redis: `docker compose -f docker/docker-compose.dev.yml up -d`

**Upload fails / CORS error**

- Configure R2 CORS using [`docker/r2-cors.json`](docker/r2-cors.json) with `http://localhost:3000`

**Worker `ENOTFOUND redis`**

- Worker hostname `redis` only works inside Docker. Locally: set `REDIS_DISABLED=true` and skip `npm run worker`.

**Folder upload structure**

- Chrome/Edge `showDirectoryPicker()` preserves paths; `webkitdirectory` fallback uses timestamp folder name.

### Production (VPS)

Login, SSL, container, upload issues after deploy → **[DEPLOY.md § Troubleshooting](DEPLOY.md#troubleshooting)**

---

## Commands

### Development

```bash
npm run dev                   # Dev server
npm run build                 # Production build
npm run start                 # Start production server
npm run lint                  # ESLint
npm run db:push               # Push schema
npm run db:studio             # Drizzle Studio
npm run bootstrap             # Create master admin
npm run reset-master-password # Reset master password
npm run worker                # Background worker (needs Redis)
```

### Production (VPS)

```bash
./install.sh                  # First install (wizard)
./update.sh                   # Safe update
npm run deploy:logs           # Container logs
npm run deploy:health         # Service health check
```

Detail deploy → **[DEPLOY.md](DEPLOY.md)**

---

## License

Private — All rights reserved.
