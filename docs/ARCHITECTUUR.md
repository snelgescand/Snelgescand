# Sportief Opgewekt — Architectuur

> **Doel**: De Excel-modellen (Rekenmodel v8.2.1, Accumodel PV-curtailment v1.3.2, Accuberekening Club) vervangen door een schaalbare web-applicatie met realtime herberekening, API-koppelingen, en automatische PowerPoint-export.

> **Status**: Architectuur-document v0.1. Begeleidt de starter-repo.

---

## 1. Uitgangspunten

### 1.1 Wat de huidige Excels écht doen (samenvatting)

Op basis van inspectie van de drie werkbladen:

| Excel | Wat het doet | Engine-type |
|---|---|---|
| **Rekenmodel v8.2.1** (26 sheets) | Statische jaarrekening per maatregel: investering, subsidie, gas-/stroombesparing, terugverdientijd. Plus dimensionering (boiler, warmtepomp, PV-staffel). | **Stationaire calculator** — input → output zonder tijdas |
| **Accumodel EPEX v1.3.2** | 8.760 uur tijdreeks (of 35.040 kwartieren): PV-opwek + verbruik + EPEX-prijzen → SOC-traject van de accu → curtailment, eigen verbruik, arbitrage | **Tijdreeks-simulatie** |
| **Accuberekening Club** | Cashflow-tabel 2025–2040 per meterkast | **Multi-jaar projectie** |

Conclusie: we hebben drie verschillende rekensoorten nodig, geen één-grootte-past-alles.

### 1.2 Kernprincipes

1. **Eén bron van waarheid voor formules.** De rekenkern is een aparte package (`@so/calc-core`) zonder UI- of backend-afhankelijkheden. Pure functies, deterministisch, testbaar met snapshot-tests tegen Excel-uitkomsten.
2. **State is afgeleid.** De UI heeft alleen `inputs`; alle `outputs` zijn pure derivaties via `selectors`. Geen handgeschreven sync-logica.
3. **Modules zijn los koppelbaar.** Elke maatregel is een module met dezelfde contract-shape (`Input → Result`). Toevoegen van een nieuwe maatregel = nieuw bestand + registratie in `registry.ts`, geen wijzigingen elders.
4. **Realtime, niet "trage-batch".** Stationaire calcs draaien <10ms in de browser. Alleen de tijdreeks (8760 uur) draait in een Web Worker.
5. **Externe data is een laag eromheen.** BAG, satellietfoto, EPEX, eancodeboek — allemaal *enrichment*. Het model moet ook werken zonder die diensten (handmatige input).

---

## 2. Tech stack

### 2.1 Aanbevolen keuzes

| Laag | Keuze | Reden |
|---|---|---|
| Taal | **TypeScript** overal | Type-safety voor de formules is essentieel. Domain modellen worden ingewikkeld. |
| Monorepo | **pnpm workspaces** + **turbo** | Lichter dan Nx, voldoende voor 3–5 packages. |
| Frontend | **React 18 + Vite + Tailwind** | Bart kent dit al van Zuvy. Geen leercurve. |
| State | **Zustand** met `immer` middleware | Lichter dan Redux Toolkit; selectors-pattern past bij "outputs zijn afgeleid". |
| Forms | **react-hook-form** + **zod** | Validatie van numerieke inputs (positieve getallen, ranges) is overal nodig. |
| Grafieken | **Recharts** voor 90%, **Plotly** voor de 8760-uur SOC-tijdreeks | Recharts is goed genoeg voor cashflows en staafdiagrammen; Plotly heeft betere zoom/pan voor 35k punten. |
| Tijdreeks | **Web Worker** (Comlink) | Houdt UI responsive tijdens accu-simulatie. |
| Backend | **Fastify** (Node 22, TypeScript) | Sneller dan NestJS, minder boilerplate. Voor enrichment-proxy, PPT-generatie, persistentie. |
| Database | **PostgreSQL** + **Prisma** | JSONB-kolommen voor flexibele input-blobs, relaties voor users/projecten. |
| Background jobs | **BullMQ** + Redis | Voor lange taken zoals 35.040-kwartier sim, PDOK-bevraging, PPT-export. |
| PPT | **PptxGenJS** server-side, of `python-pptx` als sidecar | Zie §7. PptxGenJS is JS-native maar minder krachtig dan python-pptx voor template-vulling. |
| Tests | **Vitest** + **fast-check** (property-based) | Property tests op fysische invarianten (energiebalans, monotonie van besparing). |
| Hosting | Frontend op **Vercel/Netlify**; backend op **Fly.io / Railway**; DB **Neon** | Goedkoop voor SaaS-start. |

