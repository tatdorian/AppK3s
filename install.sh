#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║         AppK3s — Script d'installation sur Ubuntu vierge                ║
# ║  Usage : sudo bash install.sh                                           ║
# ║  Vars  : DOMAIN, NODE_IP, REPO_URL, APP_DIR, BRANCH                    ║
# ╚══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail
IFS=$'\n\t'

# ── Couleurs ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

step()  { echo -e "\n${BOLD}${BLUE}▶ $*${NC}"; }
ok()    { echo -e "  ${GREEN}✓${NC} $*"; }
warn()  { echo -e "  ${YELLOW}⚠${NC}  $*"; }
die()   { echo -e "\n${RED}✗ ERREUR : $*${NC}" >&2; exit 1; }

# ── Vérifications préliminaires ─────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Lancez le script en root (sudo bash install.sh)"
[[ -f /etc/os-release ]] || die "Système non reconnu (pas d'os-release)"
. /etc/os-release
[[ "$ID" == "ubuntu" ]] || warn "Distribution : $ID (testé sur Ubuntu)"

# ── Variables configurables ──────────────────────────────────────────────────
REPO_URL="${REPO_URL:-https://github.com/tatdorian/AppK3s.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/AppK3s}"
NODE_VERSION="22"
API_PORT="10112"
WEB_PORT="3001"
DB_NAME="appk3s"
DB_USER="appk3s"
DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"

# Détection IP du node (première IP non-loopback)
NODE_IP="${NODE_IP:-$(hostname -I | awk '{print $1}')}"
# Domaine par défaut — utilise nip.io pour un DNS automatique sans config
# (toute adresse X.X.X.X.nip.io résout vers X.X.X.X)
DOMAIN="${DOMAIN:-appk3s.${NODE_IP}.nip.io}"
WILDCARD_DOMAIN="${WILDCARD_DOMAIN:-${NODE_IP}.nip.io}"

# ── Bannière ────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
cat <<'BANNER'
    _             _  _  ___  ___
   / \  _ __  _ | |/ |/ __||_  )
  / _ \| '_ \| '_ \ '3 \__ \ / /
 /_/ \_\ .__/ \__,_/_|_|___//___|
        |_|    Installation
BANNER
echo -e "${NC}"
echo -e "  Node IP   : ${BOLD}${NODE_IP}${NC}"
echo -e "  Domaine   : ${BOLD}${DOMAIN}${NC}"
echo -e "  Répertoire: ${BOLD}${APP_DIR}${NC}"
echo -e "  Repo      : ${BOLD}${REPO_URL}${NC}"
echo ""
read -rp "  Continuer ? [Y/n] " REPLY
[[ "${REPLY:-Y}" =~ ^[Yy]$ ]] || { echo "Annulé."; exit 0; }

# ════════════════════════════════════════════════════════════════════════════
# 1. PAQUETS SYSTÈME
# ════════════════════════════════════════════════════════════════════════════
step "1/9  Paquets système"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl wget git build-essential ca-certificates gnupg lsb-release \
  apt-transport-https software-properties-common \
  openssl jq unzip
ok "Paquets de base installés"

# ════════════════════════════════════════════════════════════════════════════
# 2. NODE.JS (NodeSource officiel — system-wide, pas nvm)
# ════════════════════════════════════════════════════════════════════════════
step "2/9  Node.js ${NODE_VERSION}"

if node --version 2>/dev/null | grep -q "^v${NODE_VERSION}"; then
  ok "Node.js $(node --version) déjà présent"
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y -qq nodejs
  ok "Node.js $(node --version) installé"
fi

# pnpm (gestionnaire de packages)
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm --silent
  ok "pnpm $(pnpm --version) installé"
else
  ok "pnpm $(pnpm --version) déjà présent"
fi

# PM2 (gestionnaire de processus)
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2 --silent
  ok "PM2 $(pm2 --version) installé"
else
  ok "PM2 $(pm2 --version) déjà présent"
fi

# ════════════════════════════════════════════════════════════════════════════
# 3. POSTGRESQL
# ════════════════════════════════════════════════════════════════════════════
step "3/9  PostgreSQL"

if ! command -v psql &>/dev/null; then
  # Dépôt officiel PostgreSQL
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
  echo "deb [arch=$(dpkg --print-architecture)] https://apt.postgresql.org/pub/repos/apt \
    $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -y -qq postgresql-16
  ok "PostgreSQL 16 installé"
else
  ok "PostgreSQL $(psql --version | awk '{print $3}') déjà présent"
fi

systemctl enable postgresql --quiet
systemctl start postgresql

