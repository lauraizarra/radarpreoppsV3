import sample from "../data/sample.json";

export type Seller = {
  region: string;
  seller: string;
  cumplimientoQ: number;
  clasificacion: string;
  accion: string;
  preoppsRequeridas: number;
  estrategiaRequerida: string;
};

export type Activity = {
  id: string;
  preoppId: string;
  fecha: string;
  tipo: string;
  descripcion: string;
  owner: string;
  cuenta: string;
  producto: string;
  etapaPreOpp: string;
  etapaCloudSales: string;
  pipelineAnterior: number;
  pipelineActual: number;
  linkPreOpp: string;
  origen: string;
  mostrarEnDetalle: string;
};

export type PreOpp = {
  id: string;
  region: string;
  vendedor: string;
  semanaId: string;
  semanaLabel: string;
  cumplimientoQ: number;
  clasificacionQ: string;
  cuenta: string;
  pais: string;
  industria: string;
  producto: string;
  propensity: string;
  senal: string;
  etapa: string;
  etapaAnterior: string;
  estado: string;
  iconoEstado: string;
  montoEstimado: number;
  montoAnterior: number;
  variacion: number;
  cambioEtapa: string;
  numeroActividades: number;
  numeroActividadesAnterior: number;
  ultimaActividad: string;
  diasSinActividad: number;
  motivoDescarte: string;
  productOwner: string;
  fechaCreacion?: string;
  dealIdHubSpot?: string;
  linkHubSpot?: string;
  cuentaActiva: number;
  reemplazoRequerido: string;
};

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }
  return rows;
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function toNumber(value: any): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const cleaned = String(value).replace(/[$,%\s]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function pick(row: Record<string, string>, keys: string[], fallback = "") {
  for (const key of keys) {
    const normalized = normalizeHeader(key);
    if (row[normalized] !== undefined && row[normalized] !== "") return row[normalized];
  }
  return fallback;
}

async function fetchApi(view: string): Promise<Record<string, string>[]> {
  const baseUrl = process.env.PREOPP_API_BASE_URL;
  const token = process.env.PREOPP_API_TOKEN;

  if (!baseUrl || !token || baseUrl.includes("PEGAR_AQUI")) return [];

  const url = new URL(baseUrl);
  url.searchParams.set("view", view);
  url.searchParams.set("token", token);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer API ${view}: ${res.status}`);

  const payload = await res.json();
  if (!payload?.ok) throw new Error(payload?.error || `API ${view} respondió sin ok`);

  if (!Array.isArray(payload.rows)) return [];

  // Apps Script devuelve encabezados como "Cuenta_Dashboard" o "Pipeline_Logrado_Esta_Semana".
  // La app compara usando encabezados normalizados en minúscula, así que normalizamos aquí.
  return payload.rows.map((row: Record<string, any>) => {
    const normalized: Record<string, string> = {};
    Object.entries(row).forEach(([key, value]) => {
      normalized[normalizeHeader(key)] = value == null ? "" : String(value);
    });
    return normalized;
  });
}


function mapPreOpp(r: Record<string, any>): PreOpp {
  const etapaEstaSemana = pick(r, ["Etapa_Esta_Semana", "Etapa real", "Etapa_real", "Etapa_PreOpp", "Etapa PreOpp", "Etapa"]);
  const etapaSemanaPasada = pick(r, ["Etapa_Semana_Pasada", "Etapa semana pasada", "Etapa_Anterior", "Etapa anterior"]);
  const estado = pick(r, ["Estado_Dashboard", "Estado dashboard", "Estado"]);
  const pipelineEstaSemana = toNumber(pick(r, ["Pipeline_Logrado_Esta_Semana", "Pipeline_Logrado", "Monto_estimado", "Net Revenue", "Monto"]));
  const pipelineSemanaPasada = toNumber(pick(r, ["Pipeline_Logrado_Semana_Pasada", "Monto_semana_anterior", "Pipeline_Anterior"]));

  return {
    id: pick(r, ["ID_PreOpp", "ID de registro", "ID negocio", "Record ID", "ID"]),
    region: pick(r, ["Region", "Región"]),
    vendedor: pick(r, ["Vendedor", "Propietario del negocio", "Owner", "Deal owner"]),
    semanaId: pick(r, ["Semana_ID", "Semana"]),
    semanaLabel: pick(r, ["Semana_Label", "Semana label", "Semana"]),
    cumplimientoQ: toNumber(pick(r, ["Cumplimiento_Q"])),
    clasificacionQ: pick(r, ["Clasificacion_Q"]),
    cuenta: pick(r, ["Cuenta_Dashboard", "Cuenta", "Associated Company Primary", "Associated Company (Primary)"]) || "Cuenta sin nombre",
    pais: pick(r, ["Pais", "País", "Country"]),
    industria: pick(r, ["Industria"]),
    producto: pick(r, ["Producto_PreOpp", "Associated Product", "Producto"]),
    propensity: pick(r, ["Propensity"]),
    senal: pick(r, ["Senal_de_necesidad", "Señal_de_necesidad", "Señal de necesidad"]),
    etapa: etapaEstaSemana,
    etapaAnterior: etapaSemanaPasada,
    estado,
    iconoEstado: pick(r, ["Icono_Estado", "Icono Estado", "Icono"]),
    montoEstimado: pipelineEstaSemana,
    montoAnterior: pipelineSemanaPasada,
    variacion: toNumber(pick(r, ["Variacion_Monto", "Variación_Monto", "Variacion monto"])),
    cambioEtapa: pick(r, ["Cambio_Etapa", "Cambio Etapa"]),
    numeroActividades: toNumber(pick(r, ["Numero_Actividades_Esta_Semana", "Numero_Actividades", "Número Actividades"])),
    numeroActividadesAnterior: toNumber(pick(r, ["Numero_Actividades_Semana_Pasada", "Numero_Actividades_Anterior"])),
    ultimaActividad: pick(r, ["Ultima_Actividad", "Última_Actividad", "Fecha_Ultima_Modificacion", "Fecha última modificación"]),
    diasSinActividad: toNumber(pick(r, ["Dias_sin_actividad"])),
    motivoDescarte: pick(r, ["Motivo_Descarte_PreOpp", "Motivo_de_descarte", "Motivo de descarte"]),
    productOwner: pick(r, ["Product_Owner"]),
    fechaCreacion: pick(r, ["Fecha_creacion", "Fecha de creación"]),
    dealIdHubSpot: pick(r, ["Deal_ID_HubSpot"]),
    linkHubSpot: pick(r, ["Link_HubSpot", "Link_PreOpp", "Link HubSpot"]),
    cuentaActiva: toNumber(pick(r, ["Cuenta_Activa", "Cuenta_como_activa"])),
    reemplazoRequerido: pick(r, ["Reemplazo_requerido"]),
  };
}

function mapActivity(r: Record<string, string>): Activity {
  return {
    id: pick(r, ["ID_Actividad"]),
    preoppId: pick(r, ["ID_PreOpp"]),
    fecha: pick(r, ["Fecha_Actividad"]),
    tipo: pick(r, ["Tipo_Actividad"]),
    descripcion: pick(r, ["Descripcion", "Descripción"]),
    owner: pick(r, ["Owner"]),
    cuenta: pick(r, ["Cuenta"]),
    producto: pick(r, ["Producto_PreOpp"]),
    etapaPreOpp: pick(r, ["Etapa_PreOpp"]),
    etapaCloudSales: pick(r, ["Etapa_CloudSales"]),
    pipelineAnterior: toNumber(pick(r, ["Pipeline_Anterior"])),
    pipelineActual: toNumber(pick(r, ["Pipeline_Actual"])),
    linkPreOpp: pick(r, ["Link_PreOpp", "Link_HubSpot"]),
    origen: pick(r, ["Origen"]),
    mostrarEnDetalle: pick(r, ["Mostrar_en_Detalle", "Mostrar en Detalle"], "Sí"),
  };
}

export async function loadData() {
  try {
    const [preRows, activityRows] = await Promise.all([
      fetchApi("preopps"),
      fetchApi("activities"),
    ]);

    if (!preRows.length) throw new Error("API de PreOpps incompleta");

    const sellerRows: Record<string, string>[] = [];

    const sellers: Seller[] = sellerRows.map((r) => ({
      region: pick(r, ["Region"]),
      seller: pick(r, ["Vendedor", "Seller"]),
      cumplimientoQ: toNumber(pick(r, ["Cumplimiento_Q"])),
      clasificacion: pick(r, ["Clasificacion", "Clasificación"]),
      accion: pick(r, ["Accion", "Acción"]),
      preoppsRequeridas: toNumber(pick(r, ["PreOpps_Requeridas"])),
      estrategiaRequerida: pick(r, ["Estrategia_Requerida"]),
    }));

    const preopps = preRows.map(mapPreOpp).filter((p) => p.id);
    const activities = activityRows.map(mapActivity).filter((a) => a.preoppId && a.mostrarEnDetalle !== "No");

    return { sellers, preopps, activities, source: `Google Sheets privado vía Apps Script · ${preopps.length} filas` };
  } catch (error) {
    const sellers: Seller[] = (sample as any).sellers.map((s: any) => ({
      region: s.region,
      seller: s.seller,
      cumplimientoQ: s.cumplimientoQ,
      clasificacion: s.clasificacion,
      accion: s.accion,
      preoppsRequeridas: s.preoppsRequeridas,
      estrategiaRequerida: s.estrategiaRequerida,
    }));

    const preopps: PreOpp[] = (sample as any).preopps.map((p: any) => mapPreOpp(p));
    const activities: Activity[] = ((sample as any).activities || []).map((a: any) => mapActivity(a));

    return { sellers, preopps, activities, source: "Data local de ejemplo" };
  }
}
