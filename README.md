# Sportief Opgewekt

SaaS-applicatie voor verduurzaming van Nederlandse sportclubs. Vervangt en automatiseert drie Excel-rekenmodellen tot één samenhangende web-app met automatische PowerPoint-export.

## Status

**Sprint 0-6 voltooid:**

- ✅ **`packages/calc-core`** — 19 maatregel-modules (alle Excel-tabbladen), 8760-uur batterij-engine, penningmeester-rollup, aansluitwaarde-check. 31/31 tests groen.
- ✅ **`apps/api`** — Fastify backend met multi-tenant DB, cookie-based JWT auth, project CRUD, berekenings-endpoint, **PPT-export via python-pptx sidecar**, modules-listing. 6/6 tests groen.
- ✅ **`apps/web`** — Vite + React + Tailwind frontend met login, projectenoverzicht en project-editor met live businesscase + **PowerPoint-download knop**. Productie-build draait (~70 KB gzipped).
- ✅ **Branding-systeem** — centrale `branding.ts` config, SVG-logo, AppHeader-component, vast op Sportief Opgewekt-thema.
- ✅ **PPT-export pipeline** — placeholder-template-engine met NL-formatters (€, m³, ton, jaren).

**Klaar voor productie** zie `docs/HOSTING.md` voor gratis Oracle Cloud deployment en `docs/DOMEIN.md` voor `snelgescand.nl` setup.

**Komt nog (Sprint 7+):**
- BAG/PDOK postcode-autofill
- 8760-uur batterij-grafiek in UI
- Sportlink scraper
- Gemeente-subsidie-DB
- Dynamische grafieken in PPT (matplotlib of frontend-screenshot)

## Snel aan de slag

```bash
# Vereist: node 20+, pnpm 9+, docker (voor Postgres+Redis lokaal)
corepack enable
pnpm install

# Calc-core eerst builden (api/web hangen ervan af)
pnpm --filter @sportief-opgewekt/calc-core build
pnpm --filter @sportief-opgewekt/calc-core test    # 31/31 groen

# Backend opzetten
cd apps/api
docker compose up -d
cp .env.example .env       # vul JWT_SECRET en COOKIE_SECRET in
pnpm prisma:generate
pnpm prisma:migrate
pnpm tsx src/scripts/seed.ts
pnpm dev                   # draait op :3000

# In een ander terminal: frontend
cd apps/web
pnpm dev                   # draait op :5173
```

## Structuur

```
sportief-opgewekt/
├── docs/                          Architectuur, formules, roadmap
├── packages/
│   └── calc-core/                 Pure rekenkern (browser + node)
└── apps/
    ├── api/                       Fastify + Prisma + Postgres
    └── web/                       React + Vite + Tailwind
```

## Volgende stappen

- **Productie**: zie `docs/HOSTING.md` (Oracle Cloud Free Tier setup) en `docs/DOMEIN.md` (Mijndomein → Namecheap → server)
- **PPT-template aanpassen**: zie `docs/PPT_TEMPLATE.md` voor placeholder-syntax
- **Roadmap**: zie `docs/ROADMAP.md` voor verdere sprint-planning

