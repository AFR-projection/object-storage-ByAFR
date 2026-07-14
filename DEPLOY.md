# Deploy Storage ByAFR di VPS Ubuntu (dari nol)

Panduan production untuk user **non-developer**.  
Target: VPS Ubuntu fresh + domain → **`./install.sh`** → selesai dengan HTTPS.

> Local development → lihat [README.md](README.md)

---

## Ringkasan (30 detik)

```bash
ssh ubuntu@IP-VPS
git clone <repo-url> /opt/storage-by-afr
cd /opt/storage-by-afr
chmod +x install.sh deploy.sh update.sh

cp .env.example .env
nano .env    # isi DATABASE_URL, R2, domain — paste 1 baris penuh!

./install.sh
```

**`.env` manual** — sama seperti dulu. Wizard opsional: `./install.sh --wizard`

---

## Server requirement

| Item | Minimum |
|------|---------|
| OS | Ubuntu 22.04 / 24.04 LTS |
| RAM | 2 GB (4 GB recommended) |
| CPU | 2 vCPU |
| Disk | 20 GB SSD |
| Port | **80** dan **443** terbuka (firewall + cloud security group) |

### Layanan eksternal (gratis tier OK)

1. **Neon PostgreSQL** — https://neon.tech  
2. **Cloudflare R2** — https://dash.cloudflare.com → R2  
3. **Domain** — A record mengarah ke IP VPS

---

## Langkah 1 — Siapkan domain

Di panel DNS domain kamu:

| Type | Name | Value |
|------|------|-------|
| A | storage (atau @) | IP-VPS-KAMU |

Tunggu 5–30 menit sampai DNS propagate.  
Cek: `ping storage.example.com` harus menunjuk ke IP VPS.

---

## Langkah 2 — Firewall VPS

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Di panel cloud provider (Tencent, AWS, dll.) buka juga **Security Group** port 80 & 443.

---

## Langkah 3 — Buat `.env` & install

```bash
ssh ubuntu@IP-VPS

sudo apt update && sudo apt install -y git curl

git clone <repo-url> /opt/storage-by-afr
cd /opt/storage-by-afr

chmod +x install.sh deploy.sh update.sh

cp .env.example .env
nano .env
```

### Isi `.env` (contoh)

```env
NODE_ENV=production
DEPLOY_DOMAIN=storage.dataku.id
CERTBOT_EMAIL=admin@storage.dataku.id

DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require

R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=strogebyafr
R2_PUBLIC_URL=https://pub-xxxx.r2.dev

MASTER_USERNAME=ByAFR
MASTER_PASSWORD=password-min-10-char
SESSION_SECRET=random-64-char-hex

NEXT_PUBLIC_APP_URL=https://storage.dataku.id
COOKIE_SECURE=true
HSTS_ENABLED=true
REDIS_URL=redis://redis:6379
REDIS_DISABLED=false
```

**Penting:** `DATABASE_URL` harus **1 baris penuh** dari Neon.  
Jangan sampai terpotong jadi `...?sslmode>` — itu penyebab deploy gagal.

Deploy:

```bash
./install.sh
```

Script otomatis:
- Validasi `.env` (format)
- Request SSL Let's Encrypt
- Generate nginx config
- Build & start Docker (app, worker, redis, nginx)
- Database migrate + admin bootstrap

### Wizard (opsional)

Kalau mau wizard interaktif: `./install.sh --wizard`
- Build & start containers
- Database migration + bootstrap admin
- Health check semua service

### Output sukses:

```
Application : Running
Database    : Connected
Redis       : OK
Worker      : OK
SSL         : Active
URL         : https://storage.example.com
```

---

## Langkah 4 — R2 CORS (wajib untuk upload)

1. Edit `docker/r2-cors.json` — ganti `your-domain.com` dengan domain kamu  
2. Cloudflare Dashboard → R2 → Bucket → Settings → CORS  
   Atau via Wrangler:
   ```bash
   wrangler r2 bucket cors set NAMA-BUCKET --file docker/r2-cors.json
   ```

