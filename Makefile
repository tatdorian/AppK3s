APP_DIR  := $(shell pwd)
API_PORT := $(shell grep -E '^PORT=' apps/api/.env 2>/dev/null | cut -d= -f2 || echo 10112)

.DEFAULT_GOAL := help

# ── Aide ─────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "  \033[1mAppK3s — Commandes disponibles\033[0m"
	@echo ""
	@echo "  \033[1;34mDéploiement\033[0m"
	@echo "  make deploy          Mettre à jour (pull + install + migrate + restart)"
	@echo "  make deploy-fast     Mettre à jour sans git pull"
	@echo "  make restart         Redémarrer les processus PM2"
	@echo ""
	@echo "  \033[1;34mObservabilité\033[0m"
	@echo "  make status          État complet (PM2 + k8s + certificat)"
	@echo "  make logs            Logs temps réel (API + Web)"
	@echo "  make logs-api        Logs API uniquement"
	@echo "  make logs-web        Logs Web uniquement"
	@echo ""
	@echo "  \033[1;34mBase de données\033[0m"
	@echo "  make migrate         Lancer les migrations SQL"
	@echo "  make reset-password  Réinitialiser le mot de passe admin"
	@echo ""
	@echo "  \033[1;34mKubernetes\033[0m"
	@echo "  make k8s-apply       Appliquer tous les manifests k8s"
	@echo "  make k8s-status      État des ressources k8s"
	@echo "  make cert-status     État du certificat TLS"
	@echo ""

# ── Déploiement ───────────────────────────────────────────────────────────────
.PHONY: deploy
deploy:
	@bash $(APP_DIR)/deploy.sh

.PHONY: deploy-fast
deploy-fast:
	@bash $(APP_DIR)/deploy.sh --skip-pull

.PHONY: restart
restart:
	@echo "  Redémarrage PM2..."
	@pm2 reload ecosystem.config.cjs --update-env
	@pm2 list | grep appk3s

# ── Observabilité ─────────────────────────────────────────────────────────────
.PHONY: status
status:
	@echo ""
	@echo "\033[1m── PM2 ────────────────────────────────────────────\033[0m"
	@pm2 list 2>/dev/null | grep -E "appk3s|name" || echo "  PM2 non actif"
	@echo ""
	@echo "\033[1m── API health ─────────────────────────────────────\033[0m"
	@curl -sf http://localhost:$(API_PORT)/health 2>/dev/null \
		&& echo "  ✓ API répond (port $(API_PORT))" \
		|| echo "  ✗ API ne répond pas"
	@echo ""
	@echo "\033[1m── Kubernetes ─────────────────────────────────────\033[0m"
	@kubectl get ingress -A --no-headers 2>/dev/null | sed 's/^/  /' || echo "  kubectl indisponible"
	@echo ""
	@echo "\033[1m── Certificat TLS ─────────────────────────────────\033[0m"
	@kubectl get certificate -n default --no-headers 2>/dev/null | sed 's/^/  /' || echo "  Aucun certificat"
	@echo ""

.PHONY: logs
logs:
	@pm2 logs --lines 50

.PHONY: logs-api
logs-api:
	@pm2 logs appk3s-api

.PHONY: logs-web
logs-web:
	@pm2 logs appk3s-web

# ── Base de données ───────────────────────────────────────────────────────────
.PHONY: migrate
migrate:
	@set -a; source apps/api/.env; set +a; pnpm db:migrate

.PHONY: reset-password
reset-password:
	@read -p "  Nouveau mot de passe : " PWD; \
	HASH=$$(node -e "const b=require('./node_modules/.pnpm/bcryptjs@2.4.3/node_modules/bcryptjs/dist/bcrypt.js');b.hash('$$PWD',12).then(h=>console.log(h))"); \
	docker exec appk3s-postgres-1 psql -U appk3s -d appk3s \
		-c "UPDATE users SET password_hash='$$HASH' WHERE role='admin' RETURNING email" \
	&& echo "  ✓ Mot de passe mis à jour"

# ── Kubernetes ────────────────────────────────────────────────────────────────
.PHONY: k8s-apply
k8s-apply:
	@echo "  Application des manifests k8s..."
	@kubectl apply -f k8s/namespace.yaml        2>/dev/null || true
	@kubectl apply -f k8s/rbac.yaml             2>/dev/null || true
	@kubectl apply -f k8s/letsencrypt-issuer.yaml
	@kubectl apply -f k8s/traefik-redirect-middleware.yaml
	@kubectl apply -f k8s/coredns-override.yaml
	@kubectl apply -f k8s/appk3s-ingress.yaml
	@echo "  ✓ Manifests appliqués"

.PHONY: k8s-status
k8s-status:
	@echo ""
	@echo "\033[1m── Nodes ──────────────────────────────────────────\033[0m"
	@kubectl get nodes -o wide 2>/dev/null | sed 's/^/  /'
	@echo ""
	@echo "\033[1m── Ingress ────────────────────────────────────────\033[0m"
	@kubectl get ingress -A 2>/dev/null | sed 's/^/  /'
	@echo ""
	@echo "\033[1m── Pods (default) ─────────────────────────────────\033[0m"
	@kubectl get pods -n default 2>/dev/null | sed 's/^/  /'
	@echo ""

.PHONY: cert-status
cert-status:
	@echo ""
	@echo "\033[1m── Certificats ────────────────────────────────────\033[0m"
	@kubectl get certificate -A 2>/dev/null | sed 's/^/  /'
	@echo ""
	@echo "\033[1m── Secrets TLS ────────────────────────────────────\033[0m"
	@kubectl get secret -n default --field-selector type=kubernetes.io/tls 2>/dev/null | sed 's/^/  /'
	@echo ""
	@echo "\033[1m── Expiration ─────────────────────────────────────\033[0m"
	@kubectl get secret appk3s-tls -n default -o jsonpath='{.data.tls\.crt}' 2>/dev/null \
		| base64 -d | openssl x509 -noout -dates 2>/dev/null | sed 's/^/  /' \
		|| echo "  Certificat non disponible"
	@echo ""
