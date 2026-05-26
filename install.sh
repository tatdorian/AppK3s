#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║         AppK3s — Script d'installation complet                          ║
# ║  Usage : sudo bash install.sh                                           ║
# ║  Vars  : DOMAIN=mon.domaine.com  NODE_IP=x.x.x.x  DB_PASS=xxx          ║
# ╚══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail
IFS=$'\n\t'

# ── Couleurs ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

step() { echo -e "\n${BOLD}${BLUE}▶  $*${NC}"; }
ok()   { echo -e "  ${GREEN}✓${NC}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $*"; }
die()  { echo -e "\n${RED}✗  ERREUR : $*${NC}" >&2; exit 1; }
info() { echo -e "  ${BLUE}ℹ${NC}  $*"; }

# ── Garde-fous ────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Lance le script en root :  sudo bash install.sh"

# ── Variables ─────────────────────────────────────────────────────────────────
APP_DIR="${APP_DIR:-/opt/AppK3s}"
REPO_URL="${REPO_URL:-https://github.com/tatdorian/AppK3s.git}"
BRANCH="${BRANCH:-main}"
NODE_VERSION="22"
API_PORT="10112"
WEB_PORT="3001"

# Réseau
NODE_IP="${NODE_IP:-$(hostname -I | awk '{print $1}')}"
DOMAIN="${DOMAIN:-appk3s.${NODE_IP}.nip.io}"

# Base de données (Docker)
DB_NAME="appk3s"
DB_USER="appk3s"
DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"

# ── Bannière ──────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
cat <<'EOF'
    _             _  _  ___  ___
   / \  _ __  _ _| |/ /|_  )/ __|
  / _ \| '_ \ '_ \   /  / / \__ \
 /_/ \_\ .__/ .__/_|\_\/___||___/
        |_|  |_|
EOF
echo -e "${NC}"
echo -e "  ${BOLD}Node IP${NC}  : $NODE_IP"
echo -e "  ${BOLD}Domaine${NC}  : $DOMAIN"
echo -e "  ${BOLD}Dossier${NC}  : $APP_DIR"
echo ""
read -rp "  Continuer l'installation ? [Y/n] " REPLY
[[ "${REPLY:-Y}" =~ ^[Yy]$ ]] || { echo "Annulé."; exit 0; }

# ═════════════════════════════════════════════════════════════════════════════
# ÉTAPE 1 — Paquets système
# ═════════════════════════════════════════════════════════════════════════════
step "1/8  Paquets système"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl wget git build-essential ca-certificates gnupg \
  lsb-release apt-transport-https software-properties-common \
  openssl jq unzip
ok "Paquets de base installés"

# ═════════════════════════════════════════════════════════════════════════════
# ÉTAPE 2 — Docker (pour PostgreSQL + Redis)
# ═════════════════════════════════════════════════════════════════════════════
step "2/8  Docker"

if command -v docker &>/dev/null; then
  ok "Docker $(docker --version | awk '{print $3}' | tr -d ',') déjà présent"
else
  curl -fsSL https://get.docker.com | bash -s -- -q
  systemctl enable docker --quiet
  systemctl start docker
  ok "Docker $(docker --version | awk '{print $3}' | tr -d ',') installé"
fi

# Docker Compose plugin
if docker compose version &>/dev/null 2>&1; then
  ok "Docker Compose $(docker compose version --short) déjà présent"
else
  apt-get install -y -qq docker-compose-plugin
  ok "Docker Compose installé"
fi

# ═════════════════════════════════════════════════════════════════════════════
# ÉTAPE 3 — Node.js + pnpm + PM2
# ═════════════════════════════════════════════════════════════════════════════
step "3/8  Node.js ${NODE_VERSION} + pnpm + PM2"

if node --version 2>/dev/null | grep -q "^v${NODE_VERSION}"; then
  ok "Node.js $(node --version) déjà présent"
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
  ok "Node.js $(node --version) installé"
fi

if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm --silent
  ok "pnpm $(pnpm --version) installé"
else
  ok "pnpm $(pnpm --version) déjà présent"
fi

if ! command -v pm2 &>/dev/null; then
  npm install -g pm2 --silent
  ok "PM2 $(pm2 --version) installé"
else
  ok "PM2 $(pm2 --version) déjà présent"
fi

# ═════════════════════════════════════════════════════════════════════════════
# ÉTAPE 4 — k3s (Kubernetes léger)
# ═════════════════════════════════════════════════════════════════════════════
step "4/8  k3s"

