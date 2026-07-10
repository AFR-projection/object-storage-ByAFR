# ☁️ Storage ByAFR

Modern cloud storage web application — fast, secure, and elegant.  
Built with Next.js 16 + Drizzle ORM + Cloudflare R2 + Redis.

---

## Fitur

- **Manajemen File** — Upload, download, rename, duplicate, favorite, drag-and-drop folder
- **Folder Upload** — Upload seluruh folder dengan struktur tetap (File System Access API + fallback webkitdirectory)
- **Virtual Scrolling** — Render ribuan file tanpa lag (`@tanstack/react-virtual`)
- **Multi-Select & Batch Actions** — Download, favorite, delete massal (parallel `Promise.all`)
- **Tipe Filter** — Filter cepat: All / Images / Videos / Audio / Documents / Archives
- **Sortable Columns** — Urutkan berdasarkan Name / Size / Modified / Type
- **File Preview** — Preview gambar, video, audio, PDF, dokumen Office, SVG, teks (syntax highlight)
- **Rich Text Notes** — Tiptap editor dengan auto-save
- **Image Editor** — Crop, rotate, flip built-in
- **Share Links** — Buat link share dengan expiry, batas akses, permission (view/edit), tracking access log (IP, device, browser, OS, lokasi)
- **Recycle Bin** — Soft-delete, time grouping (Today/Yesterday/This Week/This Month/Older), batch restore/delete, search
- **Favorites** — Tandai file favorit
- **Pencarian** — Full-text search across files
- **Admin Panel** — User management, impersonation, monitoring real-time, activity logs
- **Keamanan** — Argon2id password hashing, CSRF token, rate limiting, magic byte validation, CSP headers, bot detection
- **Background Jobs** — Thumbnail generation, image compression, media trimming via BullMQ
- **Dark/Light Mode** — Theme kustom dengan persistensi localStorage
- **Responsive** — Desktop-first dengan UI premium (Framer Motion, gradient, glow effects)

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Framework** | Next.js 16.2.10 (App Router) |
| **Language** | TypeScript 5 |
| **Database** | Neon PostgreSQL + Drizzle ORM 0.45 |
| **Storage** | Cloudflare R2 (S3-compatible, presigned URLs) |
| **Cache & Queue** | Redis + BullMQ 5 |
| **Auth** | Session-based (Argon2id via `@node-rs/argon2`) |
| **UI** | Tailwind CSS v4 + Framer Motion + Radix UI + Lucide Icons |
| **Forms** | React Dropzone, React Easy Crop |
| **Virtual Scroll** | @tanstack/react-virtual |
| **Rich Text** | Tiptap |
| **Drag & Drop** | @dnd-kit |
| **PDF** | react-pdf + pdfjs-dist |
| **Charts** | Recharts |
| **Deploy** | Docker Compose (multi-stage, Nginx reverse proxy) |

---

## Prasyarat

- **Node.js** ≥ 20.x
- **npm** ≥ 10.x
- **PostgreSQL** (Neon — serverless, atau lokal via Docker)
- **Cloudflare R2 bucket** (atau S3-compatible lainnya)
- **Redis** (opsional — bisa dinonaktifkan untuk development)
- **Docker** (opsional, untuk deploy)

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

Isi `.env` dengan konfigurasi berikut:

| Variable | Wajib | Deskripsi |
|----------|-------|-----------|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `R2_ACCOUNT_ID` | ✅ | Cloudflare R2 Account ID |
| `R2_ACCESS_KEY_ID` | ✅ | R2 Access Key |
| `R2_SECRET_ACCESS_KEY` | ✅ | R2 Secret Access Key |
| `R2_BUCKET_NAME` | ✅ | Nama bucket R2 |
| `R2_PUBLIC_URL` | ✅ | Public URL bucket (dev: `https://pub-<hash>.r2.dev`) |
| `SESSION_SECRET` | ✅ | Minimal 64 karakter random |
| `MASTER_USERNAME` | ✅ | Username master admin |
| `MASTER_PASSWORD` | ✅ | Password master admin |
| `NEXT_PUBLIC_APP_URL` | ✅ | `http://localhost:3000` (dev) |
| `REDIS_URL` | ✅ | `redis://localhost:6379` |
| `REDIS_DISABLED` | ❌ | Set `true` jika tidak pakai Redis |
| `MAX_FILE_SIZE_BYTES` | ❌ | Default 5GB (5368709120) |
| `UPLOAD_URL_EXPIRY_SECONDS` | ❌ | Default 900 (15 menit) |
| `DOWNLOAD_URL_EXPIRY_SECONDS` | ❌ | Default 60 (1 menit) |
| `RATE_LIMIT_LOGIN_MAX` | ❌ | Default 5 percobaan |
| `RATE_LIMIT_LOGIN_WINDOW_MS` | ❌ | Default 900000 (15 menit) |