# Création de la base et de l'utilisateur (idempotent)
su - postgres -c "
  psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\" | grep -q 1 \
    || psql -c \"CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}'\"
  psql -tc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\" | grep -q 1 \
    || psql -c \"CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}\"
  psql -c \"GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER}\"
" 2>/dev/null
ok "Base de données '${DB_NAME}' prête"

# ════════════════════════════════════════════════════════════════════════════
# 4. REDIS
# ════════════════════════════════════════════════════════════════════════════
step "4/9  Redis"

if ! command -v redis-server &>/dev/null; then
  curl -fsSL https://packages.redis.io/gpg \
    | gpg --dearmor -o /etc/apt/trusted.gpg.d/redis.gpg
  echo "deb [arch=$(dpkg --print-architecture)] https://packages.redis.io/deb \
    $(lsb_release -cs) main" > /etc/apt/sources.list.d/redis.list
  apt-get update -qq
  apt-get install -y -qq redis
  ok "Redis $(redis-server --version | awk '{print $3}' | tr -d 'v=') installé"
else
  ok "Redis $(redis-server --version | awk '{print $3}' | tr -d 'v=') déjà présent"
fi

systemctl enable redis-server --quiet
systemctl start redis-server
ok "Redis démarré"

# ════════════════════════════════════════════════════════════════════════════
# 5. K3S (cluster kubernetes léger)
# ════════════════════════════════════════════════════════════════════════════
step "5/9  k3s"

if ! command -v k3s &>/dev/null; then
  # Installation k3s single-node (sans Traefik interne pour éviter conflits — on
  # garde le Traefik k3s par défaut car il gère le port 80 via KUBE-SERVICES)
  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
    --write-kubeconfig-mode 644" sh -
  ok "k3s $(k3s --version | head -1) installé"
else
  ok "k3s $(k3s --version | head -1) déjà présent"
fi

# Attendre que k3s soit prêt
echo -n "  Attente de k3s..."
for i in $(seq 1 60); do
  if kubectl get nodes &>/dev/null 2>&1; then
    echo ""
    ok "Cluster k3s opérationnel"
    break
  fi
  echo -n "."
  sleep 3
  [[ $i -eq 60 ]] && die "k3s ne démarre pas après 3 minutes"
done

# KUBECONFIG accessible pour root et utilisateurs sudo
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
chmod 644 /etc/rancher/k3s/k3s.yaml

# Ajout dans /etc/environment pour que ça persiste
grep -q "KUBECONFIG" /etc/environment \
  || echo "KUBECONFIG=/etc/rancher/k3s/k3s.yaml" >> /etc/environment

ok "KUBECONFIG configuré"

# Affichage du node
kubectl get nodes 2>/dev/null | head -3 | sed 's/^/    /'

# ════════════════════════════════════════════════════════════════════════════
# 6. CLONAGE / MISE À JOUR DU REPO
# ════════════════════════════════════════════════════════════════════════════
step "6/9  AppK3s — sources"

if [[ -d "${APP_DIR}/.git" ]]; then
  warn "Répertoire ${APP_DIR} existe — mise à jour (git pull)"
  git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}" 2>/dev/null \
    || warn "git pull échoué — on continue avec la version existante"
else
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
  ok "Repo cloné dans ${APP_DIR}"
fi

# ════════════════════════════════════════════════════════════════════════════
# 7. CONFIGURATION (fichiers .env)
# ════════════════════════════════════════════════════════════════════════════
step "7/9  Configuration"

# .env principal (API)
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

# Sauvegarde des credentials dans un fichier lisible par root uniquement
CREDS_FILE="/root/.appk3s-credentials"
cat > "${CREDS_FILE}" <<EOF
# AppK3s — Credentials générés par install.sh
# NE PAS PARTAGER CE FICHIER
APP_URL=http://${DOMAIN}
NODE_IP=${NODE_IP}
API_PORT=${API_PORT}
WEB_PORT=${WEB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
JWT_SECRET=${JWT_SECRET}
EOF
chmod 600 "${CREDS_FILE}"
ok "Credentials sauvegardés dans ${CREDS_FILE}"

# ════════════════════════════════════════════════════════════════════════════
# 8. INSTALLATION DES DÉPENDANCES + MIGRATIONS
# ════════════════════════════════════════════════════════════════════════════
step "8/9  Dépendances & migrations"

cd "${APP_DIR}"

# Configuration pnpm pour trouver les workspaces
pnpm install --frozen-lockfile 2>&1 | tail -3
ok "pnpm install terminé"

# Migrations base de données
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}" \
  pnpm --filter @appk3s/api db:migrate 2>&1 | tail -3
ok "Migrations BDD terminées"

