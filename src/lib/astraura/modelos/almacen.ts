// Persistencia local de los modelos recomendados (MOD1110A), con migración. Es POR NEURONA: cada
// neurona decide su modelo según su hardware, así que NO viaja con la cuenta (settings-sync).
// Todo defensivo: un almacén roto o ausente nunca rompe la pantalla.

import { idSinFiltros, leerCatalogoModelos } from "./catalogo";
import { catalogoSemilla } from "./catalogo-datos";
import { PRIVACIDAD_PREDETERMINADA, type EleccionPrivacidad } from "./recomendar";
import { CASOS, type CasoUso, type CatalogoModelos } from "./tipos";

export const CLAVE_CATALOGO = "starseed.astraura.modelos.catalogo.v1";
export const CLAVE_AJUSTES = "starseed.astraura.modelos.ajustes.v1";
export const CLAVE_REVISION = "starseed.astraura.modelos.revision.v1";
export const CLAVE_INSTALADOS = "starseed.astraura.modelos.instalados.v1";
export const CLAVE_OLLAMA_PENDIENTE = "starseed.astraura.modelos.ollama-pendiente.v1";
export const EVENTO_MODELOS = "starseed:astraura-modelos";

export interface AlmacenTexto {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export type ModoModelos = "automatico" | "manual";

export interface AjustesModelos {
  v: 1;
  /** Automático (predeterminado): la neurona usa lo recomendado. Manual: respeta lo elegido por caso. */
  modo: ModoModelos;
  /** Elección manual por caso (id de modelo). Solo cuenta en modo manual. */
  porCaso: Partial<Record<CasoUso, string>>;
  privacidad: EleccionPrivacidad;
  /** Memoria real declarada por la persona (el navegador nunca informa de más de 8 GB). */
  ramDeclaradaGb: number | null;
  /** Avisos de «hay un modelo mejor» ya mostrados. */
  avisosVistos: string[];
  /**
   * «Mostrar variantes sin filtros» (MOD1110B). APAGADO por defecto y POR PERFIL (como todo este almacén).
   * Solo vale `true` si además consta el día en que la persona confirmó la explicación (`variantesConfirmadoEl`).
   */
  variantesSinFiltros: boolean;
  /** Día (YYYY-MM-DD) en que se aceptó la explicación; null si nunca. */
  variantesConfirmadoEl: string | null;
}

export function ajustesPredeterminados(): AjustesModelos {
  return { v: 1, modo: "automatico", porCaso: {}, privacidad: { ...PRIVACIDAD_PREDETERMINADA }, ramDeclaradaGb: null, avisosVistos: [], variantesSinFiltros: false, variantesConfirmadoEl: null };
}

/**
 * Migra lo guardado a la versión actual. Las cuentas que ya existían NO tienen esta clave: reciben el
 * modo «automático» (regla de propagación del OS: toda mejora llega también a las cuentas viejas).
 * Acepta la forma antigua `{ auto: boolean }` y descarta lo ilegible.
 */
export function migrarAjustes(raw: unknown): AjustesModelos {
  const base = ajustesPredeterminados();
  if (typeof raw !== "object" || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const modo: ModoModelos = r.modo === "manual" || r.auto === false ? "manual" : "automatico";
  const porCaso: Partial<Record<CasoUso, string>> = {};
  if (typeof r.porCaso === "object" && r.porCaso !== null) {
    for (const c of CASOS) {
      const v = (r.porCaso as Record<string, unknown>)[c];
      if (typeof v === "string" && v.length > 0 && v.length < 120) porCaso[c] = v;
    }
  }
  const p = (typeof r.privacidad === "object" && r.privacidad !== null ? r.privacidad : {}) as Record<string, unknown>;
  const ram = typeof r.ramDeclaradaGb === "number" && Number.isFinite(r.ramDeclaradaGb) && r.ramDeclaradaGb >= 1 && r.ramDeclaradaGb <= 4096 ? r.ramDeclaradaGb : null;
  // Variantes sin filtros: un `true` suelto, sin confirmación fechada, NO vale (ajustes manipulados o a medias).
  const confirmado = typeof r.variantesConfirmadoEl === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.variantesConfirmadoEl) ? r.variantesConfirmadoEl : null;
  const variantes = r.variantesSinFiltros === true && confirmado !== null;
  if (!variantes) {
    // Apagado (o sin confirmar): ninguna elección manual puede apuntar a una variante sin filtros → vuelve a «Automático».
    for (const c of CASOS) if (porCaso[c] && idSinFiltros(porCaso[c]!)) delete porCaso[c];
  }
  const sinElecciones = Object.keys(porCaso).length === 0;
  return {
    v: 1,
    modo: !variantes && sinElecciones && hayVariantesEnBruto(r.porCaso) ? "automatico" : modo,
    porCaso,
    privacidad: {
      externoPermitido: typeof p.externoPermitido === "boolean" ? p.externoPermitido : base.privacidad.externoPermitido,
      externoParaPrivados: typeof p.externoParaPrivados === "boolean" ? p.externoParaPrivados : base.privacidad.externoParaPrivados,
    },
    ramDeclaradaGb: ram,
    avisosVistos: Array.isArray(r.avisosVistos) ? (r.avisosVistos as unknown[]).filter((x): x is string => typeof x === "string").slice(-50) : [],
    variantesSinFiltros: variantes,
    variantesConfirmadoEl: variantes ? confirmado : null,
  };
}

function hayVariantesEnBruto(porCaso: unknown): boolean {
  return typeof porCaso === "object" && porCaso !== null && Object.values(porCaso as Record<string, unknown>).some((v) => typeof v === "string" && idSinFiltros(v));
}

/** Enciende «Mostrar variantes sin filtros» DESPUÉS de que la persona confirmó la explicación. `hoy` = YYYY-MM-DD. */
export function activarVariantes(a: AjustesModelos, hoy: string): AjustesModelos {
  return { ...a, variantesSinFiltros: true, variantesConfirmadoEl: hoy };
}

/**
 * Lo apaga: las variantes se esconden y cualquier elección manual que apuntara a una vuelve a «Automático»
 * (si no queda ninguna elección manual, el modo también). `esSinFiltros` decide por el catálogo vivo; además
 * se descarta lo que por su id lo parece.
 */
export function desactivarVariantes(a: AjustesModelos, esSinFiltros: (id: string) => boolean = idSinFiltros): AjustesModelos {
  const porCaso: AjustesModelos["porCaso"] = {};
  for (const c of CASOS) {
    const id = a.porCaso[c];
    if (id && !esSinFiltros(id) && !idSinFiltros(id)) porCaso[c] = id;
  }
  const quitoAlguna = CASOS.some((c) => a.porCaso[c] !== undefined && porCaso[c] === undefined);
  const modo: ModoModelos = quitoAlguna && Object.keys(porCaso).length === 0 ? "automatico" : a.modo;
  return { ...a, variantesSinFiltros: false, variantesConfirmadoEl: null, porCaso, modo };
}

function leerJson(a: AlmacenTexto | null | undefined, k: string): unknown {
  try {
    const t = a?.getItem(k);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

function escribir(a: AlmacenTexto | null | undefined, k: string, v: unknown): boolean {
  try {
    a?.setItem(k, JSON.stringify(v));
    return !!a;
  } catch {
    return false;
  }
}

export const leerAjustes = (a: AlmacenTexto | null | undefined): AjustesModelos => migrarAjustes(leerJson(a, CLAVE_AJUSTES));
export const guardarAjustes = (a: AlmacenTexto | null | undefined, v: AjustesModelos): boolean => escribir(a, CLAVE_AJUSTES, v);

/** Catálogo guardado (con su fecha de revisión) o la semilla si no hay nada válido. */
export function leerCatalogoGuardado(a: AlmacenTexto | null | undefined): CatalogoModelos {
  const crudo = leerJson(a, CLAVE_CATALOGO);
  return crudo ? leerCatalogoModelos(crudo) : catalogoSemilla();
}
export const guardarCatalogo = (a: AlmacenTexto | null | undefined, c: CatalogoModelos): boolean => escribir(a, CLAVE_CATALOGO, c);

export interface EstadoRevision {
  /** Marca de tiempo (ms) del último INTENTO de revisión, haya salido bien o no. */
  ultimoIntentoMs: number | null;
  ultimoResultado: "ok" | "sin-conexion" | "fallo" | null;
}

export function leerRevision(a: AlmacenTexto | null | undefined): EstadoRevision {
  const r = leerJson(a, CLAVE_REVISION) as Partial<EstadoRevision> | null;
  const ms = r && typeof r.ultimoIntentoMs === "number" && Number.isFinite(r.ultimoIntentoMs) ? r.ultimoIntentoMs : null;
  const res = r?.ultimoResultado;
  return { ultimoIntentoMs: ms, ultimoResultado: res === "ok" || res === "sin-conexion" || res === "fallo" ? res : null };
}
export const guardarRevision = (a: AlmacenTexto | null | undefined, v: EstadoRevision): boolean => escribir(a, CLAVE_REVISION, v);

export function leerInstalados(a: AlmacenTexto | null | undefined): string[] {
  const r = leerJson(a, CLAVE_INSTALADOS);
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === "string") : [];
}
export function marcarInstalado(a: AlmacenTexto | null | undefined, id: string): boolean {
  const lista = leerInstalados(a);
  return lista.includes(id) ? true : escribir(a, CLAVE_INSTALADOS, [...lista, id]);
}


// ── Ollama pendiente (MOD1110B): el modelo que se iba a instalar cuando faltaba el motor ─────────────────

export interface OllamaPendiente {
  modeloId: string;
  /** Día (YYYY-MM-DD) en que se pidió; pasados 14 días se olvida. */
  desde: string;
}

export function leerOllamaPendiente(a: AlmacenTexto | null | undefined, hoy: string): OllamaPendiente | null {
  const r = leerJson(a, CLAVE_OLLAMA_PENDIENTE) as Partial<OllamaPendiente> | null;
  if (!r || typeof r.modeloId !== "string" || r.modeloId.length === 0 || r.modeloId.length > 120 || typeof r.desde !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.desde)) return null;
  const dias = (Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${r.desde}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(dias) && dias >= 0 && dias <= 14 ? { modeloId: r.modeloId, desde: r.desde } : null;
}
export const guardarOllamaPendiente = (a: AlmacenTexto | null | undefined, v: OllamaPendiente): boolean => escribir(a, CLAVE_OLLAMA_PENDIENTE, v);
export function olvidarOllamaPendiente(a: AlmacenTexto | null | undefined): void {
  try { a?.setItem(CLAVE_OLLAMA_PENDIENTE, "null"); } catch { /* sin almacén */ }
}
