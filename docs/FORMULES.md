# Formule-inventaris

> Naslagwerk met alle berekeningen zoals ze in de Excel-modellen staan. Dit is het bronmateriaal voor de TypeScript-modules in `packages/calc-core/src/modules/`.

## Constanten (uit `Inputsheet`)

| Symbool | Waarde | Toelichting |
|---|---|---|
| c_water | 4.19 kJ/(kg·K) | Soortelijke warmte water |
| ρ_water | 1.0 kg/L | Dichtheid water |
| LHV_gas | 31.65 MJ/m³ | (Sommige tabbladen gebruiken 10.1 kWh/m³ ≈ 36.36 MJ — zie noot 1) |
| CO₂_gas | 2.05 kg/m³ | Emissiefactor aardgas |
| CO₂_stroom | 0.337 kg/kWh | Emissiefactor stroom NL grid-mix (rekenmodel) |
| CO₂_stroom_alt | 0.328 kg/kWh | Variant in accumodel |
| 1 ton CO₂ ≈ 3 m³ poolijs | — | Visualisatie |
| 1 ton CO₂ ≈ 50 bomen/jaar | — | Visualisatie |
| 1 ton CO₂ ≈ 7 vluchten AMS-PRS | — | Visualisatie |

**Noot 1**: het rekenmodel gebruikt op verschillende plekken zowel 31.65 MJ/m³ (Dakisolatie!J19 verdeelt MJ door 31.65) als 10.1 kWh/m³ (Lucht-water!J11). Dit is inconsistent — het juiste cijfer voor calorische verbranding (onderwaarde, Gronings gas) is **31.65 MJ/m³ = 8.79 kWh/m³**. In sommige sheets is 10.1 kWh/m³ gebruikt voor *primaire energie* (incl. opwekrendement). Voor de TypeScript-implementatie kiezen we expliciet:
- `GAS_LHV_MJ_M3 = 31.65` — voor warmteverliesbesparing
- `GAS_PRIMARY_KWH_M3 = 10.1` — voor warmtepompvergelijking (waar Excel dit ook gebruikt)

We documenteren dit in code zodat de inconsistentie zichtbaar is en bij latere review aangepast kan worden.

## Subsidiepercentages (default)

Uit `Inputsheet`:
- Dumava: 20% (`H38`)
- Eén-derde regeling gemeente: 33.3% (`H40`)
- IAS: 60% (`H41`)
- BOSA-sport (uit Accuberekening): 40%

## RC-waardes per bouwjaar (uit Inputsheet en alle isolatie-tabs)

| Bouwjaar | Gevel | Vloer | Dak | Glas |
|---|---|---|---|---|
| <1965, met spouw, geen isolatie | 0.35 | 0.33 | 0.35 | 3.6 |
| <1965, met spouw, nageïsoleerd | 0.85 | 0.83 | 0.85 | 2.5 |
| <1965, geen spouw, geen isolatie | 0.19 | 0.15 | 0.22 | 4.9 |
| <1965, geen spouw, nageïsoleerd | 0.69 | 0.65 | 0.72 | 2.7 |
| 1965–1974 | 0.43 | 0.17 | 0.86 | 4.9 |
| 1975–1987 | 1.3 | 0.52 | 1.3 | 4.9 |
| 1988–1991 | 2.0 | 1.3 | 2.0 | 4.9 |
| 1992–2013 | 2.5 | 2.5 | 2.5 | 4.2 |
| 2014 | 3.5 | 3.5 | 3.5 | 1.65 |
| 2015–2020 | 4.5 | 3.5 | 6.0 | 1.65 |
| ≥2021 | 4.7 | 3.7 | 6.3 | 1.65 |

**Glas-U-waardes** (uit Glasisolatie):
- Enkelglas: 5.8 W/m²K (24 m³ gas/m²/jaar bij 24×7 verwarmen)
- Dubbel: 2.8 (11.6 m³)
- HR: 1.9 (7.9 m³)
- HR+: 1.5 (6.2 m³)
- HR++: 1.1 (4.5 m³)
- HR+++: 0.7 (2.9 m³)

## Module 1: Douches (teamsporten)

**Tijdvenster-matrix**: per dag-van-week × tijdslot × veld het percentage douchers. Excel heeft 4 velden, 4–7 tijdsloten per dag, en aparte percentages voor:
- Doordeweekse training: 25% (`U5`)
- Trainingsavond piek: 95% (`U6`)
- Wedstrijd jeugd zaterdag: 50% (`U7`)
- Wedstrijd ouderen zaterdag/zondag: 100% (`U8`)

