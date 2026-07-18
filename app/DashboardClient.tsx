"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Activity, PreOpp, Seller } from "../lib/googleSheets";

const PIPELINE_VALUE_PER_PREOPP = 100000;
const PIPELINE_VALUE_CLOUD_EMX = 180000;

type View = "overview" | "preopps" | "convertidas";
type Props = { sellers: Seller[]; preopps: PreOpp[]; activities: Activity[]; source: string; view?: View };
type Tone = "blue" | "amber" | "green" | "teal" | "gray" | "red" | "purple";
type DetailPreOpp = PreOpp & { previous?: PreOpp | null; changesCount?: number };
type ExecutiveState = "Propuestas" | "Activas" | "Convertidas" | "Convertida Congelada" | "Descartadas" | "Sin clasificar";

type ConsolidatedUnit = {
  key: string;
  cuenta: string;
  vendedor: string;
  region: string;
  pais: string;
  industria: string;
  productFamily: string;
  state: ExecutiveState;
  stage: string;
  pipelineEsperado: number;
  pipelineLogrado: number;
  latest: PreOpp;
  rows: PreOpp[];
};

type AccountProductRow = {
  key: string;
  cuenta: string;
  vendedor: string;
  region: string;
  pais: string;
  industria: string;
  productStatus: Record<string, { state: ExecutiveState; stage: string; preopp: PreOpp }>;
  products: string[];
  pipelineEsperado: number;
  pipelineLogrado: number;
  ultimaActividad: string;
  alerta: string;
  totalPreopps: number;
  rows: PreOpp[];
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function compactCurrency(value: number) {
  const safe = value || 0;
  const abs = Math.abs(safe);

  const clean = (num: number) => {
    const rounded = Math.round(num * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  };

  if (abs >= 1000000) return `USD ${clean(safe / 1000000)}MM`;
  if (abs >= 1000) return `USD ${clean(safe / 1000)}K`;

  return currency(safe);
}

function percent(value: number) {
  return `${Math.round((value || 0) * 100)}%`;
}

function safeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = String(value)
    .replace(/USD/gi, "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
}

function getField(row: unknown, names: string[]) {
  const record = row as Record<string, unknown>;

  for (const name of names) {
    const value = record?.[name];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
}

function getPipelineEsperadoInicial(preopp: PreOpp) {
  const valueFromRow = safeNumber(
    getField(preopp, [
      "pipelineEsperado",
      "Pipeline_Esperado_Inicial",
      "Pipeline esperado inicial",
      "Pipeline_Esperado",
      "Pipeline Esperado",
      "Pipeline_Estimado",
      "Pipeline Estimado",
    ])
  );

  if (valueFromRow > 0) {
    return valueFromRow;
  }

  const product = String(preopp.producto || "").toLowerCase();

  if (product.includes("cloud emx") || product.includes("emx")) {
    return PIPELINE_VALUE_CLOUD_EMX;
  }

  return PIPELINE_VALUE_PER_PREOPP;
}

function getPipelineLogradoActual(preopp: PreOpp) {
  const valueFromRow = safeNumber(
    getField(preopp, [
      "pipelineLogrado",
      "Pipeline_Logrado_Esta_Semana",
      "Pipeline logrado esta semana",
      "Pipeline_Logrado",
      "Pipeline logrado",
      "Net Revenue",
      "Deal Amount",
      "Deal amount",
      "Monto",
      "Amount",
    ])
  );

  if (valueFromRow > 0) {
    return valueFromRow;
  }

  return safeNumber(preopp.montoEstimado);
}

function getExecutiveState(preopp: Pick<PreOpp, "etapa" | "estado">): ExecutiveState {
  if (["Propuestas", "Activas", "Convertidas", "Convertida Congelada", "Descartadas"].includes(preopp.estado)) {
    return preopp.estado as ExecutiveState;
  }

  if (preopp.etapa === "Identificada") return "Propuestas";
  if (["Validada por owner", "Interés detectado", "Con monto estimado"].includes(preopp.etapa)) return "Activas";

  if (
    [
      "Convertida a Cloud Sales",
      "Convertida a Prospect",
      "Prospect",
      "Qualified",
      "Technical Validation",
      "Business Validation",
      "Committed",
      "Commited",
      "Launched",
    ].includes(preopp.etapa)
  ) {
    return "Convertidas";
  }

  if (preopp.etapa === "Frozen") return "Convertida Congelada";
  if (["Descartada", "Closed Lost"].includes(preopp.etapa)) return "Descartadas";

  return "Sin clasificar";
}

function countsAsActive(preopp: PreOpp) {
  return ["Identificada", "Validada por owner", "Interés detectado", "Con monto estimado"].includes(preopp.etapa);
}

function getAlert(preopp: PreOpp) {
  if (["Descartada", "Closed Lost"].includes(preopp.etapa) && !preopp.motivoDescarte) return "Descartada sin motivo";
  if (preopp.reemplazoRequerido === "Sí") return "Reemplazo requerido";
  if (countsAsActive(preopp) && preopp.diasSinActividad >= 14) return "Sin actividad 14+ días";
  if (countsAsActive(preopp) && preopp.diasSinActividad >= 7) return "Sin actividad 7+ días";

  if (
    [
      "Convertida a Prospect",
      "Convertida a Cloud Sales",
      "Prospect",
      "Qualified",
      "Technical Validation",
      "Business Validation",
      "Committed",
      "Commited",
      "Launched",
    ].includes(preopp.etapa)
  ) {
    return "Convertida";
  }

  if (preopp.etapa === "Frozen") return "Convertida congelada";

  return "OK";
}

function getStageTone(stage: string): Tone {
  if (stage === "Descartada") return "gray";

  if (
    [
      "Convertida a Prospect",
      "Convertida a Cloud Sales",
      "Prospect",
      "Qualified",
      "Technical Validation",
      "Business Validation",
      "Committed",
      "Commited",
      "Launched",
    ].includes(stage)
  ) {
    return "green";
  }

  if (stage === "Frozen") return "purple";
  if (stage === "Con monto estimado") return "teal";
  if (stage === "Interés detectado") return "blue";
  if (stage === "Validada por owner") return "green";

  return "amber";
}

function getStateTone(state: string): Tone {
  if (state === "Propuestas") return "blue";
  if (state === "Activas") return "green";
  if (state === "Convertidas") return "teal";
  if (state === "Convertida Congelada") return "purple";
  if (state === "Descartadas") return "gray";

  return "blue";
}

function stateIcon(state: ExecutiveState) {
  if (state === "Propuestas") return "🔎";
  if (state === "Activas") return "🏃‍➡️";
  if (state === "Convertidas") return "🏆";
  if (state === "Convertida Congelada") return "🧊";
  if (state === "Descartadas") return "🏃";

  return "—";
}

function stateLabel(state: ExecutiveState) {
  if (state === "Propuestas") return "Propuesta";
  if (state === "Activas") return "Activa";
  if (state === "Convertidas") return "Convertida";
  if (state === "Convertida Congelada") return "Congelada";
  if (state === "Descartadas") return "Descartada";

  return "Sin PreOpp";
}

function statePriority(state: ExecutiveState) {
  if (state === "Convertidas") return 5;
  if (state === "Convertida Congelada") return 4;
  if (state === "Activas") return 3;
  if (state === "Propuestas") return 2;
  if (state === "Descartadas") return 1;

  return 0;
}

function productFamily(product: string) {
  const clean = product.toLowerCase();

  if (clean.includes("modern")) return "Modernization Squads";
  if (clean.includes("genai") || clean.includes("gen ai")) return "GenAI Squads";
  if (clean.includes("security")) return "Security Epics";
  if (clean.includes("emx")) return "Cloud EMx";
  if (clean.includes("intellidocs") || clean.includes("document")) return "IntelliDocs";
  if (clean.includes("compliance") || clean.includes("fsi")) return "Compliance FSI";

  return product.replace(" by Escala 24x7", "");
}

function Pill({ children, tone = "blue" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function StagePill({ stage }: { stage: string }) {
  return <Pill tone={getStageTone(stage)}>{stage}</Pill>;
}

function KpiCard({
  emoji,
  label,
  value,
  hint,
  tone = "blue",
}: {
  emoji: string;
  label: string;
  value: string | number;
  hint: string;
  tone?: Tone;
}) {
  return (
    <article className={`kpi kpi-${tone}`}>
      <div className="kpi-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
      <div className="kpi-emoji" aria-hidden="true">
        {emoji}
      </div>
    </article>
  );
}

function PipelineKpi({ esperado, logrado }: { esperado: number; logrado: number }) {
  const avance = esperado > 0 ? logrado / esperado : 0;

  return (
    <article className="kpi kpi-blue pipeline-kpi">
      <div className="kpi-copy pipeline-copy">
        <span>Pipeline PreOpp</span>
        <strong>{currency(logrado)}</strong>
        <small>Pipeline logrado</small>

        <div className="pipeline-breakdown">
          <div>
            <b>{compactCurrency(esperado)}</b>
            <small>Esperado</small>
          </div>
          <div>
            <b>{percent(avance)}</b>
            <small>Avance</small>
          </div>
        </div>
      </div>

      <div className="kpi-emoji" aria-hidden="true">
        💰
      </div>
    </article>
  );
}

const navItems = [
  { id: "overview" as View, label: "Overview", href: "/", icon: "▦" },
  { id: "preopps" as View, label: "Pre-oportunidades", href: "/preopps", icon: "📋" },
  { id: "convertidas" as View, label: "Convertidas", href: "/convertidas", icon: "🏆" },
];

const titles: Record<View, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "Estado de cuentas por producto con una sola fila por cuenta.",
  },
  preopps: {
    title: "Pre-oportunidades",
    description: "Progreso semanal de pre-oportunidades abiertas o descartadas.",
  },
  convertidas: {
    title: "Convertidas",
    description: "Progreso semanal de oportunidades convertidas a Cloud Sales.",
  },
};

function weekIndexMap(preopps: PreOpp[]) {
  const weeks = unique(preopps.map((p) => p.semanaLabel || p.semanaId));
  return new Map(weeks.map((week, index) => [week, index]));
}

function getRowKey(preopp: PreOpp) {
  return `${preopp.cuenta}||${preopp.vendedor}||${preopp.producto}`;
}

function getPreviousRow(current: PreOpp, allRows: PreOpp[], weeks: Map<string, number>) {
  const currentWeek = current.semanaLabel || current.semanaId;
  const currentIdx = weeks.get(currentWeek);

  if (currentIdx === undefined || currentIdx <= 0) return null;

  const previousWeek = Array.from(weeks.entries()).find(([, index]) => index === currentIdx - 1)?.[0];

  if (!previousWeek) return null;

  return (
    allRows.find(
      (row) =>
        getRowKey(row) === getRowKey(current) &&
        (row.semanaLabel === previousWeek || row.semanaId === previousWeek)
    ) || null
  );
}

function countChanges(current: PreOpp, previous?: PreOpp | null) {
  if (current.cambioEtapa && current.cambioEtapa !== "Sin cambio") {
    return 1 + (current.variacion !== 0 ? 1 : 0);
  }

  if (!previous) return current.variacion !== 0 ? 1 : 0;

  let changes = 0;

  if (current.etapa !== previous.etapa) changes += 1;
  if (safeNumber(current.montoEstimado) !== safeNumber(previous.montoEstimado)) changes += 1;
  if (current.numeroActividades !== previous.numeroActividades) changes += 1;
  if (getAlert(current) !== getAlert(previous)) changes += 1;

  return changes;
}

function getLatestByKey(rows: PreOpp[], weeks: Map<string, number>) {
  return rows
    .slice()
    .sort((a, b) => {
      const weekDiff =
        (weeks.get(b.semanaLabel || b.semanaId) ?? 0) -
        (weeks.get(a.semanaLabel || a.semanaId) ?? 0);

      if (weekDiff !== 0) return weekDiff;

      return String(b.ultimaActividad || "").localeCompare(String(a.ultimaActividad || ""));
    })[0];
}

function consolidatePreOppUnits(filtered: PreOpp[], allRows: PreOpp[]): ConsolidatedUnit[] {
  const weeks = weekIndexMap(allRows);
  const grouped = new Map<string, PreOpp[]>();

  filtered.forEach((row) => {
    const family = productFamily(row.producto);
    const key = `${row.cuenta}||${row.vendedor}||${family}`;

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  });

  return Array.from(grouped.entries())
    .map(([key, rows]) => {
      const latest = getLatestByKey(rows, weeks);

      const bestRow = rows.reduce((best, row) => {
        const currentState = getExecutiveState(row);
        const bestState = getExecutiveState(best);

        if (statePriority(currentState) > statePriority(bestState)) return row;

        return best;
      }, latest);

      const state = getExecutiveState(bestRow);

      return {
        key,
        cuenta: latest.cuenta,
        vendedor: latest.vendedor,
        region: latest.region,
        pais: latest.pais,
        industria: latest.industria,
        productFamily: productFamily(latest.producto),
        state,
        stage: bestRow.etapa,

        // CAMBIO CLAVE:
        // Antes era PIPELINE_VALUE_PER_PREOPP fijo.
        // Ahora usa Pipeline_Esperado_Inicial de Vercel_View.
        pipelineEsperado: getPipelineEsperadoInicial(latest),

        // CAMBIO CLAVE:
        // Este es el monto real actual cargado en la oportunidad.
        pipelineLogrado: getPipelineLogradoActual(latest),

        latest,
        rows,
      };
    })
    .sort((a, b) => b.pipelineLogrado - a.pipelineLogrado || a.cuenta.localeCompare(b.cuenta, "es"));
}

function getAccountProductRows(units: ConsolidatedUnit[]): AccountProductRow[] {
  const grouped = new Map<string, ConsolidatedUnit[]>();

  units.forEach((unit) => {
    const key = `${unit.cuenta}||${unit.vendedor}`;

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(unit);
  });

  return Array.from(grouped.entries())
    .map(([key, accountUnits]) => {
      const latest = accountUnits[0].latest;
      const productStatus: AccountProductRow["productStatus"] = {};

      accountUnits.forEach((unit) => {
        productStatus[unit.productFamily] = {
          state: unit.state,
          stage: unit.stage,
          preopp: unit.latest,
        };
      });

      const allRows = accountUnits.flatMap((u) => u.rows);

      return {
        key,
        cuenta: latest.cuenta,
        vendedor: latest.vendedor,
        region: latest.region,
        pais: latest.pais,
        industria: latest.industria,
        productStatus,
        products: unique(accountUnits.map((u) => u.productFamily)),
        pipelineEsperado: accountUnits.reduce((sum, u) => sum + u.pipelineEsperado, 0),
        pipelineLogrado: accountUnits.reduce((sum, u) => sum + u.pipelineLogrado, 0),
        ultimaActividad: allRows.map((p) => p.ultimaActividad).filter(Boolean).sort().at(-1) || "Sin registro",
        alerta: unique(allRows.map(getAlert).filter((alert) => alert !== "OK")).join(" · ") || "OK",
        totalPreopps: accountUnits.length,
        rows: allRows,
      };
    })
    .sort((a, b) => b.pipelineLogrado - a.pipelineLogrado || a.cuenta.localeCompare(b.cuenta, "es"));
}

function getActivities(preopp: PreOpp, activities: Activity[]) {
  const fromLog = activities
    .filter((activity) => String(activity.preoppId) === String(preopp.id) && activity.mostrarEnDetalle !== "No")
    .slice()
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    .map((activity) => ({
      type: activity.tipo,
      detail: activity.descripcion,
      date: activity.fecha,
      origen: activity.origen,
    }));

  if (fromLog.length) return fromLog;

  const base = [
    {
      type: "Actualización",
      detail: `Etapa real esta semana: ${preopp.etapa}`,
      date: preopp.ultimaActividad || "Sin fecha",
      origen: "Vercel_View",
    },
    {
      type: "Producto",
      detail: preopp.producto,
      date: preopp.ultimaActividad || "Sin fecha",
      origen: "Vercel_View",
    },
  ];

  if (preopp.etapaAnterior) {
    base.push({
      type: "Semana pasada",
      detail: `Etapa real semana pasada: ${preopp.etapaAnterior}`,
      date: preopp.ultimaActividad || "Sin fecha",
      origen: "Vercel_View",
    });
  }

  if (getPipelineLogradoActual(preopp) > 0) {
    base.push({
      type: "Monto",
      detail: `Pipeline logrado: ${currency(getPipelineLogradoActual(preopp))}`,
      date: preopp.ultimaActividad || "Sin fecha",
      origen: "Vercel_View",
    });
  }

  if (preopp.motivoDescarte) {
    base.push({
      type: "Descarte",
      detail: preopp.motivoDescarte,
      date: preopp.ultimaActividad || "Sin fecha",
      origen: "Vercel_View",
    });
  }

  if (preopp.senal) {
    base.push({
      type: "Señal",
      detail: preopp.senal,
      date: preopp.ultimaActividad || "Sin fecha",
      origen: "Vercel_View",
    });
  }

  return base;
}

export default function DashboardClient({ sellers, preopps, activities, source, view = "overview" }: Props) {
  const pathname = usePathname();

  const [selectedSeller, setSelectedSeller] = useState("Todos");
  const [selectedRegion, setSelectedRegion] = useState("Todas");
  const [selectedState, setSelectedState] = useState("Todos");
  const [selectedProduct, setSelectedProduct] = useState("Todos");
  const [selectedAccount, setSelectedAccount] = useState("Todas");
  const [selectedWeek, setSelectedWeek] = useState("Todas");
  const [detail, setDetail] = useState<DetailPreOpp | null>(null);

  const weekOptions = useMemo(
    () => ["Todas", ...unique(preopps.map((p) => p.semanaLabel || p.semanaId))],
    [preopps]
  );

  const regionOptions = useMemo(() => ["Todas", ...unique(preopps.map((p) => p.region))], [preopps]);

  const stateOptions = ["Todos", "Propuestas", "Activas", "Convertidas", "Convertida Congelada", "Descartadas"];

  const accountOptions = useMemo(
    () => [
      "Todas",
      ...unique(
        preopps
          .filter((p) => selectedRegion === "Todas" || p.region === selectedRegion)
          .filter((p) => selectedWeek === "Todas" || p.semanaLabel === selectedWeek || p.semanaId === selectedWeek)
          .filter((p) => selectedSeller === "Todos" || p.vendedor === selectedSeller)
          .filter((p) => selectedState === "Todos" || getExecutiveState(p) === selectedState)
          .filter((p) => selectedProduct === "Todos" || productFamily(p.producto) === selectedProduct || p.producto === selectedProduct)
          .map((p) => p.cuenta)
      ),
    ],
    [preopps, selectedRegion, selectedWeek, selectedSeller, selectedState, selectedProduct]
  );

  const sellerOptions = useMemo(
    () => [
      "Todos",
      ...unique(
        preopps
          .filter((p) => selectedRegion === "Todas" || p.region === selectedRegion)
          .filter((p) => selectedWeek === "Todas" || p.semanaLabel === selectedWeek || p.semanaId === selectedWeek)
          .filter((p) => selectedAccount === "Todas" || p.cuenta === selectedAccount)
          .filter((p) => selectedState === "Todos" || getExecutiveState(p) === selectedState)
          .filter((p) => selectedProduct === "Todos" || productFamily(p.producto) === selectedProduct || p.producto === selectedProduct)
          .map((p) => p.vendedor)
      ),
    ],
    [preopps, selectedRegion, selectedWeek, selectedAccount, selectedState, selectedProduct]
  );

  const productOptions = useMemo(
    () => [
      "Todos",
      ...unique(
        preopps
          .filter((p) => selectedRegion === "Todas" || p.region === selectedRegion)
          .filter((p) => selectedWeek === "Todas" || p.semanaLabel === selectedWeek || p.semanaId === selectedWeek)
          .filter((p) => selectedSeller === "Todos" || p.vendedor === selectedSeller)
          .filter((p) => selectedAccount === "Todas" || p.cuenta === selectedAccount)
          .filter((p) => selectedState === "Todos" || getExecutiveState(p) === selectedState)
          .map((p) => productFamily(p.producto))
      ),
    ],
    [preopps, selectedRegion, selectedWeek, selectedSeller, selectedAccount, selectedState]
  );

  useEffect(() => {
    if (selectedSeller !== "Todos" && !sellerOptions.includes(selectedSeller)) setSelectedSeller("Todos");
  }, [selectedSeller, sellerOptions]);

  useEffect(() => {
    if (selectedAccount !== "Todas" && !accountOptions.includes(selectedAccount)) setSelectedAccount("Todas");
  }, [selectedAccount, accountOptions]);

  useEffect(() => {
    if (selectedProduct !== "Todos" && !productOptions.includes(selectedProduct)) setSelectedProduct("Todos");
  }, [selectedProduct, productOptions]);

  const filteredPreopps = useMemo(
    () =>
      preopps.filter((p) => {
        if (selectedSeller !== "Todos" && p.vendedor !== selectedSeller) return false;
        if (selectedRegion !== "Todas" && p.region !== selectedRegion) return false;
        if (selectedWeek !== "Todas" && p.semanaLabel !== selectedWeek && p.semanaId !== selectedWeek) return false;
        if (selectedState !== "Todos" && getExecutiveState(p) !== selectedState) return false;
        if (selectedProduct !== "Todos" && productFamily(p.producto) !== selectedProduct && p.producto !== selectedProduct) return false;
        if (selectedAccount !== "Todas" && p.cuenta !== selectedAccount) return false;

        return true;
      }),
    [preopps, selectedSeller, selectedRegion, selectedWeek, selectedState, selectedProduct, selectedAccount]
  );

  const weeks = useMemo(() => weekIndexMap(preopps), [preopps]);
  const consolidatedUnits = useMemo(() => consolidatePreOppUnits(filteredPreopps, preopps), [filteredPreopps, preopps]);
  const accountProductRows = useMemo(() => getAccountProductRows(consolidatedUnits), [consolidatedUnits]);

  const productColumns = useMemo(() => {
    const base = ["Modernization Squads", "GenAI Squads", "Security Epics", "Cloud EMx", "IntelliDocs", "Compliance FSI"];
    const dynamic = unique(consolidatedUnits.map((unit) => unit.productFamily));

    return base.filter((product) => dynamic.includes(product)).concat(dynamic.filter((product) => !base.includes(product)));
  }, [consolidatedUnits]);

  const propuestas = consolidatedUnits.filter((p) => p.state === "Propuestas").length;
  const activas = consolidatedUnits.filter((p) => p.state === "Activas").length;
  const convertidas = consolidatedUnits.filter((p) => p.state === "Convertidas").length;
  const congeladas = consolidatedUnits.filter((p) => p.state === "Convertida Congelada").length;
  const descartadas = consolidatedUnits.filter((p) => p.state === "Descartadas").length;

  const pipelineEsperado = consolidatedUnits.reduce((sum, p) => sum + safeNumber(p.pipelineEsperado), 0);
  const pipelineLogrado = consolidatedUnits.reduce((sum, p) => sum + safeNumber(p.pipelineLogrado), 0);

  const currentTitle = titles[view];

  function clearFilters() {
    setSelectedWeek("Todas");
    setSelectedSeller("Todos");
    setSelectedRegion("Todas");
    setSelectedState("Todos");
    setSelectedProduct("Todos");
    setSelectedAccount("Todas");
  }

  function openDetail(preopp: PreOpp) {
    const previous = getPreviousRow(preopp, preopps, weeks);
    setDetail({ ...preopp, previous, changesCount: countChanges(preopp, previous) });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">◎</div>
          <div>
            <strong>PreOpp Radar</strong>
            <span>
              Monitoreo semanal de
              <br />
              pre-oportunidades
            </span>
          </div>
        </div>

        <nav className="nav" aria-label="Navegación principal">
          {navItems.map((item) => {
            const activeLink = pathname === item.href || (item.href === "/" && pathname === "/");

            return (
              <Link key={item.id} href={item.href} className={activeLink ? "active" : ""}>
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span>Última actualización</span>
          <strong>Semanal · automático</strong>
          <small>Fuente: {source}</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="page-header">
          <div>
            <h1>{currentTitle.title}</h1>
            <p>{currentTitle.description}</p>
          </div>

          <button className="ghost-button" onClick={clearFilters}>
            Limpiar filtros
          </button>
        </header>

        <section className="filter-row" aria-label="Filtros globales">
          <Filter label="Semana" value={selectedWeek} onChange={setSelectedWeek} options={weekOptions} />
          <Filter label="Región" value={selectedRegion} onChange={setSelectedRegion} options={regionOptions} />
          <Filter label="Cuenta" value={selectedAccount} onChange={setSelectedAccount} options={accountOptions} wide />
          <Filter label="Vendedor" value={selectedSeller} onChange={setSelectedSeller} options={sellerOptions} wide />
          <Filter label="Estado" value={selectedState} onChange={setSelectedState} options={stateOptions} />
          <Filter label="Producto" value={selectedProduct} onChange={setSelectedProduct} options={productOptions} wide />
        </section>

        <section className="kpi-row">
          <PipelineKpi esperado={pipelineEsperado} logrado={pipelineLogrado} />
          <KpiCard emoji="🔎" label="Propuestas" value={propuestas} hint="Etapa identificada" tone="blue" />
          <KpiCard emoji="🏃‍➡️" label="Activas" value={activas} hint="En gestión" tone="green" />
          <KpiCard emoji="🏆" label="Convertidas" value={convertidas} hint="Pasaron a Cloud Sales" tone="teal" />
          <KpiCard emoji="🧊" label="Congeladas" value={congeladas} hint="Convertidas en Frozen" tone="purple" />
          <KpiCard emoji="🏃" label="Descartadas" value={descartadas} hint="Salen del pool activo" tone="gray" />
        </section>

        <section className="context-strip">
          <strong>Vista actual:</strong>
          <span>{selectedWeek}</span>
          <span>{selectedRegion}</span>
          <span>{selectedAccount}</span>
          <span>{selectedSeller}</span>
          <span>{selectedState}</span>
          <span>{selectedProduct}</span>
          <span>{accountProductRows.length} cuentas</span>
          <span>{consolidatedUnits.length} PreOpps consolidadas</span>
        </section>

        {view === "overview" ? (
          <Overview accounts={accountProductRows} productColumns={productColumns} openDetail={openDetail} />
        ) : (
          <PreOpps preopps={filteredPreopps} allRows={preopps} weeks={weeks} openDetail={openDetail} mode={view} />
        )}
      </section>

      {detail && <DetailModal preopp={detail} activities={activities} onClose={() => setDetail(null)} />}
    </main>
  );
}

function Filter({
  label,
  value,
  options,
  onChange,
  wide = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={`filter-chip ${wide ? "wide-filter" : ""}`}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Overview({
  accounts,
  productColumns,
  openDetail,
}: {
  accounts: AccountProductRow[];
  productColumns: string[];
  openDetail: (preopp: PreOpp) => void;
}) {
  return (
    <section className="panel overview-status-panel">
      <div className="panel-head">
        <div>
          <h2>Estado de cuentas por producto</h2>
          <p>Una cuenta por fila. Los iconos reflejan el estatus consolidado de cada PreOpp por producto.</p>
        </div>
        <Pill tone="blue">{accounts.length} cuentas visibles</Pill>
      </div>

      <div className="status-table-wrap">
        <table className="status-table">
          <thead>
            <tr>
              <th className="account-col">Cuenta</th>
              <th className="owner-col">Vendedor</th>
              {productColumns.map((product) => (
                <th className="product-col" key={product}>
                  {product}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {accounts.map((account) => (
              <tr key={account.key}>
                <td data-label="Cuenta">
                  <b>{account.cuenta}</b>
                  <small>
                    {account.region} · {account.pais} · {account.industria}
                  </small>
                </td>

                <td data-label="Vendedor">
                  <b>{account.vendedor}</b>
                  <small>
                    {compactCurrency(account.pipelineLogrado)} logrado · {compactCurrency(account.pipelineEsperado)} esperado
                  </small>
                </td>

                {productColumns.map((product) => {
                  const status = account.productStatus[product];

                  return (
                    <td data-label={product} key={`${account.key}-${product}`}>
                      {status ? (
                        <button
                          className={`status-icon status-${getStateTone(status.state)}`}
                          title={`${stateLabel(status.state)} · ${status.stage}`}
                          onClick={() => openDetail(status.preopp)}
                        >
                          <span>{stateIcon(status.state)}</span>
                          <small>{stateLabel(status.state)}</small>
                        </button>
                      ) : (
                        <span className="empty-status">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend status-legend">
        <span>🔎 Propuesta</span>
        <span>🏃‍➡️ Activa</span>
        <span>🏆 Convertida</span>
        <span>🏃 Descartada</span>
        <span>— Sin PreOpp</span>
      </div>
    </section>
  );
}

function PreOpps({
  preopps,
  allRows,
  weeks,
  openDetail,
  mode,
}: {
  preopps: PreOpp[];
  allRows: PreOpp[];
  weeks: Map<string, number>;
  openDetail: (preopp: PreOpp) => void;
  mode: View;
}) {
  const baseRows = preopps.filter((p) =>
    mode === "convertidas"
      ? ["Convertidas", "Convertida Congelada"].includes(getExecutiveState(p))
      : !["Convertidas", "Convertida Congelada"].includes(getExecutiveState(p))
  );

  const rows = baseRows.map((p) => {
    const previous = getPreviousRow(p, allRows, weeks);
    return { current: p, previous, changes: countChanges(p, previous) };
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{mode === "convertidas" ? "Convertidas" : "Pre-oportunidades"}</h2>
          <p>Comparación contra la semana anterior usando snapshot histórico. Las actividades se revisan desde “Ver detalles”.</p>
        </div>
        <Pill tone="blue">{rows.length} registros</Pill>
      </div>

      <div className="table-wrap">
        <table className="data-table weekly-comparison-table">
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Producto</th>
              <th>Etapa real · esta semana</th>
              <th>Esta semana · monto</th>
              <th>Etapa real · semana pasada</th>
              <th>Semana pasada · monto</th>
              <th>Variación</th>
              <th>Detalle</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(({ current, previous, changes }) => {
              const previousAmount = current.montoAnterior || previous?.montoEstimado || 0;
              const previousStage = current.etapaAnterior || previous?.etapa || "";
              const delta = getPipelineLogradoActual(current) - safeNumber(previousAmount);

              return (
                <tr key={`${current.id}-${current.semanaId}`} className="clickable-row" onClick={() => openDetail(current)}>
                  <td data-label="Cuenta">
                    <b>{current.cuenta}</b>
                    <small>
                      {current.vendedor} · {current.region}
                    </small>
                  </td>

                  <td data-label="Producto">
                    {productFamily(current.producto)}
                    <small>{current.propensity}</small>
                  </td>

                  <td data-label="Etapa real · esta semana">
                    <StagePill stage={current.etapa} />
                  </td>

                  <td data-label="Esta semana · monto">{currency(getPipelineLogradoActual(current))}</td>

                  <td data-label="Etapa real · semana pasada">
                    {previousStage ? <StagePill stage={previousStage} /> : <span className="muted">Sin snapshot</span>}
                  </td>

                  <td data-label="Semana pasada · monto">{currency(previousAmount)}</td>

                  <td data-label="Variación">
                    <span className={delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral"}>{currency(delta)}</span>
                  </td>

                  <td data-label="Detalle">
                    <button
                      className="row-action"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDetail(current);
                      }}
                    >
                      Ver detalles <small>{changes} cambios</small>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetailModal({ preopp, activities, onClose }: { preopp: DetailPreOpp; activities: Activity[]; onClose: () => void }) {
  const previous = preopp.previous;
  const montoAnterior = preopp.montoAnterior || previous?.montoEstimado || 0;
  const previousStage = preopp.etapaAnterior || previous?.etapa || "Sin snapshot";
  const relatedActivities = activities.filter(
    (activity) => String(activity.preoppId) === String(preopp.id) && activity.mostrarEnDetalle !== "No"
  );
  const hubspotLink = preopp.linkHubSpot || relatedActivities.find((activity) => activity.linkPreOpp)?.linkPreOpp || "";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Detalle de la pre-oportunidad">
      <article className="modal-card side-panel-card">
        <div className="modal-head">
          <div>
            <h2>Detalles de la Pre-oportunidad</h2>
            <p>
              {preopp.cuenta} · {productFamily(preopp.producto)}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="detail-grid">
          <Detail label="Cuenta" value={preopp.cuenta} />
          <Detail label="Vendedor" value={preopp.vendedor} />
          <Detail label="Producto" value={productFamily(preopp.producto)} />
          <Detail label="Etapa real esta semana" value={preopp.etapa} />
          <Detail label="Etapa real semana anterior" value={previousStage} />
          <Detail label="Pipeline esperado inicial" value={currency(getPipelineEsperadoInicial(preopp))} />
          <Detail label="Pipeline logrado" value={currency(getPipelineLogradoActual(preopp))} />
          <Detail label="Pipeline anterior" value={currency(montoAnterior)} />
          <Detail label="# de cambios" value={String(preopp.changesCount ?? 0)} />
          <Detail label="Fecha de creación" value={preopp.fechaCreacion || "Sin registro"} />
          <Detail label="Última modificación" value={preopp.ultimaActividad || "Sin registro"} />
        </div>

        <div className="modal-section">
          <div className="modal-section-head">
            <h3>Actividades de la oportunidad</h3>
            {hubspotLink ? (
              <a className="mini-link" href={hubspotLink} target="_blank" rel="noreferrer">
                Ver actividades en HubSpot
              </a>
            ) : (
              <Pill tone="gray">HubSpot pendiente</Pill>
            )}
          </div>

          {getActivities(preopp, activities).map((activity, index) => (
            <div className="activity-line" key={`${activity.type}-${index}`}>
              <span>
                {activity.type === "Monto"
                  ? "💵"
                  : activity.type === "Descarte"
                    ? "🏃"
                    : activity.type === "Señal"
                      ? "🔎"
                      : activity.type === "Cambio de etapa"
                        ? "🔁"
                        : activity.type === "Semana pasada"
                          ? "🕒"
                          : "•"}
              </span>
              <div>
                <b>{activity.type}</b>
                <small>
                  {activity.detail} · {activity.date}
                </small>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </article>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}