### 2.2 Wat ik bewust *niet* aanraad

- **GraphQL** — overkill. REST + zod-typed clients (of tRPC) is voldoende en sneller te bouwen.
- **NestJS** — veel boilerplate die je voor deze use case niet nodig hebt.
- **Server-side rendering** — de app is bvk applicatie, geen content-site. SPA is prima.
- **Een rule-engine zoals JSON-Logic** — formules zijn fysische berekeningen, code in TS leest beter en is sneller.

---

## 3. Repository-indeling

```
sportief-opgewekt/
├── docs/
│   ├── ARCHITECTUUR.md         ← dit bestand
│   ├── ROADMAP.md              ← fasering & deliverables
│   ├── FORMULES.md             ← formule-inventaris uit Excel
│   └── ADR/                    ← Architecture Decision Records
├── packages/
│   ├── calc-core/              ← rekenkern (geen UI, geen Node-deps)
│   │   ├── src/
│   │   │   ├── types/          ← gedeelde TypeScript types
│   │   │   ├── data/           ← constanten (RC-waardes, staffel, vollasturen)
│   │   │   ├── modules/        ← per maatregel één bestand
│   │   │   ├── util/           ← helpers (businessCase, energieBalans)
│   │   │   ├── registry.ts     ← lijst van alle modules
│   │   │   └── index.ts        ← public API
│   │   └── test/               ← snapshot-tests tegen Excel-output
│   ├── shared-types/           ← zod-schemas voor API-contract
│   └── ui-kit/                 ← Tailwind componenten, branding
├── apps/
│   ├── web/                    ← React frontend (Vite)
│   └── api/                    ← Fastify backend
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 4. Datamodel

### 4.1 Centrale state (frontend)

```ts
type Project = {
  id: string;
  meta: { naam: string; createdAt: Date; updatedAt: Date };
  club: ClubInfo;
  energie: EnergieSituatie;
  gebouw: GebouwKenmerken;     // BAG-verrijkt, mag leeg
  maatregelen: GeselecteerdeMaatregelen;  // welke aan/uit + parameters
  fotos: Foto[];
  // afgeleid, niet opgeslagen:
  resultaat?: ProjectResultaat;
};
```

`ProjectResultaat` is altijd berekend via `computeProjectResultaat(project)`. Nooit opgeslagen in state — anders raakt het uit sync met inputs.

### 4.2 Maatregel-contract

Elke maatregel implementeert:

```ts
interface MaatregelModule<I, R extends MaatregelResultaat> {
  id: MaatregelId;
  naam: string;
  bereken(input: I, context: ProjectContext): R;
  defaultInput(context: ProjectContext): I;
}

interface MaatregelResultaat {
  brutoInvestering: number;     // EUR incl btw
  subsidies: Subsidie[];
  nettoInvestering: number;
  besparingPerJaar: number;     // EUR
  besparingGasM3?: number;
  besparingStroomKwh?: number;
  extraStroomverbruikKwh?: number;  // bv warmtepomp
  co2BesparingKg: number;
  terugverdientijdJaren: number;
  piekVermogenKw?: number;      // voor aansluitwaarde-check
  warnings: Warning[];
}
```

Deze uniformiteit maakt de penningmeester-rollup triviaal: gewoon optellen.

### 4.3 Database-schema (PostgreSQL)

```sql
CREATE TABLE users (...);

