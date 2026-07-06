# Production Deployment Guide

Türkçe RAG platformunun tek sunuculu (Docker Compose) üretim mimarisi, CI/CD
süreci, izleme, yedekleme ve ölçekleme yolu.

---

## 1. Mimari Genel Bakış

```
                        Internet
                           │
                    ┌──────▼──────┐  :80 / :443 (tek açık kapı)
                    │    nginx    │  TLS, rate-limit, gzip, SSE
                    └──┬───────┬──┘
              edge ağı │       │
        ┌──────────────▼─┐   ┌─▼──────────────┐
        │   frontend     │   │      api       │ /metrics ─┐
        │ (nginx + SPA)  │   │   (FastAPI)    │           │
        └────────────────┘   └─┬──────────────┘           │
                       backend │ ağı (port yayını yok)    │
   ┌─────────┬─────────┬──────┼──────┬───────────┐        │
┌──▼───┐ ┌───▼──┐ ┌────▼───┐ ┌▼────┐ ┌▼─────────┐│  ┌─────▼─────────────┐
│ post │ │redis │ │rabbitmq│ │minio│ │  ollama  ││  │ monitor ağı:      │
│ gres │ │      │ │        │ │     │ │ (LLM)    ││  │ prometheus,grafana│
└──▲───┘ └──▲───┘ └───▲────┘ └──▲──┘ └────▲─────┘│  │ loki, promtail,   │
   │        │         │         │         │      │  │ alertmanager,     │
   └────────┴────┬────┴─────────┴─────────┘      │  │ exporters         │
             ┌───▼────┐                          │  └───────────────────┘
             │ worker │ (Celery: ingestion+OCR)  │
             └────────┘──────────────────────────┘
```

**Tasarım kararları ve ödünleşimler (tradeoffs):**

| Karar | Neden | Ödünleşim |
|---|---|---|
| Tek host + Compose | Az kullanıcı, düşük maliyet, basit işletim | Tek hata noktası; HA yok. DR = yedekten kurtarma |
| Ollama (yerel LLM) | API maliyeti sıfır, veri dışarı çıkmaz | CPU'da yavaş; GPU host gerektirir veya `LLM_PROVIDER=gemini`'ye geç |
| Edge nginx + ayrı frontend nginx | Frontend imajı dev/prod aynı kalır; edge tek yerde TLS/limit | Bir hop daha (ihmal edilebilir) |
| Loki (tek binary) | ELK'ya göre 10x az RAM | Gelişmiş log analitiği yok (bu ölçekte gereksiz) |
| GHCR | GitHub Actions ile sıfır-config entegrasyon | — |

---

## 2. Ortamlar (Environment Matrix)

| Ortam | Compose dosyası | Env | LLM | Amaç |
|---|---|---|---|---|
| **local** | `docker-compose.yml` + `override.yml` (otomatik) | `.env` | ollama (GPU) | Geliştirme, hot-reload |
| **test/CI** | GitHub Actions service containers | workflow env | mock | PR doğrulama |
| **staging** | `docker-compose.prod.yml` | `.env.prod` | ollama/gemini | Sürüm provası (opsiyonel: aynı host, farklı compose project adı) |
| **production** | `docker-compose.prod.yml` (+ `docker-compose.gpu.yml`) | `.env.prod` | ollama | Canlı |

Config doğrulama: `backend/app/core/config.py` (pydantic-settings) eksik/yanlış
env'de **boot'ta hata verir** (fail-fast).

---

## 3. Sunucu Gereksinimleri

**Ollama (CPU) ile — önerilen asgari:**
| Kaynak | Değer | Not |
|---|---|---|
| CPU | 8 vCPU | Ollama CPU inference + embedding |
| RAM | **16 GB** | ollama ~6-8G, api+worker ~4-6G (BGE-M3), monitoring ~2.5G |
| Disk | 100 GB SSD | modeller ~10G, HF cache ~3G, DB+objeler+loglar |
| OS | Ubuntu 22.04/24.04 LTS | docker + compose v2 |

