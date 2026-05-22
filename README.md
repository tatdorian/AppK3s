# AppK3s

Interface web self-hosted pour déployer et administrer des applications sur un cluster k3s.
Inspiré de l'UX de Dokploy, générant des ressources Kubernetes natives.

## Architecture

```
apps/
  api/          # Backend Fastify + TypeScript
  web/          # Frontend React + Vite + TailwindCSS
packages/
  shared/       # Types et schemas Zod partagés
k8s/            # Manifests pour déployer AppK3s sur k3s
docker-compose.yml  # PostgreSQL + Redis pour le dev local
```

## Stack

| Couche | Technologie |
|--------|------------|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Backend | Fastify v4 + TypeScript |
| ORM | Drizzle ORM + PostgreSQL |
| Queue | BullMQ + Redis |
| K8s | @kubernetes/client-node (officiel) |
| Auth | JWT (HS256) |

---

## Lancement en local (développement)

### Prérequis

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- `kubectl` configuré sur votre cluster k3s (ou `KUBECONFIG` défini)

### 1. Cloner et installer

```bash
git clone <repo>
cd AppK3s
pnpm install
```

### 2. Variables d'environnement

```bash
cp .env.example apps/api/.env
# Éditez apps/api/.env :
#   DATABASE_URL=postgresql://appk3s:appk3s@localhost:5432/appk3s
#   REDIS_URL=redis://localhost:6379
#   JWT_SECRET=un-secret-d-au-moins-32-caracteres
#   KUBECONFIG=/home/vous/.kube/config   # optionnel si déjà dans PATH
```

### 3. Démarrer PostgreSQL + Redis

```bash
docker compose up -d
```

### 4. Migrer la base de données

```bash
pnpm db:migrate
```

### 5. Créer l'utilisateur admin (première fois)

```bash
# Via l'API (POST /api/auth/register) ou :
cd apps/api && pnpm tsx src/db/seed.ts
# → admin@appk3s.local / admin1234
```

### 6. Lancer les deux serveurs

```bash
# Terminal 1 — API (port 3001)
cd apps/api && pnpm dev

# Terminal 2 — Web (port 3000)
cd apps/web && pnpm dev
```

Accès : http://localhost:3000

---

## Déploiement sur k3s

### 1. Construire et pousser les images

```bash
# Depuis la racine
docker build -f apps/api/Dockerfile -t ghcr.io/YOUR_ORG/appk3s-api:latest .
docker build -f apps/web/Dockerfile -t ghcr.io/YOUR_ORG/appk3s-web:latest .
docker push ghcr.io/YOUR_ORG/appk3s-api:latest
docker push ghcr.io/YOUR_ORG/appk3s-web:latest
```

### 2. Mettre à jour les images dans les manifests

```bash
# k8s/api.yaml et k8s/web.yaml → remplacer "your-org" par votre org
sed -i 's/your-org/YOUR_ORG/g' k8s/api.yaml k8s/web.yaml
```

### 3. Configurer les secrets

```bash
# Éditer k8s/postgres.yaml : changer le mot de passe PostgreSQL
# Éditer k8s/api.yaml : changer JWT_SECRET
# Éditer k8s/ingress.yaml : changer appk3s.example.com par votre domaine
```