### 3. Setup Database

```bash
# Push schema ke database
npm run db:push

# Buat akun master (pertama kali saja)
npm run bootstrap

# (Opsional) Reset password master
npm run reset-master-password
```

### 4. Setup R2 CORS

Akses Cloudflare Dashboard → R2 → Bucket → Settings → CORS.  
Gunakan konfigurasi dari [`docker/r2-cors.json`](docker/r2-cors.json).

Atau via Wrangler:

```bash
wrangler r2 bucket cors set strogebyafr --file docker/r2-cors.json
```

### 5. Jalankan Development

```bash
# Terminal 1: Next.js dev server
npm run dev

# Terminal 2: Worker (thumbnail, compression)
npm run worker
```

Akses di **http://localhost:3000**.

> **Catatan:** Tanpa Redis, set `REDIS_DISABLED=true` di `.env` — jangan jalankan `npm run worker`.

### Redis via Docker (opsional)

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

---

## 🐳 Docker Deployment (Production)

### Struktur Docker

```
docker/
├── docker-compose.yml       # Production stack
├── docker-compose.dev.yml   # Redis for local dev
├── Dockerfile               # Next.js app (multi-stage)
├── Dockerfile.worker        # Background worker
├── nginx.conf               # Reverse proxy config
└── r2-cors.json             # R2 CORS template
```

### Build & Jalankan

```bash
cd docker
docker compose up -d --build
```

Ini akan menjalankan 4 service:

| Service | Port | Fungsi |
|---------|------|--------|
| `app` | 3000 | Next.js server |
| `worker` | — | BullMQ background job processor |
| `redis` | 6379 | Cache + job queue |
| `nginx` | 80/443 | Reverse proxy dengan SSL |

---

## 🖥️ Deploy ke VPS

### Opsi 1: Docker Compose (Recommended)

**Requirements:** Ubuntu 22.04+, Docker, Docker Compose.

```bash
# 1. SSH ke VPS
ssh user@vps-ip

# 2. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Logout & login kembali

# 3. Clone project
git clone <repo-url> /opt/storage-by-afr
cd /opt/storage-by-afr

# 4. Buat .env file
nano .env
# Isi semua environment variables (lihat tabel di atas)
# PASTIKAN: NEXT_PUBLIC_APP_URL=https://domain-anda.com

# 5. Build & jalankan
cd docker
docker compose up -d --build
```

### Opsi 2: Manual (tanpa Docker)

**Requirements:** Node.js 20+, PM2, Nginx, Redis.

