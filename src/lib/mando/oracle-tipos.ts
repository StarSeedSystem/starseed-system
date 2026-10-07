export interface LimitesOracle {
  a1_ocpu: number;
  a1_gb: number;
  micro: number;
}

export interface InstanciaOracle {
  nombre: string;
  forma: string;
  ocpus: number;
  gb: number;
  estado: string;
  ip_publica: string;
}

export interface ServicioOracle {
  nombre: string;
  url: string;
  ok: boolean;
  ms: number | null;
  t: number;
}

export interface EstadoOracle {
  vinculada: boolean;
  perfil: string;
  region: string;
  comprobado: number | null;
  limites: LimitesOracle;
  instancias: InstanciaOracle[];
  servicios: ServicioOracle[];
}

const CLAVES_VALIDAS = new Set(["vinculada","perfil","region","comprobado","limites","instancias","servicios"]);

function esString(v: unknown): v is string {
  return typeof v === "string";
}
function esNumero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function esBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}
function sanitizeString(v: unknown): string {
  return esString(v) && !String(v).startsWith("ocid1.") ? String(v) : "";
}

function sanitizeNumero(v: unknown): number | null {
  if (esNumero(v) && !String(v).startsWith("ocid1.")) return v;
  return null;
}

export function leerEstadoOracle(json: unknown): EstadoOracle | null {
  let obj: Record<string, unknown>;
  if (esString(json)) {
    try {
      obj = JSON.parse(json) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof json === "object" && json !== null && !Array.isArray(json)) {
    obj = json as Record<string, unknown>;
  } else {
    return null;
  }

  const resultante: Partial<EstadoOracle> = {};
  for (const k of Object.keys(obj)) {
    if (!CLAVES_VALIDAS.has(k)) continue;
    const v = obj[k];
    switch (k) {
      case "vinculada":
        resultante.vinculada = esBoolean(v) ? v : false;
        break;
      case "perfil":
        resultante.perfil = sanitizeString(v);
        break;
      case "region":
        resultante.region = sanitizeString(v);
        break;
      case "comprobado":
        resultante.comprobado = sanitizeNumero(v);
        break;
      case "limites":
        if (typeof v === "object" && v !== null) {
          const l = v as Record<string, unknown>;
          resultante.limites = {
            a1_ocpu: sanitizeNumero(l.a1_ocpu) ?? 0,
            a1_gb: sanitizeNumero(l.a1_gb) ?? 0,
            micro: sanitizeNumero(l.micro) ?? 0,
          };
        }
        break;
      case "instancias":
        if (Array.isArray(v)) {
          resultante.instancias = v.filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
            .map((i) => ({
              nombre: sanitizeString((i as Record<string, unknown>).nombre),
              forma: sanitizeString((i as Record<string, unknown>).forma),
              ocpus: sanitizeNumero((i as Record<string, unknown>).ocpus) ?? 0,
              gb: sanitizeNumero((i as Record<string, unknown>).gb) ?? 0,
              estado: sanitizeString((i as Record<string, unknown>).estado),
              ip_publica: sanitizeString((i as Record<string, unknown>).ip_publica),
            }));
        }
        break;
      case "servicios":
        if (Array.isArray(v)) {
          resultante.servicios = v.filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
            .map((s) => ({
              nombre: sanitizeString((s as Record<string, unknown>).nombre),
              url: sanitizeString((s as Record<string, unknown>).url),
              ok: esBoolean((s as Record<string, unknown>).ok) ? (s as Record<string, unknown>).ok as boolean : false,
              ms: sanitizeNumero((s as Record<string, unknown>).ms),
              t: sanitizeNumero((s as Record<string, unknown>).t) ?? 0,
            }));
        }
        break;
    }
  }

  if (resultante.limites === undefined) resultante.limites = { a1_ocpu: 0, a1_gb: 0, micro: 0 };
  if (resultante.instancias === undefined) resultante.instancias = [];
  if (resultante.servicios === undefined) resultante.servicios = [];

  return resultante as EstadoOracle;
}

export function resumenOracle(e: EstadoOracle): string {
  const vinculada = e.vinculada ? "vinculada" : "sin vincular";
  const region = e.region || "—";
  const inst = e.instancias.length;
  const srvOk = e.servicios.filter(s => s.ok).length;
  const srvTot = e.servicios.length;
  return `Oracle ${vinculada} en ${region} · ${inst} instancia(s) · ${srvOk}/${srvTot} servicios OK`;
}