CREATE TABLE projects (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  state JSONB NOT NULL,        -- volledige Project zonder afgeleide velden
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE timeseries (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  kind TEXT,                   -- 'pv_opwek', 'verbruik', 'epex'
  resolution TEXT,             -- 'hour', 'quarter'
  year INT,
  data BYTEA                   -- gecomprimeerde Float32Array (8760 of 35040 punten)
);

CREATE TABLE attachments (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  kind TEXT,                   -- 'meterkast', 'dak', 'cv', ...
  storage_url TEXT,
  exif JSONB
);
```

**Waarom JSONB voor `projects.state`?** De input-shape evolueert snel; SQL-migraties bij elke nieuwe maatregel zou pijnlijk worden. JSONB met een zod-schema voor runtime-validatie geeft flexibiliteit zonder type-veiligheid op te geven.

---

## 5. Rekenkern: hoe ik de Excel-formules vertaal

### 5.1 De drie engine-types

**A. Stationaire calculator** — input → output, geen tijdas. 80% van de modules.

Voorbeeld (Dakisolatie, zoals het in Excel staat):
```
J12 = J8 * J9 * J10           // warmteverlies oud (W)  = opp × dT × U_oud
J13 = J8 * J9 * J11           // warmteverlies nieuw   = opp × dT × U_nieuw
J17 = J16 * (J14*3600)        // besparing in J/jaar   = uren × (W * s/uur)
J19 = J17 / (3.6e6) / 31.65   // besparing in m³ gas   (1 m³ gas ≈ 31.65 MJ)
```

Wordt in TypeScript:
```ts
function berekenDakisolatie(input, ctx) {
  const uOud = uWaarde(input.bouwjaar, 'dak', input.huidigeStaat);
  const uNieuw = 1 / input.gewensteRcWaarde;
  const warmteVerschilW = input.oppervlakte * input.binnenBuitenDeltaT * (uOud - uNieuw);
  const besparingMJPerJaar = warmteVerschilW * input.stookurenPerJaar * 3.6 / 1000;
  const besparingM3Gas = besparingMJPerJaar / 31.65;
  // ...
}
```

**B. Tijdreeks-simulatie** — 8760 uur of 35040 kwartieren. Alleen accu/PV-curtailment.

Algoritme zoals het in het Excel-rekenblad staat (kolommen AL/AV/AM/AW):
```
voor elke t in [0, T):
  netto = P[t] - V[t]                        // PV-opwek minus verbruik
  if netto > 0:                              // overschot
    laad = min(netto, P_batt, C_max - SOC)
    curtailment = netto - laad
    afname_net = 0
  else:                                       // tekort
    ontlaad = min(-netto, P_batt, SOC - C_min)
    afname_net = -netto - ontlaad
    laad = 0
  // EPEX-arbitrage in goedkope uren (top-X% goedkoopste van de dag):
  if epex[t] in goedkope_uren[dag(t)] en SOC < C_max:
    extra_laad = min(P_batt - laad, C_max - SOC)
  SOC[t+1] = SOC[t] + laad + extra_laad - ontlaad - verliezen
```

In TypeScript draait dit in een Web Worker met Float32Array's. Snelheid is geen issue (~10ms voor 8760 uur op moderne hardware).

**C. Multi-jaar projectie** — degradatie PV (0.03%/jaar), inflatie energie, cashflow.

Eenvoudig: een loop over 15–25 jaren met indexering.

### 5.2 Hoe ik formule-correctheid borg

**Snapshot-tests tegen Excel**. Voor elke module:

1. Pak 3–5 representatieve scenarios uit het Excel-model
2. Vul ze in Excel, lees de uitkomst
3. Schrijf een test die hetzelfde scenario door de TS-module pompt
4. Vergelijk uitkomsten met tolerantie 0.5%

Zonder dit drift de TypeScript-implementatie onvermijdelijk weg van de Excel.

**Property-based tests** met fast-check voor invarianten:
- Energiebalans: opwek_pv = direct_verbruik + laad_accu + curtailment + verlies
- Monotonie: meer isolatie ⇒ meer besparing (zelfde input)
- Subsidie ≤ bruto investering
- Terugverdientijd > 0 als besparing > 0

---

## 6. API-strategie

### 6.1 Welke API's, en wanneer

| Externe bron | Wanneer aanroepen | Cachebeleid | Fallback |
|---|---|---|---|
| **BAG (PDOK)** | Adres-invoer (debounced) | Per gebouw eeuwig (bouwjaar verandert niet) | Handmatig invullen |
| **Satellietfoto (PDOK luchtfoto WMS)** | On-demand bij "bekijk dak" | 30 dagen | Geen — gebouwfoto upload |
| **EPEX Day-Ahead (ENTSO-E)** | Bij accu-simulatie | 1 dag | Vorig jaar als profiel |
| **Eancodeboek.nl** | Op verzoek (knop "verrijk") | 7 dagen | Handmatig |
| **Subsidies-scraping (gemeente/provincie)** | Bij projectinitialisatie | 24 uur | Handmatige subsidie-invoer |
| **Club-website scraping (wedstrijden)** | On-demand | 7 dagen | Generiek seizoenprofiel |

**Architectuur**: alle externe calls gaan via **`apps/api/src/enrichment/`**. Frontend praat *nooit* direct met externe API's. Voordelen:
- CORS-vrij
- Centrale rate-limiting + caching (Redis)
- API-keys blijven server-side
- Eenvoudig swappen van provider

### 6.2 Frontend ↔ Backend contract

REST + zod-validated bodies, of tRPC voor automatische type-sharing.

Belangrijkste endpoints (versie 1):
```
POST   /api/projects                          → maak project
GET    /api/projects/:id                      → lees project
PATCH  /api/projects/:id                      → update
POST   /api/projects/:id/compute              → forceer herberekening (zelden nodig, meeste calcs in browser)
POST   /api/projects/:id/export/pptx          → genereer PowerPoint
POST   /api/projects/:id/simulate-battery     → trigger 8760-uur sim async (returns job ID)
GET    /api/jobs/:id                          → poll job status

POST   /api/enrichment/bag                    → adres → bouwjaar + GBO
POST   /api/enrichment/epex                   → datum-range → prijscurve
POST   /api/enrichment/subsidies              → postcode → lijst
POST   /api/enrichment/club-bezetting         → URL → bezettingsprofiel
```

### 6.3 Scrapen van clubwebsites (kritisch nadenken)

Realiteit: clubwebsites variëren enorm (KNVB-app, Sportlink, eigen WordPress, etc). Scraping is brittle. Aanbeveling:

1. **Eerste versie**: alléén Sportlink-publieke kalenders (de meeste verenigingen gebruiken dit). Gestandaardiseerde HTML/JSON.
2. **Tweede versie**: KNVB Sportlink API officieel aanvragen.
3. **Vangnet**: generiek profiel (zaterdag piek 9–17h, doordeweekse training 18–22h, zomerstop juli-augustus). Veel goedkoper en bijna even goed voor energie-berekeningen.

Niet beginnen met scraping. Beginnen met handmatige invoer + presets.

---

## 7. PowerPoint-export

### 7.1 De template (86 slides) analyseren

Uit inspectie: de PPT heeft een vaste verhaalstructuur:
1. **Voorblad** (slide 1)
2. **Uitgangspunten** (2)
3. **Verduurzamingsroute** (3–5)
4. **Goed gedaan / Dit kan beter** (6–7)
5. **Warmte slim besparen** (isolatie 8–32, ventilatie 33–36)
6. **Warmte slim opwekken** (warmtepompen 37–46)
7. **Stroom slim besparen** (verlichting 47–56)
8. **Stroom slim opwekken** (PV 57–59, batterij 60–61, netbeheer 62–65)
9. **Klimaatadaptatie** (66–71)
10. **Circulair / afval** (72–75)
11. **Conclusie + penningmeester** (76–77)
12. **Optionele bijlages** (78–86)

**De template wordt slim opgebouwd op basis van gekozen maatregelen** (zoals jij ook beschrijft): we genereren slides per actieve maatregel, met de rest weg.

### 7.2 Twee opties

| Optie | Voordelen | Nadelen |
|---|---|---|
| **PptxGenJS** (Node) | Native JS, in backend mee te bundelen | Beperkter; geen template-vulling. Layout moet handmatig hergebouwd. |
| **python-pptx** sidecar | Volledige template-manipulatie (placeholders, charts uit Excel) | Extra runtime, Python dependency |

**Mijn aanbeveling**: python-pptx sidecar. Reden: de template is rijk (foto-placeholders, complexe layouts). PptxGenJS herbouwen kost meer tijd dan het waard is.

Architectuur:
```
[Frontend] → POST /api/projects/:id/export/pptx
                          ↓
                   [Fastify backend]
                          ↓
                   spawn python sidecar (of HTTP naar lokale FastAPI)
                          ↓
                   python leest template, vult placeholders,
                   verwijdert niet-gekozen slides,
                   sluit charts in vanuit JSON-data
                          ↓
                   Returneert .pptx bytes
                          ↓
                   Backend stuurt door naar frontend als download
```

### 7.3 Template-conventies (te introduceren in v2 van template)

We willen straks placeholders in de PPT die we programmatisch invullen:
- `{{club.naam}}` → "VV Heerenveen"
- `{{huidige.gasverbruik}}` → "5.230 m³"
- `{{maatregel.dak.investering}}` → "€ 12.500"
- Tabel-rijen met named ranges
- Foto-placeholders met `picture name="foto_meterkast"` enz.

Eerste versie van de tool kan ook werken met de huidige template (lege placeholders), maar voor een nette automatisering moet de template lichtjes geannoteerd worden. Dit is een eenmalig werkje.

---

## 8. Frontend componentarchitectuur

### 8.1 Schermen

```
/                        StartScherm (leeg, alleen adres-invoer + naam)
/project/:id/input       Tab-based invoer (Algemeen, Energie, Gebouw, Maatregelen)
/project/:id/dashboard   Penningmeester-view + grafieken
/project/:id/details/:m  Detail-view per maatregel (dimensionering)
/project/:id/export      Export-wizard (PPT, PDF)
```

### 8.2 Componenten

```
src/components/
├── form/
│   ├── NumberInput.tsx          // met eenheid + i-icoontje
│   ├── DropdownAansluiting.tsx  // pre-gevulde lijst (3x25A etc)
│   ├── BouwjaarInput.tsx
│   ├── InfoTooltip.tsx          // hover-help
│   └── FotoUploader.tsx         // drag-drop per categorie
├── chart/
│   ├── CashflowChart.tsx        // staaf, jaarlijks
│   ├── EnergieFlowSankey.tsx    // huidige vs nieuwe situatie
│   ├── SocTimeSeries.tsx        // Plotly, 8760u
│   ├── PiekbelastingChart.tsx
│   └── BezettingsProfiel.tsx
├── maatregel/
│   ├── MaatregelCard.tsx        // klikbaar, met aan/uit + ROI badge
│   └── MaatregelDetails.tsx     // formulier voor params
└── dashboard/
    ├── KPIBlokken.tsx           // de 7 nummers (investering, sub, etc)
    ├── PenningmeesterTabel.tsx
    └── NetcongestieBanner.tsx   // waarschuwing als piek > aansluiting
```

### 8.3 State-flow

```
[gebruiker tikt in NumberInput]
        ↓
zustand store.setInput(path, value)
        ↓
selector useMaatregelResultaat(maatregelId) hercomputeert ALLEEN als
  ─ relevante input is veranderd (memoized via shallow compare)
        ↓
Component rerendert met nieuwe waarde
```

Geen handmatige useEffect-chaining. Geen "save and refresh"-knop. Alles is reactief omdat outputs pure functies zijn van inputs.

---

## 9. Subsidies — kritisch ontwerp

Excel heeft een eenvoudige aanpak: 4 percentages (Dumava 20%, ISDE, 1/3-regeling 33.3%, IAS 60%) die per maatregel toe te passen zijn. Werkelijkheid is veel complexer:

- **DUMAVA** heeft staffels: stap 1 (20%), stap 2 (30%), stap 3 (40%), met combinatie-eisen.
- **ISDE** is per-techniek (warmtepomp x€ per kW thermisch, zonneboiler op m²).
- **Gemeentelijke regelingen** verschillen per postcode.
- **BOSA-subsidie** (sport-specifiek, 30% met opslag voor energiebesparende maatregelen — staat in de Accuberekening als 40%).

Aanbeveling: een **subsidie-engine** als aparte module met:
```ts
type SubsidieRegeling = {
  id: string;
  bron: 'rijk' | 'provincie' | 'gemeente' | 'sport';
  geldigVan: Date;
  geldigTot?: Date;
  voorwaarden: VoorwaardenAST;     // bv "alleen voor sportverenigingen", "min 2 maatregelen"
  toepasbaar(maatregel: Maatregel, context: ProjectContext): boolean;
  berekenBedrag(maatregel: Maatregel, context: ProjectContext): number;
};
```

Subsidies worden gestapeld waar toegestaan (DUMAVA + BOSA mag, DUMAVA + ISDE op dezelfde post mag niet). De engine houdt cap-regels bij.

Eerste versie: harde codering van DUMAVA + ISDE + BOSA. Latere versie: scraping/database van gemeentelijke regelingen via een eigen subsidies-database (we kunnen die zelf onderhouden in de DB, niet vertrouwen op scraping live).

---

## 10. Beveiliging & privacy

- **Authenticatie**: Auth.js (NextAuth) met email-magic-link. Geen wachtwoorden.
- **Multi-tenant**: elke gebruiker ziet alleen eigen projecten. Row-Level-Security in Postgres als extra vangnet.
- **API-keys** (PDOK, ENTSO-E, etc): nooit in frontend bundle. Alleen in backend env.
- **AVG/GDPR**: clubadressen + foto's zijn persoonsgegevens. Verwerkersovereenkomst nodig met de cloudprovider. Privacy-statement vereist (zoals Zuvy ook al heeft — dezelfde basis bruikbaar).
- **Foto-uploads**: gescand op malware (ClamAV in backend) of via een dienst als Cloudflare R2 met AV.

---

## 11. Wat eerst, wat later

Zie [ROADMAP.md](./ROADMAP.md) voor de fasering. De volgorde van bouwen die ik aanraad:

1. **Sprint 0 (1 week)**: Repo-opzet, calc-core skeleton, eerste 3 modules met snapshot-tests (douches, dakisolatie, zonnepanelen) — *dat lever ik vandaag*.
2. **Sprint 1 (2 weken)**: Resterende stationaire modules (alle isolatie, alle warmtepompen, verlichting, batterij-eenvoudig).
3. **Sprint 2 (2 weken)**: Frontend MVP — input-formulieren + penningmeester-dashboard. Nog geen externe API's.
4. **Sprint 3 (1 week)**: Backend + persistentie + auth.
5. **Sprint 4 (2 weken)**: BAG-koppeling + satellietfoto + EPEX. Subsidie-engine eerste versie.
6. **Sprint 5 (2 weken)**: Tijdreeks-engine (Web Worker) + accu-simulatie + curtailment-analyse.
7. **Sprint 6 (2 weken)**: PPT-export sidecar.
8. **Sprint 7 (1 week)**: Foto-uploads + visuele inspectie.
9. **Sprint 8 (1 week)**: Subsidie-scraping (alleen na validatie of het nodig is).
10. **Sprint 9 (open)**: Clubwebsite-scraping, AI-fotoanalyse, etc.

Totaal ≈ 14 weken voor één developer voor MVP zonder de "geavanceerde" features. Met een tweede developer of als jij parttime werkt, dubbel.

---

## 12. Open vragen voor jou

Voordat ik verder bouw, een paar keuzes die jij moet maken:

1. **Single-tenant of SaaS?** Eén klant per installatie (zoals een installatiebureau die zelf draait), of jij host het en meerdere bureaus zijn klant? Dit raakt de DB-architectuur.
2. **Wie zijn de eindgebruikers?** Energieadviseurs die voor sportclubs werken, of de penningmeesters van clubs zelf? Dat verandert het UX-niveau (vakjargon vs. uitleg-rijk).
3. **Witlabel/branding?** Moet de tool herbrandbaar zijn voor verschillende adviesbureaus, of altijd "Sportief Opgewekt"-branding?
4. **Excel-import?** Veel adviseurs hebben hun gegevens al in Excel. Een "upload Rekenmodel"-knop die je inputs overneemt zou enorm helpen voor migratie van bestaande projecten.
5. **PPT-template versie**: wil je de huidige template hergebruiken, of een v2 maken met expliciete placeholders die makkelijker te vullen zijn?

Antwoorden hierop bepalen de volgende sprint.
