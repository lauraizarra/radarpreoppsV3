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
  pipelineEsperado?: number;
  pipelineLogrado?: number;
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
  sourcePreOpp: string;
  cuentaActiva: number;
  reemplazoRequerido: string;
};

type ApiResponse = {
  rows: Record<string, string>[];
  updatedAt: string;
};

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

  const cleaned = String(value)
    .replace(/USD/gi, "")
    .replace(/[$,%\s]/g, "")
    .replace(/,/g, "");

  const n = Number(cleaned);

  return Number.isFinite(n) ? n : 0;
}

function pick(row: Record<string, string>, keys: string[], fallback = "") {
  for (const key of keys) {
    const normalized = normalizeHeader(key);

    if (row[normalized] !== undefined && row[normalized] !== "") {
      return row[normalized];
    }
  }

  return fallback;
}

async function fetchApi(view: string): Promise<ApiResponse> {
  const baseUrl = process.env.PREOPP_API_BASE_URL;
  const token = process.env.PREOPP_API_TOKEN;

  if (!baseUrl || !token || baseUrl.includes("PEGAR_AQUI")) {
    return {
      rows: [],
      updatedAt: "",
    };
  }

  const url = new URL(baseUrl);
  url.searchParams.set("view", view);
  url.searchParams.set("token", token);

  const res = await fetch(url.toString(), {
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`No se pudo leer API ${view}: ${res.status}`);
  }

  const payload = await res.json();

  if (!payload?.ok) {
    throw new Error(payload?.error || `API ${view} respondió sin ok`);
  }

  if (!Array.isArray(payload.rows)) {
    return {
      rows: [],
      updatedAt: payload?.updated_at || "",
    };
  }

  const rows = payload.rows.map((row: Record<string, any>) => {
    const normalized: Record<string, string> = {};

    Object.entries(row).forEach(([key, value]) => {
      normalized[normalizeHeader(key)] = value == null ? "" : String(value);
    });

    return normalized;
  });

  return {
    rows,
    updatedAt: payload.updated_at || "",
  };
}

async function fetchOptionalApi(view: string): Promise<ApiResponse> {
  try {
    return await fetchApi(view);
  } catch (error) {
    console.warn(`La vista opcional ${view} todavía no está disponible`, error);

    return {
      rows: [],
      updatedAt: "",
    };
  }
}

function mapPreOpp(r: Record<string, any>): PreOpp {
  const etapaEstaSemana = pick(r, [
    "Etapa_Esta_Semana",
    "Etapa real",
    "Etapa_real",
    "Etapa_PreOpp",
    "Etapa PreOpp",
    "Etapa",
  ]);

  const etapaSemanaPasada = pick(r, [
    "Etapa_Semana_Pasada",
    "Etapa semana pasada",
    "Etapa_Anterior",
    "Etapa anterior",
  ]);

  const estado = pick(r, [
    "Estado_Dashboard",
    "Estado dashboard",
    "Estado",
  ]);

  const pipelineLogradoEstaSemana = toNumber(
    pick(r, [
      "Pipeline_Logrado_Esta_Semana",
      "Pipeline_Logrado",
      "Pipeline logrado esta semana",
      "Pipeline logrado",
      "Net Revenue",
    ])
  );

  const montoEstimadoEstaSemana = toNumber(
    pick(r, [
      "Monto_estimado",
      "Monto estimado",
      "Monto",
      "Amount",
      "Deal Amount",
      "Deal amount",
    ])
  );

  const pipelineSemanaPasada = toNumber(
    pick(r, [
      "Pipeline_Logrado_Semana_Pasada",
      "Monto_semana_anterior",
      "Pipeline_Anterior",
    ])
  );

  const pipelineEsperado = toNumber(
    pick(r, [
      "Pipeline_Esperado_Inicial",
      "Pipeline esperado inicial",
      "Pipeline_Esperado",
      "Pipeline esperado",
      "Pipeline_Estimado",
      "Pipeline estimado",
    ])
  );

  return {
    id: pick(r, [
      "ID_PreOpp",
      "ID de registro",
      "ID negocio",
      "Record ID",
      "ID",
    ]),
    region: pick(r, ["Region", "Región"]),
    vendedor: pick(r, [
      "Vendedor",
      "Propietario del negocio",
      "Owner",
      "Deal owner",
    ]),
    semanaId: pick(r, ["Semana_ID", "Semana"]),
    semanaLabel: pick(r, ["Semana_Label", "Semana label", "Semana"]),
    cumplimientoQ: toNumber(pick(r, ["Cumplimiento_Q"])),
    clasificacionQ: pick(r, ["Clasificacion_Q"]),
    cuenta:
      pick(r, [
        "Cuenta_Dashboard",
        "Cuenta",
        "Associated Company Primary",
        "Associated Company (Primary)",
      ]) || "Cuenta sin nombre",
    pais: pick(r, ["Pais", "País", "Country"]),
    industria: pick(r, ["Industria"]),
    producto: pick(r, [
      "Producto_PreOpp",
      "Associated Product",
      "Producto",
    ]),
    propensity: pick(r, ["Propensity"]),
    senal: pick(r, [
      "Senal_de_necesidad",
      "Señal_de_necesidad",
      "Señal de necesidad",
    ]),
    etapa: etapaEstaSemana,
    etapaAnterior: etapaSemanaPasada,
    estado,
    iconoEstado: pick(r, [
      "Icono_Estado",
      "Icono Estado",
      "Icono",
    ]),
    montoEstimado: montoEstimadoEstaSemana || pipelineLogradoEstaSemana,
    montoAnterior: pipelineSemanaPasada,
    pipelineEsperado,
    pipelineLogrado: pipelineLogradoEstaSemana,
    variacion: toNumber(
      pick(r, [
        "Variacion_Monto",
        "Variación_Monto",
        "Variacion monto",
      ])
    ),
    cambioEtapa: pick(r, [
      "Cambio_Etapa",
      "Cambio Etapa",
    ]),
    numeroActividades: toNumber(
      pick(r, [
        "Numero_Actividades_Esta_Semana",
        "Numero_Actividades",
        "Número Actividades",
      ])
    ),
    numeroActividadesAnterior: toNumber(
      pick(r, [
        "Numero_Actividades_Semana_Pasada",
        "Numero_Actividades_Anterior",
      ])
    ),
    ultimaActividad: pick(r, [
      "Fecha_Ultima_Modificacion",
      "Fecha última modificación",
      "Fecha de última modificación",
      "Ultima_Modificacion",
      "Última modificación",
      "Last modified date",
      "Ultima_Actividad",
      "Última_Actividad",
    ]),
    diasSinActividad: toNumber(pick(r, ["Dias_sin_actividad"])),
    motivoDescarte: pick(r, [
      "Motivo_Descarte_PreOpp",
      "Motivo_de_descarte",
      "Motivo de descarte",
    ]),
    productOwner: pick(r, ["Product_Owner"]),
    fechaCreacion: pick(r, [
      "Fecha_Creacion",
      "Fecha_creacion",
      "Fecha de creación",
      "Fecha creación",
      "Create date",
      "Created at",
    ]),
    dealIdHubSpot: pick(r, ["Deal_ID_HubSpot"]),
    linkHubSpot: pick(r, [
      "Link_HubSpot",
      "Link_PreOpp",
      "Link HubSpot",
    ]),
    sourcePreOpp: pick(r, [
      "Source",
      "Origen",
      "Fuente",
      "Source_PreOpp",
      "Source PreOpp",
      "Origen_PreOpp",
      "Origen PreOpp",
      "Fuente_PreOpp",
      "Fuente PreOpp",
      "Record Source",
      "Original Source",
    ]),
    cuentaActiva: toNumber(
      pick(r, [
        "Cuenta_Activa",
        "Cuenta_como_activa",
      ])
    ),
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
    mostrarEnDetalle: pick(
      r,
      ["Mostrar_en_Detalle", "Mostrar en Detalle"],
      "Sí"
    ),
  };
}

