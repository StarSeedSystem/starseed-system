/*
 * MetaGeminis · lógica pura de la cola «Para aprobar», las piezas de campaña, los resultados por
 * rama y las donaciones. Sin red ni React: lo prueban las pruebas de este directorio y lo usa el panel.
 * Las reglas de estado son las mismas que fuerza la base de datos (supabase/migrations/20261011090000_metageminis.sql).
 */

import type {
  Borrador,
  Donacion,
  EstadoBorrador,
  EstadoPieza,
  Pieza,
  RamaId,
  Resultado,
} from "./tipos";
import { RAMAS } from "./tipos";

// ───────────────────────── estados ─────────────────────────

const TRANSICIONES_BORRADOR: Record<EstadoBorrador, EstadoBorrador[]> = {
  para_aprobar: ["aprobado", "descartado"],
  aprobado: ["enviado", "descartado"],
  enviado: ["respondido"],
  respondido: [],
  descartado: [],
};

const TRANSICIONES_PIEZA: Record<EstadoPieza, EstadoPieza[]> = {
  para_aprobar: ["aprobado", "descartado"],
  aprobado: ["publicado", "descartado"],
  publicado: [],
  descartado: [],
};

export function puedeTransitarBorrador(de: EstadoBorrador, a: EstadoBorrador): boolean {
  return TRANSICIONES_BORRADOR[de]?.includes(a) ?? false;
}

export function puedeTransitarPieza(de: EstadoPieza, a: EstadoPieza): boolean {
  return TRANSICIONES_PIEZA[de]?.includes(a) ?? false;
}

/**
 * ¿Puede un agente enviar este borrador? Solo si Alex (o un dueño) lo aprobó, hay constancia de
 * quién y cuándo, y el canal no es «manual» (esos los envía una persona, no el agente).
 */
export function puedeEnviar(b: Pick<Borrador, "estado" | "aprobado_por" | "aprobado_en" | "canal">): boolean {
  return b.estado === "aprobado" && !!b.aprobado_por && !!b.aprobado_en && b.canal !== "manual_alex";
}

export function ordenarParaAprobar(borradores: readonly Borrador[]): Borrador[] {
  const peso = { alto: 0, medio: 1, bajo: 2 } as const;
  return borradores
    .filter((b) => b.estado === "para_aprobar")
    .slice()
    .sort((a, b) => {
      const pa = a.puntuacion_nivel ? peso[a.puntuacion_nivel] : 1;
      const pb = b.puntuacion_nivel ? peso[b.puntuacion_nivel] : 1;
      return pa - pb || (a.creado_en < b.creado_en ? 1 : -1);
    });
}

// ───────────────────────── piezas de campaña ─────────────────────────

export interface GrupoPiezas {
  campana: string;
  medios: { medio: string; piezas: Pieza[] }[];
  total: number;
  paraAprobar: number;
}

/** Piezas agrupadas por campaña y, dentro, por medio. Las piezas sin campaña van a «Sin campaña». */
export function agruparPiezas(piezas: readonly Pieza[], nombresCampana: Record<string, string> = {}): GrupoPiezas[] {
  const porCampana = new Map<string, Map<string, Pieza[]>>();
  for (const p of piezas) {
    const clave = p.campana_id ?? "";
    if (!porCampana.has(clave)) porCampana.set(clave, new Map());
    const medios = porCampana.get(clave)!;
    if (!medios.has(p.medio)) medios.set(p.medio, []);
    medios.get(p.medio)!.push(p);
  }
  return Array.from(porCampana.entries())
    .map(([id, medios]) => {
      const lista = Array.from(medios.entries())
        .map(([medio, ps]) => ({ medio, piezas: ps.slice().sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1)) }))
        .sort((a, b) => a.medio.localeCompare(b.medio, "es"));
      const todas = lista.flatMap((m) => m.piezas);
      return {
        campana: id ? nombresCampana[id] ?? `Campaña ${id.slice(0, 8)}` : "Sin campaña",
        medios: lista,
        total: todas.length,
        paraAprobar: todas.filter((p) => p.estado === "para_aprobar").length,
      };
    })
    .sort((a, b) => b.paraAprobar - a.paraAprobar || a.campana.localeCompare(b.campana, "es"));
}

export type TipoVistaPrevia = "imagen" | "video" | "ninguna";

const EXT_IMAGEN = /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i;
const EXT_VIDEO = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;

