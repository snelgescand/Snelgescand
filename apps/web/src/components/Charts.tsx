/**
 * Grafiek-componenten in Op Naar Nul-stijl.
 *
 * Drie typen:
 *  - WaterverbruikChart: per dag van de week, gestapeld (training/wedstrijd)
 *  - KasstroomChart: cumulatief netto-rendement over 15 jaar
 *  - EnergiebalansChart: huidige situatie — verdeling gasverbruik
 */

import { useRef, useState, type RefObject } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';
import { downloadGrafiekPng, type ExportThema } from '../util/kopieer';

const ONN_TEAL = '#006579';
const ONN_TEAL_LIGHT = '#5DA4AE';
const ONN_ORANJE = '#DE533E';
const ONN_DONKER = '#042d34';
const ONN_GRIJS = '#64748b';
const PALETTE = [ONN_TEAL, ONN_ORANJE, ONN_TEAL_LIGHT, '#90C2C9', '#F2A192', '#1F2D7A'];

interface ChartContainerProps {
  titel: string;
  ondertitel?: string;
  children: React.ReactNode;
  hoogte?: number;
  toelichting?: React.ReactNode;
  /** Optionele actie-knop(pen) rechts in de header, bv. een KopieerKnop. */
  actie?: React.ReactNode;
}

/** Klein menu om de grafiek als PNG te downloaden in een gekozen kleurstijl. */
function GrafiekPngKnop({ targetRef, naam }: { targetRef: RefObject<HTMLDivElement | null>; naam: string }) {
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);

  async function exporteer(thema: ExportThema) {
    if (!targetRef.current) return;
    setBezig(true);
    try {
      await downloadGrafiekPng(targetRef.current, naam, thema);
    } catch (e) {
      console.error('Grafiek-export mislukt:', e);
    } finally {
      setBezig(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-xs px-2.5 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
        title="Download de grafiek als afbeelding (PNG)"
      >
        {bezig ? '…' : '🖼️ Grafiek'} <span className="text-[9px]">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 text-xs">
            <p className="px-1.5 pt-0.5 pb-1 text-[10px] uppercase tracking-wide text-gray-400">Grafiek als PNG</p>
            <button type="button" className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100" onClick={() => exporteer('onn')}>🟢 Op Naar Nul-kleuren</button>
            <button type="button" className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100" onClick={() => exporteer('spo')}>🔵 Sportief Opgewekt-kleuren</button>
            <p className="px-1.5 pt-1 text-[10px] text-gray-400 leading-snug">Tip: de bijhorende datatabel kun je via de andere knop als HTML/PNG opslaan (incl. legenda).</p>
          </div>
        </>
      )}
    </div>
  );
}