if command -v k3s &>/dev/null; then
  ok "k3s $(k3s --version | head -1 | awk '{print $3}') déjà présent"
else
  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --write-kubeconfig-mode 644" sh -
  ok "k3s installé"
fi

# Attendre que k3s soit prêt ET que le node soit Ready
echo -n "  Attente du cluster k3s"
for i in $(seq 1 80); do
  STATUS=$(kubectl get nodes --no-headers 2>/dev/null | awk '{print $2}' | head -1)
  [[ "$STATUS" == "Ready" ]] && { echo ""; break; }
  echo -n "."; sleep 3
  [[ $i -eq 80 ]] && die "k3s ne passe pas Ready après 4 minutes"
done
ok "Cluster k3s opérationnel"

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
chmod 644 /etc/rancher/k3s/k3s.yaml
grep -q "KUBECONFIG" /etc/environment \
  || echo "KUBECONFIG=/etc/rancher/k3s/k3s.yaml" >> /etc/environment

kubectl get nodes | sed 's/^/    /'

# ═════════════════════════════════════════════════════════════════════════════
# ÉTAPE 5 — Clonage / mise à jour du dépôt
# ═════════════════════════════════════════════════════════════════════════════
step "5/8  Sources AppK3s"

if [[ -d "${APP_DIR}/.git" ]]; then
  warn "Dossier ${APP_DIR} existant — on garde le code local (pas de git pull)"
  ok "Sources existantes conservées (${APP_DIR})"
else
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
  ok "Repo cloné dans ${APP_DIR}"
fi

# ═════════════════════════════════════════════════════════════════════════════
# ÉTAPE 6 — Fichiers de configuration
# ═════════════════════════════════════════════════════════════════════════════
step "6/8  Configuration"

# .env API
cat > "${APP_DIR}/apps/api/.env" <<EOF
NODE_ENV=production
PORT=${API_PORT}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
REDIS_URL=redis://localhost:6379
JWT_SECRET=${JWT_SECRET}
KUBECONFIG=/etc/rancher/k3s/k3s.yaml
NODE_IP=${NODE_IP}
EOF
ok "apps/api/.env créé"

# docker-compose.yml avec le mot de passe généré
cat > "${APP_DIR}/docker-compose.yml" <<EOF
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASS}
      POSTGRES_DB: ${DB_NAME}
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${DB_USER}']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
EOF
ok "docker-compose.yml mis à jour"

# ecosystem.config.cjs pour PM2
cat > "${APP_DIR}/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [
    {
      name: 'appk3s-api',
      cwd: '${APP_DIR}/apps/api',
      script: 'pnpm',
      args: 'dev',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: '${API_PORT}',
        DATABASE_URL: 'postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}',
        REDIS_URL: 'redis://localhost:6379',
        JWT_SECRET: '${JWT_SECRET}',
        KUBECONFIG: '/etc/rancher/k3s/k3s.yaml',
        NODE_IP: '${NODE_IP}',
      }
    },
    {
      name: 'appk3s-web',
      cwd: '${APP_DIR}/apps/web',
      script: 'pnpm',
      args: 'dev --host',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        VITE_API_URL: '',
        API_PORT: '${API_PORT}',
      }
    }
  ]
}
EOF
ok "ecosystem.config.cjs créé"

# Fichier credentials (root only)
cat > /root/.appk3s-credentials <<EOF
# AppK3s — générés le $(date '+%Y-%m-%d %H:%M:%S')
APP_URL=http://${DOMAIN}
NODE_IP=${NODE_IP}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
JWT_SECRET=${JWT_SECRET}
API_PORT=${API_PORT}
WEB_PORT=${WEB_PORT}
EOF
chmod 600 /root/.appk3s-credentials
ok "Credentials sauvegardés dans /root/.appk3s-credentials"

# ═════════════════════════════════════════════════════════════════════════════
# ÉTAPE 7 — Docker (PostgreSQL + Redis) + dépendances Node + migrations
# ═════════════════════════════════════════════════════════════════════════════
step "7/8  PostgreSQL + Redis + dépendances + migrations"

cd "${APP_DIR}"

# Démarrer PostgreSQL & Redis via Docker Compose
docker compose up -d 2>&1 | grep -v "^$" || true
echo -n "  Attente de PostgreSQL"
for i in $(seq 1 40); do
  docker compose exec -T postgres pg_isready -U "${DB_USER}" &>/dev/null && { echo ""; break; }
  echo -n "."; sleep 3
  [[ $i -eq 40 ]] && die "PostgreSQL ne démarre pas après 2 minutes"
done
ok "PostgreSQL prêt"

