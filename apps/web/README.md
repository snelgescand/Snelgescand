# apps/web

React + Vite frontend voor Sportief Opgewekt.

## Status

**Werkend MVP-skelet (Sprint 3):**
- Vite + React 18 + Tailwind
- React Router (login, projectenoverzicht, project-editor)
- @tanstack/react-query voor server-state
- Login flow (cookie-based, praat met `/api/auth/login`)
- Projectenoverzicht met "nieuw"-knop
- Minimale project-editor: club/gebouw-velden + maatregelen aan/uit + "Bereken"-knop
- Penningmeester-resultaat naast inputs

**Komt nog (Sprint 3-5):**
- Volwaardige wizard met stappen (Excel-tabs als tabs)
- Per-maatregel detail-form (nu alleen defaults aan/uit)
- Recharts/Plotly grafieken voor de 8760-uur batterij-tijdreeks
- Web Worker (Comlink) rond `simuleerBatterijTijdreeks()`
- BAG-lookup-knop bij postcode/huisnummer
- PPT-export-knop (sprint 6)

## Start

Vereist: backend draait op `localhost:3000` (zie `apps/api/README.md`).

```bash
# Vanuit repo root
pnpm --filter @sportief-opgewekt/calc-core build
pnpm --filter @sportief-opgewekt/web dev
```

Web app draait dan op `http://localhost:5173`. Vite proxy stuurt `/api/*` door naar de Fastify backend.

## Architectuur

```
src/
├── api/client.ts         fetch-wrapper met credentials: include
├── components/
│   └── AuthGate.tsx      redirect naar /login als niet ingelogd
├── routes/
│   ├── Login.tsx
│   ├── ProjectList.tsx
│   └── ProjectEditor.tsx
├── styles.css            Tailwind layers + component classes
└── main.tsx              entry + router + react-query
```

State-strategie: server-state in react-query, lokale form-state in `useState` (later useReducer / zustand voor de wizard). Persistence loopt via API — geen localStorage.