export function ChartCard({ titel, ondertitel, children, hoogte = 280, toelichting, actie }: ChartContainerProps) {
  const grafiekRef = useRef<HTMLDivElement>(null);
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-primary-900">{titel}</h3>
          {ondertitel && <p className="text-xs text-gray-500">{ondertitel}</p>}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {actie}
          <GrafiekPngKnop targetRef={grafiekRef} naam={titel} />
        </div>
      </div>
      <div ref={grafiekRef} style={{ width: '100%', height: hoogte }}>
        {children}
      </div>
      {toelichting && (
        <div className="text-xs text-gray-500 mt-3 leading-snug">
          {toelichting}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * Waterverbruik per dag (training + wedstrijd, gestapeld)
 * ============================================================ */

interface WaterverbruikDag {
  dag: string;
  trainingL: number;
  wedstrijdL: number;
}

export function WaterverbruikChart({ data }: { data: WaterverbruikDag[] }) {
  const labels = data.map(d => ({
    ...d,
    dagKort: d.dag.slice(0, 2).toUpperCase(),
  }));

  return (
    <ResponsiveContainer>
      <BarChart data={labels} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E0F2F5" />
        <XAxis dataKey="dagKort" tick={{ fill: ONN_DONKER, fontSize: 12 }} />
        <YAxis tick={{ fill: ONN_DONKER, fontSize: 12 }} label={{ value: 'Liters/dag', angle: -90, position: 'insideLeft', fill: ONN_GRIJS, fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: 'white', border: `1px solid ${ONN_TEAL}`, borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => `${Math.round(v).toLocaleString('nl-NL')} L`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="trainingL" stackId="a" name="Training" fill={ONN_TEAL} radius={[0, 0, 0, 0]} />
        <Bar dataKey="wedstrijdL" stackId="a" name="Wedstrijd" fill={ONN_ORANJE} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ============================================================
 * Kasstroom: cumulatief netto rendement
 * ============================================================ */

interface KasstroomPunt {
  jaar: number;
  cumulatief: number;
  jaarBesparing?: number;
}

export function KasstroomChart({ data }: { data: KasstroomPunt[] }) {
  return (
    <ResponsiveContainer>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="kasstroom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ONN_TEAL} stopOpacity={0.4} />
            <stop offset="100%" stopColor={ONN_TEAL} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E0F2F5" />
        <XAxis dataKey="jaar" tick={{ fill: ONN_DONKER, fontSize: 12 }} label={{ value: 'Jaar', position: 'insideBottom', offset: -2, fill: ONN_GRIJS, fontSize: 11 }} />
        <YAxis
          tick={{ fill: ONN_DONKER, fontSize: 12 }}
          tickFormatter={(v) => `€${Math.round(v / 1000)}k`}
        />
        <Tooltip
          contentStyle={{ background: 'white', border: `1px solid ${ONN_TEAL}`, borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => `€ ${Math.round(v).toLocaleString('nl-NL')}`}
        />
        <Area type="monotone" dataKey="cumulatief" stroke={ONN_TEAL} strokeWidth={2} fill="url(#kasstroom)" name="Cumulatief netto" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ============================================================
 * Energiebalans: waar gaat het gas naartoe
 * ============================================================ */

interface EnergiePost {
  naam: string;
  m3: number;
}

export function EnergiebalansChart({ data }: { data: EnergiePost[] }) {
  const totaal = data.reduce((s, d) => s + d.m3, 0);
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie
          data={data}
          dataKey="m3"
          nameKey="naam"
          cx="50%"
          cy="50%"
          outerRadius={90}
          innerRadius={50}
          paddingAngle={2}
          label={({ percent }) => `${(percent! * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: 'white', border: `1px solid ${ONN_TEAL}`, borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => `${Math.round(v).toLocaleString('nl-NL')} m³ (${((v / totaal) * 100).toFixed(0)}%)`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="bottom" height={36} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ============================================================
 * Waterverbruik per uur van de dag (bar chart)
 * ============================================================ */

interface WaterPerUur {
  uur: string;
  liters: number;
}

export function WaterverbruikPerUurChart({ data }: { data: WaterPerUur[] }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E0F2F5" />
        <XAxis dataKey="uur" tick={{ fill: ONN_DONKER, fontSize: 10 }} interval={2} />
        <YAxis tick={{ fill: ONN_DONKER, fontSize: 12 }} />
        <Tooltip
          contentStyle={{ background: 'white', border: `1px solid ${ONN_TEAL}`, borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => `${Math.round(v).toLocaleString('nl-NL')} L`}
        />
        <Bar dataKey="liters" name="Warm water" fill={ONN_TEAL} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ============================================================
 * Maatregel-vergelijking (TVT en besparing per maatregel)
 * ============================================================ */

interface MaatregelStaaf {
  naam: string;
  tvt: number;          // jaren
  besparingEur: number;
}

export function MaatregelVergelijking({ data }: { data: MaatregelStaaf[] }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E0F2F5" />
        <XAxis type="number" tick={{ fill: ONN_DONKER, fontSize: 11 }} />
        <YAxis type="category" dataKey="naam" width={100} tick={{ fill: ONN_DONKER, fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: 'white', border: `1px solid ${ONN_TEAL}`, borderRadius: 8, fontSize: 12 }}
          formatter={(v: number, key) => key === 'tvt' ? `${v.toFixed(1)} jaar` : `€ ${Math.round(v).toLocaleString('nl-NL')}`}
        />
        <Bar dataKey="besparingEur" name="Besparing/jaar" fill={ONN_TEAL} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
