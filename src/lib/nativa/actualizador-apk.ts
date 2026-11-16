/**
 * ════════════════════════════════════════════════════════════════════════════
 * (ACT1108A · 2026-11-08) Actualizar la app de ANDROID desde dentro: descarga del APK nuevo en la app,
 * SHA-256 contra el manifiesto, mismo paquete y misma firma, y el instalador del sistema.
 * Contrato: architecture/centro-versiones-1105.md §9.
 *
 * Comandos de la app nativa (native/src-tauri/src/canal_actualizacion.rs, Kotlin en ActualizadorApk.kt):
 *   · `apk_actualizar { instalar }` → pide buscar (y, con `instalar`, abrir el instalador al terminar).
 *                                     Devuelve enseguida; el progreso se lee con `apk_estado`.
 *   · `apk_estado`                  → { fase, version, version_code, instalada, descargado, total,
 *                                       mensaje, canal, notas, t }.
 *   · `apk_instalar`                → abre el instalador con el APK ya descargado y verificado.
 * HONESTIDAD: Android SIEMPRE pide a la persona que confirme «Instalar»; la primera vez, además, que
 * permita a StarSeed OS «Instalar apps desconocidas». Con la misma firma conserva los datos de la app.
 * Una APK anterior a ACT1108A no tiene estos comandos: la web ofrece el .apk como antes.
 * Nunca lanza.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { puenteNativo, type PuenteNativo } from "./puente";
import { esComandoAusente } from "./info-neurona";

export const COMANDOS_APK = {
  actualizar: "apk_actualizar",
  estado: "apk_estado",
  instalar: "apk_instalar",
} as const;

/** Lo que devuelve `apk_estado` (los nombres de Rust: `EstadoApk` de canal_actualizacion_logica.rs). */
export interface EstadoApkNativo {
  fase: string;
  version?: string | null;
  version_code?: number | null;
  instalada?: string | null;
  descargado?: number | null;
  total?: number | null;
  mensaje?: string | null;
  canal?: string | null;
  notas?: string | null;
  /** (FAC1116) Veces que se reanudó la descarga tras un corte, y segundos sin bytes en el último. */
  reanudaciones?: number | null;
  sin_datos_s?: number | null;
  t: number;
}

export type FaseApk =
  | ""
  | "buscando"
  | "al-dia"
  | "descargando"
  | "lista"
  | "permiso"
  | "instalador"
  | "instalada"
  | "error"
  | "sin-actualizador";

const FASES: readonly string[] = ["", "buscando", "al-dia", "descargando", "lista", "permiso", "instalador", "instalada", "error", "sin-actualizador"];

/** Sanea lo que llega de la app. null si no es un estado. Pura. */
export function normalizarEstadoApk(x: unknown): EstadoApkNativo | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const fase = typeof o.fase === "string" && FASES.includes(o.fase) ? o.fase : null;
  if (fase === null) return null;
  const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  return {
    fase,
    version: txt(o.version),
    version_code: num(o.version_code),
    instalada: txt(o.instalada),
    descargado: num(o.descargado),
    total: num(o.total),
    mensaje: txt(o.mensaje),
    canal: txt(o.canal),
    notas: txt(o.notas),
    reanudaciones: num(o.reanudaciones),
    sin_datos_s: num(o.sin_datos_s),
    t: num(o.t) ?? 0,
  };
}

/** Porcentaje de la descarga (null si no se sabe el total). Pura. */
export function porcentajeApk(e: EstadoApkNativo): number | null {
  if (!e.total || e.descargado == null) return null;
  return Math.max(0, Math.min(100, Math.round((e.descargado / e.total) * 100)));
}

