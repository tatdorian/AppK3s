import type { CreateAppInput } from './schemas.js';

export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  category: 'web' | 'database' | 'storage' | 'monitoring' | 'devops' | 'productivity' | 'media' | 'auth' | 'stack';
  icon: string; // emoji
  defaults: Omit<CreateAppInput, 'name' | 'subdomain' | 'domain' | 'tlsEnabled' | 'namespace'>;
  docs?: string;
  requiredEnv?: string[]; // env vars the user must fill
}

export const TEMPLATES: AppTemplate[] = [

  // ── Web ──────────────────────────────────────────────────────────────────────
  {
    id: 'nginx',
    name: 'Nginx',
    description: 'Serveur web statique haute performance.',
    category: 'web',
    icon: '🌐',
    docs: 'https://hub.docker.com/_/nginx',
    defaults: {
      type: 'docker-image',
      image: 'nginx',
      imageTag: 'alpine',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [],
      volumes: [{ name: 'html', mountPath: '/usr/share/nginx/html', size: '1Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'caddy',
    name: 'Caddy',
    description: 'Serveur web moderne avec HTTPS automatique.',
    category: 'web',
    icon: '🔒',
    docs: 'https://hub.docker.com/_/caddy',
    defaults: {
      type: 'docker-image',
      image: 'caddy',
      imageTag: 'alpine',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [],
      volumes: [
        { name: 'config', mountPath: '/config', size: '1Gi' },
        { name: 'data', mountPath: '/data', size: '1Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    description: 'CMS open-source le plus populaire au monde.',
    category: 'web',
    icon: '📝',
    docs: 'https://hub.docker.com/_/wordpress',
    requiredEnv: ['WORDPRESS_DB_HOST', 'WORDPRESS_DB_USER', 'WORDPRESS_DB_PASSWORD', 'WORDPRESS_DB_NAME'],
    defaults: {
      type: 'docker-image',
      image: 'wordpress',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [
        { key: 'WORDPRESS_DB_HOST', value: 'mysql:3306' },
        { key: 'WORDPRESS_DB_USER', value: 'wordpress' },
        { key: 'WORDPRESS_DB_PASSWORD', value: 'changeme' },
        { key: 'WORDPRESS_DB_NAME', value: 'wordpress' },
      ],
      volumes: [{ name: 'data', mountPath: '/var/www/html', size: '5Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'ghost',
    name: 'Ghost',
    description: 'Plateforme de blogging et publication moderne.',
    category: 'web',
    icon: '👻',
    docs: 'https://hub.docker.com/_/ghost',
    requiredEnv: ['url'],
    defaults: {
      type: 'docker-image',
      image: 'ghost',
      imageTag: 'alpine',
      ports: [{ containerPort: 2368, protocol: 'TCP' }],
      envVars: [
        { key: 'NODE_ENV', value: 'production' },
        { key: 'database__client', value: 'sqlite3' },
        { key: 'database__connection__filename', value: '/var/lib/ghost/content/data/ghost.db' },
        // ⚠️  Doit correspondre à l'URL publique réelle (ex: https://blog.example.com)
        // Un mauvais URL casse les redirections, les emails et les liens canoniques.
        { key: 'url', value: 'https://ghost.example.com' },
      ],
      volumes: [{ name: 'content', mountPath: '/var/lib/ghost/content', size: '5Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'wikijs',
    name: 'Wiki.js',
    description: 'Wiki moderne et puissant avec éditeur riche.',
    category: 'web',
    icon: '📖',
    docs: 'https://hub.docker.com/r/requarks/wiki',
    requiredEnv: ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'],
    defaults: {
      type: 'docker-image',
      image: 'requarks/wiki',
      imageTag: 'latest',
      ports: [{ containerPort: 3000, protocol: 'TCP' }],
      envVars: [
        { key: 'DB_TYPE', value: 'postgres' },
        { key: 'DB_HOST', value: 'postgres' },
        { key: 'DB_PORT', value: '5432' },
        { key: 'DB_USER', value: 'wiki' },
        { key: 'DB_PASS', value: 'changeme' },
        { key: 'DB_NAME', value: 'wiki' },
      ],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'bookstack',
    name: 'BookStack',
    description: 'Documentation structurée en livres, chapitres et pages.',
    category: 'web',
    icon: '📚',
    docs: 'https://hub.docker.com/r/linuxserver/bookstack',
    requiredEnv: ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_DATABASE', 'APP_URL'],
    defaults: {
      type: 'docker-image',
      image: 'linuxserver/bookstack',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [
        { key: 'APP_URL', value: 'https://bookstack.example.com' },
        { key: 'DB_HOST', value: 'mysql' },
        { key: 'DB_USER', value: 'bookstack' },
        { key: 'DB_PASS', value: 'changeme' },
        { key: 'DB_DATABASE', value: 'bookstack' },
        { key: 'PUID', value: '1000' },
        { key: 'PGID', value: '1000' },
      ],
      volumes: [{ name: 'data', mountPath: '/config', size: '5Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'outline',
    name: 'Outline',
    description: 'Wiki collaboratif et gestionnaire de connaissances.',
    category: 'web',
    icon: '🗂️',
    docs: 'https://hub.docker.com/r/outlinewiki/outline',
    requiredEnv: ['SECRET_KEY', 'UTILS_SECRET', 'DATABASE_URL', 'REDIS_URL'],
    defaults: {
      type: 'docker-image',
      image: 'outlinewiki/outline',
      imageTag: 'latest',
      ports: [{ containerPort: 3000, protocol: 'TCP' }],
      envVars: [
        { key: 'NODE_ENV', value: 'production' },
        { key: 'SECRET_KEY', value: 'generate-a-random-32-char-string-here' },
        { key: 'UTILS_SECRET', value: 'generate-another-random-string-here' },
        { key: 'DATABASE_URL', value: 'postgres://user:pass@postgres:5432/outline' },
        { key: 'REDIS_URL', value: 'redis://redis:6379' },
        { key: 'URL', value: 'https://outline.example.com' },
        { key: 'PORT', value: '3000' },
        { key: 'FILE_STORAGE', value: 'local' },
      ],
      volumes: [{ name: 'data', mountPath: '/var/lib/outline/data', size: '10Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'freshrss',
    name: 'FreshRSS',
    description: 'Agrégateur RSS auto-hébergé léger et performant.',
    category: 'web',
    icon: '📰',
    docs: 'https://hub.docker.com/r/freshrss/freshrss',
    defaults: {
      type: 'docker-image',
      image: 'freshrss/freshrss',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [
        { key: 'TZ', value: 'Europe/Paris' },
        { key: 'CRON_MIN', value: '3,33' },
      ],
      volumes: [{ name: 'data', mountPath: '/var/www/FreshRSS/data', size: '2Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'wallabag',
    name: 'Wallabag',
    description: 'Application de lecture différée et sauvegarde d\'articles.',
    category: 'web',
    icon: '🔖',
    docs: 'https://hub.docker.com/r/wallabag/wallabag',
    defaults: {
      type: 'docker-image',
      image: 'wallabag/wallabag',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [
        { key: 'SYMFONY__ENV__DATABASE_DRIVER', value: 'pdo_sqlite' },
        { key: 'SYMFONY__ENV__DATABASE_PATH', value: '/var/www/wallabag/data/db/wallabag.sqlite' },
        { key: 'SYMFONY__ENV__MAILER_HOST', value: '127.0.0.1' },
        { key: 'SYMFONY__ENV__FROM_EMAIL', value: 'wallabag@example.com' },
      ],
      volumes: [{ name: 'data', mountPath: '/var/www/wallabag/data', size: '5Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'linkding',
    name: 'Linkding',
    description: 'Gestionnaire de marque-pages minimaliste auto-hébergé.',
    category: 'web',
    icon: '🔗',
    docs: 'https://github.com/sissbruecker/linkding',
    defaults: {
      type: 'docker-image',
      image: 'sissbruecker/linkding',
      imageTag: 'latest',
      ports: [{ containerPort: 9090, protocol: 'TCP' }],
      envVars: [
        { key: 'LD_SUPERUSER_NAME', value: 'admin' },
        { key: 'LD_SUPERUSER_PASSWORD', value: 'changeme' },
      ],
      volumes: [{ name: 'data', mountPath: '/etc/linkding/data', size: '2Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'homer',
    name: 'Homer',
    description: 'Dashboard de démarrage statique ultra-léger.',
    category: 'web',
    icon: '🏠',
    docs: 'https://hub.docker.com/r/b4bz/homer',
    defaults: {
      type: 'docker-image',
      image: 'b4bz/homer',
      imageTag: 'latest',
      ports: [{ containerPort: 8080, protocol: 'TCP' }],
      envVars: [
        { key: 'INIT_ASSETS', value: '1' },
      ],
      volumes: [{ name: 'assets', mountPath: '/www/assets', size: '1Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'heimdall',
    name: 'Heimdall',
    description: 'Dashboard d\'applications avec tuiles personnalisables.',
    category: 'web',
    icon: '🧭',
    docs: 'https://hub.docker.com/r/linuxserver/heimdall',
    defaults: {
      type: 'docker-image',
      image: 'linuxserver/heimdall',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [
        { key: 'PUID', value: '1000' },
        { key: 'PGID', value: '1000' },
        { key: 'TZ', value: 'Europe/Paris' },
      ],
      volumes: [{ name: 'config', mountPath: '/config', size: '1Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'stirling-pdf',
    name: 'Stirling PDF',
    description: 'Boîte à outils PDF complète : fusion, split, conversion.',
    category: 'web',
    icon: '📄',
    docs: 'https://hub.docker.com/r/stirlingtools/stirling-pdf',
    defaults: {
      type: 'docker-image',
      image: 'stirlingtools/stirling-pdf',
      imageTag: 'latest',
      ports: [{ containerPort: 8080, protocol: 'TCP' }],
      envVars: [
        { key: 'DOCKER_ENABLE_SECURITY', value: 'false' },
        { key: 'LANGS', value: 'fr_FR' },
      ],
      volumes: [
        { name: 'configs', mountPath: '/configs', size: '1Gi' },
        { name: 'customfiles', mountPath: '/customFiles', size: '1Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'penpot',
    name: 'Penpot',
    description: 'Outil de design open-source (alternative à Figma). Stack complète : frontend, backend, exporteur, PostgreSQL et Redis.',
    category: 'stack',
    icon: '🎨',
    docs: 'https://help.penpot.app/technical-guide/getting-started/',
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      // ⚠️  Le nom de l'app DOIT rester "penpot" (valeur par défaut) pour que
      //     l'ingress nginx du frontend résolve penpot-backend et penpot-exporter.
      composeContent: `version: "3.8"
services:
  # Frontends nginx — port d'entrée exposé à l'ingress
  frontend:
    image: penpotapp/frontend:latest
    ports:
      - "80:80"
    environment:
      PENPOT_FLAGS: enable-login-with-password
    depends_on:
      - backend
      - exporter
    volumes:
      - penpot_assets:/opt/data/assets

  # Backend API (interne, port 6060)
  backend:
    image: penpotapp/backend:latest
    environment:
      PENPOT_FLAGS: enable-login-with-password
      PENPOT_DATABASE_URI: postgresql://postgres:5432/penpot
      PENPOT_DATABASE_USERNAME: penpot
      PENPOT_DATABASE_PASSWORD: penpotpassword
      PENPOT_REDIS_URI: redis://redis/0
      PENPOT_ASSETS_STORAGE_BACKEND: assets-fs
      PENPOT_STORAGE_ASSETS_FS_DIRECTORY: /opt/data/assets
      PENPOT_TELEMETRY_ENABLED: "false"
    depends_on:
      - postgres
      - redis
    volumes:
      - penpot_assets:/opt/data/assets

  # Exporteur PDF/SVG (interne, port 6061)
  exporter:
    image: penpotapp/exporter:latest
    environment:
      PENPOT_PUBLIC_URI: http://frontend
      PENPOT_REDIS_URI: redis://redis/0
    depends_on:
      - redis

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_INITDB_ARGS: --data-checksums
      POSTGRES_DB: penpot
      POSTGRES_USER: penpot
      POSTGRES_PASSWORD: penpotpassword
    volumes:
      - penpot_postgres:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  penpot_assets:
  penpot_postgres:
`,
    },
  },

  // ── Databases ─────────────────────────────────────────────────────────────
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Base de données relationnelle open-source avancée.',
    category: 'database',
    icon: '🐘',
    docs: 'https://hub.docker.com/_/postgres',
    requiredEnv: ['POSTGRES_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'postgres',
      imageTag: '16-alpine',
      ports: [{ containerPort: 5432, protocol: 'TCP' }],
      envVars: [
        { key: 'POSTGRES_USER', value: 'postgres' },
        { key: 'POSTGRES_PASSWORD', value: 'changeme' },
        { key: 'POSTGRES_DB', value: 'app' },
      ],
      volumes: [{ name: 'data', mountPath: '/var/lib/postgresql/data', size: '10Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'mysql',
    name: 'MySQL',
    description: 'Base de données relationnelle MySQL.',
    category: 'database',
    icon: '🐬',
    docs: 'https://hub.docker.com/_/mysql',
    requiredEnv: ['MYSQL_ROOT_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'mysql',
      imageTag: '8.0',
      ports: [{ containerPort: 3306, protocol: 'TCP' }],
      envVars: [
        { key: 'MYSQL_ROOT_PASSWORD', value: 'changeme' },
        { key: 'MYSQL_DATABASE', value: 'app' },
        { key: 'MYSQL_USER', value: 'app' },
        { key: 'MYSQL_PASSWORD', value: 'changeme' },
      ],
      volumes: [{ name: 'data', mountPath: '/var/lib/mysql', size: '10Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'mariadb',
    name: 'MariaDB',
    description: 'Fork communautaire de MySQL, compatible et performant.',
    category: 'database',
    icon: '🦭',
    docs: 'https://hub.docker.com/_/mariadb',
    requiredEnv: ['MYSQL_ROOT_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'mariadb',
      imageTag: '11',
      ports: [{ containerPort: 3306, protocol: 'TCP' }],
      envVars: [
        { key: 'MYSQL_ROOT_PASSWORD', value: 'changeme' },
        { key: 'MYSQL_DATABASE', value: 'app' },
        { key: 'MYSQL_USER', value: 'app' },
        { key: 'MYSQL_PASSWORD', value: 'changeme' },
      ],
      volumes: [{ name: 'data', mountPath: '/var/lib/mysql', size: '10Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'redis',
    name: 'Redis',
    description: 'Cache et store de données en mémoire ultra-rapide.',
    category: 'database',
    icon: '⚡',
    docs: 'https://hub.docker.com/_/redis',
    defaults: {
      type: 'docker-image',
      image: 'redis',
      imageTag: '7-alpine',
      ports: [{ containerPort: 6379, protocol: 'TCP' }],
      envVars: [],
      volumes: [{ name: 'data', mountPath: '/data', size: '2Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'Base de données orientée documents NoSQL.',
    category: 'database',
    icon: '🍃',
    docs: 'https://hub.docker.com/_/mongo',
    defaults: {
      type: 'docker-image',
      image: 'mongo',
      imageTag: '7',
      ports: [{ containerPort: 27017, protocol: 'TCP' }],
      envVars: [
        { key: 'MONGO_INITDB_ROOT_USERNAME', value: 'admin' },
        { key: 'MONGO_INITDB_ROOT_PASSWORD', value: 'changeme' },
      ],
      volumes: [{ name: 'data', mountPath: '/data/db', size: '10Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'influxdb',
    name: 'InfluxDB',
    description: 'Base de données time-series pour métriques et IoT.',
    category: 'database',
    icon: '📊',
    docs: 'https://hub.docker.com/_/influxdb',
    requiredEnv: ['DOCKER_INFLUXDB_INIT_PASSWORD', 'DOCKER_INFLUXDB_INIT_ADMIN_TOKEN'],
    defaults: {
      type: 'docker-image',
      image: 'influxdb',
      imageTag: '2',
      ports: [{ containerPort: 8086, protocol: 'TCP' }],
      envVars: [
        { key: 'DOCKER_INFLUXDB_INIT_MODE', value: 'setup' },
        { key: 'DOCKER_INFLUXDB_INIT_USERNAME', value: 'admin' },
        { key: 'DOCKER_INFLUXDB_INIT_PASSWORD', value: 'changeme123' },
        { key: 'DOCKER_INFLUXDB_INIT_ORG', value: 'myorg' },
        { key: 'DOCKER_INFLUXDB_INIT_BUCKET', value: 'metrics' },
        { key: 'DOCKER_INFLUXDB_INIT_ADMIN_TOKEN', value: 'my-super-secret-token' },
      ],
      volumes: [{ name: 'data', mountPath: '/var/lib/influxdb2', size: '10Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'elasticsearch',
    name: 'Elasticsearch',
    description: 'Moteur de recherche et d\'analyse distribué.',
    category: 'database',
    icon: '🔍',
    docs: 'https://hub.docker.com/_/elasticsearch',
    defaults: {
      type: 'docker-image',
      image: 'elasticsearch',
      imageTag: '8.12.0',
      ports: [{ containerPort: 9200, protocol: 'TCP' }],
      envVars: [
        { key: 'discovery.type', value: 'single-node' },
        { key: 'xpack.security.enabled', value: 'false' },
        { key: 'ES_JAVA_OPTS', value: '-Xms512m -Xmx512m' },
      ],
      volumes: [{ name: 'data', mountPath: '/usr/share/elasticsearch/data', size: '10Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'adminer',
    name: 'Adminer',
    description: 'Interface web légère pour gérer toutes vos bases de données.',
    category: 'database',
    icon: '🛠️',
    docs: 'https://hub.docker.com/_/adminer',
    defaults: {
      type: 'docker-image',
      image: 'adminer',
      imageTag: 'latest',
      ports: [{ containerPort: 8080, protocol: 'TCP' }],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'pgadmin',
    name: 'pgAdmin',
    description: 'Interface web d\'administration PostgreSQL.',
    category: 'database',
    icon: '🐘',
    docs: 'https://hub.docker.com/r/dpage/pgadmin4',
    requiredEnv: ['PGADMIN_DEFAULT_EMAIL', 'PGADMIN_DEFAULT_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'dpage/pgadmin4',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [
        { key: 'PGADMIN_DEFAULT_EMAIL', value: 'admin@example.com' },
        { key: 'PGADMIN_DEFAULT_PASSWORD', value: 'changeme' },
      ],
      volumes: [{ name: 'data', mountPath: '/var/lib/pgadmin', size: '1Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },

  // ── Storage ────────────────────────────────────────────────────────────────
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    description: 'Suite collaborative : fichiers, calendrier, contacts.',
    category: 'storage',
    icon: '☁️',
    docs: 'https://hub.docker.com/_/nextcloud',
    defaults: {
      type: 'docker-image',
      image: 'nextcloud',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [
        { key: 'NEXTCLOUD_ADMIN_USER', value: 'admin' },
        { key: 'NEXTCLOUD_ADMIN_PASSWORD', value: 'changeme' },
      ],
      volumes: [{ name: 'data', mountPath: '/var/www/html', size: '20Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'minio',
    name: 'MinIO',
    description: 'Stockage objet S3-compatible haute performance. Console web sur :9001, API S3 sur :9000.',
    category: 'storage',
    icon: '🗄️',
    docs: 'https://hub.docker.com/r/minio/minio',
    requiredEnv: ['MINIO_ROOT_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'minio/minio',
      imageTag: 'latest',
      // Port 9001 = console web (ingress), port 9000 = API S3
      // MINIO_CONSOLE_ADDRESS est OBLIGATOIRE : sans lui MinIO choisit
      // un port aléatoire pour la console et le NodePort 9001 reste vide.
      ports: [
        { containerPort: 9001, protocol: 'TCP' },  // console UI → ingress
        { containerPort: 9000, protocol: 'TCP' },  // S3 API
      ],
      envVars: [
        { key: 'MINIO_ROOT_USER', value: 'admin' },
        { key: 'MINIO_ROOT_PASSWORD', value: 'changeme123' },
        { key: 'MINIO_CONSOLE_ADDRESS', value: ':9001' },
      ],
      volumes: [{ name: 'data', mountPath: '/data', size: '20Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'filebrowser',
    name: 'FileBrowser',
    description: 'Gestionnaire de fichiers web minimaliste.',
    category: 'storage',
    icon: '📁',
    docs: 'https://hub.docker.com/r/filebrowser/filebrowser',
    defaults: {
      type: 'docker-image',
      image: 'filebrowser/filebrowser',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [],
      volumes: [
        { name: 'data', mountPath: '/srv', size: '20Gi' },
        { name: 'config', mountPath: '/database', size: '1Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'syncthing',
    name: 'Syncthing',
    description: 'Synchronisation de fichiers P2P open-source et sécurisée.',
    category: 'storage',
    icon: '🔄',
    docs: 'https://hub.docker.com/r/syncthing/syncthing',
    defaults: {
      type: 'docker-image',
      image: 'syncthing/syncthing',
      imageTag: 'latest',
      ports: [
        { containerPort: 8384, protocol: 'TCP' },
        { containerPort: 22000, protocol: 'TCP' },
      ],
      envVars: [
        { key: 'PUID', value: '1000' },
        { key: 'PGID', value: '1000' },
      ],
      volumes: [
        { name: 'config', mountPath: '/var/syncthing', size: '1Gi' },
        { name: 'data', mountPath: '/data', size: '50Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'seafile',
    name: 'Seafile',
    description: 'Plateforme de partage de fichiers cloud enterprise.',
    category: 'storage',
    icon: '🌊',
    docs: 'https://hub.docker.com/r/seafileltd/seafile-mc',
    requiredEnv: ['SEAFILE_ADMIN_EMAIL', 'SEAFILE_ADMIN_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'seafileltd/seafile-mc',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [
        { key: 'SEAFILE_SERVER_LETSENCRYPT', value: 'false' },
        { key: 'SEAFILE_ADMIN_EMAIL', value: 'admin@example.com' },
        { key: 'SEAFILE_ADMIN_PASSWORD', value: 'changeme' },
      ],
      volumes: [{ name: 'data', mountPath: '/shared', size: '50Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },

  // ── Monitoring ────────────────────────────────────────────────────────────
  {
    id: 'grafana',
    name: 'Grafana',
    description: 'Dashboards de métriques et observabilité.',
    category: 'monitoring',
    icon: '📈',
    docs: 'https://hub.docker.com/r/grafana/grafana',
    requiredEnv: ['GF_SECURITY_ADMIN_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'grafana/grafana',
      imageTag: 'latest',
      ports: [{ containerPort: 3000, protocol: 'TCP' }],
      envVars: [
        { key: 'GF_SECURITY_ADMIN_PASSWORD', value: 'changeme' },
        { key: 'GF_USERS_ALLOW_SIGN_UP', value: 'false' },
      ],
      volumes: [{ name: 'data', mountPath: '/var/lib/grafana', size: '5Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'prometheus',
    name: 'Prometheus',
    description: 'Collecte et stockage de métriques time-series.',
    category: 'monitoring',
    icon: '🔥',
    docs: 'https://hub.docker.com/r/prom/prometheus',
    defaults: {
      type: 'docker-image',
      image: 'prom/prometheus',
      imageTag: 'latest',
      ports: [{ containerPort: 9090, protocol: 'TCP' }],
      envVars: [],
      // Ne PAS monter de volume sur /etc/prometheus : ça effacerait le prometheus.yml
      // livré avec l'image. Seul le dossier de données est persisté.
      volumes: [
        { name: 'data', mountPath: '/prometheus', size: '10Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    description: 'Monitoring de disponibilité avec alertes.',
    category: 'monitoring',
    icon: '🟢',
    docs: 'https://github.com/louislam/uptime-kuma',
    defaults: {
      type: 'docker-image',
      image: 'louislam/uptime-kuma',
      imageTag: '1',
      ports: [{ containerPort: 3001, protocol: 'TCP' }],
      envVars: [],
      volumes: [{ name: 'data', mountPath: '/app/data', size: '2Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'netdata',
    name: 'Netdata',
    description: 'Monitoring système en temps réel avec visualisation avancée.',
    category: 'monitoring',
    icon: '📡',
    docs: 'https://hub.docker.com/r/netdata/netdata',
    defaults: {
      type: 'docker-image',
      image: 'netdata/netdata',
      imageTag: 'latest',
      ports: [{ containerPort: 19999, protocol: 'TCP' }],
      envVars: [
        { key: 'NETDATA_CLAIM_ROOMS', value: '' },
      ],
      volumes: [{ name: 'config', mountPath: '/etc/netdata', size: '1Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'dozzle',
    name: 'Dozzle',
    description: 'Visualiseur de logs Docker en temps réel.',
    category: 'monitoring',
    icon: '📜',
    docs: 'https://hub.docker.com/r/amir20/dozzle',
    defaults: {
      type: 'docker-image',
      image: 'amir20/dozzle',
      imageTag: 'latest',
      ports: [{ containerPort: 8080, protocol: 'TCP' }],
      envVars: [
        { key: 'DOZZLE_NO_ANALYTICS', value: '1' },
      ],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'loki',
    name: 'Loki',
    description: 'Agrégation de logs compatible Grafana.',
    category: 'monitoring',
    icon: '📋',
    docs: 'https://hub.docker.com/r/grafana/loki',
    defaults: {
      type: 'docker-image',
      image: 'grafana/loki',
      imageTag: 'latest',
      ports: [{ containerPort: 3100, protocol: 'TCP' }],
      envVars: [],
      volumes: [{ name: 'data', mountPath: '/loki', size: '10Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'healthchecks',
    name: 'Healthchecks.io',
    description: 'Surveillance de cron jobs et tâches planifiées.',
    category: 'monitoring',
    icon: '✅',
    docs: 'https://hub.docker.com/r/healthchecks/healthchecks',
    requiredEnv: ['SECRET_KEY', 'SUPERUSER_EMAIL', 'SUPERUSER_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'healthchecks/healthchecks',
      imageTag: 'latest',
      ports: [{ containerPort: 8000, protocol: 'TCP' }],
      envVars: [
        { key: 'SECRET_KEY', value: 'a-random-secret-key-here' },
        { key: 'SUPERUSER_EMAIL', value: 'admin@example.com' },
        { key: 'SUPERUSER_PASSWORD', value: 'changeme' },
        { key: 'DEBUG', value: 'False' },
        { key: 'ALLOWED_HOSTS', value: '*' },
      ],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },

  // ── DevOps ────────────────────────────────────────────────────────────────
  {
    id: 'gitea',
    name: 'Gitea',
    description: 'Forge Git légère, auto-hébergée.',
    category: 'devops',
    icon: '🐙',
    docs: 'https://hub.docker.com/r/gitea/gitea',
    requiredEnv: ['GITEA__server__DOMAIN'],
    defaults: {
      type: 'docker-image',
      image: 'gitea/gitea',
      imageTag: 'latest',
      ports: [{ containerPort: 3000, protocol: 'TCP' }],
      envVars: [
        { key: 'GITEA__database__DB_TYPE', value: 'sqlite3' },
        // ⚠️  Doit correspondre au sous-domaine public (ex: gitea.mondomaine.com)
        // Un domaine vide génère des URLs de clone SSH/HTTP avec "localhost" → repos inaccessibles.
        { key: 'GITEA__server__DOMAIN', value: 'gitea.example.com' },
        { key: 'GITEA__server__ROOT_URL', value: 'https://gitea.example.com' },
      ],
      volumes: [{ name: 'data', mountPath: '/data', size: '10Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'portainer',
    name: 'Portainer',
    description: 'Interface de gestion Docker / Kubernetes.',
    category: 'devops',
    icon: '🐳',
    docs: 'https://hub.docker.com/r/portainer/portainer-ce',
    defaults: {
      type: 'docker-image',
      image: 'portainer/portainer-ce',
      imageTag: 'latest',
      ports: [{ containerPort: 9000, protocol: 'TCP' }],
      envVars: [],
      volumes: [{ name: 'data', mountPath: '/data', size: '2Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'code-server',
    name: 'Code Server',
    description: 'VS Code dans le navigateur, accessible partout.',
    category: 'devops',
    icon: '💻',
    docs: 'https://hub.docker.com/r/codercom/code-server',
    requiredEnv: ['PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'codercom/code-server',
      imageTag: 'latest',
      ports: [{ containerPort: 8080, protocol: 'TCP' }],
      envVars: [
        { key: 'PASSWORD', value: 'changeme' },
        { key: 'SUDO_PASSWORD', value: 'changeme' },
        { key: 'TZ', value: 'Europe/Paris' },
      ],
      volumes: [{ name: 'data', mountPath: '/home/coder', size: '10Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'drone',
    name: 'Drone CI',
    description: 'CI/CD pipeline auto-hébergé orienté conteneurs.',
    category: 'devops',
    icon: '🚁',
    docs: 'https://hub.docker.com/r/drone/drone',
    requiredEnv: ['DRONE_RPC_SECRET', 'DRONE_GITEA_CLIENT_ID', 'DRONE_GITEA_CLIENT_SECRET'],
    defaults: {
      type: 'docker-image',
      image: 'drone/drone',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [
        { key: 'DRONE_GITEA_SERVER', value: 'https://gitea.example.com' },
        { key: 'DRONE_GITEA_CLIENT_ID', value: '' },
        { key: 'DRONE_GITEA_CLIENT_SECRET', value: '' },
        { key: 'DRONE_RPC_SECRET', value: 'a-random-secret' },
        { key: 'DRONE_SERVER_HOST', value: 'drone.example.com' },
        { key: 'DRONE_SERVER_PROTO', value: 'https' },
      ],
      volumes: [{ name: 'data', mountPath: '/data', size: '5Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'registry',
    name: 'Docker Registry',
    description: 'Registre Docker privé auto-hébergé.',
    category: 'devops',
    icon: '📦',
    docs: 'https://hub.docker.com/_/registry',
    defaults: {
      type: 'docker-image',
      image: 'registry',
      imageTag: '2',
      ports: [{ containerPort: 5000, protocol: 'TCP' }],
      envVars: [
        { key: 'REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY', value: '/var/lib/registry' },
      ],
      volumes: [{ name: 'data', mountPath: '/var/lib/registry', size: '20Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'jenkins',
    name: 'Jenkins',
    description: 'Serveur d\'automatisation CI/CD de référence.',
    category: 'devops',
    icon: '🔧',
    docs: 'https://hub.docker.com/r/jenkins/jenkins',
    defaults: {
      type: 'docker-image',
      image: 'jenkins/jenkins',
      imageTag: 'lts-jdk21',
      ports: [
        { containerPort: 8080, protocol: 'TCP' },
        { containerPort: 50000, protocol: 'TCP' },
      ],
      envVars: [
        { key: 'JAVA_OPTS', value: '-Xmx512m' },
      ],
      volumes: [{ name: 'home', mountPath: '/var/jenkins_home', size: '10Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'nexus',
    name: 'Nexus Repository',
    description: 'Gestionnaire d\'artefacts Maven, npm, Docker, etc.',
    category: 'devops',
    icon: '🏛️',
    docs: 'https://hub.docker.com/r/sonatype/nexus3',
    defaults: {
      type: 'docker-image',
      image: 'sonatype/nexus3',
      imageTag: 'latest',
      ports: [{ containerPort: 8081, protocol: 'TCP' }],
      envVars: [
        { key: 'INSTALL4J_ADD_VM_PARAMS', value: '-Xms256m -Xmx512m -XX:MaxDirectMemorySize=512m' },
      ],
      volumes: [{ name: 'data', mountPath: '/nexus-data', size: '20Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'sonarqube',
    name: 'SonarQube',
    description: 'Analyse de qualité et sécurité du code source.',
    category: 'devops',
    icon: '🔬',
    docs: 'https://hub.docker.com/_/sonarqube',
    requiredEnv: ['SONAR_JDBC_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'sonarqube',
      imageTag: 'community',
      ports: [{ containerPort: 9000, protocol: 'TCP' }],
      envVars: [
        { key: 'SONAR_JDBC_URL', value: 'jdbc:postgresql://postgres:5432/sonar' },
        { key: 'SONAR_JDBC_USERNAME', value: 'sonar' },
        { key: 'SONAR_JDBC_PASSWORD', value: 'changeme' },
      ],
      volumes: [
        { name: 'data', mountPath: '/opt/sonarqube/data', size: '10Gi' },
        { name: 'extensions', mountPath: '/opt/sonarqube/extensions', size: '5Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },

  // ── Productivity ──────────────────────────────────────────────────────────
  {
    id: 'n8n',
    name: 'n8n',
    description: 'Automatisation de workflows no-code / low-code.',
    category: 'productivity',
    icon: '🔗',
    docs: 'https://hub.docker.com/r/n8nio/n8n',
    requiredEnv: ['N8N_BASIC_AUTH_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'n8nio/n8n',
      imageTag: 'latest',
      ports: [{ containerPort: 5678, protocol: 'TCP' }],
      envVars: [
        { key: 'N8N_BASIC_AUTH_ACTIVE', value: 'true' },
        { key: 'N8N_BASIC_AUTH_USER', value: 'admin' },
        { key: 'N8N_BASIC_AUTH_PASSWORD', value: 'changeme' },
      ],
      volumes: [{ name: 'data', mountPath: '/home/node/.n8n', size: '2Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    description: 'Gestionnaire de mots de passe compatible Bitwarden.',
    category: 'productivity',
    icon: '🔐',
    docs: 'https://github.com/dani-garcia/vaultwarden',
    requiredEnv: ['ADMIN_TOKEN'],
    defaults: {
      type: 'docker-image',
      image: 'vaultwarden/server',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [
        { key: 'WEBSOCKET_ENABLED', value: 'true' },
        { key: 'SIGNUPS_ALLOWED', value: 'false' },
        { key: 'ADMIN_TOKEN', value: 'generate-a-random-token-here' },
      ],
      volumes: [{ name: 'data', mountPath: '/data', size: '2Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'nocodb',
    name: 'NocoDB',
    description: 'Alternative open-source à Airtable / Notion database.',
    category: 'productivity',
    icon: '📊',
    docs: 'https://hub.docker.com/r/nocodb/nocodb',
    requiredEnv: ['NC_AUTH_JWT_SECRET'],
    defaults: {
      type: 'docker-image',
      image: 'nocodb/nocodb',
      imageTag: 'latest',
      ports: [{ containerPort: 8080, protocol: 'TCP' }],
      envVars: [
        { key: 'NC_AUTH_JWT_SECRET', value: 'a-random-secret-here' },
        { key: 'NC_DB', value: 'pg://postgres:5432?u=nocodbuser&p=changeme&d=nocodb' },
      ],
      volumes: [{ name: 'data', mountPath: '/usr/app/data', size: '5Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'metabase',
    name: 'Metabase',
    description: 'Tableaux de bord analytiques et Business Intelligence.',
    category: 'productivity',
    icon: '📉',
    docs: 'https://hub.docker.com/r/metabase/metabase',
    defaults: {
      type: 'docker-image',
      image: 'metabase/metabase',
      imageTag: 'latest',
      ports: [{ containerPort: 3000, protocol: 'TCP' }],
      envVars: [
        { key: 'MB_DB_TYPE', value: 'h2' },
        { key: 'JAVA_TIMEZONE', value: 'Europe/Paris' },
      ],
      volumes: [{ name: 'data', mountPath: '/metabase-data', size: '5Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'mattermost',
    name: 'Mattermost',
    description: 'Messagerie d\'équipe open-source, alternative à Slack.',
    category: 'productivity',
    icon: '💬',
    docs: 'https://hub.docker.com/r/mattermost/mattermost-team-edition',
    requiredEnv: ['MM_SQLSETTINGS_DATASOURCE'],
    defaults: {
      type: 'docker-image',
      image: 'mattermost/mattermost-team-edition',
      imageTag: 'latest',
      ports: [{ containerPort: 8065, protocol: 'TCP' }],
      envVars: [
        { key: 'MM_SQLSETTINGS_DRIVERNAME', value: 'postgres' },
        { key: 'MM_SQLSETTINGS_DATASOURCE', value: 'postgres://mmuser:changeme@postgres:5432/mattermost?sslmode=disable&connect_timeout=10' },
        { key: 'MM_SERVICESETTINGS_SITEURL', value: 'https://chat.example.com' },
      ],
      volumes: [
        { name: 'data', mountPath: '/mattermost/data', size: '10Gi' },
        { name: 'plugins', mountPath: '/mattermost/plugins', size: '2Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'chatwoot',
    name: 'Chatwoot',
    description: 'Plateforme de support client open-source.',
    category: 'productivity',
    icon: '🎧',
    docs: 'https://hub.docker.com/r/chatwoot/chatwoot',
    requiredEnv: ['SECRET_KEY_BASE', 'POSTGRES_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'chatwoot/chatwoot',
      imageTag: 'latest',
      ports: [{ containerPort: 3000, protocol: 'TCP' }],
      envVars: [
        { key: 'SECRET_KEY_BASE', value: 'a-random-secret-key-base' },
        { key: 'FRONTEND_URL', value: 'https://support.example.com' },
        { key: 'DEFAULT_LOCALE', value: 'fr' },
        { key: 'RAILS_ENV', value: 'production' },
        { key: 'POSTGRES_HOST', value: 'postgres' },
        { key: 'POSTGRES_USERNAME', value: 'postgres' },
        { key: 'POSTGRES_PASSWORD', value: 'changeme' },
        { key: 'REDIS_URL', value: 'redis://redis:6379' },
      ],
      volumes: [{ name: 'data', mountPath: '/app/storage', size: '10Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'appsmith',
    name: 'Appsmith',
    description: 'Plateforme low-code pour créer des outils internes.',
    category: 'productivity',
    icon: '🛠️',
    docs: 'https://hub.docker.com/r/appsmithorg/appsmith',
    defaults: {
      type: 'docker-image',
      image: 'appsmithorg/appsmith',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [],
      volumes: [
        { name: 'data', mountPath: '/appsmith-stacks', size: '10Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'monica',
    name: 'Monica CRM',
    description: 'CRM personnel : gérez vos relations et contacts.',
    category: 'productivity',
    icon: '👤',
    docs: 'https://hub.docker.com/r/monica/monica',
    requiredEnv: ['APP_KEY', 'DB_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'monica',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [
        { key: 'APP_ENV', value: 'production' },
        { key: 'APP_KEY', value: 'base64:generate-a-32-char-key-here=' },
        { key: 'DB_HOST', value: 'mysql' },
        { key: 'DB_DATABASE', value: 'monica' },
        { key: 'DB_USERNAME', value: 'monica' },
        { key: 'DB_PASSWORD', value: 'changeme' },
      ],
      volumes: [{ name: 'data', mountPath: '/var/www/html/storage', size: '5Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'actual-budget',
    name: 'Actual Budget',
    description: 'Application de budget personnel locale et privée.',
    category: 'productivity',
    icon: '💰',
    docs: 'https://hub.docker.com/r/actualbudget/actual-server',
    requiredEnv: ['ACTUAL_SERVER_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'actualbudget/actual-server',
      imageTag: 'latest',
      ports: [{ containerPort: 5006, protocol: 'TCP' }],
      envVars: [
        { key: 'ACTUAL_SERVER_PASSWORD', value: 'changeme' },
      ],
      volumes: [{ name: 'data', mountPath: '/data', size: '2Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'firefly-iii',
    name: 'Firefly III',
    description: 'Gestionnaire de finances personnelles avancé.',
    category: 'productivity',
    icon: '🦋',
    docs: 'https://hub.docker.com/r/fireflyiii/core',
    requiredEnv: ['APP_KEY', 'DB_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'fireflyiii/core',
      imageTag: 'latest',
      ports: [{ containerPort: 8080, protocol: 'TCP' }],
      envVars: [
        { key: 'APP_ENV', value: 'production' },
        { key: 'APP_KEY', value: 'SomeRandomStringOf32CharsExactly' },
        { key: 'DB_CONNECTION', value: 'mysql' },
        { key: 'DB_HOST', value: 'mysql' },
        { key: 'DB_PORT', value: '3306' },
        { key: 'DB_DATABASE', value: 'firefly' },
        { key: 'DB_USERNAME', value: 'firefly' },
        { key: 'DB_PASSWORD', value: 'changeme' },
      ],
      volumes: [{ name: 'upload', mountPath: '/var/www/html/storage/upload', size: '5Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'paperless-ngx',
    name: 'Paperless-ngx',
    description: 'Gestion documentaire avec OCR et recherche full-text.',
    category: 'productivity',
    icon: '🗄️',
    docs: 'https://hub.docker.com/r/paperlessngx/paperless-ngx',
    requiredEnv: ['PAPERLESS_SECRET_KEY', 'PAPERLESS_ADMIN_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'paperlessngx/paperless-ngx',
      imageTag: 'latest',
      ports: [{ containerPort: 8000, protocol: 'TCP' }],
      envVars: [
        { key: 'PAPERLESS_SECRET_KEY', value: 'a-random-secret-key' },
        { key: 'PAPERLESS_ADMIN_USER', value: 'admin' },
        { key: 'PAPERLESS_ADMIN_PASSWORD', value: 'changeme' },
        { key: 'PAPERLESS_REDIS', value: 'redis://redis:6379' },
        { key: 'PAPERLESS_OCR_LANGUAGE', value: 'fra' },
      ],
      volumes: [
        { name: 'data', mountPath: '/usr/src/paperless/data', size: '5Gi' },
        { name: 'media', mountPath: '/usr/src/paperless/media', size: '20Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'grocy',
    name: 'Grocy',
    description: 'Gestion des stocks alimentaires et listes de courses.',
    category: 'productivity',
    icon: '🛒',
    docs: 'https://hub.docker.com/r/linuxserver/grocy',
    defaults: {
      type: 'docker-image',
      image: 'linuxserver/grocy',
      imageTag: 'latest',
      ports: [{ containerPort: 80, protocol: 'TCP' }],
      envVars: [
        { key: 'PUID', value: '1000' },
        { key: 'PGID', value: '1000' },
        { key: 'TZ', value: 'Europe/Paris' },
      ],
      volumes: [{ name: 'config', mountPath: '/config', size: '2Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  {
    id: 'keycloak',
    name: 'Keycloak',
    description: 'IAM et SSO open-source (OIDC, SAML, OAuth2).',
    category: 'auth',
    icon: '🔑',
    docs: 'https://quay.io/repository/keycloak/keycloak',
    requiredEnv: ['KEYCLOAK_ADMIN_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'quay.io/keycloak/keycloak',
      imageTag: 'latest',
      ports: [{ containerPort: 8080, protocol: 'TCP' }],
      envVars: [
        { key: 'KEYCLOAK_ADMIN', value: 'admin' },
        { key: 'KEYCLOAK_ADMIN_PASSWORD', value: 'changeme' },
        { key: 'KC_PROXY', value: 'edge' },
        { key: 'KC_DB', value: 'postgres' },
        { key: 'KC_DB_URL', value: 'jdbc:postgresql://postgres:5432/keycloak' },
        { key: 'KC_DB_USERNAME', value: 'keycloak' },
        { key: 'KC_DB_PASSWORD', value: 'changeme' },
      ],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'authelia',
    name: 'Authelia',
    description: 'Portail d\'authentification 2FA / SSO pour reverse proxy.',
    category: 'auth',
    icon: '🛡️',
    docs: 'https://hub.docker.com/r/authelia/authelia',
    requiredEnv: ['AUTHELIA_JWT_SECRET', 'AUTHELIA_SESSION_SECRET'],
    defaults: {
      type: 'docker-image',
      image: 'authelia/authelia',
      imageTag: 'latest',
      ports: [{ containerPort: 9091, protocol: 'TCP' }],
      envVars: [
        { key: 'AUTHELIA_JWT_SECRET', value: 'a-very-random-secret-jwt' },
        { key: 'AUTHELIA_SESSION_SECRET', value: 'a-very-random-secret-session' },
        { key: 'AUTHELIA_STORAGE_ENCRYPTION_KEY', value: 'a-very-random-secret-encryption' },
      ],
      volumes: [{ name: 'config', mountPath: '/config', size: '1Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'authentik',
    name: 'Authentik',
    description: 'IdP flexible : LDAP, OIDC, SAML, OAuth2 en un seul outil.',
    category: 'auth',
    icon: '🔓',
    docs: 'https://hub.docker.com/r/beryju/authentik',
    requiredEnv: ['AUTHENTIK_SECRET_KEY', 'AUTHENTIK_POSTGRESQL__PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'ghcr.io/goauthentik/server',
      imageTag: 'latest',
      ports: [{ containerPort: 9000, protocol: 'TCP' }],
      envVars: [
        { key: 'AUTHENTIK_SECRET_KEY', value: 'a-very-random-secret-key-here' },
        { key: 'AUTHENTIK_REDIS__HOST', value: 'redis' },
        { key: 'AUTHENTIK_POSTGRESQL__HOST', value: 'postgres' },
        { key: 'AUTHENTIK_POSTGRESQL__USER', value: 'authentik' },
        { key: 'AUTHENTIK_POSTGRESQL__PASSWORD', value: 'changeme' },
        { key: 'AUTHENTIK_POSTGRESQL__NAME', value: 'authentik' },
      ],
      volumes: [{ name: 'media', mountPath: '/media', size: '5Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },

  // ── Media ─────────────────────────────────────────────────────────────────
  {
    id: 'jellyfin',
    name: 'Jellyfin',
    description: 'Serveur multimédia open-source (films, séries, musique).',
    category: 'media',
    icon: '🎬',
    docs: 'https://hub.docker.com/r/jellyfin/jellyfin',
    defaults: {
      type: 'docker-image',
      image: 'jellyfin/jellyfin',
      imageTag: 'latest',
      ports: [{ containerPort: 8096, protocol: 'TCP' }],
      envVars: [
        { key: 'PUID', value: '1000' },
        { key: 'PGID', value: '1000' },
        { key: 'TZ', value: 'Europe/Paris' },
      ],
      volumes: [
        { name: 'config', mountPath: '/config', size: '5Gi' },
        { name: 'media', mountPath: '/data/media', size: '100Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'immich',
    name: 'Immich',
    description: 'Sauvegarde et gestion de photos/vidéos auto-hébergée.',
    category: 'media',
    icon: '📷',
    docs: 'https://hub.docker.com/r/ghcr.io/immich-app/immich-server',
    requiredEnv: ['DB_PASSWORD', 'UPLOAD_LOCATION'],
    defaults: {
      type: 'docker-image',
      image: 'ghcr.io/immich-app/immich-server',
      imageTag: 'release',
      ports: [{ containerPort: 2283, protocol: 'TCP' }],
      envVars: [
        { key: 'DB_HOSTNAME', value: 'postgres' },
        { key: 'DB_USERNAME', value: 'postgres' },
        { key: 'DB_PASSWORD', value: 'changeme' },
        { key: 'DB_DATABASE_NAME', value: 'immich' },
        { key: 'REDIS_HOSTNAME', value: 'redis' },
        { key: 'UPLOAD_LOCATION', value: '/usr/src/app/upload' },
      ],
      volumes: [{ name: 'upload', mountPath: '/usr/src/app/upload', size: '100Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'photoprism',
    name: 'PhotoPrism',
    description: 'Application photo IA avec reconnaissance et classification.',
    category: 'media',
    icon: '🌅',
    docs: 'https://hub.docker.com/r/photoprism/photoprism',
    requiredEnv: ['PHOTOPRISM_ADMIN_PASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'photoprism/photoprism',
      imageTag: 'latest',
      ports: [{ containerPort: 2342, protocol: 'TCP' }],
      envVars: [
        { key: 'PHOTOPRISM_ADMIN_USER', value: 'admin' },
        { key: 'PHOTOPRISM_ADMIN_PASSWORD', value: 'changeme' },
        { key: 'PHOTOPRISM_AUTH_MODE', value: 'password' },
        { key: 'PHOTOPRISM_DATABASE_DRIVER', value: 'sqlite' },
        { key: 'PHOTOPRISM_SITE_CAPTION', value: 'My Photos' },
      ],
      volumes: [
        { name: 'originals', mountPath: '/photoprism/originals', size: '100Gi' },
        { name: 'storage', mountPath: '/photoprism/storage', size: '10Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'pihole',
    name: 'Pi-hole',
    description: 'Bloqueur de publicités et DNS sinkhole réseau.',
    category: 'monitoring',
    icon: '🕳️',
    docs: 'https://hub.docker.com/r/pihole/pihole',
    requiredEnv: ['WEBPASSWORD'],
    defaults: {
      type: 'docker-image',
      image: 'pihole/pihole',
      imageTag: 'latest',
      ports: [
        { containerPort: 80, protocol: 'TCP' },
        { containerPort: 53, protocol: 'UDP' },
      ],
      envVars: [
        { key: 'TZ', value: 'Europe/Paris' },
        { key: 'WEBPASSWORD', value: 'changeme' },
        { key: 'DNSMASQ_LISTENING', value: 'all' },
      ],
      volumes: [
        { name: 'etc', mountPath: '/etc/pihole', size: '1Gi' },
        { name: 'dnsmasq', mountPath: '/etc/dnsmasq.d', size: '1Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'sonarr',
    name: 'Sonarr',
    description: 'Gestionnaire de séries TV automatisé (*arr).',
    category: 'media',
    icon: '📺',
    docs: 'https://hub.docker.com/r/linuxserver/sonarr',
    defaults: {
      type: 'docker-image',
      image: 'linuxserver/sonarr',
      imageTag: 'latest',
      ports: [{ containerPort: 8989, protocol: 'TCP' }],
      envVars: [
        { key: 'PUID', value: '1000' },
        { key: 'PGID', value: '1000' },
        { key: 'TZ', value: 'Europe/Paris' },
      ],
      volumes: [
        { name: 'config', mountPath: '/config', size: '2Gi' },
        { name: 'tv', mountPath: '/tv', size: '100Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'radarr',
    name: 'Radarr',
    description: 'Gestionnaire de films automatisé (*arr).',
    category: 'media',
    icon: '🎥',
    docs: 'https://hub.docker.com/r/linuxserver/radarr',
    defaults: {
      type: 'docker-image',
      image: 'linuxserver/radarr',
      imageTag: 'latest',
      ports: [{ containerPort: 7878, protocol: 'TCP' }],
      envVars: [
        { key: 'PUID', value: '1000' },
        { key: 'PGID', value: '1000' },
        { key: 'TZ', value: 'Europe/Paris' },
      ],
      volumes: [
        { name: 'config', mountPath: '/config', size: '2Gi' },
        { name: 'movies', mountPath: '/movies', size: '100Gi' },
      ],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'prowlarr',
    name: 'Prowlarr',
    description: 'Gestionnaire d\'indexeurs pour la suite *arr.',
    category: 'media',
    icon: '🕵️',
    docs: 'https://hub.docker.com/r/linuxserver/prowlarr',
    defaults: {
      type: 'docker-image',
      image: 'linuxserver/prowlarr',
      imageTag: 'latest',
      ports: [{ containerPort: 9696, protocol: 'TCP' }],
      envVars: [
        { key: 'PUID', value: '1000' },
        { key: 'PGID', value: '1000' },
        { key: 'TZ', value: 'Europe/Paris' },
      ],
      volumes: [{ name: 'config', mountPath: '/config', size: '2Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'jellyseerr',
    name: 'Jellyseerr',
    description: 'Gestion des demandes de médias pour Jellyfin.',
    category: 'media',
    icon: '🎯',
    docs: 'https://hub.docker.com/r/fallenbagel/jellyseerr',
    defaults: {
      type: 'docker-image',
      image: 'fallenbagel/jellyseerr',
      imageTag: 'latest',
      ports: [{ containerPort: 5055, protocol: 'TCP' }],
      envVars: [
        { key: 'TZ', value: 'Europe/Paris' },
        { key: 'LOG_LEVEL', value: 'debug' },
      ],
      volumes: [{ name: 'config', mountPath: '/app/config', size: '2Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },
  {
    id: 'home-assistant',
    name: 'Home Assistant',
    description: 'Plateforme domotique open-source auto-hébergée.',
    category: 'media',
    icon: '🏡',
    docs: 'https://hub.docker.com/r/homeassistant/home-assistant',
    defaults: {
      type: 'docker-image',
      image: 'homeassistant/home-assistant',
      imageTag: 'stable',
      ports: [{ containerPort: 8123, protocol: 'TCP' }],
      envVars: [
        { key: 'TZ', value: 'Europe/Paris' },
      ],
      volumes: [{ name: 'config', mountPath: '/config', size: '5Gi' }],
      replicas: 1,
      ingressClass: 'traefik',
    },
  },

  // ── Stacks (compose multi-services) ──────────────────────────────────────
  {
    id: 'stack-sonarqube',
    name: 'SonarQube + PostgreSQL',
    description: 'Analyse de code avec sa base PostgreSQL intégrée.',
    category: 'stack',
    icon: '🔬',
    docs: 'https://docs.sonarqube.org/latest/',
    requiredEnv: ['SONAR_JDBC_PASSWORD'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  sonarqube:
    image: sonarqube:community
    depends_on:
      - db
    environment:
      SONAR_JDBC_URL: jdbc:postgresql://db:5432/sonar
      SONAR_JDBC_USERNAME: sonar
      SONAR_JDBC_PASSWORD: sonarpassword
    ports:
      - "9000:9000"
    volumes:
      - sonarqube_data:/opt/sonarqube/data
      - sonarqube_extensions:/opt/sonarqube/extensions
      - sonarqube_logs:/opt/sonarqube/logs
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: sonar
      POSTGRES_PASSWORD: sonarpassword
      POSTGRES_DB: sonar
    volumes:
      - postgresql_data:/var/lib/postgresql/data

volumes:
  sonarqube_data:
  sonarqube_extensions:
  sonarqube_logs:
  postgresql_data:
`,
    },
  },
  {
    id: 'stack-wordpress',
    name: 'WordPress + MySQL',
    description: 'WordPress avec sa base MySQL intégrée, prêt à l\'emploi.',
    category: 'stack',
    icon: '📝',
    docs: 'https://hub.docker.com/_/wordpress',
    requiredEnv: ['MYSQL_ROOT_PASSWORD', 'WORDPRESS_DB_PASSWORD'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  wordpress:
    image: wordpress:latest
    depends_on:
      - db
    ports:
      - "80:80"
    environment:
      WORDPRESS_DB_HOST: db:3306
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wppassword
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wordpress_data:/var/www/html
  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: wppassword
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  wordpress_data:
  mysql_data:
`,
    },
  },
  {
    id: 'stack-nextcloud',
    name: 'Nextcloud + PostgreSQL + Redis',
    description: 'Suite cloud complète avec base de données et cache.',
    category: 'stack',
    icon: '☁️',
    docs: 'https://hub.docker.com/_/nextcloud',
    requiredEnv: ['POSTGRES_PASSWORD', 'NEXTCLOUD_ADMIN_PASSWORD'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  nextcloud:
    image: nextcloud:latest
    depends_on:
      - db
      - redis
    ports:
      - "80:80"
    environment:
      POSTGRES_HOST: db
      POSTGRES_DB: nextcloud
      POSTGRES_USER: nextcloud
      POSTGRES_PASSWORD: ncpassword
      NEXTCLOUD_ADMIN_USER: admin
      NEXTCLOUD_ADMIN_PASSWORD: adminpassword
      REDIS_HOST: redis
    volumes:
      - nextcloud_data:/var/www/html
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: nextcloud
      POSTGRES_PASSWORD: ncpassword
      POSTGRES_DB: nextcloud
    volumes:
      - postgres_data:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  nextcloud_data:
  postgres_data:
  redis_data:
`,
    },
  },
  {
    id: 'stack-gitea',
    name: 'Gitea + PostgreSQL',
    description: 'Forge Git légère avec sa base PostgreSQL intégrée.',
    category: 'stack',
    icon: '🐙',
    docs: 'https://hub.docker.com/r/gitea/gitea',
    requiredEnv: ['POSTGRES_PASSWORD'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  gitea:
    image: gitea/gitea:latest
    depends_on:
      - db
    ports:
      - "3000:3000"
    environment:
      GITEA__database__DB_TYPE: postgres
      GITEA__database__HOST: db:5432
      GITEA__database__NAME: gitea
      GITEA__database__USER: gitea
      GITEA__database__PASSWD: giteapassword
      GITEA__server__DOMAIN: gitea.example.com
      GITEA__server__ROOT_URL: https://gitea.example.com
    volumes:
      - gitea_data:/data
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: gitea
      POSTGRES_PASSWORD: giteapassword
      POSTGRES_DB: gitea
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  gitea_data:
  postgres_data:
`,
    },
  },
  {
    id: 'stack-mattermost',
    name: 'Mattermost + PostgreSQL',
    description: 'Messagerie d\'équipe open-source avec sa base de données.',
    category: 'stack',
    icon: '💬',
    docs: 'https://hub.docker.com/r/mattermost/mattermost-team-edition',
    requiredEnv: ['MM_SQLSETTINGS_DATASOURCE'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  mattermost:
    image: mattermost/mattermost-team-edition:latest
    depends_on:
      - db
    ports:
      - "8065:8065"
    environment:
      MM_SQLSETTINGS_DRIVERNAME: postgres
      MM_SQLSETTINGS_DATASOURCE: postgres://mmuser:mmpassword@db:5432/mattermost?sslmode=disable&connect_timeout=10
      MM_SERVICESETTINGS_SITEURL: https://chat.example.com
    volumes:
      - mattermost_data:/mattermost/data
      - mattermost_plugins:/mattermost/plugins
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: mmuser
      POSTGRES_PASSWORD: mmpassword
      POSTGRES_DB: mattermost
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  mattermost_data:
  mattermost_plugins:
  postgres_data:
`,
    },
  },
  {
    id: 'stack-wikijs',
    name: 'Wiki.js + PostgreSQL',
    description: 'Wiki moderne avec base de données PostgreSQL intégrée.',
    category: 'stack',
    icon: '📖',
    docs: 'https://js.wiki',
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  wiki:
    image: requarks/wiki:latest
    depends_on:
      - db
    ports:
      - "3000:3000"
    environment:
      DB_TYPE: postgres
      DB_HOST: db
      DB_PORT: "5432"
      DB_USER: wiki
      DB_PASS: wikipassword
      DB_NAME: wiki
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: wiki
      POSTGRES_PASSWORD: wikipassword
      POSTGRES_DB: wiki
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
`,
    },
  },
  {
    id: 'stack-outline',
    name: 'Outline + PostgreSQL + Redis',
    description: 'Wiki collaboratif avec stockage, base de données et cache.',
    category: 'stack',
    icon: '🗂️',
    docs: 'https://www.getoutline.com',
    requiredEnv: ['SECRET_KEY', 'UTILS_SECRET'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  outline:
    image: outlinewiki/outline:latest
    depends_on:
      - db
      - redis
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      SECRET_KEY: CHANGE_ME_TO_A_RANDOM_32_CHAR_STRING
      UTILS_SECRET: CHANGE_ME_TO_ANOTHER_RANDOM_STRING
      DATABASE_URL: postgres://outline:outlinepass@db:5432/outline
      REDIS_URL: redis://redis:6379
      URL: https://outline.example.com
      PORT: "3000"
      FILE_STORAGE: local
      FILE_STORAGE_LOCAL_ROOT_DIR: /var/lib/outline/data
    volumes:
      - outline_data:/var/lib/outline/data
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: outline
      POSTGRES_PASSWORD: outlinepass
      POSTGRES_DB: outline
    volumes:
      - postgres_data:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine

volumes:
  outline_data:
  postgres_data:
`,
    },
  },
  {
    id: 'stack-ghost-mysql',
    name: 'Ghost + MySQL',
    description: 'Plateforme de blogging Ghost avec MySQL pour la production.',
    category: 'stack',
    icon: '👻',
    docs: 'https://hub.docker.com/_/ghost',
    requiredEnv: ['database__connection__password'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  ghost:
    image: ghost:alpine
    depends_on:
      - db
    ports:
      - "2368:2368"
    environment:
      NODE_ENV: production
      database__client: mysql
      database__connection__host: db
      database__connection__user: ghost
      database__connection__password: ghostpassword
      database__connection__database: ghost
      url: https://blog.example.com
    volumes:
      - ghost_content:/var/lib/ghost/content
  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_USER: ghost
      MYSQL_PASSWORD: ghostpassword
      MYSQL_DATABASE: ghost
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  ghost_content:
  mysql_data:
`,
    },
  },
  {
    id: 'stack-n8n',
    name: 'n8n + PostgreSQL',
    description: 'Automatisation de workflows avec base de données persistante.',
    category: 'stack',
    icon: '🔗',
    docs: 'https://hub.docker.com/r/n8nio/n8n',
    requiredEnv: ['N8N_BASIC_AUTH_PASSWORD'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  n8n:
    image: n8nio/n8n:latest
    depends_on:
      - db
    ports:
      - "5678:5678"
    environment:
      N8N_BASIC_AUTH_ACTIVE: "true"
      N8N_BASIC_AUTH_USER: admin
      N8N_BASIC_AUTH_PASSWORD: changeme
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: db
      DB_POSTGRESDB_PORT: "5432"
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: n8npassword
    volumes:
      - n8n_data:/home/node/.n8n
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: n8npassword
      POSTGRES_DB: n8n
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  n8n_data:
  postgres_data:
`,
    },
  },
  {
    id: 'stack-keycloak',
    name: 'Keycloak + PostgreSQL',
    description: 'IAM et SSO avec base de données PostgreSQL intégrée.',
    category: 'stack',
    icon: '🔑',
    docs: 'https://www.keycloak.org/getting-started/getting-started-docker',
    requiredEnv: ['KEYCLOAK_ADMIN_PASSWORD'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  keycloak:
    image: quay.io/keycloak/keycloak:latest
    depends_on:
      - db
    ports:
      - "8080:8080"
    command: start
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://db:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloakpass
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: changeme
      KC_PROXY: edge
      KC_HOSTNAME_STRICT: "false"
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloakpass
      POSTGRES_DB: keycloak
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
`,
    },
  },
  {
    id: 'stack-authentik',
    name: 'Authentik + PostgreSQL + Redis',
    description: 'IdP complet avec sa base de données et son cache Redis.',
    category: 'stack',
    icon: '🔓',
    docs: 'https://goauthentik.io/docs/installation/docker-compose',
    requiredEnv: ['AUTHENTIK_SECRET_KEY'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  server:
    image: ghcr.io/goauthentik/server:latest
    command: server
    depends_on:
      - db
      - redis
    ports:
      - "9000:9000"
    environment:
      AUTHENTIK_REDIS__HOST: redis
      AUTHENTIK_POSTGRESQL__HOST: db
      AUTHENTIK_POSTGRESQL__USER: authentik
      AUTHENTIK_POSTGRESQL__PASSWORD: authentikpass
      AUTHENTIK_POSTGRESQL__NAME: authentik
      AUTHENTIK_SECRET_KEY: CHANGE_ME_TO_A_RANDOM_SECRET_KEY
    volumes:
      - authentik_media:/media
      - authentik_templates:/templates
  worker:
    image: ghcr.io/goauthentik/server:latest
    command: worker
    depends_on:
      - db
      - redis
    environment:
      AUTHENTIK_REDIS__HOST: redis
      AUTHENTIK_POSTGRESQL__HOST: db
      AUTHENTIK_POSTGRESQL__USER: authentik
      AUTHENTIK_POSTGRESQL__PASSWORD: authentikpass
      AUTHENTIK_POSTGRESQL__NAME: authentik
      AUTHENTIK_SECRET_KEY: CHANGE_ME_TO_A_RANDOM_SECRET_KEY
    volumes:
      - authentik_media:/media
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: authentik
      POSTGRES_PASSWORD: authentikpass
      POSTGRES_DB: authentik
    volumes:
      - postgres_data:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  authentik_media:
  authentik_templates:
  postgres_data:
  redis_data:
`,
    },
  },
  {
    id: 'stack-monitoring',
    name: 'Prometheus + Grafana + Loki',
    description: 'Stack d\'observabilité complète : métriques, dashboards et logs.',
    category: 'stack',
    icon: '📊',
    docs: 'https://grafana.com/docs/grafana/latest/getting-started/get-started-grafana-prometheus/',
    requiredEnv: ['GF_SECURITY_ADMIN_PASSWORD'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  grafana:
    image: grafana/grafana:latest
    depends_on:
      - prometheus
      - loki
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: changeme
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_DATASOURCES_DEFAULT_NAME: Prometheus
    volumes:
      - grafana_data:/var/lib/grafana
  prometheus:
    image: prom/prometheus:latest
    # Ne PAS monter de volume sur /etc/prometheus — le config yml est livré avec l image
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--web.console.libraries=/usr/share/prometheus/console_libraries"
      - "--web.console.templates=/usr/share/prometheus/consoles"
    ports:
      - "9090:9090"
    volumes:
      - prometheus_data:/prometheus
  loki:
    image: grafana/loki:latest
    # Config minimale passée en ligne de commande (pas de fichier à monter)
    command:
      - "-config.file=/etc/loki/local-config.yaml"
    ports:
      - "3100:3100"
    volumes:
      - loki_data:/loki

volumes:
  grafana_data:
  prometheus_data:
  loki_data:
`,
    },
  },
  {
    id: 'stack-chatwoot',
    name: 'Chatwoot + PostgreSQL + Redis',
    description: 'Support client open-source avec base de données et cache.',
    category: 'stack',
    icon: '🎧',
    docs: 'https://www.chatwoot.com/docs/self-hosted/deployment/docker',
    requiredEnv: ['SECRET_KEY_BASE'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  rails:
    image: chatwoot/chatwoot:latest
    depends_on:
      - db
      - redis
    ports:
      - "3000:3000"
    command: bundle exec rails s -p 3000 -b 0.0.0.0
    environment:
      SECRET_KEY_BASE: CHANGE_ME_TO_A_RANDOM_SECRET
      FRONTEND_URL: https://support.example.com
      DEFAULT_LOCALE: fr
      RAILS_ENV: production
      POSTGRES_HOST: db
      POSTGRES_USERNAME: chatwoot
      POSTGRES_PASSWORD: chatwootpass
      REDIS_URL: redis://redis:6379
    volumes:
      - chatwoot_storage:/app/storage
  sidekiq:
    image: chatwoot/chatwoot:latest
    depends_on:
      - db
      - redis
    command: bundle exec sidekiq -C config/sidekiq.yml
    environment:
      SECRET_KEY_BASE: CHANGE_ME_TO_A_RANDOM_SECRET
      RAILS_ENV: production
      POSTGRES_HOST: db
      POSTGRES_USERNAME: chatwoot
      POSTGRES_PASSWORD: chatwootpass
      REDIS_URL: redis://redis:6379
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: chatwoot
      POSTGRES_PASSWORD: chatwootpass
      POSTGRES_DB: chatwoot
    volumes:
      - postgres_data:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  chatwoot_storage:
  postgres_data:
  redis_data:
`,
    },
  },
  {
    id: 'stack-nocodb',
    name: 'NocoDB + PostgreSQL',
    description: 'Alternative Airtable avec base de données PostgreSQL dédiée.',
    category: 'stack',
    icon: '📊',
    docs: 'https://hub.docker.com/r/nocodb/nocodb',
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  nocodb:
    image: nocodb/nocodb:latest
    depends_on:
      - db
    ports:
      - "8080:8080"
    environment:
      NC_DB: pg://db:5432?u=nocodb&p=nocopassword&d=nocodb
      NC_AUTH_JWT_SECRET: CHANGE_ME_TO_A_RANDOM_SECRET
    volumes:
      - nocodb_data:/usr/app/data
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: nocodb
      POSTGRES_PASSWORD: nocopassword
      POSTGRES_DB: nocodb
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  nocodb_data:
  postgres_data:
`,
    },
  },
  {
    id: 'stack-vaultwarden',
    name: 'Vaultwarden + MariaDB',
    description: 'Gestionnaire de mots de passe Bitwarden avec MariaDB.',
    category: 'stack',
    icon: '🔐',
    docs: 'https://github.com/dani-garcia/vaultwarden/wiki/Using-the-MariaDB-(MySQL)-Backend',
    requiredEnv: ['ADMIN_TOKEN'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  vaultwarden:
    image: vaultwarden/server:latest
    depends_on:
      - db
    ports:
      - "80:80"
    environment:
      WEBSOCKET_ENABLED: "true"
      SIGNUPS_ALLOWED: "false"
      ADMIN_TOKEN: CHANGE_ME_TO_A_RANDOM_ADMIN_TOKEN
      DATABASE_URL: mysql://vaultwarden:vaultpass@db:3306/vaultwarden
    volumes:
      - vaultwarden_data:/data
  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: vaultwarden
      MYSQL_USER: vaultwarden
      MYSQL_PASSWORD: vaultpass
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  vaultwarden_data:
  mysql_data:
`,
    },
  },
  {
    id: 'stack-paperless',
    name: 'Paperless-ngx + PostgreSQL + Redis',
    description: 'GED complète avec OCR, base de données et cache Redis.',
    category: 'stack',
    icon: '🗄️',
    docs: 'https://docs.paperless-ngx.com/setup/#docker_hub',
    requiredEnv: ['PAPERLESS_SECRET_KEY', 'PAPERLESS_ADMIN_PASSWORD'],
    defaults: {
      type: 'compose',
      imageTag: 'latest',
      ports: [],
      envVars: [],
      volumes: [],
      replicas: 1,
      ingressClass: 'traefik',
      composeContent: `version: "3.8"
services:
  webserver:
    image: paperlessngx/paperless-ngx:latest
    depends_on:
      - db
      - redis
    ports:
      - "8000:8000"
    environment:
      PAPERLESS_REDIS: redis://redis:6379
      PAPERLESS_DBENGINE: postgresql
      PAPERLESS_DBHOST: db
      PAPERLESS_DBUSER: paperless
      PAPERLESS_DBPASS: paperlesspass
      PAPERLESS_DBNAME: paperless
      PAPERLESS_SECRET_KEY: CHANGE_ME_TO_A_RANDOM_KEY
      PAPERLESS_ADMIN_USER: admin
      PAPERLESS_ADMIN_PASSWORD: changeme
      PAPERLESS_OCR_LANGUAGE: fra
    volumes:
      - paperless_data:/usr/src/paperless/data
      - paperless_media:/usr/src/paperless/media
      - paperless_export:/usr/src/paperless/export
      - paperless_consume:/usr/src/paperless/consume
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: paperless
      POSTGRES_PASSWORD: paperlesspass
      POSTGRES_DB: paperless
    volumes:
      - postgres_data:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine

volumes:
  paperless_data:
  paperless_media:
  paperless_export:
  paperless_consume:
  postgres_data:
`,
    },
  },
];

/**
 * Quick lookup: Docker image base name → default container port.
 * Used to auto-fill the Ports field when the user types an image name.
 * The TEMPLATES array takes precedence (it already contains port info).
 * This map covers images that don't have a full template.
 */
export const IMAGE_PORT_MAP: Record<string, number> = {
  // Web servers
  'nginx': 80,
  'httpd': 80,
  'caddy': 80,
  'traefik': 8080,
  'haproxy': 80,
  // CMS / Web apps
  'wordpress': 80,
  'ghost': 2368,
  'nextcloud': 80,
  'owncloud/server': 8080,
  'drupal': 80,
  'joomla': 80,
  'bitnami/wordpress': 8080,
  'wallabag/wallabag': 80,
  'requarks/wiki': 3000,
  'linuxserver/bookstack': 80,
  'sissbruecker/linkding': 9090,
  'b4bz/homer': 8080,
  'linuxserver/heimdall': 80,
  'outlinewiki/outline': 3000,
  'freshrss/freshrss': 80,
  'stirlingtools/stirling-pdf': 8080,
  'penpotapp/frontend': 80,
  // Databases
  'postgres': 5432,
  'mysql': 3306,
  'mariadb': 3306,
  'mongo': 27017,
  'redis': 6379,
  'elasticsearch': 9200,
  'opensearchproject/opensearch': 9200,
  'influxdb': 8086,
  'memcached': 11211,
  'cassandra': 9042,
  'couchdb': 5984,
  'neo4j': 7474,
  'clickhouse/clickhouse-server': 8123,
  'bitnami/postgresql': 5432,
  'bitnami/mysql': 3306,
  'bitnami/redis': 6379,
  'bitnami/mongodb': 27017,
  // DB admin UIs
  'adminer': 8080,
  'phpmyadmin': 80,
  'dpage/pgadmin4': 80,
  'mongo-express': 8081,
  'redis/redisinsight': 5540,
  'kibana': 5601,
  'opensearchproject/opensearch-dashboards': 5601,
  // Message queues
  'rabbitmq': 15672,
  'eclipse-mosquitto': 1883,
  'emqx/emqx': 18083,
  'confluentinc/cp-kafka': 9092,
  'apache/kafka': 9092,
  'apache/activemq': 8161,
  'nats': 8222,
  // DevOps / CI
  'portainer/portainer-ce': 9000,
  'portainer/portainer-ee': 9000,
  'gitea/gitea': 3000,
  'gogs/gogs': 3000,
  'drone/drone': 80,
  'gitlab/gitlab-ce': 80,
  'jenkins/jenkins': 8080,
  'jenkins': 8080,
  'sonarqube': 9000,
  'registry': 5000,
  'codercom/code-server': 8080,
  'linuxserver/code-server': 8443,
  'louislam/dockge': 5001,
  'amir20/dozzle': 8080,
  'containrrr/watchtower': 8080,
  'sonatype/nexus3': 8081,
  // Monitoring & observability
  'grafana/grafana': 3000,
  'prometheus': 9090,
  'prom/prometheus': 9090,
  'prom/alertmanager': 9093,
  'grafana/loki': 3100,
  'grafana/tempo': 3200,
  'grafana/mimir': 9009,
  'louislam/uptime-kuma': 3001,
  'netdata/netdata': 19999,
  'influxdata/influxdb': 8086,
  'influxdata/chronograf': 8888,
  'healthchecks/healthchecks': 8000,
  'pihole/pihole': 80,
  // Productivity / Collaboration
  'n8nio/n8n': 5678,
  'vaultwarden/server': 80,
  'bitwarden/self-host': 80,
  'nocodb/nocodb': 8080,
  'appsmithorg/appsmith': 80,
  'metabase/metabase': 3000,
  'mattermost/mattermost-team-edition': 8065,
  'rocketchat/rocket.chat': 3000,
  'chatwoot/chatwoot': 3000,
  'wekan/wekan': 80,
  'paperlessngx/paperless-ngx': 8000,
  'monica': 80,
  'fireflyiii/core': 8080,
  'actualbudget/actual-server': 5006,
  'linuxserver/grocy': 80,
  'grocy/grocy': 80,
  // Auth
  'keycloak': 8080,
  'quay.io/keycloak/keycloak': 8080,
  'authelia/authelia': 9091,
  'ghcr.io/goauthentik/server': 9000,
  // Secrets / HashiCorp
  'vault': 8200,
  'hashicorp/vault': 8200,
  'consul': 8500,
  'hashicorp/consul': 8500,
  'hashicorp/nomad': 4646,
  // Storage & files
  'minio/minio': 9001,
  'filebrowser/filebrowser': 80,
  'syncthing/syncthing': 8384,
  'seafileltd/seafile': 80,
  'seafileltd/seafile-mc': 80,
  'linuxserver/nextcloud': 80,
  // Media
  'jellyfin/jellyfin': 8096,
  'linuxserver/jellyfin': 8096,
  'plexinc/pms-docker': 32400,
  'linuxserver/plex': 32400,
  'emby/embyserver': 8096,
  'linuxserver/emby': 8096,
  'photoprism/photoprism': 2342,
  'ghcr.io/immich-app/immich-server': 2283,
  'fallenbagel/jellyseerr': 5055,
  'homeassistant/home-assistant': 8123,
  'linuxserver/homeassistant': 8123,
  'ghcr.io/home-assistant/home-assistant': 8123,
  'esphome/esphome': 6052,
  'koenkk/zigbee2mqtt': 8080,
  // *arr / Servarr stack
  'linuxserver/sonarr': 8989,
  'linuxserver/radarr': 7878,
  'linuxserver/readarr': 8787,
  'linuxserver/bazarr': 6767,
  'linuxserver/jackett': 9117,
  'linuxserver/prowlarr': 9696,
  'linuxserver/lidarr': 8686,
  'linuxserver/overseerr': 5055,
  'sctx/overseerr': 5055,
  'hotio/overseerr': 5055,
  // Download clients
  'linuxserver/qbittorrent': 8080,
  'linuxserver/transmission': 9091,
  'linuxserver/nzbget': 6789,
  'linuxserver/sabnzbd': 8080,
  'linuxserver/deluge': 8112,
  // Finance
  'firefly-iii/firefly-iii': 8080,
  // Notebooks / ML
  'jupyter/base-notebook': 8888,
  'jupyter/scipy-notebook': 8888,
  'jupyter/datascience-notebook': 8888,
  'ollama/ollama': 11434,
  'open-webui/open-webui': 8080,
  'ghcr.io/open-webui/open-webui': 8080,
  // Misc useful
  'linuxserver/homer': 8080,
  'ghcr.io/bastienwirtz/homer': 8080,
  'hay-kot/mealie': 9000,
  'ghcr.io/hay-kot/mealie': 9000,
  'linuxserver/duplicati': 8200,
  'photoview/photoview': 80,
};

export const TEMPLATE_CATEGORIES = [
  { id: 'all',          label: 'Tous' },
  { id: 'stack',        label: '🐋 Stacks' },
  { id: 'web',          label: 'Web' },
  { id: 'database',     label: 'Bases de données' },
  { id: 'storage',      label: 'Stockage' },
  { id: 'monitoring',   label: 'Monitoring' },
  { id: 'devops',       label: 'DevOps' },
  { id: 'productivity', label: 'Productivité' },
  { id: 'media',        label: 'Médias' },
  { id: 'auth',         label: 'Authentification' },
] as const;
