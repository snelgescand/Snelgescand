# Hosting handleiding — Sportief Opgewekt online

**Doel**: de app gratis hosten op `snelgescand.nl`, zodat jij en je collega's er bij kunnen voor klantprojecten.

## Aanbeveling: Oracle Cloud Free Tier (Ampere ARM)

Verreweg de meest genereuze "gratis voor altijd"-tier voor een volledig zelf-gehoste app:

| Resource | Wat je krijgt | Wat de app nodig heeft |
|---|---|---|
| ARM compute | 4 OCPU + 24 GB RAM (Ampere A1) | ~1 OCPU + 1 GB RAM |
| Block storage | 200 GB | ~10 GB |
| Outbound transfer | 10 TB/maand | < 5 GB/maand |
| Public IP | 2 reserved | 1 |
| Load balancer | 10 Mbps gratis | optioneel |

**Trade-offs**:
- ✅ Echt gratis voor altijd, geen credit-card-trucs achteraf
- ✅ Zat capaciteit voor jaren groei
- ⚠️ Account-creatie is omslachtig (BTW-nummer, soms 2x bellen)
- ⚠️ "Out of capacity"-foutmeldingen bij ARM zijn berucht — probeer een ander region of een ander moment van de dag

**Alternatieven die ik heb overwogen**:
- **Eigen NAS (zoals Zuvy)**: simpelst voor jou, maar voor klantwerk minder professioneel (geen 99.9% uptime, je router moet altijd aan, port forwarding nodig)
- **Hetzner CX11** (€4,51/maand): goedkoop maar niet gratis. Hetzner Cloud heeft géén Free Tier.
- **Vercel + Neon Postgres**: gratis, maar Fastify draait niet lekker op serverless en de PPT-sidecar (Python) helemaal niet
- **Render Free**: web service is gratis maar slaapt na 15 min inactiviteit en Postgres free expireert na 90 dagen

## Stap-voor-stap setup

### Stap 1 — Oracle Cloud account

1. Ga naar https://signup.oracle.com/?language=nl (kies Nederland, BTW-nummer is verplicht).
2. Account-verificatie kan 1-2 uur duren. Soms moet je hun support bellen om het aktief te krijgen — frustrerend maar normaal.
3. Log in op https://cloud.oracle.com.

### Stap 2 — VM aanmaken (ARM Ampere)

1. Menu → **Compute → Instances → Create instance**
2. Naam: `snelgescand-prod`
3. Image: **Ubuntu 22.04 Minimal** (ARM64)
4. Shape: kies **"Specialty and previous generation"** → **VM.Standard.A1.Flex**
   - 2 OCPU, 12 GB memory (binnen Always Free)
5. Networking: maak een nieuwe VCN of gebruik de default. **Assign public IPv4: Ja**
6. SSH keys: voeg jouw public key toe (`~/.ssh/id_ed25519.pub`)
7. Boot volume: 50 GB (genoeg voor app + Postgres + PPT-templates)
8. **Create**. Als je "Out of host capacity" krijgt: probeer een andere availability domain (1, 2 of 3), of een andere region.

### Stap 3 — Firewall openen

In Oracle Cloud:
1. **VCN → Security Lists → Default Security List for VCN**
2. **Add Ingress Rules**:
   - Source CIDR `0.0.0.0/0`, TCP, Destination port **80**
   - Source CIDR `0.0.0.0/0`, TCP, Destination port **443**

