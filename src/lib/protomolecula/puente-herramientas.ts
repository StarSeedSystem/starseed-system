/**
 * Puente OS⇄herramienta aislada (Protomolécula, contrato §8.1 y §11.1).
 * Módulo puro: el `window` y el reloj se inyectan; nada de node:* ni de red.
 */

import { MAX_NOMBRE, MAX_OPCIONES, MAX_PARAMETROS, MAX_TEXTO_GENERAL, MAX_TEXTO_OPCION, sanearTexto } from "./registro-atomos";
import { PALABRAS_UNIDAD, type Parametro, type TipoParametro } from "./tipos";

export const VERSION_PUENTE = 1 as const;

export const TIPOS_HERRAMIENTA_A_OS = ["hola", "cambio", "exportar", "listo", "error"] as const;
export const TIPOS_OS_A_HERRAMIENTA = ["establecer", "estado", "disparar"] as const;
export type TipoHerramientaAOS = (typeof TIPOS_HERRAMIENTA_A_OS)[number];
export type TipoOSAHerramienta = (typeof TIPOS_OS_A_HERRAMIENTA)[number];

interface MensajeBase { protomolecula: typeof VERSION_PUENTE; tipo: string; canal: string }
export type MensajeHola = MensajeBase & { tipo: "hola"; nombre?: string; parametros?: Parametro[] };
export type MensajeCambio = MensajeBase & { tipo: "cambio"; parametroId: string; valor: unknown };
export type MensajeExportar = MensajeBase & { tipo: "exportar"; formato: string; datos: unknown };
export type MensajeListo = MensajeBase & { tipo: "listo" };
export type MensajeError = MensajeBase & { tipo: "error"; mensaje: string };
export type MensajeDeHerramientaAOS = MensajeHola | MensajeCambio | MensajeExportar | MensajeListo | MensajeError;
export type MensajeEstablecer = MensajeBase & { tipo: "establecer"; parametroId: string; valor: unknown };
export type MensajeEstado = MensajeBase & { tipo: "estado"; valores: Record<string, unknown> };
export type MensajeDisparar = MensajeBase & { tipo: "disparar"; parametroId: string };
export type MensajeDeOSAHerramienta = MensajeEstablecer | MensajeEstado | MensajeDisparar;

export interface Marco {
  ventana: unknown; // contentWindow del iframe
  token: string;
  /** null = envoltorio propio con sandbox sin allow-same-origin (origen opaco «null») */
  origenEsperado: string | null;
  parametros?: Parametro[];
}

/** Cubo de fichas: cuántos mensajes quedan y cuándo se rellena. */
export interface EstadoLimite { fichas: number; proximaRecarga: number }
export interface EntradaPuente { tipo: TipoHerramientaAOS; canal: string; [clave: string]: unknown }

const TOPE_JSON = 64 * 1024;
const TOPE_EXPORTAR = 2 * 1024 * 1024;
export const MENSAJES_POR_SEGUNDO = 120;
/** Los topes de lo que declara un `hola` son LOS DEL REGISTRO (se importan de allí): un `hola` aceptado nunca lo rechaza `registrarAtomo`. */
const UNIDADES: readonly string[] = ["", ...Object.keys(PALABRAS_UNIDAD)];

/** Token de 16 bytes (128 bits) en hexadecimal; en producción se inyecta `crypto.getRandomValues`. */
export function crearToken(aleatorio: (n: number) => Uint8Array): string {
  return Array.from(aleatorio(16), (b) => b.toString(16).padStart(2, "0")).join("");
}

const TIPOS_VALIDOS: readonly TipoParametro[] = ["numero", "entero", "booleano", "opcion", "disparo"];
/** Texto declarado por un tercero: sin < ni > (el mismo `sanearTexto` del registro) y acotado. */
const texto = (v: unknown, max = MAX_TEXTO_GENERAL): string => (typeof v === "string" ? sanearTexto(v).slice(0, max) : "");