/** Una dirección solo se muestra si es https o una ruta del propio sitio: nunca javascript:, data: ni http. */
export function direccionSegura(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  if (!v || v.length > 2000) return null;
  if (v.startsWith("//")) return null;
  if (v.startsWith("/")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Qué vista previa se ofrece para una pieza (por su tipo y la extensión de la ruta o url). */
export function vistaPrevia(p: Pick<Pieza, "tipo" | "ruta" | "url">): { tipo: TipoVistaPrevia; src: string | null } {
  const src = direccionSegura(p.url) ?? direccionSegura(p.ruta);
  if (!src) return { tipo: "ninguna", src: null };
  if (EXT_VIDEO.test(src)) return { tipo: "video", src };
  if (EXT_IMAGEN.test(src)) return { tipo: "imagen", src };
  // Sin extensión reconocible: el tipo de pieza decide.
  if (p.tipo === "video" || p.tipo === "anuncio" || p.tipo === "animacion3d") return { tipo: "video", src };
  if (p.tipo === "imagen" || p.tipo === "cartel" || p.tipo === "carrusel") return { tipo: "imagen", src };
  return { tipo: "ninguna", src };
}

/** «1080x1920@15s» → { ancho, alto, segundos }. */
export function leerFormato(f: string): { ancho: number; alto: number; segundos: number | null } | null {
  const m = /^(\d{2,5})x(\d{2,5})(?:@(\d+(?:\.\d+)?)s)?$/.exec(f);
  if (!m) return null;
  return { ancho: +m[1], alto: +m[2], segundos: m[3] ? +m[3] : null };
}

// ───────────────────────── resultados por rama ─────────────────────────

export interface ResumenRama {
  rama: RamaId;
  nombre: string;
  borradores: number;
  paraAprobar: number;
  aprobados: number;
  enviados: number;
  respondidos: number;
  descartados: number;
  /** respondidos / enviados (incluye los ya respondidos); 0 si no se ha enviado nada. */
  tasaRespuesta: number;
  aportaciones: number;
  voluntarios: number;
  alianzas: number;
  /** Donaciones y financiación atribuidas, por moneda, en unidades menores (céntimos). */
  importes: Record<string, number>;
}

export function resumenPorRama(borradores: readonly Borrador[], resultados: readonly Resultado[]): ResumenRama[] {
  return RAMAS.map((r) => {
    const bs = borradores.filter((b) => b.rama_id === r.id);
    const rs = resultados.filter((x) => x.rama_id === r.id);
    const enviadosOMas = bs.filter((b) => b.estado === "enviado" || b.estado === "respondido").length;
    const respondidos = bs.filter((b) => b.estado === "respondido").length;
    const importes: Record<string, number> = {};
    for (const x of rs) {
      if ((x.tipo === "donacion" || x.tipo === "financiacion") && x.valor_minor && x.moneda) {
        importes[x.moneda] = (importes[x.moneda] ?? 0) + x.valor_minor;
      }
    }
    return {
      rama: r.id,
      nombre: r.nombre,
      borradores: bs.length,
      paraAprobar: bs.filter((b) => b.estado === "para_aprobar").length,
      aprobados: bs.filter((b) => b.estado === "aprobado").length,
      enviados: enviadosOMas,
      respondidos,
      descartados: bs.filter((b) => b.estado === "descartado").length,
      tasaRespuesta: enviadosOMas ? respondidos / enviadosOMas : 0,
      aportaciones: rs.filter((x) => x.tipo === "aportacion").length,
      voluntarios: rs.filter((x) => x.tipo === "voluntariado").length,
      alianzas: rs.filter((x) => x.tipo === "alianza").length,
      importes,
    };
  });
}

// ───────────────────────── donaciones ─────────────────────────

export interface ResumenDonaciones {
  confirmadas: number;
  reembolsadas: number;
  /** Total confirmado menos reembolsos, por moneda, en unidades menores. */
  totales: Record<string, number>;
}

export function resumenDonaciones(donaciones: readonly Donacion[]): ResumenDonaciones {
  const totales: Record<string, number> = {};
  let confirmadas = 0;
  let reembolsadas = 0;
  for (const d of donaciones) {
    if (d.estado === "confirmada") {
      confirmadas += 1;
      totales[d.moneda] = (totales[d.moneda] ?? 0) + d.importe_minor;
    } else {
      reembolsadas += 1;
    }
  }
  return { confirmadas, reembolsadas, totales };
}

/** Monedas cuyo importe se expresa sin decimales en Stripe (lista parcial de las habituales). */
const SIN_DECIMALES = new Set(["jpy", "krw", "clp", "vnd", "pyg", "ugx"]);

/** «2000» + «eur» → «20,00 €». Importes en unidades menores, como los guarda Stripe. */
export function formatearImporte(minor: number, moneda: string, locale = "es-ES"): string {
  const m = moneda.toLowerCase();
  const divisor = SIN_DECIMALES.has(m) ? 1 : 100;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: m.toUpperCase() }).format(minor / divisor);
  } catch {
    return `${(minor / divisor).toFixed(divisor === 1 ? 0 : 2)} ${m.toUpperCase()}`;
  }
}

export function formatearPorcentaje(valor: number): string {
  return `${Math.round(valor * 100)} %`;
}

// ───────────────────────── presentación ─────────────────────────

/** «2026-10-10T08:30:00Z» → «10 oct 2026» (siempre en UTC, para que no cambie según la zona). */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** La puntuación de Jev en palabras: «alta (82 %)». Vacío si no se puntuó. */
export function textoPuntuacion(b: Pick<Borrador, "puntuacion_nivel" | "puntuacion_p">): string {
  if (!b.puntuacion_nivel) return "sin puntuar";
  const nivel = { alto: "alta", medio: "media", bajo: "baja" }[b.puntuacion_nivel];
  return b.puntuacion_p === null || b.puntuacion_p === undefined ? nivel : `${nivel} (${Math.round(b.puntuacion_p * 100)} %)`;
}
