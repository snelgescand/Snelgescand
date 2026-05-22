/**
 * Beheer-instellingen — "premium Excel"-paneel.
 *
 * Drie groepen instellingen voor beheerders:
 *   1. Prijzen (gas/stroom/water) — gebruikt in de PPT-export en kostenraming
 *   2. Vuistregels (CO₂, gas per douche, etc) — voor PPT-export en analyses
 *   3. Subsidies (ISDE/DUMAVA/SCE) — getoond in maatregel-tegels
 *
 * Per veld een toelichting WAAR het wordt gebruikt, en een "← default"-knop
 * om individueel terug te zetten.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instellingenApi, type TenantInstellingen, authApi } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { Footer } from '../components/Footer';

export default function BeheerInstellingen() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => authApi.me() });
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-instellingen'],
    queryFn: () => instellingenApi.get(),
  });

  const update = useMutation({
    mutationFn: (data: Partial<TenantInstellingen>) => instellingenApi.update(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-instellingen'] });
      setOpgeslagen(true);
      setTimeout(() => setOpgeslagen(false), 2000);
    },
  });

  const reset = useMutation({
    mutationFn: () => instellingenApi.reset(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-instellingen'] }),
  });

  const [opgeslagen, setOpgeslagen] = useState(false);

  // Lokale draft-state — pas naar backend bij blur of klik
  const [draft, setDraft] = useState<TenantInstellingen | null>(null);
  const huidig = draft ?? data?.instellingen;

  if (me.data && me.data.gebruiker.rol !== 'BEHEERDER') {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="card p-8 text-center">
            <p className="text-gray-600">Alleen beheerders hebben toegang tot deze pagina.</p>
            <Link to="/projecten" className="text-primary-700 hover:underline text-sm mt-2 inline-block">
              ← Terug naar projecten
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (isLoading || !huidig || !data) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="max-w-3xl mx-auto px-4 py-8">
          <p className="text-gray-500">Instellingen laden…</p>
        </main>
      </div>
    );
  }

  function veldWijzig<K extends keyof TenantInstellingen>(
    groep: K,
    veld: keyof TenantInstellingen[K],
    waarde: number,
  ) {
    if (!huidig) return;
    setDraft({
      ...huidig,
      [groep]: { ...huidig[groep], [veld]: waarde },
    });
  }

  function opslaanGroep<K extends keyof TenantInstellingen>(groep: K) {
    if (!draft || !huidig) return;
    update.mutate({ [groep]: huidig[groep] } as Partial<TenantInstellingen>);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader rechts={
        <>
          <Link to="/projecten" className="text-sm text-gray-700 hover:text-primary-700">← Projecten</Link>
          <Link to="/beheer" className="text-sm text-gray-700 hover:text-primary-700">Beheer</Link>
        </>
      } />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary-900">Berekening-instellingen</h1>
            <p className="text-gray-600 mt-1 max-w-2xl">
              Pas hier de prijzen, vuistregels en subsidie-percentages aan voor jouw organisatie.
              Wijzigingen werken door in de PPT-export en in kostenramingen.
            </p>
          </div>
          {opgeslagen && (
            <span className="text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-full">✓ Opgeslagen</span>
          )}
        </div>

        <div className="space-y-6">
          {/* === Prijzen === */}
          <Sectie titel="💰 Prijzen" omschrijving="Tarieven die gebruikt worden om besparingen en kosten in euro's uit te rekenen.">
            <Veld
              label="Gasprijs"
              eenheid="€/m³"
              waarde={huidig.prijzen.gasPerM3}
              defaultWaarde={data.defaults.prijzen.gasPerM3}
              onChange={v => veldWijzig('prijzen', 'gasPerM3', v)}
              tooltip="Gemiddelde all-in gasprijs incl. belastingen en transport. Gebruikt in: douche-kosten, kantine-besparing, PPT-cijfers."
            />
            <Veld
              label="Stroomprijs"
              eenheid="€/kWh"
              waarde={huidig.prijzen.stroomPerKwh}
              defaultWaarde={data.defaults.prijzen.stroomPerKwh}
              onChange={v => veldWijzig('prijzen', 'stroomPerKwh', v)}
              tooltip="Gemiddelde all-in stroomprijs. Gebruikt in: terugverdientijd PV, besparing LED, batterij-rendement."
            />
            <Veld
              label="Waterprijs"
              eenheid="€/m³"
              waarde={huidig.prijzen.waterPerM3}
              defaultWaarde={data.defaults.prijzen.waterPerM3}
              onChange={v => veldWijzig('prijzen', 'waterPerM3', v)}
              tooltip="Drinkwatertarief incl. zuiveringsheffing. Gebruikt in: kostbesparing WC en douches."
            />
            <Knop
              label="Prijzen opslaan"
              isLoading={update.isPending}
              gewijzigd={draft?.prijzen !== huidig.prijzen && draft !== null}
              onClick={() => opslaanGroep('prijzen')}
            />
          </Sectie>

          {/* === Vuistregels === */}
          <Sectie titel="📐 Vuistregels" omschrijving="Standaard aannames voor verbruik en CO₂. Pas aan als je betere bron-data hebt voor jouw projecten.">
            <Veld
              label="Liter water per douche"
              eenheid="L"
              waarde={huidig.vuistregels.literPerDouche}
              defaultWaarde={data.defaults.vuistregels.literPerDouche}
              onChange={v => veldWijzig('vuistregels', 'literPerDouche', v)}
              tooltip="Aanname uit Sportief Opgewekt Excel: 35 L warm water per douche."
            />
            <Veld
              label="Gas per douche"
              eenheid="m³"
              waarde={huidig.vuistregels.gasPerDouche}
              defaultWaarde={data.defaults.vuistregels.gasPerDouche}
              onChange={v => veldWijzig('vuistregels', 'gasPerDouche', v)}
              step={0.1}
              tooltip="Hoeveel m³ gas nodig is om 1 douche-warmwater te verwarmen. Bij standaard CV-ketel: ~0,5 m³."
            />
            <Veld
              label="Liter per WC-spoeling"
              eenheid="L"
              waarde={huidig.vuistregels.literPerSpoeling}
              defaultWaarde={data.defaults.vuistregels.literPerSpoeling}
              onChange={v => veldWijzig('vuistregels', 'literPerSpoeling', v)}
              tooltip="Hoeveel water elke spoeling kost. Moderne dual-flush: 4-6L. Oude toiletten: 9-12L."
            />
            <Veld
              label="CO₂ per m³ gas"
              eenheid="kg"
              waarde={huidig.vuistregels.co2GasPerM3}
              defaultWaarde={data.defaults.vuistregels.co2GasPerM3}
              onChange={v => veldWijzig('vuistregels', 'co2GasPerM3', v)}
              step={0.01}
              tooltip="Emissiefactor aardgas. Officiële NL-waarde: 1,78 kg CO₂/m³."
            />
            <Veld
              label="CO₂ per kWh stroom"
              eenheid="kg"
              waarde={huidig.vuistregels.co2StroomPerKwh}
              defaultWaarde={data.defaults.vuistregels.co2StroomPerKwh}
              onChange={v => veldWijzig('vuistregels', 'co2StroomPerKwh', v)}
              step={0.01}
              tooltip="Gemiddelde NL-mix emissiefactor. Daalt elk jaar — actuele CBS-waarde rond 0,28-0,34."
            />
            <Veld
              label="Primair-factor gas (WEii)"
              eenheid="kWh/m³"
              waarde={huidig.vuistregels.primairFactorGas}
              defaultWaarde={data.defaults.vuistregels.primairFactorGas}
              onChange={v => veldWijzig('vuistregels', 'primairFactorGas', v)}
              step={0.01}
              tooltip="Omrekenfactor m³ gas → primair kWh voor WEii-score. Standaard: 9,77."
            />
            <Knop
              label="Vuistregels opslaan"
              isLoading={update.isPending}
              gewijzigd={draft?.vuistregels !== huidig.vuistregels && draft !== null}
              onClick={() => opslaanGroep('vuistregels')}
            />
          </Sectie>

          {/* === Subsidies === */}
          <Sectie titel="🎁 Subsidies" omschrijving="Percentages die als indicatie worden getoond bij relevante maatregelen.">
            <Veld
              label="ISDE-subsidie"
              eenheid="%"
              waarde={huidig.subsidies.isdePct}
              defaultWaarde={data.defaults.subsidies.isdePct}
              onChange={v => veldWijzig('subsidies', 'isdePct', v)}
              tooltip="Investeringssubsidie Duurzame Energie — vooral voor warmtepompen en isolatie. Actuele percentages op rvo.nl."
            />
            <Veld
              label="DUMAVA-subsidie"
              eenheid="%"
              waarde={huidig.subsidies.dumavaPct}
              defaultWaarde={data.defaults.subsidies.dumavaPct}
              onChange={v => veldWijzig('subsidies', 'dumavaPct', v)}
              tooltip="DUurzaam MAatschappelijk VAstgoed-subsidie voor sportclubs en MFA's."
            />
            <Veld
              label="SCE-subsidie"
              eenheid="%"
              waarde={huidig.subsidies.scePct}
              defaultWaarde={data.defaults.subsidies.scePct}
              onChange={v => veldWijzig('subsidies', 'scePct', v)}
              tooltip="Subsidie Coöperatieve Energieopwekking — alleen relevant voor postcoderoos-projecten."
            />
            <Knop
              label="Subsidies opslaan"
              isLoading={update.isPending}
              gewijzigd={draft?.subsidies !== huidig.subsidies && draft !== null}
              onClick={() => opslaanGroep('subsidies')}
            />
          </Sectie>

          {/* Reset alles */}
          <div className="card p-4 bg-red-50 border border-red-200">
            <h3 className="text-sm font-semibold text-red-900 mb-1">Alles terugzetten</h3>
            <p className="text-xs text-red-800 mb-3">
              Reset alle waarden naar de standaarden. Bestaande projecten worden niet aangepast — alleen toekomstige berekeningen.
            </p>
            <button
              onClick={() => {
                if (confirm('Weet je zeker dat je alle instellingen wilt resetten naar de standaarden?')) {
                  reset.mutate();
                  setDraft(null);
                }
              }}
              className="text-xs text-red-700 hover:bg-red-100 px-3 py-1.5 rounded border border-red-300"
              disabled={reset.isPending}
            >
              {reset.isPending ? 'Resetten…' : '↻ Reset alle instellingen'}
            </button>
          </div>

          <div className="card p-4 bg-blue-50 border border-blue-200">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Wat doet deze pagina niet?</h3>
            <p className="text-xs text-blue-800 leading-relaxed">
              De gebruikt-in-deze-PPT prijzen + vuistregels en subsidie-tekst werken al door. De per-maatregel
              percentages (zoals "25% besparing dakisolatie") zitten dieper in de calc-modules en worden in een
              latere versie ook hier instelbaar. Vandaag zit de waarde van deze pagina vooral in de PPT-export
              die je tenant-specifieke prijzen gebruikt.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Sectie({ titel, omschrijving, children }: { titel: string; omschrijving: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold text-primary-900 mb-1">{titel}</h2>
      <p className="text-xs text-gray-600 mb-4">{omschrijving}</p>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Veld({
  label, eenheid, waarde, defaultWaarde, onChange, tooltip, step = 0.01,
}: {
  label: string;
  eenheid: string;
  waarde: number;
  defaultWaarde: number;
  onChange: (v: number) => void;
  tooltip: string;
  step?: number;
}) {
  const isDefault = waarde === defaultWaarde;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
      <div>
        <label className="text-sm text-gray-900">{label}</label>
        <p className="text-xs text-gray-500">{tooltip}</p>
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          min={0}
          value={waarde}
          onChange={e => onChange(Number(e.target.value))}
          className="input py-1 w-24 text-sm text-right"
        />
        <span className="text-xs text-gray-500">{eenheid}</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(defaultWaarde)}
        className={`text-xs px-2 py-1 rounded ${isDefault ? 'text-gray-300 cursor-not-allowed' : 'text-primary-700 hover:bg-primary-50'}`}
        disabled={isDefault}
        title={isDefault ? 'Al op default' : `Reset naar ${defaultWaarde}`}
      >
        ↺ {defaultWaarde}
      </button>
    </div>
  );
}

function Knop({ label, isLoading, gewijzigd, onClick }: {
  label: string; isLoading: boolean; gewijzigd: boolean; onClick: () => void;
}) {
  return (
    <div className="flex justify-end pt-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isLoading || !gewijzigd}
        className={`text-sm px-4 py-1.5 rounded ${gewijzigd
          ? 'bg-accent-orange text-white hover:bg-accent-orange/90'
          : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
      >
        {isLoading ? 'Opslaan…' : gewijzigd ? label : '— niets gewijzigd'}
      </button>
    </div>
  );
}
