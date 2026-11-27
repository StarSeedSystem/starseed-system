// Nodos NFC: oferta, acciones del lugar y privacidad del visitante (contrato: architecture/nfc-neuronas.md §5).
// Módulo puro: sin red, disco ni Node. Un nodo es una neurona en modo nodo o una etiqueta NDEF.

import type { Accion } from "./preferencias";

export const TIPOS_OFERTA = [
  "informacion", "app", "publicacion", "pagina", "enlace", "archivo", "folder", "capa",
  "audioguia", "descripcion_zona", "nodo_informativo",
] as const;
export type TipoOferta = (typeof TIPOS_OFERTA)[number];

export const ACCIONES_LUGAR = [
  "registro_evento", "casa", "espacio_publico", "registro_visitas", "notificacion", "ubicacion_mapa",
] as const;
export type AccionLugar = (typeof ACCIONES_LUGAR)[number];

export type GuardaVisitante = "nada" | "alias" | "cuenta";
export type VisibilidadMapa = "privada" | "publica";
export type TipoNodo = "neurona" | "etiqueta";

export const MAX_OFERTAS = 8;
export const MAX_BYTES_ETIQUETA = 512;
export const RETENCION_MAX_DIAS = 365;

export interface OfertaNodo {
  tipo: TipoOferta;
  titulo: string;
  /** Ruta interna, id de la entidad o URL https. Nunca contiene claves. */
  destino: string;
}

export interface PrivacidadNodo {
  guarda: GuardaVisitante;
  /** Días que se conserva el registro; 0 = no se conserva. */
  retencionDias: number;
}

export interface ConfigNodo {
  version: 1;
  tipo: TipoNodo;
  nombre: string;
  ofertas: OfertaNodo[];
  acciones: AccionLugar[];
  privacidad: PrivacidadNodo;
  mapa: VisibilidadMapa;
  /** Evento al que da entrada, si «registro_evento» está activo. */
  eventoId?: string;
}

export type ResultadoConfig = { ok: true; config: ConfigNodo } | { ok: false; errores: string[] };

const esTexto = (x: unknown): x is string => typeof x === "string";
const incluye = <T extends string>(lista: readonly T[], x: unknown): x is T => esTexto(x) && (lista as readonly string[]).includes(x);