**Per-dag totaal liters**:
```
Liter[dag] = Σ_slots (Σ_velden percentage_douchers × spelers_per_veld) × min_per_douche × l/min
            (Inputsheet variabelen U10=30 trainingsweken, U11=25 wedstrijdweken,
             U12=5 doucheminuten, U13=7 liter/min)
```

**Gas-omrekening**: 0.2 m³ gas / 50 L water (= 0.004 m³/L, oftewel ca 22 Wh/L, plausibel voor doucheverwarming van 10→38°C inclusief CV-verliezen).

**Totaal jaarverbruik**:
```
Liters_jaar = (Σ_dagen_doordeweeks Liter[dag]) × trainingsweken
            + (Σ_dagen_weekend Liter[dag]) × wedstrijdweken
M3_gas_jaar = Liters_jaar × 0.004
```

**Simpele variant** (`Douchen (overig)`):
```
L_per_douche = doucheminuten × l_per_min       (default 5 × 7 = 35 L)
L_jaar = L_per_douche × aantal_douchebeurten_per_jaar
M3_gas_jaar = (L_jaar / 1000) × 3.93           (3.93 m³ gas per kuub douchewater verwarmd)
```

Verschil tussen de twee: simpele methode is 3.93 m³/m³, gedetailleerde is 0.2/50 × 1000 = 4 m³/m³ → vrijwel gelijk maar gedetailleerde verdeelt de piekuren.

## Module 2: Boilerinhoud + vermogen (warmtepompboiler)

Thermodynamica conform Q = m·c·ΔT:

```
Δt_douche = 38 - 10 = 28 K
Δt_boiler = 65 - 10 = 55 K
debiet = 0.166 L/s per douchekop
piek_seconden = doucheminuten × 60
piek_liters = aantal_douchekoppen × debiet × piek_seconden

Q_kJ = aantal_douchekoppen × c × ρ × Δt_douche × debiet × piek_seconden
toeslag_leidingverliezen = 7.5%
Q_kJ_totaal = Q_kJ × 1.075

effectieve_inhoud_L = Q_kJ_totaal / (c × ρ × (T_boiler - T_koud))
                    = Q_kJ_totaal / (c × ρ × Δt_boiler)
benodigde_inhoud_L = effectieve_inhoud_L / 0.85     (aftapfactor)

P_warmtepompboiler_kW = Q_kJ_totaal / (3600 × oplaadtijd_uren)
```

## Module 3: Verwarming-allocatie

```
Netto_gas_verwarming_m3 = Totaal_gas - Gas_douche - Gas_keuken
Bruto_BVO_gewogen[ruimte] = comfort_weging × BVO[ruimte]
Gas_per_ruimte = (Netto_gas / Σ Bruto_BVO_gewogen) × Bruto_BVO_gewogen[ruimte]
```

## Module 4: Isolatie (algemene formule)

```
U_oud = 1 / Rc_oud                                 W/(m²·K)
U_nieuw = 1 / Rc_nieuw
warmteverlies_oud_W = opp × ΔT × U_oud             (W bij ΔT=8K default)
warmteverlies_nieuw_W = opp × ΔT × U_nieuw
besparing_W = warmteverlies_oud_W - warmteverlies_nieuw_W

stookuren_jaar = 1500              (default in Excel)
besparing_J_jaar = stookuren × 3600 × besparing_W
besparing_kWh = besparing_J / 3.6e6
besparing_m3_gas = besparing_kWh / 8.79             (afgerond: /31.65 voor MJ→m³)

NB Excel deelt door 31.65 (MJ→m³). 31.65 MJ = 8.79 kWh, dus consistente formules.
```

## Module 5: Glasisolatie

Excel gebruikt direct een lookup-tabel m³ gas per m² glas per jaar (bij 24×7 verwarmen):
```
verlies_oud = m3_per_m2[glassoort_oud] × opp_glas × (uren_per_dag/24)
verlies_nieuw = m3_per_m2[glassoort_nieuw] × opp_glas × (uren_per_dag/24)
besparing_m3 = verlies_oud - verlies_nieuw
```

## Module 6: Warmtepompboiler (energieverbruik)

```
COP = 2.7                                          (default)
Piek_liters_per_douche = 7 L/min × 5 min
Boilervat_op_piek = piek_liters / aftap_factor     (0.85 voor oplaadtype)
Q_kJ_piek = boilervat × c × Δt_boiler              (zie boilerinhoud)
kWh_op_piek = (Q_kJ_piek / 3600) / COP
kWh_jaar = kWh_op_piek / piekdouches × jaardouches
P_thermisch_kW = (kWh_jaar × COP / vollasturen) / oplaadtijd
Gasbesparing_m3 = aanwezig_douchegasverbruik
CO2_besparing = m3_gas × 2.05
```