/** El texto para la persona. Pura. */
export function textoEstadoApk(e: EstadoApkNativo): string {
  const v = e.version ? ` ${e.version}` : "";
  switch (e.fase) {
    case "buscando":
      // (ACT1108B) Kotlin cuenta aquí el cambio de ruta: «GitHub no respondió (504). Lo intento por otra ruta…».
      return e.mensaje?.trim() ? e.mensaje : "Buscando la versión nueva…";
    case "descargando": {
      if (e.descargado == null && e.mensaje?.trim()) return e.mensaje;
      const p = porcentajeApk(e);
      // (FAC1116) Con un corte en curso, Kotlin dice «sin datos desde hace 31 s: sigo desde el 36 %».
      if (e.mensaje?.trim() && (e.sin_datos_s ?? 0) > 0 && e.mensaje.startsWith("Sin datos")) return e.mensaje;
      return `Descargando la versión${v} dentro de la app${p == null ? "…" : ` · ${p} %`}`;
    }
    case "lista":
      return `Descargada y verificada la versión${v}. Android te pedirá confirmar «Instalar».`;
    case "permiso":
      return (
        e.mensaje ??
        "Android pide que permitas a StarSeed OS «Instalar apps desconocidas». Actívalo en el ajuste que se abrió y vuelve: la instalación sigue sola."
      );
    case "instalador":
      return "Android te pide confirmar: pulsa «Instalar» (o «Actualizar»). Es la misma firma: tus datos y ajustes se quedan donde están.";
    case "instalada":
      return e.mensaje ?? `Instalada la versión${v}.`;
    case "al-dia":
      return e.mensaje ?? "Ya tienes la última versión.";
    case "error":
      return e.mensaje ?? "No se pudo descargar la versión nueva.";
    case "sin-actualizador":
      return e.mensaje ?? "Esta app no trae el actualizador interno: descarga el .apk.";
    default:
      return e.mensaje ?? "";
  }
}

/** ¿Deja de mirarse el progreso con este estado? (Con `instalar`, «lista» es de paso.) Pura. */
export function esFinal(e: EstadoApkNativo, instalar: boolean): boolean {
  if (["al-dia", "error", "sin-actualizador", "instalador", "instalada"].includes(e.fase)) return true;
  return e.fase === "lista" && !instalar;
}

export type ResultadoApk =
  /** La app no tiene el actualizador interno (APK anterior, o no es la app de StarSeed OS). */
  | { estado: "sin-actualizador"; motivo: string }
  /** Terminó (o se dejó de mirar) en `final`. */
  | { estado: "ok"; final: EstadoApkNativo }
  | { estado: "error"; motivo: string; ultimo: EstadoApkNativo | null };

export interface OpcionesApk {
  /** Abrir el instalador al terminar (por defecto sí: lo pidió la persona). */
  instalar?: boolean;
  onEstado?: (e: EstadoApkNativo) => void;
  puente?: PuenteNativo;
  /** Para las pruebas: cómo esperar y qué hora es. */
  esperar?: (ms: number) => Promise<void>;
  ahora?: () => number;
  /** Cada cuánto se pregunta el estado y cuánto se espera como mucho. */
  cadaMs?: number;
  limiteMs?: number;
  /** Kotlin callado (el estado no cambia ni su hora) durante este tiempo: el proceso murió o está congelado. */
  quietoMs?: number;
  /** Ni un byte nuevo durante este tiempo aunque Kotlin siga vivo reanudando: se deja de mirar (sigue en segundo plano). */
  sinBytesMs?: number;
}

/** Megabytes para el registro. Pura. */
const mb = (n: number) => Math.round(n / 1_048_576);

/**
 * (FAC1116) El motivo con el que se deja de mirar: bytes, porcentaje y por qué. Es lo que acaba en la línea
 * `actualizacion … paso=descargar resultado=error motivo=…` (160 caracteres: va corto). Pura.
 */
