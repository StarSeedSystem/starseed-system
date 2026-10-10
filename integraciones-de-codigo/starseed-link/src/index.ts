/**
 * StarSeed Link — el kit para vincular CUALQUIER app con StarSeed OS (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/vinculo-apps-starseed-link.md` · Guía: `../README.md`.
 * Sin dependencias: TypeScript estándar + APIs del navegador (fetch, WebCrypto, WebRTC,
 * BroadcastChannel). Vale para web, PWA, Capacitor, Electron y Tauri. Usa el cliente de Supabase
 * que la app ya tiene (`@supabase/supabase-js` 2.x), creado con lo que diga `config()`.
 *
 *   config()               → a qué OS y base de datos se conecta (nunca fijada en el código)
 *   entrar()               → la misma cuenta de StarSeed OS (correo o @usuario)
 *   presencia()            → la app como MEDIO de su neurona, en vivo
 *   estacion.publicar()    → transmitir en directo en una estación pública o privada del OS
 *   estacion.seguir()      → seguir una estación por su enlace (el mismo que en el OS)
 *   relojComun()           → el reloj común de las estaciones (NTP sobre el canal)
 *   transporte.enviar()    → mensajes entre los medios de la cuenta (local, pestañas, internet)
 *   emparejar.*            → enlace directo sin internet, por código o QR (compatible con el OS)
 *   puenteOS()             → el lado de la app del puente postMessage cuando se abre dentro del OS
 *   validarManifiesto()    → lo que la app declara para registrarse en PoliGenesis/Genesis
 */

export * from "./config";
export * from "./cuenta";
export * from "./manifiesto";
export * from "./presencia";
export * from "./puente-os";
export * from "./supabase";
export {
  crearTransporte,
  temaCuenta,
  tokenDeCuenta,
  esSobreAcuse,
  esSobreMensaje,
  type Camino,
  type MensajeEntrante,
  type ResultadoEnvio,
  type SobreAcuse,
  type SobreMensaje,
  type Transporte,
} from "./transporte";
export {
  RelojComun,
  estimarDesfase,
  muestraNtp,
  programarSondeo,
  type EstadoReloj,
  type EstimacionReloj,
  type MuestraReloj,
} from "./reloj";
export {
  entonacionDesdeOsciladores,
  osciladoresDesdeEntonacion,
  visualDesdeParametros,
  parametrosDesdeVisual,
  enlaceDeSesion,
  leerEnlaceSesion,
  posicionEn,
  valoresOscilador,
  inicioEnFase,
  sanearParametros,
  FUENTES_TRANSMISION,
  SUFIJO_LISTA,
  type EntonacionParam,
  type OsciladorApp,
  type OsciladorParam,
  type ParametrosSesion,
  type FichaSesion,
  type FaseSesion,
  type FuenteTransmision,
  type ValorVisual,
} from "./modelo";
export { SesionEnVivo, type CanalEstacion, type FotoSesion } from "./sesion";
export {
  iniciarEmparejamiento,
  responderEmparejamiento,
  enlacesLocales,
  alCambiarEnlacesLocales,
  soportaEmparejado,
  type EnlaceLocal,
  type Emparejamiento,
} from "./emparejar";

import * as estacionMod from "./estacion";
import { RelojComun, type OpcionesReloj } from "./reloj";

/** `estacion.publicar()`, `estacion.seguir()`, `estacion.retomar()`, `estacion.directorio()`… */
export const estacion = {
  publicar: estacionMod.publicar,
  seguir: estacionMod.seguir,
  retomar: estacionMod.retomar,
  directorio: estacionMod.directorio,
  misEstaciones: estacionMod.misEstaciones,
};
export type { EstacionViva, FotoEstacion, DatosPublicar, OpcionesEstacion, FilaDirectorio, AccionEstacion } from "./estacion";

/** `relojComun()`: un reloj común nuevo (el de una estación ya viene dentro de su sesión). */
export function relojComun(op: OpcionesReloj = {}): RelojComun {
  return new RelojComun(op);
}

/**
 * El motivo de un resultado `{ ok: false, motivo }` del kit, o `null` si salió bien. Sirve también
 * en apps que compilan SIN «strict» (allí `if (!r.ok) r.motivo` no estrecha el tipo y no compila).
 */
export function motivoDe(r: { ok: boolean }): string | null {
  if (r.ok) return null;
  const m = (r as { motivo?: unknown }).motivo;
  return typeof m === "string" && m ? m : "No se pudo.";
}

/** Versión del kit (sube cuando cambia el protocolo o la API). */
export const VERSION_KIT = "1.0.1";