# ════════════════════════════════════════════════════════════════════════════
# 9. DÉMARRAGE PM2 + INGRESS K3S
# ════════════════════════════════════════════════════════════════════════════
step "9/9  Démarrage des services"

# Arrêt des anciennes instances si elles existent
pm2 delete appk3s-api  2>/dev/null || true
pm2 delete appk3s-web  2>/dev/null || true

# Démarrage avec l'ecosystem
pm2 start "${APP_DIR}/ecosystem.config.cjs"

# Attendre que l'API réponde
echo -n "  Attente de l'API (port ${API_PORT})..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${API_PORT}/health" &>/dev/null; then
    echo ""
    ok "API opérationnelle"
    break
  fi
  echo -n "."
  sleep 2
  [[ $i -eq 30 ]] && { echo ""; warn "L'API ne répond pas encore — vérifiez : pm2 logs appk3s-api"; }
done

# Attendre que le Vite dev server réponde
echo -n "  Attente du serveur web (port ${WEB_PORT})..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${WEB_PORT}" &>/dev/null; then
    echo ""
    ok "Serveur web opérationnel"
    break
  fi
  echo -n "."
  sleep 2
  [[ $i -eq 30 ]] && { echo ""; warn "Le serveur web ne répond pas — vérifiez : pm2 logs appk3s-web"; }
done

# Persistance PM2 au démarrage
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash 2>/dev/null || true
ok "PM2 configuré pour démarrer au boot"

# ── Application des ressources k3s ──────────────────────────────────────────
echo -n "  Application de l'Ingress k3s..."

# Mise à jour du manifeste avec les valeurs réelles
MANIFEST="${APP_DIR}/k8s/appk3s-ingress.yaml"

# Remplace le domaine et l'IP dans le manifeste
sed -i "s|appk3s.w0.app.syit.fr|${DOMAIN}|g"     "${MANIFEST}"
sed -i "s|192.168.188.10|${NODE_IP}|g"              "${MANIFEST}"

kubectl apply -f "${MANIFEST}" &>/dev/null
echo ""
ok "Ingress k3s appliqué pour ${DOMAIN}"

# Attendre que le Traefik k3s soit prêt
echo -n "  Attente de k3s Traefik..."
for i in $(seq 1 30); do
  if kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik \
     --field-selector=status.phase=Running --no-headers 2>/dev/null | grep -q Running; then
    echo ""
    ok "k3s Traefik prêt"
    break
  fi
  echo -n "."
  sleep 3
  [[ $i -eq 30 ]] && { echo ""; warn "Traefik non prêt — essayez dans quelques secondes"; }
done

# Test final de routage
sleep 3
if curl -sf -H "Host: ${DOMAIN}" "http://${NODE_IP}:80/" &>/dev/null; then
  ok "Routage HTTP vérifié ✓"
else
  warn "Test de routage échoué — le routage peut prendre encore quelques secondes"
fi

# ════════════════════════════════════════════════════════════════════════════
# RÉSUMÉ FINAL
# ════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  AppK3s installé avec succès !${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}URL d'accès${NC}"
echo -e "  ├─ Interface  : ${BOLD}http://${DOMAIN}${NC}"
echo -e "  ├─ API        : http://localhost:${API_PORT}"
echo -e "  └─ Web (Vite) : http://localhost:${WEB_PORT}"
echo ""
echo -e "  ${BOLD}Premier compte${NC}"
echo -e "  └─ Créez votre compte admin sur : http://${DOMAIN}/register"
echo -e "     (le premier compte est automatiquement admin)"
echo ""
echo -e "  ${BOLD}Cluster k3s${NC}"
kubectl get nodes 2>/dev/null | sed 's/^/  /'
echo ""
echo -e "  ${BOLD}Processus PM2${NC}"
pm2 list 2>/dev/null | grep appk3s | sed 's/^/  /'
echo ""
echo -e "  ${BOLD}Commandes utiles${NC}"
echo -e "  ├─ Logs API     : pm2 logs appk3s-api"
echo -e "  ├─ Logs Web     : pm2 logs appk3s-web"
echo -e "  ├─ Redémarrage  : pm2 restart all"
echo -e "  ├─ Nodes k3s    : kubectl get nodes"
echo -e "  └─ Credentials  : cat /root/.appk3s-credentials"
echo ""
echo -e "  ${YELLOW}Note DNS${NC} : Le domaine ${DOMAIN} utilise nip.io"
echo -e "  (résolution automatique via IP — fonctionne sans config DNS)"
echo -e "  Pour un vrai domaine, définissez : DOMAIN=mon.domaine.com"
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════${NC}"