### 4. Appliquer les manifests

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/api.yaml
kubectl apply -f k8s/web.yaml
kubectl apply -f k8s/ingress.yaml
```

### 5. Vérifier

```bash
kubectl get pods -n appk3s
kubectl logs -n appk3s -l app=appk3s-api -f
```

### 6. Migrer la DB en cluster

```bash
kubectl exec -n appk3s -it deploy/appk3s-api -- node dist/db/migrate.js
kubectl exec -n appk3s -it deploy/appk3s-api -- node dist/db/seed.js
```

---

## API Reference

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Créer un compte |
| GET | `/api/auth/me` | Profil courant |
| GET | `/api/apps` | Lister les apps |
| POST | `/api/apps` | Créer une app |
| GET | `/api/apps/:id` | Détail d'une app |
| PATCH | `/api/apps/:id` | Modifier une app |
| DELETE | `/api/apps/:id` | Supprimer (k8s + DB) |
| POST | `/api/apps/:id/deploy` | Déployer |
| POST | `/api/apps/:id/start` | Démarrer (scale up) |
| POST | `/api/apps/:id/stop` | Arrêter (scale 0) |
| POST | `/api/apps/:id/restart` | Redémarrer |
| GET | `/api/apps/:id/status` | État k8s (pods) |
| GET | `/api/apps/:id/logs` | Logs (HTTP) |
| WS | `/api/apps/:id/logs/stream` | Logs temps réel |
| GET | `/api/apps/:id/deployments` | Historique des déploiements |

---

## Ressources Kubernetes générées

### Pour une app `docker-image`

```
Namespace/<namespace>          (créé si inexistant)
Secret/<name>-env              (variables d'environnement)
PersistentVolumeClaim/<name>-<vol>  (si volumes configurés)
Deployment/<name>
Service/<name>
Ingress/<name>-ingress         (si subdomain + domain configurés)
```

### Hostname généré

```
subdomain = "myapp"
domain    = "example.com"
→ Ingress host: myapp.example.com
```

### Pour une app `compose`

Chaque service du compose génère :
```
Deployment/<app>-<service>
Service/<app>-<service>
Secret/<app>-<service>-env
```
Chaque volume nommé génère :
```
PersistentVolumeClaim/<app>-<volume>
```

---

## Labels k8s

Toutes les ressources créées par AppK3s portent ces labels :

```yaml
app.kubernetes.io/name: <nom-app>
app.kubernetes.io/managed-by: appk3s
appk3s.io/app-id: <uuid>
```

---

## Structure du projet

```
AppK3s/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── config.ts              # Variables d'env
│   │   │   ├── index.ts               # Serveur Fastify
│   │   │   ├── db/
│   │   │   │   ├── schema.ts          # Drizzle schema
│   │   │   │   ├── index.ts           # Connexion DB
│   │   │   │   ├── migrate.ts         # Runner migrations
│   │   │   │   └── migrations/        # SQL migrations
│   │   │   ├── plugins/
│   │   │   │   └── auth.ts            # Plugin JWT Fastify
│   │   │   ├── routes/
│   │   │   │   ├── apps.ts            # CRUD + actions apps
│   │   │   │   ├── auth.ts            # Login / register / me
│   │   │   │   └── logs.ts            # Logs HTTP + WebSocket
│   │   │   └── services/
│   │   │       ├── kubernetes.service.ts  # Adapter k8s
│   │   │       ├── compose.service.ts     # Parser compose → k8s
│   │   │       └── deployment.service.ts  # Orchestration
│   │   └── Dockerfile
│   └── web/
│       ├── src/
│       │   ├── App.tsx                # Router principal
│       │   ├── lib/
│       │   │   ├── api.ts             # Client Axios
│       │   │   └── utils.ts           # Helpers
│       │   ├── store/auth.ts          # Zustand auth store
│       │   ├── hooks/
│       │   │   ├── useApps.ts         # React Query hooks
│       │   │   └── useLogs.ts         # WebSocket logs
│       │   ├── components/
│       │   │   ├── layout/            # Sidebar + Layout
│       │   │   ├── AppCard.tsx
│       │   │   ├── StatusBadge.tsx
│       │   │   ├── LogsViewer.tsx
│       │   │   └── EnvVarsEditor.tsx
│       │   └── pages/
│       │       ├── Dashboard.tsx
│       │       ├── AppsPage.tsx
│       │       ├── AppDetail.tsx
│       │       ├── CreateApp.tsx
│       │       └── LoginPage.tsx
│       └── Dockerfile
├── packages/
│   └── shared/
│       └── src/
│           ├── types.ts               # Interfaces TypeScript
│           └── schemas.ts             # Validation Zod
├── k8s/
│   ├── namespace.yaml
│   ├── rbac.yaml                      # ServiceAccount + ClusterRole
│   ├── postgres.yaml
│   ├── redis.yaml
│   ├── api.yaml
│   ├── web.yaml
│   └── ingress.yaml
└── docker-compose.yml                 # Dev local
```