/** Equivalente de `sanearDefinicion` para solo parámetros (registro-atomos no lo exporta). */
export function sanearParametro(bruto: unknown): Parametro | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.length <= MAX_TEXTO_GENERAL && sanearTexto(o.id) === o.id ? o.id : ""; // un id que el saneo cambiaría ya no es el de la herramienta
  const nombre = texto(o.nombre, MAX_TEXTO_GENERAL);
  if (!id || !nombre || !TIPOS_VALIDOS.includes(o.tipo as TipoParametro)) return null;
  const p: Parametro = { id, nombre, tipo: o.tipo as TipoParametro };
  if (typeof o.min === "number" && Number.isFinite(o.min)) p.min = o.min;
  if (typeof o.max === "number" && Number.isFinite(o.max)) p.max = o.max;
  if (p.min !== undefined && p.max !== undefined && p.min >= p.max) return null; // mismo criterio que registrarAtomo
  if (typeof o.paso === "number" && Number.isFinite(o.paso) && o.paso > 0) p.paso = o.paso;
  if (typeof o.unidad === "string" && UNIDADES.includes(o.unidad)) p.unidad = o.unidad as Parametro["unidad"]; // solo las que sabe dictar el núcleo
  // Una opción que no cabe o que el saneo cambiaría («L->R») se DESCARTA: recortada o sin sus < >, dos opciones distintas serían una y el OS ofrecería un texto que la herramienta no reconoce.
  if (Array.isArray(o.opciones)) p.opciones = Array.from(new Set(o.opciones.filter((x): x is string => typeof x === "string" && x.length <= MAX_TEXTO_OPCION && sanearTexto(x) === x))).slice(0, MAX_OPCIONES);
  if (Array.isArray(o.sinonimos)) p.sinonimos = o.sinonimos.filter((x): x is string => typeof x === "string").map((x) => texto(x));
  return p;
}

/** `cambio` respeta el TIPO del parámetro declarado (número finito · booleano · texto de una opción). No se acota aquí: lo acota el núcleo. */
function valorRespetaTipo(p: Parametro | undefined, valor: unknown): boolean {
  if (!p) return false;
  if (p.tipo === "numero" || p.tipo === "entero") return typeof valor === "number" && Number.isFinite(valor);
  if (p.tipo === "booleano") return typeof valor === "boolean";
  if (p.tipo === "opcion") return typeof valor === "string" && (p.opciones?.includes(valor) ?? true);
  return false; // «disparo» no se cambia: se dispara
}

/** Un objeto «plano»: prototipo nulo o raíz (Object.prototype, también el de otro marco). Map, Set, Date, RegExp, Blob, ArrayBuffer y las clases quedan fuera. */
const plano = (x: object): boolean => {
  const p = Object.getPrototypeOf(x);
  return p === null || Object.getPrototypeOf(p) === null;
};

/**
 * Bytes UTF-8 del JSON del mensaje, o null si NO es JSON puro (objetos planos, listas, texto, números finitos, booleanos y null).
 * `postMessage` clona mucho más (BigInt, Map, Set, Date, ArrayBuffer, Blob, referencias circulares…) y `JSON.stringify` lo mediría
 * mal (un Map pesa «{}»; un Uint8Array, seis veces su tamaño): se rechaza en vez de medir algo que no es el mensaje. El binario va como texto (base64).
 * Un `undefined` dentro de un objeto se omite como en JSON, pero su CLAVE cuenta (postMessage la clona); en una lista no vale. Una lista con propiedades que no son índices (`l.oculto = "…"`) se rechaza: `postMessage` las clona con su peso y `JSON.stringify` las ignora.
 */
function pesoJson(v: unknown): number | null {
  let omitidas = 0;
  try {
    const json = JSON.stringify(v, function (this: Record<string, unknown>, k: string, valor: unknown) {
      const x = this[k]; // el valor ORIGINAL: `valor` ya pasó por toJSON (una Date llegaría como texto)
      if (x === null || typeof x === "string" || typeof x === "boolean" || Number.isFinite(x)) return valor;
      if (x === undefined && !Array.isArray(this)) return void (omitidas += new TextEncoder().encode(k).length + 4); // «"k":,» sin el valor
      if (typeof x === "object" && (Array.isArray(x) ? Object.keys(x).length === x.length : plano(x))) return valor;
      throw new TypeError("no es JSON puro");
    });
    return json === undefined ? null : new TextEncoder().encode(json).length + omitidas;
  } catch {
    return null;
  }
}
const mal = (estado: EstadoLimite, motivo: string) => ({ entrada: null, estado, motivo });