In de VM zelf (Ubuntu's eigen iptables):
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### Stap 4 — Server-basics installeren

SSH naar de VM met het IP uit Oracle Console:
```bash
ssh ubuntu@<jouw-public-ip>
```

Op de VM:
```bash
# System updaten
sudo apt update && sudo apt upgrade -y

# Node 20, pnpm, Python, Docker, Caddy
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs python3 python3-pip python3-venv git ufw caddy
sudo corepack enable
sudo npm install -g pnpm

# Docker voor Postgres + Redis
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker  # nieuwe groep activeren zonder uitloggen

# Python-pptx voor de PPT-sidecar
pip3 install --user python-pptx
```

### Stap 5 — App deployen

```bash
# Code klonen (of via scp van je laptop uploaden)
mkdir -p ~/apps && cd ~/apps
# Optie A: git
git clone <jouw-repo-url> sportief-opgewekt
# Optie B: scp vanaf laptop:
#   scp sportief-opgewekt-v3.tar.gz ubuntu@<ip>:~/apps/
#   tar -xzf sportief-opgewekt-v3.tar.gz

cd sportief-opgewekt
pnpm install
pnpm --filter @sportief-opgewekt/calc-core build

# Postgres + Redis starten
cd apps/api
cp .env.example .env
# Bewerk .env:
#   - vervang JWT_SECRET en COOKIE_SECRET met `openssl rand -hex 32` (32+ tekens)
#   - DATABASE_URL kun je laten (gaat naar de docker-compose Postgres)
#   - ALLOWED_ORIGINS=https://snelgescand.nl,https://www.snelgescand.nl
#   - COOKIE_DOMAIN=.snelgescand.nl
nano .env

docker compose up -d
pnpm prisma:generate
pnpm prisma:migrate deploy
pnpm tsx src/scripts/seed.ts   # eenmalig — maakt eerste tenant + admin
```

### Stap 6 — Productie-start met systemd

API als systemd-service zodat hij automatisch herstart na reboot:

```bash
sudo nano /etc/systemd/system/sopg-api.service
```

```ini
[Unit]
Description=Sportief Opgewekt API
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/apps/sportief-opgewekt/apps/api
EnvironmentFile=/home/ubuntu/apps/sportief-opgewekt/apps/api/.env
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Frontend builden naar statische bestanden:
```bash
cd ~/apps/sportief-opgewekt/apps/web
pnpm build
# /home/ubuntu/apps/sportief-opgewekt/apps/web/dist is nu een statische SPA
```

Backend builden:
```bash
cd ~/apps/sportief-opgewekt/apps/api
pnpm build
sudo systemctl enable --now sopg-api
sudo systemctl status sopg-api
```

### Stap 7 — Caddy reverse proxy + HTTPS

Caddy regelt HTTPS automatisch via Let's Encrypt (gratis):

```bash
sudo nano /etc/caddy/Caddyfile
```

```caddy
snelgescand.nl, www.snelgescand.nl {
    encode gzip

    # API → Fastify backend
    handle /api/* {
        reverse_proxy localhost:3000
    }

    # Alles anders → statische frontend (SPA)
    handle {
        root * /home/ubuntu/apps/sportief-opgewekt/apps/web/dist
        try_files {path} /index.html
        file_server
    }
}
```

```bash
sudo systemctl reload caddy
sudo systemctl status caddy
```

Caddy haalt nu automatisch een Let's Encrypt-certificaat zodra de DNS klopt (zie `DOMEIN.md`).

### Stap 8 — Backups

Postgres-backup elke nacht naar een tar.gz:

```bash
sudo nano /etc/cron.daily/sopg-backup
```

```bash
#!/bin/bash
set -e
BACKUP_DIR=/home/ubuntu/backups
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec sportief-opgewekt-postgres-1 pg_dump -U sopg sportief_opgewekt | gzip > "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"
# Bewaar laatste 14 dagen
find $BACKUP_DIR -name 'db_*.sql.gz' -mtime +14 -delete
```

```bash
sudo chmod +x /etc/cron.daily/sopg-backup
```

Eens per maand: kopieer de backups naar een tweede plek (S3, Backblaze, of zelfs naar je NAS via rsync).

## Updates uitrollen

```bash
cd ~/apps/sportief-opgewekt
git pull
pnpm install
pnpm --filter @sportief-opgewekt/calc-core build
cd apps/api
pnpm build
pnpm prisma:migrate deploy
sudo systemctl restart sopg-api
cd ../web
pnpm build
# Caddy serveert direct uit dist/, geen restart nodig
```

## Monitoring

Simpele healthcheck-cron:
```bash
*/5 * * * * curl -fs https://snelgescand.nl/api/health > /dev/null || echo "API DOWN" | mail -s "snelgescand down" jouw@email.nl
```

Voor uitgebreidere monitoring (gratis): Uptime Robot, BetterUptime, of een eigen Grafana — maar voor MVP is een cron-pingmail genoeg.

## Vragen die later komen

- **Wanneer migreer ik weg van Free Tier?** Pas als je >20 actieve gebruikers tegelijk hebt of de DB > 5 GB wordt. Dan: Hetzner CX21 (€4,51/maand) is verreweg de beste prijs-prestatie.
- **Wat als ik m'n Oracle-account verlies?** Backups zijn cruciaal. Stap 8 niet overslaan.
- **Worker-process voor PPT-export queues?** Voor MVP niet nodig — synchrone export is < 2 seconden. Pas relevant als je >100 templates per minuut moet renderen.