## Module 7: PVT-tapwater (zonneboiler)

Twee opties:
- **Vlakke plaat**: 1.6 GJ/m²/jr ≈ 444 kWh/m²/jr; minimaal 50 L/m² collectorvat
- **Vacuümbuis**: 2.3 GJ/m²/jr ≈ 639 kWh/m²/jr; minimaal 70 L/m² collectorvat

```
benodigd_oppervlak_collector = 1.25 × aantal_douchers_per_dag    (vuistregel)
aantal_collectoren_ideaal = benodigd_oppervlak / opp_per_collector
boiler_grootte = dagverbruik (afgerond op 50 L) of 2× dagverbruik (bivalent)
toegestaan_m2_collector = floor(boiler_grootte/50, opp_per_collector)
opbrengst_kWh = toegestaan_m2 × kWh_per_m2_per_jaar
opbrengst_m3_gas = opbrengst_kWh / 10.1
```

## Module 8: Lucht-water warmtepomp

```
benodigd_vermogen_W_per_m2 (zonder WTW):
  bouwjaar < 2000 → 90
  2000–2010 → 80
  2010–2017 → 60
  > 2017 → 50

met WTW: alle waardes ~45% lager (90→50, 80→45, 60→35, 50→30)

benodigd_vermogen_kW = (W_per_m2 × BVO) / 1000
COP = 4 (default)
Stroomverbruik_kWh = gasbesparing_m3 × 10.1 / COP
```

## Module 9: Lucht-lucht warmtepomp

```
W_per_m3:
  goed_geisoleerd, weinig ramen → 30
  redelijk geisoleerd → 40
  matig geisoleerd → 50
COP = 4
benodigd_vermogen_kW = (W_per_m3 × volume) / 1000
```

## Module 10: Hybride warmtepomp

Beta-factor benadering. Vollasturen per bouwjaar (uit `Hybride warmtepomp` tab):

| Bouwjaar | Vollasturen |
|---|---|
| 1965–1974 | 1801 |
| 1975–1994 | 1749 |
| 1995–1999 | 1700 |
| 2000–2010 | 1649 |
| 2011–2015 | 1525 |
| 2016–2017 | 1400 |
| 2018–2020 | 1200 |
| ≥2021 | 1001 |

```
WTW_besparing_factor = 0.6                          (60% besparing op gas door WTW)
netto_gas[ruimte] = if WTW dan bruto × 0.6 else bruto

gebruiker_kiest gewenst_besparingspercentage_op_gas
benodigd_vermogen_warmtepomp_kW[ruimte] = (netto_gas × 10.1 / vollasturen) × besparingspct

Gasbesparing_m3 = Σ_ruimtes netto_gas × besparingspct
Stroomverbruik_extra_kWh = Gasbesparing_m3 × 10.1 / COP
CO2_besparing_kg = Gasbesparing_m3 × 1.78          (ander getal dan 2.05 — Excel-inconsistentie)
```

## Module 11: Binnenverlichting

Eenvoudig:
```
huidig_W_per_jaar = Σ (aantal × W) × branduren_per_jaar / 1000     (kWh)
led_W_per_jaar = idem met LED-armaturen
besparing_kWh = huidig - led
```

## Module 12: Veldverlichting (LED)

```
totaal_vermogen_W_huidig = aantal_armaturen_huidig × W_per_armatuur_huidig
totaal_vermogen_W_led = (aantal_armaturen_led × W_per_armatuur_led) × dimstand
                                                    (dimstand_training = 0.7)
verbruik_seizoen_kWh_huidig = totaal_W_huidig × branduren / 1000
verbruik_seizoen_kWh_led = totaal_W_led × branduren / 1000
besparing_kWh = huidig - led
```

## Module 13: Zonnepanelen

Staffel-prijzen incl btw (€/Wp):
- <5000 Wp: 1.39
- 5.000–10.000: 1.38
- 10.001–20.000: 1.36
- 20.001–30.000: 1.33
- 30.001–40.000: 1.31
- 40.001–50.000: 1.28
- 50.001–60.000: 1.26
- 60.001–80.000: 1.23
- 80.001–100.000: 1.21
- >100.000: 1.19

```
Wp_nodig = aantal_kWh_per_jaar × 1.2 (15% overopwek + 5% verlies)
aantal_panelen = ceil(Wp_nodig / 430)               (430 Wp per paneel default)
bruto_investering = Wp_nodig × prijs_per_Wp[staffel]

vermindering_per_jaar = 0.03%                       (0.0003)
opwek[jaar] = aantal_panelen × Wp × instralingsfactor × (1 - 0.0003)^jaar

Direct_verbruik = ratio × jaarverbruik              (default 15%)
Terug_te_leveren = opwek - direct - thermisch - batterij
Waarde = direct × stroomprijs
       + terug × (terugleverwaarde - boete_terugleveren)
```