---

## Neon: allowlist IP VPS

Neon free tier kadang perlu allow IP VPS:
- Neon Dashboard → Project → Settings → IP Allow  
- Tambahkan IP publik VPS kamu

---

## Perintah sehari-hari

| Command | Fungsi |
|---------|--------|
| `./install.sh` | Install pertama (wizard + deploy) |
| `./deploy.sh` | Deploy ulang pakai `.env` existing |
| `./update.sh` | Update aman (backup config, pull, rebuild, migrate) |
| `npm run deploy:logs` | Lihat log |
| `npm run deploy:health` | Cek status service |

---

## Backup

Installer backup otomatis saat `./update.sh`:
- `.deploy/backups/.env.TIMESTAMP`
- `.deploy/backups/nginx.TIMESTAMP.conf`

Backup manual yang disarankan:
- File `.env` (simpan offline, berisi secrets)
- Neon: built-in backup / branch di dashboard
- R2: data sudah di Cloudflare

---

## Update versi aplikasi

```bash
cd /opt/storage-by-afr
./update.sh
```

Otomatis: backup → git pull → validate → rebuild → migration → health check.

---

## Troubleshooting

### Login tidak work / CSRF error

- Pastikan akses via **HTTPS** (`https://domain.com`)
- `NEXT_PUBLIC_APP_URL` di `.env` harus `https://domain.com` (wizard set otomatis)
- Rebuild app setelah ubah URL: `./deploy.sh`

### SSL gagal

- DNS belum pointing ke VPS → perbaiki A record, tunggu propagate
- Port 80 blocked → buka firewall & security group
- Jalankan ulang: `sudo bash scripts/deploy/ssl.sh`

### Docker permission denied

```bash
sudo usermod -aG docker $USER
newgrp docker
# atau langsung:
sudo ./install.sh
```

Installer otomatis pakai `sudo docker` jika perlu.

### Database connection failed

- Cek `DATABASE_URL` di Neon dashboard — **harus 1 baris penuh** (jangan terpotong)
- Neon → Project Settings → **IP Allow** → tambahkan IP VPS (installer menampilkan IP saat gagal)
- Atau nonaktifkan IP restriction sementara di Neon
- Test: `npm run deploy:health`

### `.env` rusak (ada `"` atau baris baru di tengah value)

Bug wizard lama bisa menghasilkan:

```env
R2_SECRET_ACCESS_KEY="
acf230cb..."
```

Perbaiki otomatis:

```bash
./install.sh --fix-env
```

Atau buat ulang dari wizard:

```bash
./install.sh --force-wizard
```

### Upload gagal (CORS)

- Update R2 CORS dengan domain HTTPS kamu
- `NEXT_PUBLIC_APP_URL` harus match browser URL

### Worker FAIL di health check

```bash
docker compose -f docker/docker-compose.yml logs worker --tail 50
```

Penyebab umum: Redis down, DATABASE_URL salah, R2 credential invalid.

### HTTP 403 saat curl homepage

Sudah diperbaiki — bot block tidak lagi block halaman utama.  
Protected API tetap aman.

### Reset password admin

```bash
docker compose -f docker/docker-compose.yml --profile setup run --rm setup
# atau di host dengan .env:
npm run reset-master-password
```

---

## Arsitektur deploy

```
Internet → Nginx (:443 SSL) → Next.js app (:3000)
                           ↘ Redis → Worker (thumbnail, cleanup)
Neon PostgreSQL (external)
Cloudflare R2 (external)
Let's Encrypt (auto renew via cron)
```

---

## File penting

| File | Fungsi |
|------|--------|
| `install.sh` | Entry point install |
| `update.sh` | Safe update |
| `.env` | Secrets (auto-generated wizard) |
| `docker/generated/nginx.conf` | Nginx auto-generated |
| `scripts/deploy/` | Modular deploy scripts |

---

## Untuk developer

Lihat juga [README.md](README.md) untuk local development.

Legacy script `scripts/vps-deploy.sh` masih ada tapi **disarankan pakai `./install.sh`**.
