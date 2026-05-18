# apps/api

Fastify + Prisma backend voor Sportief Opgewekt.

## Status

**Werkend fundament (Sprint 2):**
- Fastify server met cookie-based JWT auth (argon2id wachtwoorden)
- Multi-tenant DB-model (Prisma + Postgres)
- Project CRUD + berekenings-endpoint dat calc-core aanroept
- Modules-listing endpoint
- Rate limiting, helmet, CORS
- Health check, graceful shutdown, structured logging

**Komt nog (Sprint 4-6):**
- BAG/PDOK/EPEX proxies met caching (`/api/bag/...`, `/api/epex/...`)
- Scraper-jobs in BullMQ (Sportlink first)
- PPT-export endpoint + python-pptx sidecar

## Quickstart

```bash
# 1. Postgres + Redis lokaal starten
docker compose up -d

# 2. Env config
cp .env.example .env
# Vul JWT_SECRET en COOKIE_SECRET in (>= 32 tekens; openssl rand -hex 32)

# 3. Vanuit repo root, install
cd ../..
pnpm install

# 4. Calc-core builden (api hangt ervan af)
pnpm --filter @sportief-opgewekt/calc-core build

# 5. Prisma client genereren + migratie runnen
cd apps/api
pnpm prisma:generate
pnpm prisma:migrate

# 6. Eerste tenant + admin user
pnpm tsx src/scripts/seed.ts

# 7. Server starten (dev mode met hot reload)
pnpm dev
```

API is bereikbaar op `http://localhost:3000/api`.

## Endpoints

```
POST   /api/auth/login           { email, wachtwoord, tenantSlug? }
POST   /api/auth/logout
GET    /api/auth/me              (auth)
POST   /api/auth/users           (beheerder) { email, wachtwoord, naam, rol }

GET    /api/projects             (auth)
POST   /api/projects             (auth)
GET    /api/projects/:id         (auth)
PUT    /api/projects/:id         (auth)
DELETE /api/projects/:id         (auth) — markeert als gearchiveerd
POST   /api/projects/:id/bereken (auth) — calc-core + cache update

GET    /api/modules              metadata van alle maatregelen

GET    /api/health
```

## Berekening-flow

1. Frontend doet `POST /api/projects/:id/bereken`
2. API laadt `Project.state` uit DB
3. `bereken.service.ts` mapt state → calc-core (`MODULE_REGISTRY` lookup per maatregel)
4. Resultaat (per maatregel + rollup) wordt in `Project.cachedResult` opgeslagen
5. Bij volgende `GET /api/projects/:id` wordt cache meegestuurd zonder herberekening
6. Bij `PUT` op state wordt cache geïnvalideerd (NULL)

## Multi-tenancy

Iedere request krijgt `req.user.tenantId` uit de JWT. Alle Prisma-queries filteren expliciet op tenantId. **Cross-tenant lekken voorkomen we door geen rauwe queries te schrijven die de filter overslaan.**