## Module 14: Batterij (eenvoudig, zonder tijdreeks)

```
hergebruik_door_batterij = teruglevering × 0.35
EPEX_handel = teruglevering × 0.25
waarde_hergebruik = hergebruik × stroomprijs
waarde_EPEX = EPEX_handel × (stroomprijs - 0.18)
totale_verdienst = waarde_hergebruik + waarde_EPEX + besparing_vastrecht
onderhoud_kosten = 500 €/jaar (default)
TVT = netto_investering / (totale_verdienst - onderhoud)
```

## Module 15: Aansluitwaarde-check

```
Tabel kleinverbruik:
  1x16A → 3.68 kW
  1x25A → 5.75 kW
  3x25A → 17.2 kW
  3x35A → 24.1 kW
  3x40A → 27.6 kW
  3x50A → 34.5 kW
  3x63A → 43.47 kW
  3x80A → 55.2 kW
Grootverbruik vanaf 3x80A.

Bij gelijktijdig piekgebruik:
  P_max = P_basis
        + P_LED_overgang     (wanneer ander armaturen nu uit zijn)
        + P_warmtapwater_elec / COP
        + P_verwarming_elec / COP
        + P_extra_LED         (toevoegingen)
        + P_CV-pomp_hybride
        + P_overige_elektrificatie

Vergelijken tegen aansluitwaarde[type] → "tekort" of "voldoende"
Capaciteitstarief transport Liander 2025 voor budget-impact.
```

## Module 16: Penningmeester-rollup

Voor elke geselecteerde maatregel:
```
totale_bruto_investering = Σ bruto[maatregel]
totale_subsidie = Σ subsidies[maatregel]
totale_besparing_jaar = Σ besparing[maatregel]
totale_terugverdientijd = (totaal_bruto - totaal_subsidie) / totaal_besparing
```

Plus: dubbele-tellingen-detectie (bv. niet zowel hybride warmtepomp als lucht-water voor dezelfde ruimte).

## Tijdreeks-engine (uit Accumodel EPEX)

Per uur t in [0, 8760):
```
netto[t] = P[t] - V[t]                              // opwek - verbruik

if netto[t] > 0:                                    // overschot
  laad_pv = min(netto, P_batt, C_max - SOC[t])
  curtailment[t] = max(0, netto - laad_pv)
  net_afname[t] = 0
  net_inname[t] = laad_pv                            // (in feite: gaat naar batterij)
else:
  ontlaad = min(-netto, P_batt, SOC[t] - C_min)
  net_afname[t] = -netto - ontlaad
  laad_pv = 0

// EPEX-arbitrage: alleen laden tijdens topN goedkoopste uren van dag d
goedkope_uren_d = sort(epex[24*d : 24*(d+1)])[:N_goedkoop]
if t in goedkope_uren_d and epex[t] < threshold:
  extra_laad = min(P_batt - laad_pv, C_max - SOC[t])
  epex_inkoop[t] = extra_laad
else:
  extra_laad = 0

SOC[t+1] = SOC[t] + (laad_pv + extra_laad - ontlaad) × (1 - verlies)
verlies_factor = 0.02                              // 2% kabelverlies omvormer→hoofdverdeler
```

## Multi-jaar cashflow (uit Accuberekening / Waarde zonnepanelen)

```
voor jaar j in [start, start+looptijd]:
  opwek[j] = opwek[j-1] × (1 - degradatie)
  jaarverbruik[j] = jaarverbruik[start]              // constant tenzij elektrificatie
  direct_verbruik[j] = jaarverbruik × eigen_verbruik_ratio
  teruglevering[j] = opwek - direct - thermisch - batterij
  waarde[j] = direct × stroomprijs[j]
            + teruglevering × (terugleverwaarde - boete)

stroomprijs[j] = stroomprijs[start] × (1 + indexering)^j
```

---

## Hoe deze inventaris te gebruiken

Bij het bouwen van elke TypeScript module: open dit document, vind de relevante sectie, implementeer de formules letterlijk. Schrijf een test die een Excel-scenario reproduceert (drie scenario's per module: licht/gemiddeld/zwaar geval), vergelijk uitkomst.

Bij inconsistenties in Excel (zoals 31.65 MJ vs 10.1 kWh): expliciet documenteren in commentaar bij de constant, niet stilzwijgend "fixen".
