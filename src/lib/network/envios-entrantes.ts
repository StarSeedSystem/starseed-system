/**
 * envios-entrantes — los archivos que llegan JUNTOS forman UN envío (ARC1108A · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Petición de Alex: al recibir varios archivos, todas las preguntas de aceptar/rechazar en UNA
 * ventana. Módulo PURO (sin red ni DOM): agrupa las transferencias que recibe el motor de archivos
 * (`archivos-malla.ts`) en envíos y arma el árbol de carpetas.
 *
 *  · Con `lote` (lo pone el remitente desde ARC1108A): un envío por lote.
 *  · Sin `lote` (remitentes anteriores): por remitente y ventana de tiempo — una oferta se une al
 *    envío anterior del MISMO origen si llegó como mucho `ventanaMs` después de la última.
 * Contrato: `architecture/datos-por-la-malla.md` §8.4.
 */

import type { EstadoTransferencia, VerificacionOrigen } from "./archivos-malla";

export const VENTANA_ENVIO_MS = 20_000;

export interface EnvioEntrante {
  /** Clave estable del envío («lote:…» o «origen:…@inicio»). */
  clave: string;
  origen: string;
  via?: string;
  verificacion?: VerificacionOrigen;
  mensaje?: string;
  /** Cuántos archivos anunció el remitente (si lo dijo) y cuántos llegaron ya. */
  anunciados?: number;
  archivos: EstadoTransferencia[];
  bytes: number;
  inicioMs: number;
  pendientes: number;
  enCurso: number;
  completados: number;
  fallidos: number;
  rechazados: number;
}

const EN_CURSO = new Set(["transfiriendo", "verificando", "reintentando"]);

function resumir(clave: string, archivos: EstadoTransferencia[]): EnvioEntrante {
  const primero = archivos[0];
  const conLote = archivos.find((a) => a.loteTotal);
  const conMensaje = archivos.find((a) => a.mensaje);
  const conVerificacion = archivos.find((a) => a.verificacion);
  const conVia = archivos.find((a) => a.via);
  let pendientes = 0;
  let enCurso = 0;
  let completados = 0;
  let fallidos = 0;
  let rechazados = 0;
  let bytes = 0;
  for (const a of archivos) {
    bytes += Number.isFinite(a.tamano) ? a.tamano : 0;
    if (a.fase === "pendiente-aceptar") pendientes++;
    else if (EN_CURSO.has(a.fase)) enCurso++;
    else if (a.fase === "completada") completados++;
    else if (a.fase === "error" || a.fase === "cancelada") fallidos++;
    else if (a.fase === "rechazada") rechazados++;
  }
  return {
    clave,
    origen: primero?.origen ?? "Remitente sin nombre",
    ...(conVia?.via ? { via: conVia.via } : {}),
    ...(conVerificacion?.verificacion ? { verificacion: conVerificacion.verificacion } : {}),
    ...(conMensaje?.mensaje ? { mensaje: conMensaje.mensaje } : {}),
    ...(conLote?.loteTotal ? { anunciados: conLote.loteTotal } : {}),
    archivos,
    bytes,
    inicioMs: Math.min(...archivos.map((a) => a.inicioMs)),
    pendientes,
    enCurso,
    completados,
    fallidos,
    rechazados,
  };
}

/**
 * agruparEnvios — los envíos que se están RECIBIENDO, el más reciente primero. Solo transferencias
 * con rol «recibir»; las de cada envío, en el orden en que llegaron. Puro.
 */
export function agruparEnvios(estados: readonly EstadoTransferencia[], ventanaMs = VENTANA_ENVIO_MS): EnvioEntrante[] {
  const recibidas = estados.filter((e) => e.rol === "recibir").slice().sort((a, b) => a.inicioMs - b.inicioMs || a.id.localeCompare(b.id));
  const grupos = new Map<string, EstadoTransferencia[]>();
  const abiertoPorOrigen = new Map<string, { clave: string; ultimo: number }>();
  for (const e of recibidas) {
    if (e.lote) {
      const clave = `lote:${e.lote}`;
      grupos.set(clave, [...(grupos.get(clave) ?? []), e]);
      continue;
    }
    const origen = e.origen ?? "?";
    const abierto = abiertoPorOrigen.get(origen);
    if (abierto && e.inicioMs - abierto.ultimo <= ventanaMs) {
      grupos.get(abierto.clave)?.push(e);
      abierto.ultimo = e.inicioMs;
      continue;
    }
    const clave = `origen:${origen}@${e.inicioMs}`;
    grupos.set(clave, [e]);
    abiertoPorOrigen.set(origen, { clave, ultimo: e.inicioMs });
  }
  return Array.from(grupos, ([clave, archivos]) => resumir(clave, archivos)).sort((a, b) => b.inicioMs - a.inicioMs);
}

/** Envíos con algo por decidir (alguna oferta pendiente), el más antiguo primero (se atienden en orden). */
export function enviosPorDecidir(envios: readonly EnvioEntrante[]): EnvioEntrante[] {
  return envios.filter((e) => e.pendientes > 0).slice().sort((a, b) => a.inicioMs - b.inicioMs);
}

/* ══════════════════════════ Árbol de carpetas ══════════════════════════ */

export interface CarpetaEnvio {
  nombre: string;
  /** Ruta de la carpeta («fotos/2026»); "" para la raíz. */
  ruta: string;
  carpetas: CarpetaEnvio[];
  archivos: EstadoTransferencia[];
}

/** Carpeta de un archivo dentro del envío (de su `ruta` relativa, sin el nombre). Puro. */
export function carpetaDe(e: Pick<EstadoTransferencia, "ruta">): string {
  const partes = (e.ruta ?? "").split("/").filter(Boolean);
  return partes.slice(0, -1).join("/");
}

/** Árbol de carpetas de un envío (las carpetas primero, por nombre; los archivos por nombre). Puro. */
export function arbolDeEnvio(archivos: readonly EstadoTransferencia[]): CarpetaEnvio {
  const raiz: CarpetaEnvio = { nombre: "", ruta: "", carpetas: [], archivos: [] };
  for (const a of archivos) {
    let nodo = raiz;
    for (const parte of carpetaDe(a).split("/").filter(Boolean)) {
      const ruta = nodo.ruta ? `${nodo.ruta}/${parte}` : parte;
      let hijo = nodo.carpetas.find((c) => c.nombre === parte);
      if (!hijo) {
        hijo = { nombre: parte, ruta, carpetas: [], archivos: [] };
        nodo.carpetas.push(hijo);
      }
      nodo = hijo;
    }
    nodo.archivos.push(a);
  }
  const ordenar = (c: CarpetaEnvio) => {
    c.carpetas.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
    c.archivos.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
    c.carpetas.forEach(ordenar);
  };
  ordenar(raiz);
  return raiz;
}

/** Todos los ids de archivo bajo una carpeta (para marcarla entera). Puro. */
export function idsDeCarpeta(c: CarpetaEnvio): string[] {
  return [...c.archivos.map((a) => a.id), ...c.carpetas.flatMap(idsDeCarpeta)];
}

/** Ids que aún se pueden aceptar o rechazar. Puro. */
export function idsPendientes(envio: Pick<EnvioEntrante, "archivos">): string[] {
  return envio.archivos.filter((a) => a.fase === "pendiente-aceptar").map((a) => a.id);
}
