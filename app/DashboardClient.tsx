"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { Activity, PreOpp, Seller } from "../lib/googleSheets";
import {
  IconActivas,
  IconCongeladas,
  IconConvertidas,
  IconCuentas,
  IconDescartadas,
  IconDetalle,
  IconHubSpot,
  IconOverview,
  IconPipeline,
  IconPreoportunidades,
  IconPropuestas,
} from "../components/PreOppIcons";

const PIPELINE_VALUE_PER_PREOPP = 100000;
const PIPELINE_VALUE_CLOUD_EMX = 180000;

type View = "overview" | "cuentas" | "preopps" | "convertidas" | "descartadas";
type OperationalView = "preopps" | "convertidas" | "descartadas";

type Props = {
  sellers: Seller[];
  preopps: PreOpp[];
  activities: Activity[];
  source: string;
  updatedAt?: string;
  view?: View;
};

type Tone = "blue" | "amber" | "green" | "teal" | "gray" | "red" | "purple";
type MetricIconName = "pipeline" | "propuestas" | "activas" | "convertidas" | "congeladas" | "descartadas";
type MenuIconName = "overview" | "cuentas" | "preopps" | "convertidas" | "descartadas";

type ExecutiveState =
  | "Propuestas"
  | "Activas"
  | "Convertidas"
  | "Convertida Congelada"
  | "Descartadas"
  | "Sin clasificar";

type DetailPreOpp = PreOpp & {
  previous?: PreOpp | null;
  changesCount?: number;
};

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

const PRODUCT_ORDER = [
  "App Modernization Squads",
  "GenAI Squads",
  "Security Assessment + Epics",
  "Cloud EMx Ultra",
];

const navItems = [
  { id: "overview" as View, label: "Overview", href: "/", icon: "overview" as MenuIconName },
  { id: "cuentas" as View, label: "Cuentas", href: "/cuentas", icon: "cuentas" as MenuIconName },
  { id: "preopps" as View, label: "Pre-oportunidades", href: "/preopps", icon: "preopps" as MenuIconName },
  { id: "convertidas" as View, label: "Convertidas", href: "/convertidas", icon: "convertidas" as MenuIconName },
  { id: "descartadas" as View, label: "Descartadas", href: "/descartadas", icon: "descartadas" as MenuIconName },
];

const titles: Record<View, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "Estado de cuentas por producto con una sola fila por cuenta.",
  },
  cuentas: {
    title: "Cuentas",
    description: "Vista ejecutiva por cuenta, con consolidado de productos y pipeline.",
  },
  preopps: {
    title: "Pre-oportunidades",
    description: "Comparación contra la semana anterior usando snapshot histórico.",
  },
  convertidas: {
    title: "Convertidas",
    description: "Pre-oportunidades convertidas a Cloud Sales.",
  },
  descartadas: {
    title: "Descartadas",
    description: "Pre-oportunidades descartadas y fuera del pool activo.",
  },
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

type WeekDescriptor = {
  id: string;
  label: string;
  sortValue: number;
};

function getIsoWeekSortValue(value: string) {
  const match = String(value || "").trim().match(/^(\d{4})-W(\d{1,2})$/i);

  if (!match) return 0;

  return Number(match[1]) * 100 + Number(match[2]);
}

function getWeekDescriptors(preopps: PreOpp[]) {
  const descriptors = new Map<string, WeekDescriptor>();

  preopps.forEach((preopp) => {
    const id = String(preopp.semanaId || "").trim();
    const label = String(preopp.semanaLabel || preopp.semanaId || "").trim();

    if (!id && !label) return;

    const key = id || label;
    const current = descriptors.get(key);
    const next = {
      id,
      label: label || id,
      sortValue: getIsoWeekSortValue(id),
    };

    if (!current || next.label.length > current.label.length) {
      descriptors.set(key, next);
    }
  });

  return Array.from(descriptors.values()).sort((a, b) => {
    if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
    return a.label.localeCompare(b.label, "es");
  });
}

function getPreviousIsoWeekId(weekId: string) {
  const match = String(weekId || "").trim().match(/^(\d{4})-W(\d{1,2})$/i);

  if (!match) return "";

  const year = Number(match[1]);
  const week = Number(match[2]);
  const januaryFourth = new Date(Date.UTC(year, 0, 4, 12, 0, 0));
  const januaryFourthDay = januaryFourth.getUTCDay() || 7;
  const firstIsoMonday = new Date(januaryFourth);

  firstIsoMonday.setUTCDate(januaryFourth.getUTCDate() - januaryFourthDay + 1);

  const currentMonday = new Date(firstIsoMonday);
  currentMonday.setUTCDate(firstIsoMonday.getUTCDate() + (week - 1) * 7 - 7);

  const thursday = new Date(currentMonday);
  thursday.setUTCDate(currentMonday.getUTCDate() + 3);

  const previousIsoYear = thursday.getUTCFullYear();
  const previousJanuaryFourth = new Date(Date.UTC(previousIsoYear, 0, 4, 12, 0, 0));
  const previousJanuaryFourthDay = previousJanuaryFourth.getUTCDay() || 7;
  const previousFirstIsoMonday = new Date(previousJanuaryFourth);

  previousFirstIsoMonday.setUTCDate(
    previousJanuaryFourth.getUTCDate() - previousJanuaryFourthDay + 1
  );

  const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;
  const previousWeekNumber =
    Math.floor((currentMonday.getTime() - previousFirstIsoMonday.getTime()) / millisecondsPerWeek) + 1;

  return `${previousIsoYear}-W${String(previousWeekNumber).padStart(2, "0")}`;
}

