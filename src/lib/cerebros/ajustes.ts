/**
 * Ajustes del cerebro: medios, seguridad, privacidad, vinculación y sincronización.
 * Modelo puro (sin red, sin disco, sin procesos lanzados). Contrato: §8.
 */

export type Capacidad = "texto" | "imagen" | "voz" | "video" | "embeddings" | "agentes";

export interface AjustesObjetivo {
  privacidad: "privado" | "perfil" | "grupo" | "publico";
  cifradoLocal: boolean;
  medios: { capacidades: Partial<Record<Capacidad, string>>; almacenamiento: string[] };
  sync: { direccion: "enviar" | "recibir" | "ambas" | "ninguna"; auto: boolean; destinos: string[] };
  acceso: { quien: string; nivel: "leer" | "escribir" | "admin" }[];
}

export interface AjustesCerebro {
  cerebro: AjustesObjetivo;
  memorias: Record<string, Partial<AjustesObjetivo>>;
  carpetas: Record<string, Partial<AjustesObjetivo>>;
}

export const CAPACIDADES: Record<Capacidad, string> = {
  texto: "Texto",
  imagen: "Imagen",
  voz: "Voz",
  video: "Vídeo",
  embeddings: "Embeddings",
  agentes: "Agentes",
};

export const APLICACION: Record<
  "medios.almacenamiento" | "privacidad" | "acceso" | "cifradoLocal" | "sync" | "medios.capacidades",
  "se-aplica" | "solo-se-guarda"
> = {
  "medios.almacenamiento": "se-aplica",
  "privacidad": "se-aplica",
  "acceso": "solo-se-guarda",
  "cifradoLocal": "solo-se-guarda",
  "sync": "se-aplica",
  "medios.capacidades": "solo-se-guarda",
};

export const AJUSTES_POR_DEFECTO: AjustesCerebro = {
  cerebro: {
    privacidad: "privado",
    cifradoLocal: false,
    medios: { capacidades: { texto: "auto", imagen: "auto", voz: "auto", video: "auto", embeddings: "auto", agentes: "auto" }, almacenamiento: ["auto"] },
    sync: { direccion: "ambas", auto: true, destinos: [] },
    acceso: [],
  },
  memorias: {},
  carpetas: {},
};

function privacidadPorScope(scope?: string | null): "privado" | "grupo" {
  const s = String(scope ?? "").trim().toLowerCase();
  return s === "group" || s === "page" || s === "community" ? "grupo" : "privado";
}

export function leerAjustes(cerebro: { scope?: string | null; config?: Record<string, unknown> | null }): AjustesCerebro {
  const base = JSON.parse(JSON.stringify(AJUSTES_POR_DEFECTO)) as AjustesCerebro;
  const raw = cerebro?.config?.ajustes;
  if (raw && typeof raw === "object" && raw !== null) {
    const r = raw as Partial<AjustesCerebro>;
    if (r.cerebro) {
      base.cerebro = { ...base.cerebro, ...r.cerebro };
    }
    if (r.memorias && typeof r.memorias === "object") {
      base.memorias = { ...base.memorias, ...r.memorias };
    }
    if (r.carpetas && typeof r.carpetas === "object") {
      base.carpetas = { ...base.carpetas, ...r.carpetas };
    }
  }
  base.cerebro.privacidad = privacidadPorScope(cerebro?.scope);
  return base;
}

function objetivoEsCerebro(o: unknown): o is { tipo: "cerebro" } {
  return o && typeof o === "object" && (o as { tipo?: unknown }).tipo === "cerebro";
}

function objetivoEsMemoriaOCarpeta(o: unknown): o is { tipo: "memoria" | "carpeta"; id: string } {
  if (!o || typeof o !== "object") return false;
  const t = (o as { tipo?: unknown }).tipo;
  const idVal = (o as { id?: unknown }).id;
  const tipoStr = typeof t === "string" ? t : "";
  const idStr = typeof idVal === "string" ? idVal : "";
  return (tipoStr === "memoria" || tipoStr === "carpeta") && idStr.trim().length > 0;
}

export function conAjustes(
  config: Record<string, unknown>,
  objetivo: { tipo: "cerebro" } | { tipo: "memoria" | "carpeta"; id: string },
  parcial: Partial<AjustesObjetivo>,
): Record<string, unknown> {
  const nuevo = { ...config };
  const ajustesActuales = (nuevo.ajustes && typeof nuevo.ajustes === "object" ? { ...nuevo.ajustes } : {}) as Partial<AjustesCerebro>;
  const ajustesCompletos = {
    cerebro: (ajustesActuales.cerebro ? { ...ajustesActuales.cerebro } : { ...AJUSTES_POR_DEFECTO.cerebro }) as AjustesObjetivo,
    memorias: ajustesActuales.memorias ? { ...ajustesActuales.memorias } : { ...AJUSTES_POR_DEFECTO.memorias },
    carpetas: ajustesActuales.carpetas ? { ...ajustesActuales.carpetas } : { ...AJUSTES_POR_DEFECTO.carpetas },
  };

  if (objetivoEsCerebro(objetivo)) {
    ajustesCompletos.cerebro = { ...ajustesCompletos.cerebro, ...parcial };
  } else if (objetivoEsMemoriaOCarpeta(objetivo)) {
    const tipo = objetivo.tipo;
    const id = objetivo.id;
    const objetivoActual = (tipo === "memoria" ? ajustesCompletos.memorias[id] : ajustesCompletos.carpetas[id]) || {};
    const cerebroBase = ajustesCompletos.cerebro;
    const soloDiferente: Partial<AjustesObjetivo> = {};
    const campos: (keyof AjustesObjetivo)[] = ["privacidad", "cifradoLocal", "medios", "sync", "acceso"];
    for (const campo of campos) {
      const parcialVal = (parcial as Record<string, unknown>)[campo];
      if (parcialVal === undefined) continue;
      const objetivoVal = (objetivoActual as Record<string, unknown>)[campo];
      if (JSON.stringify(parcialVal) !== JSON.stringify(objetivoVal)) {
        (soloDiferente as Record<string, unknown>)[campo] = parcialVal;
      }
    }
    if (tipo === "memoria") {
      (ajustesCompletos.memorias as Record<string, Partial<AjustesObjetivo>>)[id] = soloDiferente;
    } else {
      (ajustesCompletos.carpetas as Record<string, Partial<AjustesObjetivo>>)[id] = soloDiferente;
    }
  }
  nuevo.ajustes = ajustesCompletos;
  return nuevo;
}

export function ajustesEfectivos(a: AjustesCerebro, objetivo: { tipo: "memoria" | "carpeta"; id: string } | { tipo: "cerebro" }): AjustesObjetivo {
  const base = { ...a.cerebro };
  if (objetivo.tipo === "cerebro") return base;
  const id = objetivo.id;
  const parcial = objetivo.tipo === "memoria" ? a.memorias[id] || {} : a.carpetas[id] || {};
  const resultado = { ...base, ...parcial };
  return resultado as AjustesObjetivo;
}
