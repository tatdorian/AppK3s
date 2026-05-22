#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  AppK3s — Mise à jour en production                                     ║
# ║  Usage : bash deploy.sh [--skip-pull] [--skip-migrate]                  ║
# ╚══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Couleurs ────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

step()  { echo -e "\n${BOLD}${BLUE}▶ $*${NC}"; }
ok()    { echo -e "  ${GREEN}✓${NC} $*"; }
warn()  { echo -e "  ${YELLOW}⚠${NC}  $*"; }
die()   { echo -e "\n${RED}✗ $*${NC}" >&2; exit 1; }

SKIP_PULL=false
SKIP_MIGRATE=false
for arg in "$@"; do
  case $arg in
    --skip-pull)    SKIP_PULL=true ;;
    --skip-migrate) SKIP_MIGRATE=true ;;
  esac
done

START_TIME=$(date +%s)

echo -e "\n${BOLD}AppK3s — Déploiement ${NC}$(date '+%d/%m/%Y %H:%M:%S')"
echo -e "  Répertoire : ${BOLD}${APP_DIR}${NC}\n"

# ── 1. Git pull ──────────────────────────────────────────────────────────────
step "1/4  Mise à jour du code"
if $SKIP_PULL; then
  warn "git pull ignoré (--skip-pull)"
else
  cd "$APP_DIR"
  BEFORE=$(git rev-parse --short HEAD)
  git pull --ff-only origin "$(git rev-parse --abbrev-ref HEAD)"
  AFTER=$(git rev-parse --short HEAD)
  if [[ "$BEFORE" == "$AFTER" ]]; then
    ok "Déjà à jour (${AFTER})"
  else
    ok "Mis à jour : ${BEFORE} → ${AFTER}"
    # Afficher les commits ajoutés
    git log --oneline "${BEFORE}..${AFTER}" | sed 's/^/    /'
  fi
fi

# ── 2. Dépendances ───────────────────────────────────────────────────────────
step "2/4  Dépendances"
cd "$APP_DIR"
pnpm install --frozen-lockfile 2>&1 | grep -E "Already up|Packages|ERR" || true
ok "pnpm install terminé"

# ── 3. Migrations BDD ────────────────────────────────────────────────────────
step "3/4  Base de données"
if $SKIP_MIGRATE; then
  warn "Migration ignorée (--skip-migrate)"
else
  # Charger DATABASE_URL depuis le .env de l'API
  if [[ -f "${APP_DIR}/apps/api/.env" ]]; then
    set -a; source "${APP_DIR}/apps/api/.env"; set +a
  fi
  pnpm db:migrate 2>&1 | tail -5
  ok "Migrations terminées"
fi

# ── 4. Redémarrage PM2 ───────────────────────────────────────────────────────
step "4/4  Redémarrage des services"
pm2 reload ecosystem.config.cjs --update-env
ok "PM2 redémarré (zero-downtime reload)"

# Attendre que l'API réponde
API_PORT=$(grep -E "^PORT=" "${APP_DIR}/apps/api/.env" 2>/dev/null | cut -d= -f2 || echo "10112")
echo -n "  Attente de l'API..."
for i in $(seq 1 20); do
  if curl -sf "http://localhost:${API_PORT}/health" &>/dev/null; then
    echo ""; ok "API opérationnelle (port ${API_PORT})"; break
  fi
  echo -n "."
  sleep 2
  [[ $i -eq 20 ]] && { echo ""; warn "L'API ne répond pas — vérifiez : pm2 logs appk3s-api"; }
done

# ── Résumé ────────────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Déploiement terminé en ${ELAPSED}s ✓${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
pm2 list 2>/dev/null | grep appk3s | sed 's/^/  /'
echo ""