```bash
# 1. Install dependencies
cd /opt/storage-by-afr
npm install --production
npm install sharp  # native module

# 2. Build
npm run build

# 3. Setup PM2 ecosystem (buat file ecosystem.config.js)
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

### Konfigurasi Nginx

Buat file `/etc/nginx/sites-available/storage-by-afr`:

```nginx
server {
    listen 80;
    server_name domain-anda.com;

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

        # Timeout untuk upload besar
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

### SSL dengan Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d domain-anda.com
```

---

## 🔧 Environment Variables Reference

Berkas `.env.example` berisi template lengkap. Berikut detail setiap variabel:

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
REDIS_DISABLED=true              # Set true jika tanpa Redis

# ── Session ───────────────────────────────────────────────
SESSION_SECRET=change-this-to-a-random-64-character-string

# ── Master Admin ──────────────────────────────────────────
MASTER_USERNAME=ByAFR
MASTER_PASSWORD=your-strong-password

# ── App ───────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Limits ────────────────────────────────────────────────
MAX_FILE_SIZE_BYTES=5368709120   # 5GB
UPLOAD_URL_EXPIRY_SECONDS=900    # 15 menit
DOWNLOAD_URL_EXPIRY_SECONDS=60   # 1 menit

# ── Rate Limiting ─────────────────────────────────────────
RATE_LIMIT_LOGIN_MAX=5
RATE_LIMIT_LOGIN_WINDOW_MS=900000
```

---

## 📁 Arsitektur Proyek

```
storage-by-afr/
├── app/
│   ├── (app)/              # Route group (tanpa layout tambahan)
│   ├── (auth)/             # Route group untuk login
│   ├── (shell)/            # Route group dengan AppShell (sidebar)
│   ├── admin/              # Halaman admin + API routes
│   ├── api/                # API routes (REST)
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

### Alur Data Upload

```
Browser ──presigned URL──► Cloudflare R2 ──complete──► Next.js API ──► Neon DB
    │                                                            │
    └──(optional)────────────────────────────► BullMQ ──► Worker ──► Thumbnail
```

### Keamanan Berlapis

1. **Middleware** — Bot detection, session check, security headers (CSP, HSTS, etc.)
2. **CSRF** — Token validation di setiap mutasi
3. **Rate Limiting** — Login attempt, API abuse detection
4. **File Validation** — Magic byte check (tidak hanya ekstensi)
5. **Suspicious Activity** — Deteksi pattern mencurigakan
6. **Argon2id** — Password hashing dengan salt otomatis
7. **Presigned URLs** — File tidak langsung diakses, hanya via URL sementara

---

## Troubleshooting

### Redis Error `[ioredis] Unhandled error event`

Redis belum berjalan. Pilih salah satu:

- **Opsi A (cepat):** Set `REDIS_DISABLED=true` di `.env` — cache & queue nonaktif, app tetap jalan
- **Opsi B:** Jalankan Redis via Docker:
  ```bash
  docker compose -f docker/docker-compose.dev.yml up -d
  ```
  Lalu hapus `REDIS_DISABLED` dari `.env`

### Upload gagal / CORS error

Cloudflare R2 membutuhkan **CORS** agar browser bisa upload langsung.  
Atur di R2 Dashboard → bucket → Settings → CORS.  
Gunakan [`docker/r2-cors.json`](docker/r2-cors.json) dan tambahkan origin domain kamu.

### Worker error `ENOTFOUND redis`

Worker memakai hostname `redis` (hanya valid di Docker network).  
Untuk dev lokal: set `REDIS_DISABLED=true` di `.env` — jangan jalankan `npm run worker`.

### Build Error `Type 'Redis' is not assignable to type 'ConnectionOptions'`

Inkompatibilitas tipe antara `ioredis` dan `bullmq`.  
Solusi: file `lib/queue/index.ts` sudah menggunakan `as unknown as import("bullmq").ConnectionOptions`.

### Login gagal setelah deploy

1. Pastikan sudah bootstrap: `npm run bootstrap`
2. Reset password master sesuai `.env`: `npm run reset-master-password`
3. Login dengan `MASTER_USERNAME` dan `MASTER_PASSWORD` dari `.env`

### Upload folder tidak mempertahankan struktur

`webkitRelativePath` tidak menyertakan nama folder induk.  
Browser modern (Chrome/Edge) otomatis pakai `showDirectoryPicker()` yang benar.  
Untuk fallback, folder diberi nama timestamp.

---

## Development

```bash
# Commands
npm run dev              # Development server
npm run build            # Production build
npm run start            # Start production server
npm run lint             # ESLint check
npm run db:generate      # Generate Drizzle migration
npm run db:migrate       # Run migration
npm run db:push          # Push schema (dev)
npm run db:studio        # Drizzle Studio (GUI database)
npm run bootstrap        # Create master admin
npm run reset-master-password  # Reset master password
npm run worker           # Start BullMQ worker
```

---

## Lisensi

Private — All rights reserved.
#   S t r o g e B y A F R  
 