function preOppIdentity(preopp: PreOpp) {
  const week = String(preopp.semanaId || preopp.semanaLabel || "").trim();
  const id = String(preopp.id || "").trim();
  const product = normalizeHeader(preopp.producto || "");

  return `${week}||${id}||${product}`;
}

function isValidPreOppId(value: string) {
  const clean = String(value || "").trim();
  return Boolean(clean) && !clean.startsWith("#");
}

export async function loadData() {
  try {
    const [preResponse, activityResponse, snapshotResponse] = await Promise.all([
      fetchApi("preopps"),
      fetchApi("activities"),
      fetchOptionalApi("snapshots"),
    ]);

    const preRows = preResponse.rows;
    const activityRows = activityResponse.rows;
    const snapshotRows = snapshotResponse.rows;
    const updatedAt =
      preResponse.updatedAt ||
      activityResponse.updatedAt ||
      snapshotResponse.updatedAt ||
      "";

    if (!preRows.length) {
      throw new Error("API de PreOpps incompleta");
    }

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

    const snapshotPreopps = snapshotRows
      .map(mapPreOpp)
      .filter((p) => isValidPreOppId(p.id));

    const currentPreopps = preRows
      .map(mapPreOpp)
      .filter((p) => isValidPreOppId(p.id));

    /*
     * Primero se cargan los snapshots y luego la vista actual. Si una semana
     * ya existe en ambas fuentes, la fila vigente de Vercel_View prevalece.
     */
    const preoppsByIdentity = new Map<string, PreOpp>();

    snapshotPreopps.forEach((preopp) => {
      preoppsByIdentity.set(preOppIdentity(preopp), preopp);
    });

    currentPreopps.forEach((preopp) => {
      preoppsByIdentity.set(preOppIdentity(preopp), preopp);
    });

    const preopps = Array.from(preoppsByIdentity.values());

    const activities = activityRows
      .map(mapActivity)
      .filter((a) => a.preoppId && a.mostrarEnDetalle !== "No");

    return {
      sellers,
      preopps,
      activities,
      source:
        `Google Sheets privado vía Apps Script · ${currentPreopps.length} actuales` +
        (snapshotPreopps.length ? ` · ${snapshotPreopps.length} históricas` : ""),
      updatedAt,
    };
  } catch (error) {
    console.error("No se pudo cargar la fuente privada de PreOpp Radar", error);

    return {
      sellers: [] as Seller[],
      preopps: [] as PreOpp[],
      activities: [] as Activity[],
      source: "Fuente privada temporalmente no disponible",
      updatedAt: "",
    };
  }
}