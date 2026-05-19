/**
 * Grafiek-componenten in Op Naar Nul-stijl.
 *
 * Drie typen:
 *  - WaterverbruikChart: per dag van de week, gestapeld (training/wedstrijd)
 *  - KasstroomChart: cumulatief netto-rendement over 15 jaar
 *  - EnergiebalansChart: huidige situatie — verdeling gasverbruik
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';

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
}

export function ChartCard({ titel, ondertitel, children, hoogte = 280 }: ChartContainerProps) {
  return (
    <div className="card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-primary-900">{titel}</h3>
        {ondertitel && <p className="text-xs text-gray-500">{ondertitel}</p>}
      </div>
      <div style={{ width: '100%', height: hoogte }}>
        {children}
      </div>
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