export function procesarMensaje(
  ev: { origin: string; source: unknown; data: unknown },
  marco: Marco,
  ahora: number,
  estado: EstadoLimite
): { entrada: EntradaPuente | null; estado: EstadoLimite; motivo?: string } {
  // Un marco sin ventana (aún no montado o ya desmontado) no identifica a nadie: `null === null` no es una prueba de identidad.
  if (marco.ventana == null || ev.source !== marco.ventana) return mal(estado, "La ventana que habla no es la del marco");
  if (marco.origenEsperado === null ? ev.origin !== "null" : ev.origin !== marco.origenEsperado)
    return mal(estado, "Origen del mensaje distinto del esperado");
  const d = ev.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return mal(estado, "El mensaje no es un objeto");
  const datos = d as Record<string, unknown>;
  if (datos.protomolecula !== VERSION_PUENTE || typeof datos.tipo !== "string")
    return mal(estado, "Falta la cabecera del protocolo");
  if (datos.canal !== marco.token) return mal(estado, "El canal no coincide con el token del marco");
  const tipo = datos.tipo as string;
  if (!(TIPOS_HERRAMIENTA_A_OS as readonly string[]).includes(tipo)) return mal(estado, `Tipo ignorado: ${tipo.slice(0, 40)}`); // el tipo viene sin acotar: no se devuelve entero
  if (ahora >= estado.proximaRecarga) estado = { fichas: MENSAJES_POR_SEGUNDO, proximaRecarga: ahora + 1000 };
  if (estado.fichas <= 0) return mal(estado, "Límite de frecuencia: más de 120 mensajes por segundo");
  estado = { ...estado, fichas: estado.fichas - 1 };
  const tope = tipo === "exportar" ? TOPE_EXPORTAR : TOPE_JSON;
  const peso = pesoJson(datos);
  if (peso === null) return mal(estado, "El mensaje no es JSON puro (solo objetos planos, listas, texto, números finitos, booleanos y null; el binario va en base64)");
  if (peso > tope) return mal(estado, `El mensaje supera el tope de ${tope === TOPE_JSON ? "64 KB" : "2 MB"}`);

  switch (tipo) {
    case "hola": {
      const m = datos as unknown as MensajeHola;
      if (m.nombre !== undefined && typeof m.nombre !== "string") return mal(estado, "«nombre» debe ser texto");
      let parametros: Parametro[] | undefined;
      if (m.parametros !== undefined) {
        if (!Array.isArray(m.parametros)) return mal(estado, "«parametros» debe ser una lista");
        parametros = [];
        for (const bruto of m.parametros) {
          const p = sanearParametro(bruto);
          if (p && !parametros.some((q) => q.id === p.id)) parametros.push(p); // ids únicos, como en el registro
          if (parametros.length >= MAX_PARAMETROS) break;
        }
      }
      const nombre = m.nombre === undefined ? undefined : texto(m.nombre, MAX_NOMBRE);
      return { entrada: { tipo: "hola", canal: m.canal, nombre, parametros }, estado };
    }
    case "cambio": {
      const m = datos as unknown as MensajeCambio;
      if (typeof m.parametroId !== "string" || !m.parametroId) return mal(estado, "«parametroId» debe ser texto no vacío");
      const declarado = marco.parametros?.find((p) => p.id === m.parametroId);
      if (marco.parametros && !declarado) return mal(estado, `Parámetro no declarado: ${m.parametroId.slice(0, 80)}`);
      if (declarado && !valorRespetaTipo(declarado, m.valor))
        return mal(estado, `El valor no respeta el tipo «${declarado.tipo}» de «${m.parametroId}»`);
      return { entrada: { tipo: "cambio", canal: m.canal, parametroId: m.parametroId, valor: m.valor }, estado };
    }
    case "exportar": {
      const m = datos as unknown as MensajeExportar;
      if (typeof m.formato !== "string" || !m.formato) return mal(estado, "«formato» debe ser texto no vacío");
      return { entrada: { tipo: "exportar", canal: m.canal, formato: m.formato, datos: m.datos }, estado };
    }
    case "listo":
      return { entrada: { tipo: "listo", canal: datos.canal as string }, estado };
    default: {
      const m = datos as unknown as MensajeError;
      if (typeof m.mensaje !== "string" || !m.mensaje) return mal(estado, "«mensaje» debe ser texto no vacío");
      return { entrada: { tipo: "error", canal: m.canal, mensaje: m.mensaje.slice(0, 500) }, estado };
    }
  }
}

export function mensajeParaMarco(tipo: TipoOSAHerramienta, payload: Record<string, unknown>, token: string): Record<string, unknown> {
  return { protomolecula: VERSION_PUENTE, tipo, canal: token, ...payload };
}

/** «*» con origen opaco: seguro porque solo se entrega a ESE contentWindow (contrato §8.1.1). */
export function destinoDe(marco: Marco): string {
  return marco.origenEsperado ?? "*";
}

export function esUrlEmbebible(url: string, origenOS: string): { ok: true; origen: string } | { ok: false; motivo: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, motivo: "URL inválida" };
  }
  if (u.protocol !== "https:") return { ok: false, motivo: "Solo https (nunca javascript:, data: ni blob:)" };
  if (u.username || u.password) return { ok: false, motivo: "La URL no puede llevar credenciales" };
  if (u.origin === origenOS) return { ok: false, motivo: "No puede ser del mismo origen que el OS" };
  return { ok: true, origen: u.origin };
}