/** Destinos válidos: rutas internas («/…»), ids sin espacios o enlaces https. Nunca javascript: ni datos. */
export function destinoValido(d: string): boolean {
  if (d.length === 0 || d.length > 300 || /[\s<>"]/.test(d)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(d)) return /^https:\/\//i.test(d);
  return true;
}

export function configPorDefecto(tipo: TipoNodo = "neurona"): ConfigNodo {
  return {
    version: 1, tipo, nombre: "", ofertas: [], acciones: [],
    privacidad: { guarda: "nada", retencionDias: 0 }, mapa: "privada",
  };
}

function validarOfertas(x: unknown, errores: string[]): OfertaNodo[] {
  const ofertas: OfertaNodo[] = [];
  if (!Array.isArray(x) || x.length > MAX_OFERTAS) {
    errores.push(`Una lista de ofertas de hasta ${MAX_OFERTAS}.`);
    return ofertas;
  }
  x.forEach((f, i) => {
    const r = (f ?? {}) as Record<string, unknown>;
    const n = i + 1;
    if (!incluye(TIPOS_OFERTA, r.tipo)) return void errores.push(`Oferta ${n}: tipo desconocido.`);
    if (!esTexto(r.titulo) || r.titulo.trim().length === 0 || r.titulo.length > 80) {
      return void errores.push(`Oferta ${n}: el título debe tener entre 1 y 80 caracteres.`);
    }
    if (!esTexto(r.destino) || !destinoValido(r.destino)) {
      return void errores.push(`Oferta ${n}: el destino no es válido (ruta interna, id o enlace https).`);
    }
    ofertas.push({ tipo: r.tipo, titulo: r.titulo.trim(), destino: r.destino });
  });
  return ofertas;
}

function validarAcciones(x: unknown, errores: string[]): AccionLugar[] {
  const acciones: AccionLugar[] = [];
  if (!Array.isArray(x)) {
    errores.push("Las acciones del lugar deben ser una lista.");
    return acciones;
  }
  for (const a of x) {
    if (!incluye(ACCIONES_LUGAR, a)) errores.push(`Acción del lugar desconocida: ${String(a)}.`);
    else if (!acciones.includes(a)) acciones.push(a);
  }
  return acciones;
}

/** Valida una config llegada de fuera (formulario, etiqueta leída). Devuelve todos los errores, no solo el primero. */
export function validarConfig(x: unknown): ResultadoConfig {
  const errores: string[] = [];
  if (typeof x !== "object" || x === null) return { ok: false, errores: ["La configuración no tiene forma de objeto."] };
  const o = x as Record<string, unknown>;
  if (o.version !== 1) errores.push("Versión de configuración no admitida.");
  const tipo = o.tipo === "neurona" || o.tipo === "etiqueta" ? o.tipo : undefined;
  if (!tipo) errores.push("El tipo de nodo debe ser «neurona» o «etiqueta».");
  const nombre = esTexto(o.nombre) ? o.nombre.trim() : "";
  if (nombre.length === 0 || nombre.length > 80) errores.push("El nombre del nodo debe tener entre 1 y 80 caracteres.");
  const ofertas = validarOfertas(o.ofertas, errores);
  const acciones = validarAcciones(o.acciones, errores);

  const p = (o.privacidad ?? {}) as Record<string, unknown>;
  const guarda = incluye(["nada", "alias", "cuenta"] as const, p.guarda) ? p.guarda : undefined;
  const dias = typeof p.retencionDias === "number" && Number.isInteger(p.retencionDias) ? p.retencionDias : -1;
  if (!guarda) errores.push("Falta decir qué guarda el nodo del visitante (nada, alias o cuenta).");
  if (dias < 0 || dias > RETENCION_MAX_DIAS) errores.push(`La retención va de 0 a ${RETENCION_MAX_DIAS} días.`);
  if (guarda === "nada" && dias > 0) errores.push("Si el nodo no guarda nada, la retención debe ser 0 días.");
  if (guarda && guarda !== "nada" && dias === 0) errores.push("Si el nodo guarda algo, indica por cuántos días.");
  const mapa = o.mapa === "privada" || o.mapa === "publica" ? o.mapa : undefined;
  if (!mapa) errores.push("El mapa de señales debe ser «privada» o «publica».");

  const eventoId = esTexto(o.eventoId) && o.eventoId.trim() ? o.eventoId.trim() : undefined;
  if (acciones.includes("registro_evento") && !eventoId) errores.push("El registro de entrada necesita el evento al que da paso.");
  if (acciones.includes("registro_evento") && guarda === "nada") errores.push("Registrar la entrada a un evento exige guardar al menos el alias.");
  if (acciones.includes("registro_visitas") && guarda === "nada") errores.push("Registrar visitas exige guardar al menos el alias.");

  if (errores.length > 0 || !tipo || !guarda || !mapa) return { ok: false, errores };
  const config: ConfigNodo = { version: 1, tipo, nombre, ofertas, acciones, privacidad: { guarda, retencionDias: dias }, mapa };
  if (eventoId) config.eventoId = eventoId;
  return { ok: true, config };
}

const TXT_GUARDA: Record<GuardaVisitante, string> = {
  nada: "No guarda nada de ti.",
  alias: "Guarda tu alias.",
  cuenta: "Guarda tu cuenta StarSeed.",
};

/** Lo que el visitante lee ANTES de aceptar: qué se guarda, por cuánto tiempo y qué hace el lugar. */
export function resumenParaVisitante(c: ConfigNodo): string[] {
  const l: string[] = [TXT_GUARDA[c.privacidad.guarda]];
  if (c.privacidad.guarda !== "nada") {
    const d = c.privacidad.retencionDias;
    l.push(`Lo conserva ${d} día${d === 1 ? "" : "s"}.`);
  }
  if (c.acciones.includes("registro_evento")) l.push("Registra tu entrada al evento.");
  if (c.acciones.includes("registro_visitas")) l.push("Cuenta tu visita.");
  if (c.acciones.includes("notificacion")) l.push("Avisa al dueño del lugar de tu llegada.");
  if (c.acciones.includes("ubicacion_mapa")) {
    l.push(c.mapa === "publica" ? "Muestra este encuentro en el mapa público de señales." : "Anota este encuentro en tu mapa privado de señales.");
  }
  return l;
}

/** Acciones de encuentro (§4) que activa lo que declara el nodo. */
export function accionesDeEncuentro(c: ConfigNodo): Accion[] {
  const a: Accion[] = [];
  if (c.ofertas.length > 0) a.push("abrir_oferta_nodo");
  if (c.acciones.includes("registro_evento")) a.push("registrar_entrada_evento");
  if (c.acciones.includes("ubicacion_mapa")) a.push("registrar_ubicacion");
  return a;
}

export interface EtiquetaNdef {
  tipoMime: string;
  /** JSON compacto de la config validada. Sin claves ni datos del dueño. */
  carga: string;
  bytes: number;
}

export const TIPO_MIME_NODO = "application/vnd.starseed.nodo";

/** Prepara el contenido de `nfc_escribir_etiqueta`: revalida y comprueba que cabe en la etiqueta. */
export function prepararEtiqueta(c: ConfigNodo): { ok: true; etiqueta: EtiquetaNdef } | { ok: false; errores: string[] } {
  const r = validarConfig(c);
  if (!r.ok) return r;
  const carga = JSON.stringify(r.config);
  const bytes = new TextEncoder().encode(carga).length;
  if (bytes > MAX_BYTES_ETIQUETA) {
    return { ok: false, errores: [`La etiqueta pesa ${bytes} bytes y el máximo es ${MAX_BYTES_ETIQUETA}: quita ofertas o acorta los textos.`] };
  }
  return { ok: true, etiqueta: { tipoMime: TIPO_MIME_NODO, carga, bytes } };
}
