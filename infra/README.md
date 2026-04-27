# Деплой Aqsha на Hetzner VPS

## Предварительные требования

На VPS уже работают:
- Docker + Docker Compose
- Nginx Proxy Manager (NPM) в Docker
- DNS-запись `aqsha.nurekella.tech` → IP сервера

## 1. Настройка Docker network

Aqsha и NPM должны быть в общей внешней сети:

```bash
docker network create npm-network
```

Затем подключите контейнер NPM к этой сети (один раз):

```bash
docker network connect npm-network <название_NPM_контейнера>
```

(Чтобы узнать название: `docker ps | grep nginx-proxy-manager`)

## 2. Подготовка директории

```bash
sudo mkdir -p /opt/aqsha-finance
sudo chown $USER:$USER /opt/aqsha-finance
cd /opt/aqsha-finance

# Скопировать docker-compose.yml и .env.example из репозитория
# (через git clone или scp)

cp .env.example .env
nano .env  # заполнить реальные значения
```

Сгенерировать секреты:

```bash
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
```

## 3. Авторизация в ghcr.io

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u nurekella --password-stdin
```

Токен — Personal Access Token (classic) с правом `read:packages`.

## 4. Запуск

```bash
cd /opt/aqsha-finance
docker compose pull
docker compose up -d
docker compose logs -f api
```

Применить миграции БД (первый раз):

```bash
docker compose run --rm api npx prisma migrate deploy
```

Создать первого админа:

```bash
./infra/scripts/create-admin.sh admin@nurekella.tech 'temp-password-123'
```

## 5. Настройка Proxy Host в NPM

В UI Nginx Proxy Manager → **Hosts → Proxy Hosts → Add Proxy Host**:

| Поле | Значение |
|---|---|
| Domain Names | `aqsha.nurekella.tech` |
| Scheme | `http` |
| Forward Hostname / IP | `aqsha-web` |
| Forward Port | `80` |
| Block Common Exploits | ✅ |
| Websockets Support | ✅ |

Вкладка **SSL**:
- Request a new SSL Certificate (Let's Encrypt)
- Force SSL ✅
- HTTP/2 Support ✅
- HSTS Enabled ✅

Вкладка **Advanced** (опционально, повышенная безопасность):

```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## 6. Бэкапы

```bash
# Установить rclone и настроить remote yandex:
curl https://rclone.org/install.sh | sudo bash
rclone config  # создать remote типа s3, провайдер Yandex Object Storage

# Создать /etc/aqsha-backup.env
sudo tee /etc/aqsha-backup.env > /dev/null <<EOF
POSTGRES_USER=aqsha
POSTGRES_DB=aqsha
BACKUP_PASSPHRASE=$(openssl rand -hex 24)
RCLONE_REMOTE=yandex:aqsha-backups
RETENTION_DAYS=14
EOF
sudo chmod 600 /etc/aqsha-backup.env

# Cron на 03:00 каждый день
sudo crontab -e
# Добавить:
# 0 3 * * * /opt/aqsha-finance/infra/scripts/backup.sh >> /var/log/aqsha-backup.log 2>&1
```

## 7. Обновление

При деплое новой версии (через CI или вручную):

```bash
cd /opt/aqsha-finance
docker compose pull
docker compose run --rm api npx prisma migrate deploy
docker compose up -d
```