**Bütçe seçenekleri:**
- **Oracle Cloud Free Tier** (ARM A1: 4 OCPU/24GB) — ücretsiz; Ollama ARM'de çalışır, 7b modelde ~3-6 tok/s (yavaş ama demo için yeterli). RAM bol.
- **Hetzner CPX41** (~€25/ay, 8vCPU/16GB) — rahat çalışır.
- **GPU host** (RTX 4000 vb., ~$150+/ay) — `docker-compose.gpu.yml` overlay ile.
- **Minimum kaçış yolu:** `LLM_PROVIDER=gemini` yap → Ollama kapat → 8GB RAM'lik ~€10/ay VPS yeter.

> ⚠️ Vercel/Netlify gibi platformlar bu stack'i barındıramaz (yalnızca statik/serverless).
> İstersen frontend'i Vercel'e, geri kalanı VPS'e ayırabilirsin; ama CORS + tek
> origin basitliği için tümünü tek host'ta tutmak önerilir.

---

## 4. Sıfırdan Kurulum (Deployment Guide)

```bash
# 0) Sunucu hazırlığı (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 1) Repo + dizin
sudo mkdir -p /opt/turkish-rag && sudo chown $USER /opt/turkish-rag
git clone https://github.com/<OWNER>/<REPO>.git /opt/turkish-rag
cd /opt/turkish-rag

# 2) Secrets
cp .env.prod.example .env.prod
openssl rand -base64 32   # her parola için tekrarla
openssl genrsa -out /tmp/jwt.pem 2048 && openssl rsa -in /tmp/jwt.pem -pubout -out /tmp/jwt.pub
# jwt.pem/jwt.pub içeriklerini tek satır (\n kaçışlı) .env.prod'a koy
chmod 600 .env.prod

# 3) TLS bootstrap (domain yoksa self-signed; varsa 5. adım)
chmod +x infra/scripts/*.sh
./infra/scripts/gen-self-signed.sh yourdomain.com

# 4) Stack'i başlat
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml --env-file .env.prod exec ollama ollama pull qwen2.5:7b-instruct
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm --no-deps api alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api python -m app.scripts.create_user

# 5) Let's Encrypt (domain DNS'i sunucuya işaret ettikten sonra)
DOMAIN=yourdomain.com EMAIL=you@mail.com ./infra/scripts/init-letsencrypt.sh
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile certbot up -d certbot

# 6) Monitoring
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile monitoring up -d
# Grafana: https://yourdomain.com/grafana  (GRAFANA_ADMIN_PASSWORD ile)

# 7) Yedek cron'u
crontab -e   # ekle:
# 0 3 * * * cd /opt/turkish-rag && ./infra/scripts/backup.sh >> backups/backup.log 2>&1
```

### CI/CD ile sürüm çıkarma
```bash
git tag v1.0.0 && git push origin v1.0.0
```
GitHub Actions: build → GHCR push → Trivy scan → staging deploy → **manuel onay** → production deploy.

**Bir defalık GitHub ayarları:**
1. Settings → Environments → `staging` ve `production` oluştur; production'a *required reviewers* ekle.
2. Her environment'a secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`; variable: `DEPLOY_ENABLED=true`.
3. Repo secret: `GEMINI_API_KEY` (haftalık AI-eval için, opsiyonel).

---

## 5. Secrets Yönetimi

- **Kaynak tek yer:** sunucuda `.env.prod` (chmod 600, git'e girmez — `.gitignore`'da).
- **CI secrets:** GitHub Environments (staging/production ayrımı + approval gate).
- **Kodda secret yok:** tüm değerler pydantic-settings üzerinden env'den okunur.
- **Rotasyon prosedürü:** yeni değeri `.env.prod`'a yaz → ilgili servisi `up -d` ile yeniden oluştur. JWT anahtar rotasyonu: yeni çifti koy → api restart → eski access token'lar 15 dk içinde doğal olarak ölür (TTL).
- Postgres/Redis/RabbitMQ/MinIO parolaları yalnızca `backend` ağında dolaşır; hiçbir port host'a yayınlanmaz.