export function motivoSinAvance(e: EstadoApkNativo | null, sinBytesS: number, quien: "kotlin-callado" | "sin-bytes"): string {
  const p = e ? porcentajeApk(e) : null;
  const donde = e?.descargado != null && e.total ? `${p ?? 0} % (${mb(e.descargado)} de ${mb(e.total)} MB)` : e?.descargado != null ? `${mb(e.descargado)} MB` : "sin bytes aún";
  const veces = e?.reanudaciones ? `, ${e.reanudaciones} reanudaciones` : "";
  const causa = quien === "kotlin-callado" ? "la app no ha dicho nada (¿en segundo plano?)" : "sigue sin llegar nada de GitHub";
  return `La descarga no avanza: ${donde}, sin bytes desde hace ${Math.round(sinBytesS)} s${veces}; ${causa}. Vuelve a intentarlo: sigue donde se quedó.`;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Lo último que dijo el actualizador interno (null si la app no lo tiene). */
export async function leerEstadoApk(puente: PuenteNativo = puenteNativo()): Promise<EstadoApkNativo | null> {
  if (!puente.disponible) return null;
  const r = await puente.llamar<unknown>(COMANDOS_APK.estado);
  if (!r.ok) return null;
  const e = normalizarEstadoApk(r.valor);
  return e && e.fase !== "sin-actualizador" ? e : null;
}

/**
 * Busca, descarga y verifica la versión nueva DENTRO de la app y abre el instalador de Android.
 * Cuenta el progreso con `onEstado`. Nunca lanza.
 */
export async function actualizarApkEnApp(o: OpcionesApk = {}): Promise<ResultadoApk> {
  const puente = o.puente ?? puenteNativo();
  const instalar = o.instalar ?? true;
  const esperar = o.esperar ?? dormir;
  const ahora = o.ahora ?? Date.now;
  const cada = o.cadaMs ?? 1000;
  const limite = o.limiteMs ?? 20 * 60_000;
  const quieto = o.quietoMs ?? 120_000;
  const sinBytes = o.sinBytesMs ?? 8 * 60_000;
  if (!puente.disponible) return { estado: "sin-actualizador", motivo: "Solo en la app de Android de StarSeed OS." };
  const pedido = await puente.llamar<unknown>(COMANDOS_APK.actualizar, { instalar });
  if (!pedido.ok) {
    return esComandoAusente(pedido.motivo) || /actualizador interno|solo en la app de android|canal de apk/i.test(pedido.motivo)
      ? { estado: "sin-actualizador", motivo: pedido.motivo }
      : { estado: "error", motivo: pedido.motivo, ultimo: null };
  }
  let ultimo = normalizarEstadoApk(pedido.valor);
  if (ultimo) o.onEstado?.(ultimo);
  let inicio = ahora();
  let cambio = inicio; // último cambio de ESTADO (incluida la hora de Kotlin: «sigo vivo»)
  let avance = inicio; // último byte nuevo o cambio de fase
  let huella = ultimo ? `${ultimo.fase}|${ultimo.t}|${ultimo.descargado}` : "";
  let bytesVistos = ultimo?.descargado ?? 0;
  let faseVista = ultimo?.fase ?? "";
  let vuelta = inicio;
  // El estado que devolvió el pedido es «buscando» (Rust); se espera a que Kotlin escriba el suyo.
  while (ahora() - inicio < limite) {
    await esperar(cada);
    // (FAC1116) Si entre dos vueltas pasó mucho más que `cada`, la página estuvo dormida (app en segundo plano, pantalla
    // apagada): ese tiempo NO es de la descarga, y no puede contar como «sin avance». Se perdona el hueco entero.
    const t0 = ahora();
    const hueco = t0 - vuelta - cada;
    vuelta = t0;
    if (hueco > Math.max(5 * cada, 15_000)) {
      cambio += hueco;
      avance += hueco;
      inicio += hueco;
    }
    const r = await puente.llamar<unknown>(COMANDOS_APK.estado);
    const e = r.ok ? normalizarEstadoApk(r.valor) : null;
    if (!e) continue;
    const h = `${e.fase}|${e.t}|${e.descargado}`;
    if (h !== huella) {
      huella = h;
      cambio = ahora();
      ultimo = e;
      o.onEstado?.(e);
      if (e.fase !== faseVista || (e.descargado ?? 0) > bytesVistos) avance = cambio;
      faseVista = e.fase;
      bytesVistos = Math.max(bytesVistos, e.descargado ?? 0);
    }
    if (e.fase === "sin-actualizador") return { estado: "sin-actualizador", motivo: e.mensaje ?? "Sin actualizador interno." };
    if (esFinal(e, instalar)) return { estado: "ok", final: e };
    // Con «lista» y la app a la vista, Kotlin abre el instalador en un instante; si no llega, se para.
    if (e.fase === "lista" || e.fase === "permiso") {
      if (ahora() - cambio > (e.fase === "lista" ? 8_000 : 10 * 60_000)) return { estado: "ok", final: e };
    } else if (ahora() - cambio > quieto) {
      return { estado: "error", motivo: motivoSinAvance(e, (ahora() - cambio) / 1000, "kotlin-callado"), ultimo: e };
    } else if (e.fase === "descargando" && ahora() - avance > sinBytes) {
      // Kotlin vive y reanuda, pero no llega nada hace rato: se deja de mirar con los números a la vista.
      return { estado: "error", motivo: motivoSinAvance(e, (ahora() - avance) / 1000, "sin-bytes"), ultimo: e };
    }
  }
  return { estado: "error", motivo: "La actualización tardó demasiado: vuelve a intentarlo más tarde.", ultimo };
}

/** Abre el instalador con el APK ya descargado y verificado (fase «lista»). */
export async function instalarApkDescargado(puente: PuenteNativo = puenteNativo()): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!puente.disponible) return { ok: false, motivo: "Solo en la app de Android de StarSeed OS." };
  const r = await puente.llamar<unknown>(COMANDOS_APK.instalar);
  return r.ok ? { ok: true } : { ok: false, motivo: r.motivo };
}
