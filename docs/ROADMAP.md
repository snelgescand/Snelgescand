# Roadmap

> **Strekking**: bouw eerst een correcte rekenkern, dan de UI, dan enrichments, en pas op het laatst de "fancy" features (AI-fotoanalyse, scraping). De volgorde is bewust om niet te struikelen over leuke-maar-niet-cruciale features terwijl de kern wankel is.

## Sprint 0 — Fundament *(deze week — geleverd in deze chat)*

**Doel**: starter-repo met de rekenkern in plaats. Geen UI nog.

- [x] Monorepo opzet (pnpm + turbo)
- [x] `calc-core` package met types & registry
- [x] Constanten uit Excel: RC-waardes, U-waardes, vollasturen, aansluitwaardes, PV-staffel
- [x] Eerste modules met de echte Excel-formules:
  - Douches (incl. tijdvenster-matrix optioneel)
  - Dakisolatie / glasisolatie / vloer / spouw
  - Warmtepompboiler
  - Hybride warmtepomp + lucht-water + lucht-lucht
  - Zonnepanelen (staffel + 25-jaar degradatie)
  - Batterij-eenvoudig (zonder tijdreeks)
  - Aansluitwaarde-check
  - Penningmeester-rollup
- [x] Snapshot-tests tegen Excel-uitkomsten (initiële set)
- [x] Architectuur- en formule-documentatie

## Sprint 1 — Rekenkern compleet *(2 weken)*

**Doel**: alle 15+ maatregelen uit het Excel-model in TypeScript, getest.

- [ ] Waterzijdig inregelen, WTW, PVT-tapwater, E-boiler
- [ ] Q-ton warmtepomp, LMNT
- [ ] Binnenverlichting (dimensionering + ROI)
- [ ] Veldverlichting met dim-/wedstrijdmodus
- [ ] CO₂-rapportage gegroepeerd
- [ ] Property-based tests (energiebalans, monotonie)
- [ ] Subsidie-engine v1 (DUMAVA staffels, ISDE per techniek, BOSA-sport)

## Sprint 2 — Frontend MVP *(2 weken)*

**Doel**: lokaal werkende app met dezelfde uitkomsten als Excel, zonder backend.

- [ ] Vite + React + Tailwind + zustand opzet
- [ ] Routing (startscherm, input, dashboard, detail)
- [ ] Input-formulieren met react-hook-form + zod
- [ ] Pre-gevulde dropdowns (aansluitingen, glassoorten)
- [ ] i-icoontjes met hover-uitleg
- [ ] Penningmeester-dashboard met KPI-blokken
- [ ] Recharts cashflow + besparingsverdeling
- [ ] Maatregel-cards met aan/uit-toggle
- [ ] LocalStorage-persistentie (nog geen backend)

## Sprint 3 — Backend & persistentie *(1 week)*

**Doel**: meerdere projecten, accounts, cloud-opslag.

- [ ] Fastify backend + Prisma + Postgres
- [ ] Auth (magic-link e-mail via Resend)
- [ ] Project-CRUD endpoints
- [ ] Frontend ↔ backend sync (tRPC of REST+zod)
- [ ] Deploy: Vercel + Fly.io + Neon

## Sprint 4 — Externe data *(2 weken)*

**Doel**: minder typewerk voor de gebruiker.

- [ ] BAG-koppeling (PDOK) → bouwjaar + GBO uit adres
- [ ] PDOK luchtfoto WMS → satellietbeeld voor PV-beoordeling
- [ ] ENTSO-E EPEX day-ahead prijzen (laatste 12 maanden, daily refresh)
- [ ] Eancodeboek.nl → aansluitwaarde + netbeheerder uit EAN
- [ ] Caching-laag (Redis)

## Sprint 5 — Tijdreeks & accu *(2 weken)*

**Doel**: het EPEX-accumodel werkend in de app.

- [ ] CSV/Excel-import voor PVsol & PVgis-data
- [ ] Web Worker met 8760-uur simulator (vorm: pure functie, Float32Arrays)
- [ ] EPEX-arbitrage logica met top-X% goedkoopste uren per dag
- [ ] SOC-tijdreeks visualisatie (Plotly)
- [ ] Curtailment-analyse + besparings-aggregaties
- [ ] Accu-database (uit Excel `Database` tabblad geïmporteerd)
- [ ] Multi-jaar projectie (degradatie, indexering)

## Sprint 6 — PPT-export *(2 weken)*

**Doel**: één-klik PDF/PPT-rapport.

- [ ] Python sidecar (FastAPI, python-pptx)
- [ ] Template-conventies: placeholder-strings, named picture frames
- [ ] Slide-selectie op basis van actieve maatregelen
- [ ] Charts vanuit JSON-data naar PPT-charts
- [ ] Foto-insluiting vanuit uploads
- [ ] PDF-export via LibreOffice headless
- [ ] Download-flow in frontend

## Sprint 7 — Foto's & visuele inspectie *(1 week)*

**Doel**: complete dossiervorming.

- [ ] Drag-drop upload, mobiele camera-upload
- [ ] Foto-categorisatie (meterkast, dak, cv, ...)
- [ ] Object-storage (Cloudflare R2 of S3)
- [ ] AV-scan
- [ ] EXIF-uitlezing (datum/locatie)
- [ ] Foto-galerij per project
- [ ] Foto's automatisch in PPT-export

## Sprint 8 — Subsidies-uitbreiding *(1 week)*

**Doel**: gemeentelijke regelingen.

- [ ] Eigen subsidie-database in Postgres (handmatig onderhouden, niet scraping)
- [ ] Postcode → provincie/gemeente lookup
- [ ] CMS-pagina om subsidies toe te voegen/wijzigen (admin-only)
- [ ] "Geldig op datum" logica (regelingen lopen af)

## Sprint 9 — Geavanceerd *(optioneel, in fasering te beslissen)*

Pas oppakken als sprints 0–8 in productie staan en gebruikt worden.

- [ ] Clubwebsite-scraping (Sportlink eerst)
- [ ] AI-fotoanalyse (Claude vision API of OpenAI vision) voor:
  - Type meterkast herkennen
  - Type isolatie herkennen vanaf foto
  - Dakoppervlak schatten uit satellietbeeld
  - OCR van typeplaatjes
- [ ] Excel-import (oude projecten migreren)
- [ ] Whitelabeling per organisatie
- [ ] Vergelijking-tool tussen scenario's
- [ ] Multi-locatie-projecten (verenigingen met meerdere accommodaties)

---

## Tijd & cost-inschatting

Voor één developer (jij), part-time naast Zuvy: realistisch 6–9 maanden voor sprints 0–8.

Voor één developer fulltime: 14–16 weken.

Hosting + diensten productie:
- Frontend (Vercel hobby): €0
- Backend (Fly.io 1GB): ~€8/mnd
- DB (Neon free → starter): €0–€19/mnd
- Redis (Upstash free): €0
- Storage (R2 1GB): ~€0,02
- Resend (e-mail): €0 tot 100/dag
- ENTSO-E API: gratis met registratie

Tot ~100 projecten/maand kun je dit voor €30–50/mnd hosten.

---

## Wat NU prioriteit krijgt

Mijn advies: focus eerst op sprints 0 t/m 3 (rekenkern + UI MVP + persistentie). Dat geeft je een werkend product dat al beter is dan de huidige Excels: realtime herberekening, multi-project, deelbaar. **Demo-baar in 7–9 weken** voor een eerste klant.

Pas daarna de "wow"-features (BAG-autovulling, accu-tijdreeks, PPT-export). Die zijn waardevol maar niet kritisch voor een eerste werkende versie.