---

## 6. Veritabanı Operasyonları

- **Migration:** Alembic; deploy script'i her sürümde `alembic upgrade head` çalıştırır. Kural: migration'lar geriye uyumlu yazılır (önce sütun ekle, sonraki sürümde eskiyi kaldır).
- **Yedek:** `infra/scripts/backup.sh` — gecelik `pg_dump -Fc` + MinIO mirror; 7 günlük + 4 haftalık saklama. **Yedekleri host dışına kopyala** (rclone → B2/S3 önerilir).
- **Geri yükleme:** `infra/scripts/restore.sh <dump> [objects.tar.gz]`.
- **Replikasyon hazırlığı:** `wal_level=replica`, `max_wal_senders=3` ayarlı — read-replica eklemek compose'a standby servis eklemekten ibaret.
- **pgvector optimizasyonu:** `chunks.embedding` için HNSW indeks migration'larda mevcut; `shared_buffers=512MB`, `work_mem=16MB` compose'da ayarlı. Chunk sayısı >1M olursa `maintenance_work_mem` artırıp indeksi yeniden kur.

---

## 7. Felaket Kurtarma (DR)

**Hedefler:** RPO ≤ 24 saat (gecelik yedek) · RTO ≤ 1 saat (yeni host + restore).

| Senaryo | Prosedür |
|---|---|
| Konteyner çöktü | `restart: unless-stopped` otomatik; alert `ServiceDown` 2 dk'da öter |
| Disk doldu | `HostOutOfDiskSpace` alert'i; `docker system prune`, log rotasyonu zaten sınırlı |
| DB bozulması | `restore.sh` ile son dump; kayıp ≤ 24s |
| Host tamamen kayboldu | Yeni VPS → kurulum bölümü 0-4 → `.env.prod` (şifre kasandan) → restore.sh → DNS'i çevir |
| Kötü sürüm çıktı | `./infra/scripts/deploy.sh <önceki-versiyon>` (imajlar GHCR'da duruyor) |

---

## 8. Ölçekleme Stratejisi

**Mevcut darboğaz sırası (bu iş yükünde):**
1. **Ollama inference** (CPU'da tek istek bile saniyeler) → ilk çare GPU veya Gemini.
2. **Embedding/rerank (BGE-M3)** api+worker içinde CPU'da → ayrı bir "inference service" konteynerine çıkarılabilir.
3. **Celery ingestion** (OCR ağır) → `docker compose up -d --scale worker=3` (bugün çalışır).
4. **API** → uvicorn `--workers 2` ayarlı; `--scale api=2` + nginx upstream zaten hazır (upstream bloğuna ikinci server eklenmeli veya docker DNS round-robin).
5. **PostgreSQL** en son sıkışır → önce read-replica, sonra managed PG.

**Redis/RabbitMQ:** bu ölçekte tek düğüm fazlasıyla yeter (limitleri: ~10K msg/s).

**Kubernetes'e geçiş yolu** (kullanıcı >~50 eşzamanlı olursa):
1. İmajlar zaten registry'de, config zaten env-tabanlı (12-factor) → değişiklik yok.
2. Compose servisleri ≈ Deployment'lar; `x-backend-env` → ConfigMap+Secret.
3. Sıra: managed DB'ye taşın (RDS/CloudSQL) → Kompose ile iskelet üret → Ingress (nginx config'in birebir karşılığı) → HPA (api/worker) → KEDA (RabbitMQ kuyruk derinliğine göre worker autoscale).
4. Ollama → GPU node pool veya managed LLM endpoint.

---

## 9. Gözlemlenebilirlik (Observability)

**Metrikler (Prometheus, 15 gün saklama):** API latency/rate/error (instrumentator),
kuyruk derinliği (RabbitMQ plugin), Celery başarı/hata (celery-exporter),
PG bağlantı/sorgu süreleri (postgres-exporter), Redis bellek (redis-exporter),
host CPU/RAM/disk (node-exporter). Dashboard: Grafana → "Turkish RAG — Platform Overview".

**Loglar (Loki, 14 gün):** tüm konteynerler promtail ile toplanır; api/worker
structlog JSON bastığı için `{service="api"} | json | level="error"` gibi sorgular çalışır.
RAG'a özgü olaylar (retrieval, cache hit, hallucination flag, token sayısı) zaten
structlog event'leri + `retrieval_logs` tablosunda — Grafana'da Loki panelinden izlenir;
AI maliyeti Ollama'da sıfır, Gemini'ye geçilirse `ai.llm` logları üzerinden sayılır.

**Alarmlar (Alertmanager):** servis düşmesi, p95>2s, 5xx>%5, kuyruk >100 (15dk),
Celery arızaları (OCR dahil), PG/Redis eşikleri, disk<%10. Alıcıyı
`infra/monitoring/alertmanager/alertmanager.yml` içinde Slack/e-posta ile değiştir.

---

## 10. Güvenlik Kontrol Listesi

- [x] Konteynerler non-root (api/worker `appuser`)
- [x] Yalnızca nginx port yayınlar (80/443); data servisleri iç ağda
- [x] TLS 1.2/1.3, HSTS, güvenlik başlıkları
- [x] Rate limit: API 20 r/s, login 5 r/dk (nginx) + uygulama içi RateLimitMiddleware
- [x] Trivy: CI'da fs taraması, release'te imaj taraması (CRITICAL bloklar)
- [x] pip-audit + npm audit CI'da
- [x] Secrets git dışında; CI'da environment-scoped
- [x] Redis parolalı, `maxmemory-policy` ayarlı
- [x] Log rotasyonu (20MB×5 tüm servislerde)
- [ ] Host: SSH key-only + ufw (80/443/SSH) + fail2ban → kurulumda yap
- [ ] DDoS: gerçek koruma için Cloudflare proxy'yi önüne al (ücretsiz katman yeterli)

## 11. Üretime Çıkış Kontrol Listesi

- [ ] `.env.prod` dolduruldu, tüm CHANGE_ME'ler değişti, chmod 600
- [ ] JWT RSA çifti üretildi
- [ ] DNS A kaydı → sunucu; Let's Encrypt alındı; certbot profili açık
- [ ] `create_user` ile gerçek admin açıldı, demo şifreler kullanılmadı
- [ ] Ollama modeli çekildi; `docker exec ... ollama ls` doğrulandı
- [ ] Backup cron'u kuruldu ve **bir restore tatbikatı yapıldı**
- [ ] Monitoring profili açık; Grafana şifresi güçlü; alert alıcısı bağlandı
- [ ] GitHub Environments + DEPLOY_* secrets tanımlı; `v0.1.0` tag'ı ile uçtan uca deploy denendi
- [ ] ufw + fail2ban aktif

---

## Dosya Haritası

```
├── docker-compose.yml            # dev (override ile)
├── docker-compose.override.yml   # dev: hot-reload, portlar
├── docker-compose.prod.yml       # üretim (profiller: monitoring, certbot)
├── docker-compose.gpu.yml        # GPU overlay
├── .env.prod.example             # secrets şablonu
├── .github/workflows/
│   ├── ci.yml                    # lint→typecheck→test→scan→build
│   └── release.yml               # tag→push→staging→(onay)→prod
├── infra/
│   ├── nginx/                    # edge: TLS, rate-limit, SSE, gzip
│   ├── rabbitmq/enabled_plugins  # prometheus plugin
│   ├── monitoring/               # prometheus, alertmanager, grafana, loki, promtail
│   └── scripts/                  # deploy, backup, restore, TLS bootstrap
└── backups/                      # pg dumps + minio arşivleri (host dışına kopyala!)
```
