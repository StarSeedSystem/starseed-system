/**
 * Puente OS⇄herramienta aislada (Protomolécula, contrato §8.1 y §11.1).
 * Módulo puro: el `window` y el reloj se inyectan; nada de node:* ni de red.
 */

import type { Parametro, TipoParametro } from "./tipos";

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

/** Token de 16 bytes (128 bits) en hexadecimal; en producción se inyecta `crypto.getRandomValues`. */
export function crearToken(aleatorio: (n: number) => Uint8Array): string {
  return Array.from(aleatorio(16), (b) => b.toString(16).padStart(2, "0")).join("");
}

const TIPOS_VALIDOS: readonly TipoParametro[] = ["numero", "entero", "booleano", "opcion", "disparo"];
const texto = (v: unknown, max = 200): string => (typeof v === "string" ? v.slice(0, max) : "");

/** Equivalente de `sanearDefinicion` para solo parámetros (registro-atomos no lo exporta). */
export function sanearParametro(bruto: unknown): Parametro | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  const id = texto(o.id, 80);
  const nombre = texto(o.nombre, 120);
  if (!id || !nombre || !TIPOS_VALIDOS.includes(o.tipo as TipoParametro)) return null;
  const p: Parametro = { id, nombre, tipo: o.tipo as TipoParametro };
  if (typeof o.min === "number" && Number.isFinite(o.min)) p.min = o.min;
  if (typeof o.max === "number" && Number.isFinite(o.max)) p.max = o.max;
  if (typeof o.paso === "number" && Number.isFinite(o.paso) && o.paso > 0) p.paso = o.paso;
  if (typeof o.unidad === "string") p.unidad = texto(o.unidad, 24) as Parametro["unidad"];
  if (Array.isArray(o.opciones)) p.opciones = o.opciones.filter((x): x is string => typeof x === "string").map((x) => texto(x, 80)).slice(0, 64);
  if (Array.isArray(o.sinonimos)) p.sinonimos = o.sinonimos.filter((x): x is string => typeof x === "string").map((x) => texto(x, 80));
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

const bytes = (v: unknown): number => new TextEncoder().encode(JSON.stringify(v)).length;
const mal = (estado: EstadoLimite, motivo: string) => ({ entrada: null, estado, motivo });

export function procesarMensaje(
  ev: { origin: string; source: unknown; data: unknown },
  marco: Marco,
  ahora: number,
  estado: EstadoLimite
): { entrada: EntradaPuente | null; estado: EstadoLimite; motivo?: string } {
  if (ev.source !== marco.ventana) return mal(estado, "La ventana que habla no es la del marco");
  if (marco.origenEsperado === null ? ev.origin !== "null" : ev.origin !== marco.origenEsperado)
    return mal(estado, "Origen del mensaje distinto del esperado");
  const d = ev.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return mal(estado, "El mensaje no es un objeto");
  const datos = d as Record<string, unknown>;
  if (datos.protomolecula !== VERSION_PUENTE || typeof datos.tipo !== "string")
    return mal(estado, "Falta la cabecera del protocolo");
  if (datos.canal !== marco.token) return mal(estado, "El canal no coincide con el token del marco");
  const tipo = datos.tipo as string;
  if (!(TIPOS_HERRAMIENTA_A_OS as readonly string[]).includes(tipo)) return mal(estado, `Tipo ignorado: ${tipo}`);
  if (ahora >= estado.proximaRecarga) estado = { fichas: MENSAJES_POR_SEGUNDO, proximaRecarga: ahora + 1000 };
  if (estado.fichas <= 0) return mal(estado, "Límite de frecuencia: más de 120 mensajes por segundo");
  estado = { ...estado, fichas: estado.fichas - 1 };
  const tope = tipo === "exportar" ? TOPE_EXPORTAR : TOPE_JSON;
  if (bytes(datos) > tope) return mal(estado, `El mensaje supera el tope de ${tope === TOPE_JSON ? "64 KB" : "2 MB"}`);

  switch (tipo) {
    case "hola": {
      const m = datos as unknown as MensajeHola;
      if (m.nombre !== undefined && typeof m.nombre !== "string") return mal(estado, "«nombre» debe ser texto");
      let parametros: Parametro[] | undefined;
      if (m.parametros !== undefined) {
        if (!Array.isArray(m.parametros)) return mal(estado, "«parametros» debe ser una lista");
        parametros = m.parametros.map(sanearParametro).filter((p): p is Parametro => p !== null);
      }
      return { entrada: { tipo: "hola", canal: m.canal, nombre: m.nombre, parametros }, estado };
    }
    case "cambio": {
      const m = datos as unknown as MensajeCambio;
      if (typeof m.parametroId !== "string" || !m.parametroId) return mal(estado, "«parametroId» debe ser texto no vacío");
      const declarado = marco.parametros?.find((p) => p.id === m.parametroId);
      if (marco.parametros && !declarado) return mal(estado, `Parámetro no declarado: ${m.parametroId}`);
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
  const esquema = u.protocol.slice(0, -1);
  if (["javascript", "data", "blob"].includes(esquema)) return { ok: false, motivo: "Esquema de URL prohibido" };
  if (u.protocol !== "https:") return { ok: false, motivo: "Solo se permiten URLs con protocolo https:" };
  if (u.username || u.password) return { ok: false, motivo: "La URL no puede contener credenciales" };
  if (u.origin === origenOS) return { ok: false, motivo: "La URL no puede ser del mismo origen que el OS" };
  return { ok: true, origen: u.origin };
}