function normalizeFilterText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function includesFilterText(value: unknown, search: string) {
  const normalizedSearch = normalizeFilterText(search);
  if (!normalizedSearch) return true;
  return normalizeFilterText(value).includes(normalizedSearch);
}

function matchesWeek(preopp: PreOpp, selectedWeek: string) {
  if (!selectedWeek) return false;

  return (
    String(preopp.semanaId || "").trim() === selectedWeek ||
    String(preopp.semanaLabel || "").trim() === selectedWeek
  );
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

function formatETDateTime(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return "Sin registro de actualización";
  }

  const formatted = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/New_York",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return `${formatted.replace(",", " ·")} ET`;
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

  if (valueFromRow > 0) return valueFromRow;

  const product = String(preopp.producto || "").toLowerCase();

  if (product.includes("cloud emx") || product.includes("emx")) {
    return PIPELINE_VALUE_CLOUD_EMX;
  }

  return PIPELINE_VALUE_PER_PREOPP;
}

function getPipelineLogradoActual(preopp: PreOpp) {
  /*
   * El KPI de pipeline usa exclusivamente Pipeline_Logrado.
   * No toma Monto_estimado, Amount ni valores de respaldo, porque
   * representan conceptos distintos y podían inflar el resultado.
   */
  return safeNumber(preopp.pipelineLogrado);
}

function getExecutiveState(preopp: Pick<PreOpp, "etapa" | "estado">): ExecutiveState {
  if (["Propuestas", "Activas", "Convertidas", "Convertida Congelada", "Descartadas"].includes(preopp.estado)) {
    return preopp.estado as ExecutiveState;
  }

  if (preopp.etapa === "Identificada") return "Propuestas";

  if (["Validada por owner", "Interés detectado", "Con monto estimado"].includes(preopp.etapa)) {
    return "Activas";
  }

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

  if (["Descartada", "Closed Lost"].includes(preopp.etapa)) {
    return "Descartadas";
  }

  return "Sin clasificar";
}

function getAlert(preopp: PreOpp) {
  const state = getExecutiveState(preopp);

  if (state === "Descartadas" && !preopp.motivoDescarte) return "Descartada sin motivo";
  if (preopp.reemplazoRequerido === "Sí") return "Reemplazo requerido";

  if (["Identificada", "Validada por owner", "Interés detectado", "Con monto estimado"].includes(preopp.etapa)) {
    if (preopp.diasSinActividad >= 14) return "Sin actividad 14+ días";
    if (preopp.diasSinActividad >= 7) return "Sin actividad 7+ días";
  }

  if (state === "Convertidas") return "Convertida";
  if (state === "Convertida Congelada") return "Convertida congelada";

  return "OK";
}