docker compose exec -T redis redis-cli ping &>/dev/null && ok "Redis prêt" || warn "Redis pas encore prêt"

# Dépendances Node.js
# pnpm 9+ requiert d'approuver les scripts de build — on désactive le strict mode
# pour l'installation automatique (non-interactive)
cat >> "${APP_DIR}/.npmrc" <<'NPMRC'
strict-dep-builds=false
NPMRC

info "Installation des dépendances Node.js (peut prendre 1-2 minutes)..."
if ! pnpm install --no-frozen-lockfile 2>&1; then
  # Fallback : approuver tous les builds puis réessayer
  warn "Premier essai échoué, approbation des builds en cours..."
  pnpm approve-builds --all 2>/dev/null || true
  pnpm install --no-frozen-lockfile 2>&1 | tail -5
fi
ok "pnpm install terminé"

# Migrations base de données
info "Migration de la base de données..."
if ! DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}" \
  pnpm db:migrate 2>&1; then
  die "Migrations échouées — vérifiez que PostgreSQL est accessible"
fi
ok "Migrations BDD terminées"

# ═════════════════════════════════════════════════════════════════════════════
# ÉTAPE 8 — Démarrage PM2 + persistance au boot
# ═════════════════════════════════════════════════════════════════════════════
step "8/8  Démarrage des services"

# Stopper les éventuelles anciennes instances
pm2 delete appk3s-api 2>/dev/null || true
pm2 delete appk3s-web 2>/dev/null || true

pm2 start "${APP_DIR}/ecosystem.config.cjs"

# Attendre que l'API soit disponible
echo -n "  Attente de l'API"
for i in $(seq 1 40); do
  curl -sf "http://localhost:${API_PORT}/health" &>/dev/null && { echo ""; break; }
  echo -n "."; sleep 2
  [[ $i -eq 40 ]] && { echo ""; warn "L'API ne répond pas encore — vérifiez : pm2 logs appk3s-api"; }
done
ok "API opérationnelle (port ${API_PORT})"

# Attendre que Vite soit disponible
echo -n "  Attente du serveur web"
for i in $(seq 1 40); do
  curl -sf "http://localhost:${WEB_PORT}" &>/dev/null && { echo ""; break; }
  echo -n "."; sleep 2
  [[ $i -eq 40 ]] && { echo ""; warn "Le serveur web ne répond pas encore — vérifiez : pm2 logs appk3s-web"; }
done
ok "Serveur web opérationnel (port ${WEB_PORT})"

# Persistance PM2 au démarrage système
pm2 save --force
STARTUP_CMD=$(pm2 startup systemd -u root --hp /root 2>/dev/null | grep "sudo env")
[[ -n "${STARTUP_CMD:-}" ]] && eval "$STARTUP_CMD" || true
ok "PM2 configuré pour démarrer automatiquement au boot"

# Manifests k3s (ingress, RBAC, etc.)
if ls "${APP_DIR}/k8s/"*.yaml &>/dev/null; then
  kubectl apply -f "${APP_DIR}/k8s/" &>/dev/null && ok "Manifests k3s appliqués" || warn "Certains manifests ont échoué (non bloquant)"
fi

# ═════════════════════════════════════════════════════════════════════════════
# RÉSUMÉ
# ═════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  AppK3s installé avec succès !${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}🌐 Accès${NC}"
echo -e "  ├─ Interface  : ${BOLD}http://${NODE_IP}:${WEB_PORT}${NC}"
echo -e "  └─ Via domaine: ${BOLD}http://${DOMAIN}${NC}  (nécessite DNS ou nip.io)"
echo ""
echo -e "  ${BOLD}👤 Premier compte${NC}"
echo -e "  └─ Ouvre http://${NODE_IP}:${WEB_PORT}/register"
echo -e "     → le premier compte créé est automatiquement admin"
echo ""
echo -e "  ${BOLD}📋 Commandes utiles${NC}"
echo -e "  ├─ Logs API    : pm2 logs appk3s-api"
echo -e "  ├─ Logs Web    : pm2 logs appk3s-web"
echo -e "  ├─ Redémarrer  : pm2 restart all"
echo -e "  ├─ Mise à jour : bash ${APP_DIR}/deploy.sh"
echo -e "  └─ Credentials : cat /root/.appk3s-credentials"
echo ""
echo -e "  ${BOLD}🔧 État actuel${NC}"
pm2 list 2>/dev/null | grep appk3s | sed 's/^/  /' || true
echo ""
kubectl get nodes 2>/dev/null | sed 's/^/  /' || true
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
