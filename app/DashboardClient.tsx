"use client";

import Image from "next/image";
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

type View = "overview" | "cuentas" | "preopps" | "convertidas" | "descartadas" | "vendedores" | "productos";
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
type MenuIconName = "overview" | "cuentas" | "preopps" | "convertidas" | "descartadas" | "leaderboard-ams" | "leaderboard-soluciones";

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


type LeaderboardMode = "ams" | "soluciones";
type LeaderboardStage =
  | "Propuestas"
  | "Activas"
  | "Convertidas"
  | "Convertida Congelada"
  | "Descartadas";

type LeaderboardRow = {
  rank: number;
  key: string;
  label: string;
  secondary: string;
  total: number;
  propuestas: number;
  activas: number;
  convertidas: number;
  congeladas: number;
  descartadas: number;
  momentum: number;
  rows: PreOpp[];
};

type LeaderboardDetail = {
  mode: LeaderboardMode;
  groupLabel: string;
  stage: LeaderboardStage;
  rows: PreOpp[];
};

const PRODUCT_ORDER = [
  "App Modernization Squads",
  "GenAI Squads",
  "Security Assessment + Epics",
  "Cloud EMx Ultra",
  "AWS Billing Solutions",
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const navItems = [
  { id: "overview" as View, label: "Overview", href: "/", icon: "overview" as MenuIconName },
  { id: "cuentas" as View, label: "Cuentas", href: "/cuentas", icon: "cuentas" as MenuIconName },
  { id: "preopps" as View, label: "Pre-oportunidades", href: "/preopps", icon: "preopps" as MenuIconName },
  { id: "convertidas" as View, label: "Convertidas", href: "/convertidas", icon: "convertidas" as MenuIconName },
  { id: "descartadas" as View, label: "Descartadas", href: "/descartadas", icon: "descartadas" as MenuIconName },
  { id: "vendedores" as View, label: "Leaderboard AMs", href: "/vendedores", icon: "leaderboard-ams" as MenuIconName },
  { id: "productos" as View, label: "Leaderboard Soluciones", href: "/productos", icon: "leaderboard-soluciones" as MenuIconName },
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
  vendedores: {
    title: "PreOpp Leaderboard | AMs",
    description: "Momentum comercial por AM: movimiento de PreOpps y conversiones de la semana.",
  },
  productos: {
    title: "PreOpp Leaderboard | Soluciones",
    description: "Momentum por solución: avance del portafolio PreOpp hacia conversión.",
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
  /*
   * Fuente única de verdad: Pipeline_Esperado_Inicial de Vercel_View.
   * No se recalcula por producto en el frontend. Un 0 recibido desde Sheets
   * se conserva como 0.
   */
  return safeNumber(preopp.pipelineEsperado);
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

  if (clean.includes("aws billing solutions") || clean.includes("billing solutions")) {
    return "AWS Billing Solutions";
  }

  return "";
}

function isRadarProduct(preopp: PreOpp) {
  return Boolean(productFamily(preopp.producto));
}

function uniqueLeaderboardPreOpps(rows: PreOpp[]) {
  const byKey = new Map<string, PreOpp>();

  rows.forEach((row) => {
    const id = String(row.id || "").trim();
    const family = productFamily(row.producto);
    if (!id || !family) return;

    byKey.set(`${id}||${family}`, row);
  });

  return Array.from(byKey.values());
}

function buildLeaderboardRows(rows: PreOpp[], mode: LeaderboardMode): LeaderboardRow[] {
  const uniqueRows = uniqueLeaderboardPreOpps(rows);
  const grouped = new Map<string, PreOpp[]>();

  if (mode === "soluciones") {
    PRODUCT_ORDER.forEach((product) => grouped.set(product, []));
  }

  uniqueRows.forEach((row) => {
    const key = mode === "ams" ? String(row.vendedor || "Sin vendedor").trim() : productFamily(row.producto);
    if (!key) return;

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  });

  return Array.from(grouped.entries())
    .map(([key, groupRows]) => {
      const propuestas = groupRows.filter((row) => getExecutiveState(row) === "Propuestas").length;
      const activas = groupRows.filter((row) => getExecutiveState(row) === "Activas").length;
      const convertidas = groupRows.filter((row) => getExecutiveState(row) === "Convertidas").length;
      const congeladas = groupRows.filter((row) => getExecutiveState(row) === "Convertida Congelada").length;
      const descartadas = groupRows.filter((row) => getExecutiveState(row) === "Descartadas").length;
      const total = propuestas + activas + convertidas + congeladas + descartadas;
      const momentum = total > 0 ? convertidas / total : 0;

      const secondary =
        mode === "ams"
          ? unique(groupRows.map((row) => row.region)).join(" · ") || "Sin región"
          : `${unique(groupRows.map((row) => row.vendedor)).length} AM${unique(groupRows.map((row) => row.vendedor)).length === 1 ? "" : "s"}`;

      return {
        rank: 0,
        key,
        label: key,
        secondary,
        total,
        propuestas,
        activas,
        convertidas,
        congeladas,
        descartadas,
        momentum,
        rows: groupRows,
      };
    })
    .sort(
      (a, b) =>
        b.convertidas - a.convertidas ||
        b.momentum - a.momentum ||
        b.activas - a.activas ||
        b.total - a.total ||
        a.label.localeCompare(b.label, "es")
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function leaderboardStageRows(row: LeaderboardRow, stage: LeaderboardStage) {
  return row.rows
    .filter((preopp) => getExecutiveState(preopp) === stage)
    .sort((a, b) =>
      safeNumber(getPipelineLogradoActual(b)) - safeNumber(getPipelineLogradoActual(a)) ||
      a.cuenta.localeCompare(b.cuenta, "es")
    );
}

function leaderboardStageLabel(stage: LeaderboardStage) {
  if (stage === "Convertida Congelada") return "Congeladas";
  return stage;
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
  if (name === "descartadas") return <IconDescartadas size={size} className="menu-svg-icon" />;

  const src =
    name === "leaderboard-ams"
      ? "/preopp-icons/leaderboard-medal.png"
      : "/preopp-icons/leaderboard-rocket.png";

  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="leaderboard-menu-icon"
    />
  );
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
  const avance = esperado > 0 ? logrado / esperado : null;

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
            <b>{avance === null ? "—" : percent(avance)}</b>
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
  const [leaderboardDetail, setLeaderboardDetail] = useState<LeaderboardDetail | null>(null);

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

  const leaderboardPreopps = useMemo(
    () => uniqueLeaderboardPreOpps(filteredPreopps),
    [filteredPreopps]
  );

  /*
   * Para el Leaderboard de AMs, el ranking se calcula sin aplicar el filtro
   * de vendedor. Así, cuando se selecciona un AM, conserva su posición real
   * dentro del ranking de la semana y del resto de filtros activos.
   */
  const sellerRankingUniverse = useMemo(
    () =>
      radarPreopps.filter((p) => {
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
      selectedRegion,
      selectedWeek,
      selectedState,
      selectedProduct,
      productSearch,
      selectedAccount,
      accountSearch,
    ]
  );

  const sellerRankMap = useMemo(
    () =>
      new Map(
        buildLeaderboardRows(sellerRankingUniverse, "ams").map((row) => [row.key, row.rank])
      ),
    [sellerRankingUniverse]
  );

  const sellerLeaderboard = useMemo(
    () =>
      buildLeaderboardRows(leaderboardPreopps, "ams").map((row) => ({
        ...row,
        rank: sellerRankMap.get(row.key) ?? row.rank,
      })),
    [leaderboardPreopps, sellerRankMap]
  );

  const solutionLeaderboard = useMemo(() => {
    const rows = buildLeaderboardRows(leaderboardPreopps, "soluciones");

    if (selectedProduct !== "Todos") {
      return rows.filter((row) => row.label === selectedProduct);
    }

    if (productSearch) {
      return rows.filter((row) => includesFilterText(row.label, productSearch));
    }

    return rows;
  }, [leaderboardPreopps, selectedProduct, productSearch]);

  /*
   * ============================================================
   * KPI Y PIPELINE
   * ============================================================
   * Los KPI se calculan por ID_PreOpp real.
   * consolidatedUnits se mantiene SOLO para las tablas por cuenta/producto.
   */
  const kpiPreopps = useMemo(() => {
    const byId = new Map<string, PreOpp>();

    filteredPreopps.forEach((preopp) => {
      const id = String(preopp.id || "").trim();
      if (!id) return;

      // Si por histórico existiera más de una fila del mismo ID en la misma
      // semana, la última fila vigente prevalece.
      byId.set(id, preopp);
    });

    return Array.from(byId.values());
  }, [filteredPreopps]);

  const propuestasRows = kpiPreopps.filter((p) => getExecutiveState(p) === "Propuestas");
  const activasRows = kpiPreopps.filter((p) => getExecutiveState(p) === "Activas");
  const convertidasRows = kpiPreopps.filter((p) => getExecutiveState(p) === "Convertidas");
  const congeladasRows = kpiPreopps.filter((p) => getExecutiveState(p) === "Convertida Congelada");
  const descartadasRows = kpiPreopps.filter((p) => getExecutiveState(p) === "Descartadas");

  const propuestas = propuestasRows.length;
  const activas = activasRows.length;
  const convertidas = convertidasRows.length;
  const congeladas = congeladasRows.length;
  const descartadas = descartadasRows.length;

  // Esperado = suma exacta de Pipeline_Esperado_Inicial, sin excluir estados.
  const pipelineEsperadoGeneral = kpiPreopps.reduce(
    (sum, preopp) => sum + getPipelineEsperadoInicial(preopp),
    0
  );

  // Vigente = Pipeline_Logrado_Esta_Semana excepto Convertidas y Descartadas.
  // Las congeladas sí forman parte del vigente por definición operativa.
  const pipelineLogradoGeneral = kpiPreopps
    .filter((preopp) => !["Convertidas", "Descartadas"].includes(getExecutiveState(preopp)))
    .reduce((sum, preopp) => sum + getPipelineLogradoActual(preopp), 0);

  // Desglose del logrado de esta semana por Estado_Dashboard.
  const pipelinePropuestas = propuestasRows.reduce(
    (sum, preopp) => sum + getPipelineLogradoActual(preopp),
    0
  );
  const pipelineActivas = activasRows.reduce(
    (sum, preopp) => sum + getPipelineLogradoActual(preopp),
    0
  );
  const pipelineConvertido = convertidasRows.reduce(
    (sum, preopp) => sum + getPipelineLogradoActual(preopp),
    0
  );

  // En Convertidas, el esperado conserva el Pipeline_Esperado_Inicial
  // de las mismas PreOpp que ya fueron convertidas.
  const pipelineEsperadoConvertido = convertidasRows.reduce(
    (sum, preopp) => sum + getPipelineEsperadoInicial(preopp),
    0
  );
  const pipelineCongelado = congeladasRows.reduce(
    (sum, preopp) => sum + getPipelineLogradoActual(preopp),
    0
  );
  const pipelineDescartado = descartadasRows.reduce(
    (sum, preopp) => sum + getPipelineLogradoActual(preopp),
    0
  );

  // La meta ideal de descarte es cero: no existe un pipeline esperado
  // estándar de descarte para este programa.
  const pipelineEsperadoDescartado = 0;

  const propuestasNoDescartadas = kpiPreopps.filter(
    (preopp) => getExecutiveState(preopp) !== "Descartadas"
  ).length;
  const propuestasNoConvertidas = kpiPreopps.filter(
    (preopp) => !["Convertidas", "Convertida Congelada"].includes(getExecutiveState(preopp))
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

  function openLeaderboardStage(row: LeaderboardRow, stage: LeaderboardStage, mode: LeaderboardMode) {
    const rows = leaderboardStageRows(row, stage);
    if (!rows.length) return;

    setLeaderboardDetail({
      mode,
      groupLabel: row.label,
      stage,
      rows,
    });
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
            <strong>Automático · cada 12 h</strong>
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

        {view !== "vendedores" && view !== "productos" && (
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
              <PipelineKpi esperado={pipelineEsperadoConvertido} logrado={pipelineConvertido} label="Pipeline convertido" hint="Valor total convertido" />
              <KpiCard icon="propuestas" label="Propuestas no descartadas" value={propuestasNoDescartadas} hint="Base de conversión" tone="blue" />
              <KpiCard icon="convertidas" label="Convertidas" value={convertidas} hint={`${compactCurrency(pipelineConvertido)} convertido`} tone="teal" />
              <KpiCard icon="convertidas" label="% conversión" value={percent(porcentajeConvertidas)} hint="Convertidas / no descartadas" tone="green" />
            </>
          )}

          {view === "descartadas" && (
            <>
              <PipelineKpi esperado={pipelineEsperadoDescartado} logrado={pipelineDescartado} label="Pipeline descartado" hint="Valor fuera del pool activo" />
              <KpiCard icon="descartadas" label="Descartadas" value={descartadas} hint={`${compactCurrency(pipelineDescartado)} descartado`} tone="gray" />
              <KpiCard icon="descartadas" label="% descarte" value={percent(porcentajeDescartadas)} hint="Descartadas / no convertidas" tone="red" />
            </>
          )}
          </section>
        )}

        <section className="context-strip">
          <strong>Vista actual:</strong>
          <span>{selectedWeekLabel}</span>
          <span>{selectedRegion}</span>
          <span>{accountSearch || selectedAccount}</span>
          <span>{sellerSearch || selectedSeller}</span>
          <span>{selectedState}</span>
          <span>{productSearch || selectedProduct}</span>
          {view === "vendedores" ? (
            <>
              <span>{sellerLeaderboard.length} AMs</span>
              <span>{leaderboardPreopps.length} PreOpps</span>
            </>
          ) : view === "productos" ? (
            <>
              <span>{solutionLeaderboard.length} soluciones</span>
              <span>{leaderboardPreopps.length} PreOpps</span>
            </>
          ) : (
            <>
              <span>{accountProductRows.length} cuentas</span>
              <span>{consolidatedUnits.length} PreOpps consolidadas</span>
            </>
          )}
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

        {view === "vendedores" && (
          <LeaderboardTable
            mode="ams"
            rows={sellerLeaderboard}
            onOpenStage={(row, stage) => openLeaderboardStage(row, stage, "ams")}
          />
        )}

        {view === "productos" && (
          <LeaderboardTable
            mode="soluciones"
            rows={solutionLeaderboard}
            onOpenStage={(row, stage) => openLeaderboardStage(row, stage, "soluciones")}
          />
        )}
      </section>

      {leaderboardDetail && (
        <LeaderboardStageModal
          detail={leaderboardDetail}
          activities={activities}
          onClose={() => setLeaderboardDetail(null)}
          onOpenDetail={(preopp) => {
            setLeaderboardDetail(null);
            openDetail(preopp);
          }}
        />
      )}

      {detail && <DetailModal preopp={detail} activities={activities} onClose={() => setDetail(null)} />}
    </main>
  );
}

function PaginationControls({
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel,
}: {
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  itemLabel: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="pagination-bar">
      <div className="pagination-summary">
        <span>Mostrando</span>
        <strong>{start}-{end}</strong>
        <span>de</span>
        <strong>{totalItems}</strong>
        <span>{itemLabel}</span>
      </div>

      <div className="pagination-actions">
        <label className="page-size-control">
          <span>Ver</span>
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <span>por página</span>
        </label>

        <div className="pager-controls">
          <button
            type="button"
            className="pager-button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            Anterior
          </button>
          <span className="pager-indicator">Página {page} de {totalPages}</span>
          <button
            type="button"
            className="pager-button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

function LeaderboardTable({
  mode,
  rows,
  onOpenStage,
}: {
  mode: LeaderboardMode;
  rows: LeaderboardRow[];
  onOpenStage: (row: LeaderboardRow, stage: LeaderboardStage) => void;
}) {
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [rows.length, pageSize, mode]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const identityLabel = mode === "ams" ? "AM" : "Solución";
  const title = mode === "ams" ? "Leaderboard de AMs" : "Leaderboard de Soluciones";
  const description =
    mode === "ams"
      ? "Ranking por PreOpps convertidas. En empate, prioriza Momentum y luego PreOpps activas."
      : "Ranking de las 4 soluciones por PreOpps convertidas. En empate, prioriza Momentum y luego PreOpps activas.";

  const stageCells: Array<{
    stage: LeaderboardStage;
    label: string;
    key: keyof Pick<LeaderboardRow, "propuestas" | "activas" | "convertidas" | "congeladas" | "descartadas">;
  }> = [
    { stage: "Propuestas", label: "Propuestas", key: "propuestas" },
    { stage: "Activas", label: "Activas", key: "activas" },
    { stage: "Convertidas", label: "Convertidas", key: "convertidas" },
    { stage: "Convertida Congelada", label: "Congeladas", key: "congeladas" },
    { stage: "Descartadas", label: "Descartadas", key: "descartadas" },
  ];

  return (
    <section className="panel leaderboard-panel">
      <div className="panel-head leaderboard-panel-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>

        <div className="leaderboard-heading-badges">
          <Pill tone="teal">{rows.length} {mode === "ams" ? "AMs" : "soluciones"}</Pill>
          <Pill tone="blue">Clic en cada etapa para ver las PreOpps</Pill>
        </div>
      </div>

      <PaginationControls
        totalItems={rows.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        itemLabel={mode === "ams" ? "AMs" : "soluciones"}
      />

      <div className="table-wrap leaderboard-table-wrap">
        <table className="data-table leaderboard-table">
          <thead>
            <tr>
              <th className="leaderboard-rank-col">#</th>
              <th>{identityLabel}</th>
              {stageCells.map((cell) => (
                <th key={cell.stage} className="leaderboard-number-col">{cell.label}</th>
              ))}
              <th className="leaderboard-momentum-col">Momentum</th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.key}>
                <td data-label="Ranking" className="leaderboard-rank-cell">
                  <span className={`leaderboard-rank leaderboard-rank-${Math.min(row.rank, 4)}`}>
                    {row.rank}
                  </span>
                </td>

                <td data-label={identityLabel} className="leaderboard-name-cell">
                  <b>{row.label}</b>
                  <small>{row.secondary} · {row.total} PreOpps</small>
                </td>

                {stageCells.map((cell) => {
                  const count = row[cell.key];
                  const stageShare = row.total > 0 ? count / row.total : 0;
                  const tone = getStateTone(cell.stage);

                  return (
                    <td key={cell.stage} data-label={cell.label} className="leaderboard-stage-cell">
                      <button
                        type="button"
                        className={`leaderboard-stage-button leaderboard-stage-${tone}`}
                        disabled={count === 0}
                        onClick={() => onOpenStage(row, cell.stage)}
                        aria-label={`${cell.label}: ${count} PreOpps de ${row.label}`}
                      >
                        <strong>{count}</strong>
                        <small>{percent(stageShare)} de base</small>
                      </button>
                    </td>
                  );
                })}

                <td data-label="Momentum" className="leaderboard-momentum-cell">
                  <div className="momentum-badge">
                    <strong>{percent(row.momentum)}</strong>
                    <small>{row.convertidas} de {row.total} convertidas</small>
                  </div>
                </td>
              </tr>
            ))}

            {!rows.length && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-table-message">
                    No hay PreOpps para construir el leaderboard con los filtros actuales.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls
        totalItems={rows.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        itemLabel={mode === "ams" ? "AMs" : "soluciones"}
      />

      <div className="leaderboard-footnote">
        <span><b>Momentum</b> = PreOpps convertidas / total de PreOpps del AM o solución.</span>
        <span>El ranking se ordena por Convertidas, luego Momentum y luego Activas.</span>
      </div>
    </section>
  );
}

function LeaderboardStageModal({
  detail,
  activities,
  onClose,
  onOpenDetail,
}: {
  detail: LeaderboardDetail;
  activities: Activity[];
  onClose: () => void;
  onOpenDetail: (preopp: PreOpp) => void;
}) {
  const stageLabel = leaderboardStageLabel(detail.stage);
  const modeLabel = detail.mode === "ams" ? "AM" : "Solución";
  const totalPipeline = detail.rows.reduce(
    (sum, row) => sum + getPipelineLogradoActual(row),
    0
  );

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Detalle de ${stageLabel}`}>
      <article className="modal-card side-panel-card leaderboard-detail-card">
        <div className="modal-head">
          <div>
            <h2>{stageLabel} · {detail.groupLabel}</h2>
            <p>
              {modeLabel} · {detail.rows.length} PreOpps · {compactCurrency(totalPipeline)} de pipeline logrado
            </p>
          </div>

          <button onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="leaderboard-detail-summary">
          <Pill tone={getStateTone(detail.stage)}>{stageLabel}</Pill>
          <Pill tone="blue">{detail.rows.length} oportunidades</Pill>
        </div>

        <div className="table-wrap leaderboard-detail-table-wrap">
          <table className="data-table leaderboard-detail-table">
            <thead>
              <tr>
                <th>Cuenta / PreOpp</th>
                <th>AM</th>
                <th>Solución</th>
                <th>Etapa real</th>
                <th>Pipeline logrado</th>
                <th>Pipeline esperado</th>
                <th>Última actividad</th>
                <th>HubSpot</th>
                <th>Detalle</th>
              </tr>
            </thead>

            <tbody>
              {detail.rows.map((preopp) => {
                const hubspotLink =
                  preopp.linkHubSpot ||
                  activities.find(
                    (activity) => String(activity.preoppId) === String(preopp.id) && activity.linkPreOpp
                  )?.linkPreOpp ||
                  "";

                return (
                <tr key={`${preopp.id}-${productFamily(preopp.producto)}-${preopp.estado}`}>
                  <td data-label="Cuenta / PreOpp">
                    <b>{preopp.cuenta}</b>
                    <small>
                      ID {preopp.id} · {preopp.region || "Sin región"} · {preopp.pais || "Sin país"}
                    </small>
                  </td>

                  <td data-label="AM">
                    <b>{preopp.vendedor || "Sin vendedor"}</b>
                  </td>

                  <td data-label="Solución">
                    {productFamily(preopp.producto)}
                  </td>

                  <td data-label="Etapa real">
                    <StagePill stage={preopp.etapa} />
                    <small>{stateLabel(getExecutiveState(preopp))}</small>
                  </td>

                  <td data-label="Pipeline logrado">{currency(getPipelineLogradoActual(preopp))}</td>
                  <td data-label="Pipeline esperado">{currency(getPipelineEsperadoInicial(preopp))}</td>

                  <td data-label="Última actividad">
                    <span className="muted">{preopp.ultimaActividad || "Sin registro"}</span>
                  </td>

                  <td data-label="HubSpot">
                    {hubspotLink ? (
                      <a className="mini-link leaderboard-hubspot-link" href={hubspotLink} target="_blank" rel="noreferrer">
                        <IconHubSpot size={15} />
                        Abrir
                      </a>
                    ) : (
                      <span className="muted">Sin enlace</span>
                    )}
                  </td>

                  <td data-label="Detalle">
                    <button className="row-action leaderboard-detail-action" onClick={() => onOpenDetail(preopp)}>
                      <IconDetalle size={15} />
                      Ver detalle
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
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
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(accounts.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [accounts.length, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleAccounts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return accounts.slice(start, start + pageSize);
  }, [accounts, page, pageSize]);

  return (
    <section className="panel overview-status-panel">
      <div className="panel-head">
        <div>
          <h2>Estado de cuentas por producto</h2>
          <p>Una cuenta por fila. Los iconos reflejan el estatus consolidado de cada PreOpp por producto.</p>
        </div>
        <Pill tone="blue">{accounts.length} cuentas visibles</Pill>
      </div>

      <PaginationControls totalItems={accounts.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="cuentas" />

      <div className="status-table-wrap">
        <table className="status-table">
          <thead>
            <tr>
              <th className="account-col">Cuenta</th>
              <th className="owner-col">Vendedor</th>
              {productColumns.map((product) => <th className="product-col" key={product}>{product}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleAccounts.map((account) => (
              <tr key={account.key}>
                <td data-label="Cuenta">
                  <b>{account.cuenta}</b>
                  <small>{account.region || "Sin región"} · {account.pais || "Sin país"} · {account.industria || "Sin industria"}</small>
                </td>
                <td data-label="Vendedor">
                  <b>{account.vendedor}</b>
                  <small>{compactCurrency(account.pipelineLogrado)} logrado · {compactCurrency(account.pipelineEsperado)} esperado</small>
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
                      ) : <span className="empty-status">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!accounts.length && (
              <tr><td colSpan={2 + productColumns.length}><div className="empty-table-message">No hay cuentas visibles con los filtros actuales.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls totalItems={accounts.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="cuentas" />

      <div className="legend status-legend">
        <span>Propuesta</span><span>Activa</span><span>Convertida</span><span>Congelada</span><span>Descartada</span><span>— Sin PreOpp</span>
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
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(accounts.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [accounts.length, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleAccounts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return accounts.slice(start, start + pageSize);
  }, [accounts, page, pageSize]);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Resumen ejecutivo por cuenta</h2>
          <p>Consolidado de productos, pipeline y cantidad de PreOpps asociadas.</p>
        </div>
        <Pill tone="blue">{accounts.length} cuentas visibles</Pill>
      </div>

      <PaginationControls totalItems={accounts.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="cuentas" />

      <div className="table-wrap">
        <table className="data-table cuentas-table">
          <thead>
            <tr>
              <th>Cuenta</th><th>Vendedor</th><th>Región</th>
              {productColumns.map((product) => <th key={product}>{product}</th>)}
              <th>Pipeline logrado</th><th>Pipeline esperado</th><th>PreOpps asociadas</th>
            </tr>
          </thead>
          <tbody>
            {visibleAccounts.map((account) => (
              <tr key={account.key}>
                <td data-label="Cuenta"><b>{account.cuenta}</b><small>{account.pais || "Sin país"} · {account.industria || "Sin industria"}</small></td>
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
                      ) : <span className="empty-status">—</span>}
                    </td>
                  );
                })}
                <td data-label="Pipeline logrado">{currency(account.pipelineLogrado)}</td>
                <td data-label="Pipeline esperado">{currency(account.pipelineEsperado)}</td>
                <td data-label="PreOpps asociadas">{account.totalPreopps}</td>
              </tr>
            ))}
            {!accounts.length && (
              <tr><td colSpan={7 + productColumns.length}><div className="empty-table-message">No hay cuentas visibles con los filtros actuales.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls totalItems={accounts.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="cuentas" />
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
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

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

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [rows.length, pageSize, mode]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const pageTitle = mode === "convertidas" ? "Convertidas" : mode === "descartadas" ? "Descartadas" : "Pre-oportunidades";
  const pageDescription = mode === "convertidas"
    ? "Pre-oportunidades convertidas a Cloud Sales."
    : mode === "descartadas"
      ? "Pre-oportunidades descartadas y fuera del pool activo."
      : "Comparación contra la semana anterior usando snapshot histórico. Las actividades se revisan desde “Ver más detalles”.";

  return (
    <section className="panel">
      <div className="panel-head">
        <div><h2>{pageTitle}</h2><p>{pageDescription}</p></div>
        <Pill tone="blue">{rows.length} registros</Pill>
      </div>

      <PaginationControls totalItems={rows.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="registros" />

      <div className="table-wrap">
        <table className="data-table weekly-comparison-table">
          <thead>
            <tr>
              <th>Cuenta</th><th>Producto</th><th>Etapa real · esta semana</th><th>Esta semana · monto</th>
              <th>Etapa real · semana pasada</th><th>Semana pasada · monto</th><th>Variación</th>
              {mode === "descartadas" && <th>Motivo</th>}<th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ current, previous, changes }) => {
              const previousAmount = current.montoAnterior || previous?.montoEstimado || 0;
              const previousStage = current.etapaAnterior || previous?.etapa || "";
              const delta = getPipelineLogradoActual(current) - safeNumber(previousAmount);
              return (
                <tr key={`${current.id}-${current.semanaId}-${current.estado}`}>
                  <td data-label="Cuenta"><b>{current.cuenta}</b><small>{current.vendedor} · {current.region}</small></td>
                  <td data-label="Producto">{productFamily(current.producto)}<small>{current.propensity}</small></td>
                  <td data-label="Etapa real · esta semana"><StagePill stage={current.etapa} /></td>
                  <td data-label="Esta semana · monto">{currency(getPipelineLogradoActual(current))}</td>
                  <td data-label="Etapa real · semana pasada">{previousStage ? <StagePill stage={previousStage} /> : <span className="muted">Sin snapshot</span>}</td>
                  <td data-label="Semana pasada · monto">{currency(previousAmount)}</td>
                  <td data-label="Variación"><span className={delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral"}>{currency(delta)}</span></td>
                  {mode === "descartadas" && <td data-label="Motivo"><span className="muted">{current.motivoDescarte || "Sin motivo registrado"}</span></td>}
                  <td data-label="Detalle">
                    <button className="row-action" onClick={() => openDetail(current)}>
                      <IconDetalle size={15} /><span>Ver más detalles <small>{changes} cambios</small></span>
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={mode === "descartadas" ? 9 : 8}><div className="empty-table-message">No hay registros para esta vista con los filtros actuales.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls totalItems={rows.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="registros" />
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
          <Detail label="ID PreOpp" value={preopp.id || "Sin ID"} />
          <Detail label="Cuenta" value={preopp.cuenta} />
          <Detail label="Vendedor" value={preopp.vendedor} />
          <Detail label="Región" value={preopp.region || "Sin región"} />
          <Detail label="País" value={preopp.pais || "Sin país"} />
          <Detail label="Industria" value={preopp.industria || "Sin industria"} />
          <Detail label="Producto" value={productFamily(preopp.producto)} />
          <Detail label="Propensity" value={preopp.propensity || "Sin registro"} />
          <Detail label="Señal de necesidad" value={preopp.senal || "Sin registro"} />
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