function getStageTone(stage: string): Tone {
  if (["Descartada", "Closed Lost"].includes(stage)) return "gray";

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
  if (stage === "Sin histórico") return "gray";

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

function stateIconName(state: ExecutiveState): MetricIconName | null {
  if (state === "Propuestas") return "propuestas";
  if (state === "Activas") return "activas";
  if (state === "Convertidas") return "convertidas";
  if (state === "Convertida Congelada") return "congeladas";
  if (state === "Descartadas") return "descartadas";

  return null;
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

function productFamily(product: string = "") {
  const clean = product.toLowerCase();

  if (
    clean.includes("app modernization") ||
    clean.includes("modernization squads") ||
    clean.includes("modernizacion") ||
    clean.includes("modernización")
  ) {
    return "App Modernization Squads";
  }

  if (clean.includes("genai") || clean.includes("gen ai")) {
    return "GenAI Squads";
  }

  if (clean.includes("security assessment") || clean.includes("security epics") || clean.includes("security")) {
    return "Security Assessment + Epics";
  }

  if (clean.includes("cloud emx") || clean.includes("emx ultra") || clean.includes("ultra ticket") || clean.includes("emx")) {
    return "Cloud EMx Ultra";
  }

  return "";
}

function isRadarProduct(preopp: PreOpp) {
  return Boolean(productFamily(preopp.producto));
}

function Pill({ children, tone = "blue" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function StagePill({ stage }: { stage: string }) {
  return <Pill tone={getStageTone(stage)}>{stage || "Sin etapa"}</Pill>;
}

function MetricIcon({ name, size = 54 }: { name: MetricIconName; size?: number }) {
  if (name === "pipeline") return <IconPipeline size={size} className="dashboard-icon" />;
  if (name === "propuestas") return <IconPropuestas size={size} className="dashboard-icon" />;
  if (name === "activas") return <IconActivas size={size} className="dashboard-icon" />;
  if (name === "convertidas") return <IconConvertidas size={size} className="dashboard-icon" />;
  if (name === "congeladas") return <IconCongeladas size={size} className="dashboard-icon" />;
  return <IconDescartadas size={size} className="dashboard-icon" />;
}

function MenuIcon({ name, size = 23 }: { name: MenuIconName; size?: number }) {
  if (name === "overview") return <IconOverview size={size} className="menu-svg-icon" />;
  if (name === "cuentas") return <IconCuentas size={size} className="menu-svg-icon" />;
  if (name === "preopps") return <IconPreoportunidades size={size} className="menu-svg-icon" />;
  if (name === "convertidas") return <IconConvertidas size={size} className="menu-svg-icon" />;
  return <IconDescartadas size={size} className="menu-svg-icon" />;
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = "blue",
  href,
}: {
  icon: MetricIconName;
  label: string;
  value: string | number;
  hint: string;
  tone?: Tone;
  href?: string;
}) {
  const card = (
    <article className={`kpi kpi-${tone}`}>
      <div className="kpi-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>

      <div className="kpi-emoji" aria-hidden="true">
        <MetricIcon name={icon} />
      </div>
    </article>
  );

  if (href) {
    return (
      <Link className="kpi-link" href={href}>
        {card}
      </Link>
    );
  }

  return card;
}

function PipelineKpi({
  esperado,
  logrado,
  label = "Pipeline PreOpp",
  hint = "Pipeline vigente",
  href,
}: {
  esperado: number;
  logrado: number;
  label?: string;
  hint?: string;
  href?: string;
}) {
  const avance = esperado > 0 ? logrado / esperado : 0;

  const card = (
    <article className="kpi kpi-blue pipeline-kpi">
      <div className="kpi-copy pipeline-copy">
        <span>{label}</span>
        <strong>{currency(logrado)}</strong>
        <small>{hint}</small>

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
        <MetricIcon name="pipeline" />
      </div>
    </article>
  );

  if (href) {
    return (
      <Link className="kpi-link" href={href}>
        {card}
      </Link>
    );
  }

  return card;
}

function weekIndexMap(preopps: PreOpp[]) {
  const map = new Map<string, number>();

  getWeekDescriptors(preopps).forEach((week, index) => {
    if (week.id) map.set(week.id, index);
    if (week.label) map.set(week.label, index);
  });

  return map;
}

function getRowKey(preopp: PreOpp) {
  return `${preopp.id}||${productFamily(preopp.producto)}`;
}

function getPreviousRow(current: PreOpp, allRows: PreOpp[], weeks: Map<string, number>) {
  const exactPreviousWeekId = getPreviousIsoWeekId(current.semanaId);

  if (exactPreviousWeekId) {
    return (
      allRows.find(
        (row) =>
          getRowKey(row) === getRowKey(current) &&
          row.semanaId === exactPreviousWeekId
      ) || null
    );
  }

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
    if (!family) return;

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
        pipelineEsperado: getPipelineEsperadoInicial(latest),
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

      const allRows = accountUnits.flatMap((unit) => unit.rows);

      return {
        key,
        cuenta: latest.cuenta,
        vendedor: latest.vendedor,
        region: latest.region,
        pais: latest.pais,
        industria: latest.industria,
        productStatus,
        products: unique(accountUnits.map((unit) => unit.productFamily)),
        pipelineEsperado: accountUnits.reduce((sum, unit) => sum + unit.pipelineEsperado, 0),
        pipelineLogrado: accountUnits.reduce((sum, unit) => sum + unit.pipelineLogrado, 0),
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
      detail: productFamily(preopp.producto) || preopp.producto,
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

export default function DashboardClient({
  preopps,
  activities,
  source,
  updatedAt,
  view = "overview",
}: Props) {
  const pathname = usePathname();

  const [selectedSeller, setSelectedSeller] = useState("Todos");
  const [selectedRegion, setSelectedRegion] = useState("Todas");
  const [selectedState, setSelectedState] = useState("Todos");
  const [selectedProduct, setSelectedProduct] = useState("Todos");
  const [selectedAccount, setSelectedAccount] = useState("Todas");
  const [selectedWeek, setSelectedWeek] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [sellerSearch, setSellerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [detail, setDetail] = useState<DetailPreOpp | null>(null);

  const [lastUpdatedEt, setLastUpdatedEt] = useState(
    "Sin registro de actualización"
  );

  useEffect(() => {
    setLastUpdatedEt(
      updatedAt
        ? formatETDateTime(new Date(updatedAt))
        : "Sin registro de actualización"
    );
  }, [updatedAt]);

  const radarPreopps = useMemo(() => preopps.filter(isRadarProduct), [preopps]);

  const weekDescriptors = useMemo(
    () =>
      getWeekDescriptors(radarPreopps)
        .slice()
        .sort((a, b) => b.sortValue - a.sortValue || b.label.localeCompare(a.label, "es")),
    [radarPreopps]
  );

  const latestWeekKey = weekDescriptors[0]?.id || weekDescriptors[0]?.label || "";

  const weekOptions = useMemo(
    () => weekDescriptors.map((week) => week.label),
    [weekDescriptors]
  );

  const selectedWeekLabel = useMemo(() => {
    const selected = weekDescriptors.find(
      (week) => week.id === selectedWeek || week.label === selectedWeek
    );

    return selected?.label || weekDescriptors[0]?.label || "Sin semana";
  }, [selectedWeek, weekDescriptors]);

  useEffect(() => {
    if (!weekDescriptors.length) return;

    const selectedStillExists = weekDescriptors.some(
      (week) => week.id === selectedWeek || week.label === selectedWeek
    );

    if (!selectedStillExists) {
      setSelectedWeek(latestWeekKey);
    }
  }, [latestWeekKey, selectedWeek, weekDescriptors]);

  const regionOptions = useMemo(() => ["Todas", ...unique(radarPreopps.map((p) => p.region))], [radarPreopps]);

  const stateOptions = ["Todos", "Propuestas", "Activas", "Convertidas", "Convertida Congelada", "Descartadas"];

  const accountOptions = useMemo(
    () => [
      "Todas",
      ...unique(
        radarPreopps
          .filter((p) => selectedRegion === "Todas" || p.region === selectedRegion)
          .filter((p) => matchesWeek(p, selectedWeek))
          .filter((p) =>
            selectedSeller !== "Todos"
              ? p.vendedor === selectedSeller
              : includesFilterText(p.vendedor, sellerSearch)
          )
          .filter((p) => selectedState === "Todos" || getExecutiveState(p) === selectedState)
          .filter((p) =>
            selectedProduct !== "Todos"
              ? productFamily(p.producto) === selectedProduct
              : includesFilterText(productFamily(p.producto), productSearch)
          )
          .map((p) => p.cuenta)
      ),
    ],
    [
      radarPreopps,
      selectedRegion,
      selectedWeek,
      selectedSeller,
      sellerSearch,
      selectedState,
      selectedProduct,
      productSearch,
    ]
  );

  const sellerOptions = useMemo(
    () => [
      "Todos",
      ...unique(
        radarPreopps
          .filter((p) => selectedRegion === "Todas" || p.region === selectedRegion)
          .filter((p) => matchesWeek(p, selectedWeek))
          .filter((p) =>
            selectedAccount !== "Todas"
              ? p.cuenta === selectedAccount
              : includesFilterText(p.cuenta, accountSearch)
          )
          .filter((p) => selectedState === "Todos" || getExecutiveState(p) === selectedState)
          .filter((p) =>
            selectedProduct !== "Todos"
              ? productFamily(p.producto) === selectedProduct
              : includesFilterText(productFamily(p.producto), productSearch)
          )
          .map((p) => p.vendedor)
      ),
    ],
    [
      radarPreopps,
      selectedRegion,
      selectedWeek,
      selectedAccount,
      accountSearch,
      selectedState,
      selectedProduct,
      productSearch,
    ]
  );

  const productOptions = useMemo(
    () => [
      "Todos",
      ...PRODUCT_ORDER.filter((product) =>
        radarPreopps
          .filter((p) => selectedRegion === "Todas" || p.region === selectedRegion)
          .filter((p) => matchesWeek(p, selectedWeek))
          .filter((p) =>
            selectedSeller !== "Todos"
              ? p.vendedor === selectedSeller
              : includesFilterText(p.vendedor, sellerSearch)
          )
          .filter((p) =>
            selectedAccount !== "Todas"
              ? p.cuenta === selectedAccount
              : includesFilterText(p.cuenta, accountSearch)
          )
          .filter((p) => selectedState === "Todos" || getExecutiveState(p) === selectedState)
          .some((p) => productFamily(p.producto) === product)
      ),
    ],
    [
      radarPreopps,
      selectedRegion,
      selectedWeek,
      selectedSeller,
      sellerSearch,
      selectedAccount,
      accountSearch,
      selectedState,
    ]
  );

  useEffect(() => {
    if (selectedSeller !== "Todos" && !sellerOptions.includes(selectedSeller)) {
      setSelectedSeller("Todos");
    }
  }, [selectedSeller, sellerOptions]);

  useEffect(() => {
    if (selectedAccount !== "Todas" && !accountOptions.includes(selectedAccount)) {
      setSelectedAccount("Todas");
    }
  }, [selectedAccount, accountOptions]);

  useEffect(() => {
    if (selectedProduct !== "Todos" && !productOptions.includes(selectedProduct)) {
      setSelectedProduct("Todos");
    }
  }, [selectedProduct, productOptions]);

  const filteredPreopps = useMemo(
    () =>
      radarPreopps.filter((p) => {
        if (selectedSeller !== "Todos" && p.vendedor !== selectedSeller) return false;
        if (selectedSeller === "Todos" && !includesFilterText(p.vendedor, sellerSearch)) return false;
        if (selectedRegion !== "Todas" && p.region !== selectedRegion) return false;
        if (!matchesWeek(p, selectedWeek)) return false;
        if (selectedState !== "Todos" && getExecutiveState(p) !== selectedState) return false;
        if (selectedProduct !== "Todos" && productFamily(p.producto) !== selectedProduct) return false;
        if (selectedProduct === "Todos" && !includesFilterText(productFamily(p.producto), productSearch)) return false;
        if (selectedAccount !== "Todas" && p.cuenta !== selectedAccount) return false;
        if (selectedAccount === "Todas" && !includesFilterText(p.cuenta, accountSearch)) return false;

        return true;
      }),
    [
      radarPreopps,
      selectedSeller,
      sellerSearch,
      selectedRegion,
      selectedWeek,
      selectedState,
      selectedProduct,
      productSearch,
      selectedAccount,
      accountSearch,
    ]
  );

  const weeks = useMemo(() => weekIndexMap(radarPreopps), [radarPreopps]);

  const consolidatedUnits = useMemo(
    () => consolidatePreOppUnits(filteredPreopps, radarPreopps),
    [filteredPreopps, radarPreopps]
  );

  const accountProductRows = useMemo(() => getAccountProductRows(consolidatedUnits), [consolidatedUnits]);

  const productColumns = useMemo(() => {
    const dynamic = unique(consolidatedUnits.map((unit) => unit.productFamily));
    return PRODUCT_ORDER.filter((product) => dynamic.includes(product));
  }, [consolidatedUnits]);

  const propuestas = consolidatedUnits.filter((p) => p.state === "Propuestas").length;
  const activas = consolidatedUnits.filter((p) => p.state === "Activas").length;
  const convertidas = consolidatedUnits.filter((p) => p.state === "Convertidas").length;
  const congeladas = consolidatedUnits.filter((p) => p.state === "Convertida Congelada").length;
  const descartadas = consolidatedUnits.filter((p) => p.state === "Descartadas").length;

  const pipelineGeneralUnits = consolidatedUnits.filter((unit) => !["Convertidas", "Descartadas"].includes(unit.state));
  const pipelinePropuestasUnits = consolidatedUnits.filter((unit) => unit.state === "Propuestas");
  const pipelineActivasUnits = consolidatedUnits.filter((unit) => unit.state === "Activas");
  const pipelineConvertidoUnits = consolidatedUnits.filter((unit) => unit.state === "Convertidas");
  const pipelineCongeladoUnits = consolidatedUnits.filter((unit) => unit.state === "Convertida Congelada");
  const pipelineDescartadoUnits = consolidatedUnits.filter((unit) => unit.state === "Descartadas");

  const pipelineEsperadoGeneral = pipelineGeneralUnits.reduce((sum, p) => sum + safeNumber(p.pipelineEsperado), 0);
  const pipelineLogradoGeneral = pipelineGeneralUnits.reduce((sum, p) => sum + safeNumber(p.pipelineLogrado), 0);
  const pipelinePropuestas = pipelinePropuestasUnits.reduce((sum, p) => sum + safeNumber(p.pipelineLogrado), 0);
  const pipelineActivas = pipelineActivasUnits.reduce((sum, p) => sum + safeNumber(p.pipelineLogrado), 0);
  const pipelineConvertido = pipelineConvertidoUnits.reduce((sum, p) => sum + safeNumber(p.pipelineLogrado), 0);
  const pipelineCongelado = pipelineCongeladoUnits.reduce((sum, p) => sum + safeNumber(p.pipelineLogrado), 0);
  const pipelineDescartado = pipelineDescartadoUnits.reduce((sum, p) => sum + safeNumber(p.pipelineLogrado), 0);

  const propuestasNoDescartadas = consolidatedUnits.filter((unit) => unit.state !== "Descartadas").length;
  const propuestasNoConvertidas = consolidatedUnits.filter(
    (unit) => !["Convertidas", "Convertida Congelada"].includes(unit.state)
  ).length;

  const porcentajeConvertidas = propuestasNoDescartadas > 0 ? convertidas / propuestasNoDescartadas : 0;
  const porcentajeDescartadas = propuestasNoConvertidas > 0 ? descartadas / propuestasNoConvertidas : 0;

  const currentTitle = titles[view];

  function clearFilters() {
    setSelectedWeek(latestWeekKey);
    setSelectedSeller("Todos");
    setSelectedRegion("Todas");
    setSelectedState("Todos");
    setSelectedProduct("Todos");
    setSelectedAccount("Todas");
    setAccountSearch("");
    setSellerSearch("");
    setProductSearch("");
  }

  function openDetail(preopp: PreOpp) {
    const previous = getPreviousRow(preopp, radarPreopps, weeks);
    setDetail({ ...preopp, previous, changesCount: countChanges(preopp, previous) });
  }

  const kpiModeClass =
    view === "preopps" || view === "convertidas"
      ? "kpi-row-four"
      : view === "descartadas"
        ? "kpi-row-three"
        : "kpi-row-overview";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a
          className="brand brand-link"
          href="https://www.escala24x7.com"
          target="_blank"
          rel="noreferrer"
          aria-label="Ir al sitio web de Escala 24x7"
        >
          <div className="brand-mark">◎</div>
          <div>
            <strong>
              PreOpp
              <br />
              Radar
            </strong>
            <span>
              Monitoreo semanal de
              <br />
              pre-oportunidades
            </span>
          </div>
        </a>

        <nav className="nav" aria-label="Navegación principal">
          {navItems.map((item) => {
            const activeLink = pathname === item.href || (item.href === "/" && pathname === "/");

            return (
              <Link key={item.id} href={item.href} className={activeLink ? "active" : ""}>
                <span className="nav-icon">
                  <MenuIcon name={item.icon} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div>
            <span>Fuente</span>
            <strong>PreOpp Radar</strong>
          </div>

          <div className="sidebar-footer-divider" />

          <div>
            <span>Última actualización</span>
            <strong>Semanal · automático</strong>
            <small>{lastUpdatedEt}</small>
            <small>{source}</small>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="page-header">
          <div>
            <h1>{currentTitle.title}</h1>
            <p>{currentTitle.description}</p>
          </div>

          <div className="page-header-actions">
            <button className="ghost-button" onClick={clearFilters}>
              Limpiar filtros
            </button>

            <form action="/api/logout" method="post" className="logout-form">
              <button className="logout-button" type="submit">
                Cerrar sesión
              </button>
            </form>
          </div>
        </header>

        <section className="filter-row" aria-label="Filtros globales">
          <Filter
            label="Semana"
            value={selectedWeekLabel}
            onChange={(label) => {
              const selected = weekDescriptors.find((week) => week.label === label);
              setSelectedWeek(selected?.id || selected?.label || latestWeekKey);
            }}
            options={weekOptions}
          />
          <Filter label="Región" value={selectedRegion} onChange={setSelectedRegion} options={regionOptions} />
          <Filter
            label="Cuenta"
            value={selectedAccount}
            onChange={setSelectedAccount}
            options={accountOptions}
            searchValue={accountSearch}
            onSearchChange={setAccountSearch}
            wide
          />
          <Filter
            label="Vendedor"
            value={selectedSeller}
            onChange={setSelectedSeller}
            options={sellerOptions}
            searchValue={sellerSearch}
            onSearchChange={setSellerSearch}
            wide
          />
          <Filter label="Estado" value={selectedState} onChange={setSelectedState} options={stateOptions} />
          <Filter
            label="Producto"
            value={selectedProduct}
            onChange={setSelectedProduct}
            options={productOptions}
            searchValue={productSearch}
            onSearchChange={setProductSearch}
            wide
          />
        </section>

        <section className={`kpi-row ${kpiModeClass}`}>
          {view === "overview" && (
            <>
              <PipelineKpi esperado={pipelineEsperadoGeneral} logrado={pipelineLogradoGeneral} href="/preopps" />
              <KpiCard icon="propuestas" label="Propuestas" value={propuestas} hint={`${compactCurrency(pipelinePropuestas)} propuesto`} tone="blue" href="/preopps" />
              <KpiCard icon="activas" label="Activas" value={activas} hint={`${compactCurrency(pipelineActivas)} activo`} tone="green" href="/preopps" />
              <KpiCard icon="convertidas" label="Convertidas" value={convertidas} hint={`${compactCurrency(pipelineConvertido)} convertido`} tone="teal" href="/convertidas" />
              <KpiCard icon="congeladas" label="Congeladas" value={congeladas} hint={`${compactCurrency(pipelineCongelado)} congelado`} tone="purple" href="/preopps" />
              <KpiCard icon="descartadas" label="Descartadas" value={descartadas} hint={`${compactCurrency(pipelineDescartado)} descartado`} tone="gray" href="/descartadas" />
            </>
          )}

          {view === "cuentas" && (
            <>
              <PipelineKpi esperado={pipelineEsperadoGeneral} logrado={pipelineLogradoGeneral} label="Pipeline por cuenta" hint="Pipeline vigente" />
              <KpiCard icon="propuestas" label="Propuestas" value={propuestas} hint={`${compactCurrency(pipelinePropuestas)} propuesto`} tone="blue" />
              <KpiCard icon="activas" label="Activas" value={activas} hint={`${compactCurrency(pipelineActivas)} activo`} tone="green" />
              <KpiCard icon="convertidas" label="Convertidas" value={convertidas} hint={`${compactCurrency(pipelineConvertido)} convertido`} tone="teal" />
              <KpiCard icon="congeladas" label="Congeladas" value={congeladas} hint={`${compactCurrency(pipelineCongelado)} congelado`} tone="purple" />
              <KpiCard icon="descartadas" label="Descartadas" value={descartadas} hint={`${compactCurrency(pipelineDescartado)} descartado`} tone="gray" />
            </>
          )}

          {view === "preopps" && (
            <>
              <PipelineKpi esperado={pipelineEsperadoGeneral} logrado={pipelineLogradoGeneral} label="Pipeline en gestión" hint="No incluye convertidas ni descartadas" />
              <KpiCard icon="propuestas" label="Propuestas" value={propuestas} hint={`${compactCurrency(pipelinePropuestas)} propuesto`} tone="blue" />
              <KpiCard icon="activas" label="Activas" value={activas} hint={`${compactCurrency(pipelineActivas)} activo`} tone="green" />
              <KpiCard icon="congeladas" label="Congeladas" value={congeladas} hint={`${compactCurrency(pipelineCongelado)} congelado`} tone="purple" />
            </>
          )}

          {view === "convertidas" && (
            <>
              <PipelineKpi esperado={pipelineConvertido} logrado={pipelineConvertido} label="Pipeline convertido" hint="Valor total convertido" />
              <KpiCard icon="propuestas" label="Propuestas no descartadas" value={propuestasNoDescartadas} hint="Base de conversión" tone="blue" />
              <KpiCard icon="convertidas" label="Convertidas" value={convertidas} hint={`${compactCurrency(pipelineConvertido)} convertido`} tone="teal" />
              <KpiCard icon="convertidas" label="% conversión" value={percent(porcentajeConvertidas)} hint="Convertidas / no descartadas" tone="green" />
            </>
          )}

          {view === "descartadas" && (
            <>
              <PipelineKpi esperado={pipelineDescartado} logrado={pipelineDescartado} label="Pipeline descartado" hint="Valor fuera del pool activo" />
              <KpiCard icon="descartadas" label="Descartadas" value={descartadas} hint={`${compactCurrency(pipelineDescartado)} descartado`} tone="gray" />
              <KpiCard icon="descartadas" label="% descarte" value={percent(porcentajeDescartadas)} hint="Descartadas / no convertidas" tone="red" />
            </>
          )}
        </section>

        <section className="context-strip">
          <strong>Vista actual:</strong>
          <span>{selectedWeekLabel}</span>
          <span>{selectedRegion}</span>
          <span>{accountSearch || selectedAccount}</span>
          <span>{sellerSearch || selectedSeller}</span>
          <span>{selectedState}</span>
          <span>{productSearch || selectedProduct}</span>
          <span>{accountProductRows.length} cuentas</span>
          <span>{consolidatedUnits.length} PreOpps consolidadas</span>
        </section>

        {view === "overview" && <Overview accounts={accountProductRows} productColumns={productColumns} />}
        {view === "cuentas" && <Cuentas accounts={accountProductRows} productColumns={productColumns} />}

        {view === "preopps" && (
          <PreOppsTable preopps={filteredPreopps} allRows={radarPreopps} weeks={weeks} openDetail={openDetail} mode="preopps" />
        )}

        {view === "convertidas" && (
          <PreOppsTable preopps={filteredPreopps} allRows={radarPreopps} weeks={weeks} openDetail={openDetail} mode="convertidas" />
        )}

        {view === "descartadas" && (
          <PreOppsTable preopps={filteredPreopps} allRows={radarPreopps} weeks={weeks} openDetail={openDetail} mode="descartadas" />
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
  searchValue = "",
  onSearchChange,
  wide = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  wide?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const defaultOption = options[0] || "";

  const normalizeSearch = normalizeFilterText;
  const normalizedSearch = normalizeSearch(query);

  const filteredOptions = options.filter((option) =>
    normalizeSearch(option).includes(normalizedSearch)
  );

  const realMatches = filteredOptions.filter((option) => option !== defaultOption);

  function closeFilter() {
    setIsOpen(false);
    setQuery("");
  }

  function openFilter() {
    setIsOpen(true);
    setQuery(searchValue);

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function selectOption(option: string) {
    onChange(option);
    onSearchChange?.("");
    closeFilter();

    window.requestAnimationFrame(() => {
      inputRef.current?.blur();
    });
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    setIsOpen(true);
    onSearchChange?.(nextQuery);

    const normalizedNextQuery = normalizeSearch(nextQuery);

    if (!normalizedNextQuery) {
      if (onSearchChange && value !== defaultOption) {
        onChange(defaultOption);
      }
      return;
    }

    const matchingOptions = options
      .filter((option) => option !== defaultOption)
      .filter((option) => normalizeSearch(option).includes(normalizedNextQuery));

    const exactMatch = matchingOptions.find(
      (option) => normalizeSearch(option) === normalizedNextQuery
    );

    const automaticMatch = exactMatch || (matchingOptions.length === 1 ? matchingOptions[0] : null);

    if (onSearchChange) {
      if (automaticMatch) {
        onChange(automaticMatch);
        onSearchChange("");
        setQuery(automaticMatch);
        setIsOpen(false);
        return;
      }

      if (value !== defaultOption) {
        onChange(defaultOption);
      }
      return;
    }

    const matchingOptionsForSelect = options
      .filter((option) => option !== defaultOption)
      .filter((option) => normalizeSearch(option).includes(normalizedNextQuery));

    const exactMatchForSelect = matchingOptionsForSelect.find(
      (option) => normalizeSearch(option) === normalizedNextQuery
    );

    /*
     * Al empezar una búsqueda se libera el valor anterior para evitar que
     * un filtro seleccionado previamente limite las nuevas opciones.
     */
    if (value !== defaultOption && !exactMatchForSelect && matchingOptionsForSelect.length !== 1) {
      onChange(defaultOption);
    }

    /*
     * Si la búsqueda deja una única coincidencia, se aplica automáticamente.
     * Así basta con escribir una parte distintiva del nombre.
     */
    const automaticMatchForSelect =
      exactMatchForSelect ||
      (matchingOptionsForSelect.length === 1 ? matchingOptionsForSelect[0] : null);

    if (automaticMatchForSelect && automaticMatchForSelect !== value) {
      onChange(automaticMatchForSelect);
    }
  }

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeFilter();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  /*
   * Safari puede conservar el desplazamiento horizontal del input después
   * de elegir una opción larga. Al cerrar el selector, devolvemos el campo
   * al inicio para que fechas como "27 jul–02 ago 2026" se vean completas.
   */
  useEffect(() => {
    if (isOpen) return;

    const frameId = window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;

      input.scrollLeft = 0;

      try {
        input.setSelectionRange(0, 0);
      } catch {
        // Algunos navegadores no permiten cambiar la selección en readOnly.
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen, value]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      closeFilter();
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowDown") {
      setIsOpen(true);
      event.preventDefault();
      return;
    }

    if (event.key === "Enter") {
      const exactMatch = realMatches.find(
        (option) => normalizeSearch(option) === normalizedSearch
      );

      const nextOption = exactMatch || realMatches[0] || filteredOptions[0];

      if (nextOption) {
        selectOption(nextOption);
      }

      event.preventDefault();
    }
  }

  const displayedValue = isOpen ? query : searchValue || value;
  const placeholder = isOpen ? `Escribe para buscar ${label.toLowerCase()}` : "";

  return (
    <div
      ref={containerRef}
      className={`filter-chip searchable-filter ${wide ? "wide-filter" : ""} ${isOpen ? "is-open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          closeFilter();
        }
      }}
    >
      <span>{label}</span>

      <div className="filter-combobox">
        <input
          ref={inputRef}
          className="filter-search-input"
          type="text"
          role="combobox"
          aria-label={`Buscar y seleccionar ${label.toLowerCase()}`}
          aria-expanded={isOpen}
          aria-autocomplete="list"
          autoComplete="off"
          value={displayedValue}
          placeholder={placeholder}
          title={value}
          readOnly={!isOpen}
          onFocus={() => {
            if (!isOpen) openFilter();
          }}
          onClick={() => {
            if (!isOpen) openFilter();
          }}
          onChange={(event) => handleQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />

        <button
          className="filter-toggle"
          type="button"
          aria-label={`Mostrar opciones de ${label.toLowerCase()}`}
          aria-expanded={isOpen}
          onClick={() => {
            if (isOpen) {
              closeFilter();
            } else {
              openFilter();
            }
          }}
        >
          <span aria-hidden="true">⌄</span>
        </button>

        {isOpen && (
          <div className="filter-options" role="listbox" aria-label={`Opciones de ${label.toLowerCase()}`}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={option === value}
                  className={`filter-option ${option === value ? "selected" : ""}`}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    selectOption(option);
                  }}
                >
                  <span className="filter-option-label">{option}</span>
                  {option === value && <span className="filter-option-check" aria-hidden="true">✓</span>}
                </button>
              ))
            ) : (
              <div className="filter-empty">No hay coincidencias</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Overview({
  accounts,
  productColumns,
}: {
  accounts: AccountProductRow[];
  productColumns: string[];
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
                    {account.region || "Sin región"} · {account.pais || "Sin país"} · {account.industria || "Sin industria"}
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
                  const icon = status ? stateIconName(status.state) : null;

                  return (
                    <td data-label={product} key={`${account.key}-${product}`}>
                      {status && icon ? (
                        <span className={`status-icon status-${getStateTone(status.state)}`}>
                          <MetricIcon name={icon} size={20} />
                          <small>{stateLabel(status.state)}</small>
                        </span>
                      ) : (
                        <span className="empty-status">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {!accounts.length && (
              <tr>
                <td colSpan={2 + productColumns.length}>
                  <div className="empty-table-message">No hay cuentas visibles con los filtros actuales.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="legend status-legend">
        <span>Propuesta</span>
        <span>Activa</span>
        <span>Convertida</span>
        <span>Congelada</span>
        <span>Descartada</span>
        <span>— Sin PreOpp</span>
      </div>
    </section>
  );
}

function Cuentas({
  accounts,
  productColumns,
}: {
  accounts: AccountProductRow[];
  productColumns: string[];
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Resumen ejecutivo por cuenta</h2>
          <p>Consolidado de productos, pipeline y cantidad de PreOpps asociadas.</p>
        </div>

        <Pill tone="blue">{accounts.length} cuentas visibles</Pill>
      </div>

      <div className="table-wrap">
        <table className="data-table cuentas-table">
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Vendedor</th>
              <th>Región</th>
              {productColumns.map((product) => (
                <th key={product}>{product}</th>
              ))}
              <th>Pipeline logrado</th>
              <th>Pipeline esperado</th>
              <th>PreOpps asociadas</th>
            </tr>
          </thead>

          <tbody>
            {accounts.map((account) => (
              <tr key={account.key}>
                <td data-label="Cuenta">
                  <b>{account.cuenta}</b>
                  <small>
                    {account.pais || "Sin país"} · {account.industria || "Sin industria"}
                  </small>
                </td>

                <td data-label="Vendedor">{account.vendedor}</td>
                <td data-label="Región">{account.region || "Sin región"}</td>

                {productColumns.map((product) => {
                  const status = account.productStatus[product];
                  const icon = status ? stateIconName(status.state) : null;

                  return (
                    <td data-label={product} key={`${account.key}-${product}`}>
                      {status && icon ? (
                        <span className={`status-icon status-${getStateTone(status.state)}`}>
                          <MetricIcon name={icon} size={20} />
                          <small>{stateLabel(status.state)}</small>
                        </span>
                      ) : (
                        <span className="empty-status">—</span>
                      )}
                    </td>
                  );
                })}

                <td data-label="Pipeline logrado">{currency(account.pipelineLogrado)}</td>
                <td data-label="Pipeline esperado">{currency(account.pipelineEsperado)}</td>
                <td data-label="PreOpps asociadas">{account.totalPreopps}</td>
              </tr>
            ))}

            {!accounts.length && (
              <tr>
                <td colSpan={7 + productColumns.length}>
                  <div className="empty-table-message">No hay cuentas visibles con los filtros actuales.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PreOppsTable({
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
  mode: OperationalView;
}) {
  const baseRows = preopps.filter((p) => {
    const state = getExecutiveState(p);

    if (mode === "convertidas") return ["Convertidas", "Convertida Congelada"].includes(state);
    if (mode === "descartadas") return state === "Descartadas";

    return !["Convertidas", "Convertida Congelada", "Descartadas"].includes(state);
  });

  const rows = baseRows.map((p) => {
    const previous = getPreviousRow(p, allRows, weeks);
    return { current: p, previous, changes: countChanges(p, previous) };
  });

  const pageTitle =
    mode === "convertidas" ? "Convertidas" : mode === "descartadas" ? "Descartadas" : "Pre-oportunidades";

  const pageDescription =
    mode === "convertidas"
      ? "Pre-oportunidades convertidas a Cloud Sales."
      : mode === "descartadas"
        ? "Pre-oportunidades descartadas y fuera del pool activo."
        : "Comparación contra la semana anterior usando snapshot histórico. Las actividades se revisan desde “Ver más detalles”.";

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{pageTitle}</h2>
          <p>{pageDescription}</p>
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
              {mode === "descartadas" && <th>Motivo</th>}
              <th>Detalle</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(({ current, previous, changes }) => {
              const previousAmount = current.montoAnterior || previous?.montoEstimado || 0;
              const previousStage = current.etapaAnterior || previous?.etapa || "";
              const delta = getPipelineLogradoActual(current) - safeNumber(previousAmount);

              return (
                <tr key={`${current.id}-${current.semanaId}-${current.estado}`}>
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

                  {mode === "descartadas" && (
                    <td data-label="Motivo">
                      <span className="muted">{current.motivoDescarte || "Sin motivo registrado"}</span>
                    </td>
                  )}

                  <td data-label="Detalle">
                    <button className="row-action" onClick={() => openDetail(current)}>
                      <IconDetalle size={15} />
                      <span>
                        Ver más detalles <small>{changes} cambios</small>
                      </span>
                    </button>
                  </td>
                </tr>
              );
            })}

            {!rows.length && (
              <tr>
                <td colSpan={mode === "descartadas" ? 9 : 8}>
                  <div className="empty-table-message">No hay registros para esta vista con los filtros actuales.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetailModal({ preopp, activities, onClose }: { preopp: DetailPreOpp; activities: Activity[]; onClose: () => void }) {
  const previous = preopp.previous;
  const state = getExecutiveState(preopp);
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
          <Detail label="Estado dashboard" value={stateLabel(state)} />
          <Detail label="Etapa real esta semana" value={preopp.etapa || "Sin etapa"} />
          <Detail label="Etapa real semana anterior" value={previousStage} />
          <Detail label="Pipeline esperado inicial" value={currency(getPipelineEsperadoInicial(preopp))} />
          <Detail label="Pipeline logrado" value={currency(getPipelineLogradoActual(preopp))} />
          <Detail label="Pipeline anterior" value={currency(montoAnterior)} />
          <Detail label="# de cambios" value={String(preopp.changesCount ?? 0)} />
          <Detail label="Fecha de creación" value={preopp.fechaCreacion || "Sin registro"} />
          <Detail label="Última modificación" value={preopp.ultimaActividad || "Sin registro"} />

          {state === "Descartadas" && (
            <Detail label="Motivo de descarte" value={preopp.motivoDescarte || "Sin motivo registrado"} />
          )}
        </div>

        <div className="modal-section">
          <div className="modal-section-head">
            <h3>Actividades de la oportunidad</h3>

            {hubspotLink ? (
              <a className="mini-link" href={hubspotLink} target="_blank" rel="noreferrer">
                <IconHubSpot size={16} />
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
                    ? "↩"
                    : activity.type === "Señal"
                      ? "•"
                      : activity.type === "Cambio de etapa"
                        ? "↻"
                        : activity.type === "Semana pasada"
                          ? "◷"
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