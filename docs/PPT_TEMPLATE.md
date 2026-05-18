# PowerPoint-template aanpassen

De PPT-export werkt met **placeholders** in je eigen template. Het systeem leest je `.pptx`, vervangt alle `{{...}}` in tekstvakken/tabellen/notities, en stuurt het bestand als download naar de gebruiker.

## Hoe het werkt

1. Maak een PowerPoint die er precies uitziet zoals jouw uiteindelijke rapport
2. Vervang waar nu vaste tekst staat door **placeholders** zoals `{{rollup.nettoInvestering | euro}}`
3. Sla op als `apps/api/scripts/TEMPLATE_v2.pptx`
4. Bij klik op "↓ PowerPoint" in de UI vult het systeem alle placeholders en levert het bestand op

## Beschikbare placeholders

### Project-context
```
{{context.club.naam}}                            → "Voetbalclub Demo"
{{context.club.aantalLeden | int}}               → "350"
{{context.gebouw.bouwjaar}}                      → "1985"
{{context.gebouw.bvoTotaalM2 | int}}             → "450"
{{context.energie.gasverbruikM3 | m3}}           → "6.500 m³"
{{context.energie.stroomverbruikTotaalKwh | kwh}} → "32.000 kWh"
```

### Rollup (penningmeester-totalen)
```
{{rollup.totaleInvestering | euro}}                  → "€ 145.691"
{{rollup.totaleSubsidie | euro}}                     → "€ 17.135"
{{rollup.nettoInvestering | euro}}                   → "€ 128.556"
{{rollup.totaleBesparingPerJaar | euro}}             → "€ 13.633"
{{rollup.gemiddeldeTerugverdientijdJaren | jaren}}   → "8,4 jaar"
{{rollup.totaleCo2BesparingKg | ton}}                → "26,9 ton"
{{rollup.totaleBesparingGasM3 | m3}}                 → "5.234 m³"
{{rollup.totaleBesparingStroomKwh | kwh}}            → "12.450 kWh"
{{rollup.nieuwePiekBelastingKw | int}}               → "47"
```

### Per maatregel
Gebruik de maatregel-id (zie `MODULE_REGISTRY` in `packages/calc-core/src/registry.ts`):

```
{{maatregel.dakisolatie.brutoInvestering | euro}}
{{maatregel.dakisolatie.totaleSubsidie | euro}}
{{maatregel.dakisolatie.besparingPerJaar | euro}}
{{maatregel.dakisolatie.terugverdientijdJaren | jaren}}
{{maatregel.dakisolatie.co2BesparingKg | int}}

{{maatregel.zonnepanelen.totaalWp | int}}
{{maatregel.zonnepanelen.opbrengstJaar1Kwh | kwh}}
{{maatregel.zonnepanelen.cumulatiefRendementEur | euro}}

{{maatregel.lucht-water-warmtepomp.vermogenKw | int}}
{{maatregel.lucht-water-warmtepomp.scop}}
```

Alle 19 maatregel-id's:
```
douches-analyse, dakisolatie, spouwmuurisolatie, vloerisolatie,
glasisolatie, waterzijdig-inregelen, wtw, warmtepompboiler, eboiler,
pvt-tapwater, qton-warmtepomp, lmnt-warmtepomp,
lucht-water-warmtepomp, lucht-lucht-warmtepomp, hybride-warmtepomp,
binnenverlichting, ledveldverlichting, zonnepanelen,
batterij-eenvoudig
```

## Filters

| Filter | Input | Output |
|---|---|---|
| `euro` | `145691` | `€ 145.691` |
| `int` | `12.7` | `13` |
| `kwh` | `32000` | `32.000 kWh` |
| `m3` | `6500` | `6.500 m³` |
| `ton` | `26900` | `26,9 ton` (deelt door 1000) |
| `jaren` | `8.4` | `8,4 jaar` |
| `pct` | `0.15` | `15%` |
| `raw` (default) | `"foo"` | `"foo"` |

## Belangrijke tips

### 1. Plak placeholders in één keer
Als je `{{...}}` in PowerPoint typt met midden in de placeholder een stijl-wisseling (bv. eerst gewoon, dan vetgedrukt), splitst PowerPoint dat over twee "runs". Onze sidecar combineert die runs automatisch, dus dat is opgelost — maar de stijl van het eerste karakter wint. **Plak liever in één keer en stijl daarna.**

### 2. Tekstvakken, tabellen en notities werken
Placeholders in tabelcellen worden ook ingevuld. Notities-pagina's idem.

### 3. Grafieken: niet dynamisch (nog)
PowerPoint-grafieken met data-bindings werken niet automatisch. Voor MVP zijn alleen tekst-placeholders ondersteund. Als je dynamische grafieken wilt, zijn er twee opties:

- **Optie A**: laat de frontend de grafiek renderen (Recharts), screenshot maken, en als image uploaden in de export
- **Optie B**: matplotlib in de python sidecar gebruiken om PNG's te genereren en in vaste posities te injecteren

Beide opties komen pas in een latere sprint.

### 4. Lege/onbekende velden
Als een placeholder verwijst naar data die niet bestaat (bv. een maatregel die niet is gekozen), wordt het vervangen door `—`. Geen crash.

### 5. Conditionele slides
Werkt nog niet automatisch. Voor de MVP: maak één masterslide per onderdeel en zet alle scenario's erop — de placeholders die niets vinden tonen `—`.

## Workflow voor jouw eigen template

1. Open de bestaande "STANDAARD - {klant} - Verduurzamingsplan.pptx" in PowerPoint
2. Loop slide voor slide:
   - Vervang `[klantnaam]` door `{{context.club.naam}}`
   - Vervang `[€ ....]` door bv. `{{rollup.nettoInvestering | euro}}`
   - Vervang `[X,X jaar]` door `{{rollup.gemiddeldeTerugverdientijdJaren | jaren}}`
3. Slides waar geen dynamische data op staat (omslag, visie-pagina's, etc.) laat je staan
4. Sla op als `apps/api/scripts/TEMPLATE_v2.pptx`
5. Op de server: scp het bestand naar `~/apps/sportief-opgewekt/apps/api/scripts/TEMPLATE_v2.pptx`
6. Geen restart nodig — wordt bij elke export opnieuw ingelezen

## Test lokaal voordat je deployt

```bash
cd apps/api/scripts
# Maak test-JSON met dezelfde structuur als de API stuurt:
cat > test.json <<EOF
{
  "context": { "club": { "naam": "Test FC" } },
  "rollup": { "nettoInvestering": 128556 },
  "perMaatregel": { "dakisolatie": { "besparingPerJaar": 416 } }
}
EOF

# Render:
python3 generate_pptx.py TEMPLATE_v2.pptx < test.json > test-uitvoer.pptx

# Open test-uitvoer.pptx en check of alle placeholders correct ingevuld zijn.
```
