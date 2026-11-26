/**
 * registro-mapa — el Mapa de señales deja UNA línea en el registro de enlaces por cada CAMBIO de estado (AUD1117).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Sirve para saber, al leer `enlaces.log`, por qué el mapa no enseña lo que debería. Nunca anota
 * posición, nombres ni contenido: solo el estado y, cuando lo hay, un código de motivo.
 *   mapa · canal-posicion · union=unido|rechazado motivo=<código>
 *   mapa · ubicacion · permiso=concedido|denegado
 *   mapa · marcas · total=<n> colocadas=<m>
 * Las líneas se calculan aparte para poder probarlas sin React ni registro.
 */

import type { TipoEventoEnlace } from "@/lib/malla/registro-enlace-ble";

export type UnionCanalRegistro = "sin-intentar" | "uniendo" | "unido" | "rechazado";
export type PermisoRegistro = "concedido" | "denegado" | "por-pedir" | "desconocido";

/** Lo que el mapa ve en un instante; solo lo que se anota. */
export interface FotoMapa {
  union: UnionCanalRegistro;
  motivo: string | null;
  permiso: PermisoRegistro;
  total: number;
  colocadas: number;
}

const SEP = " · ";
const RE_CANAL = /^mapa · canal-posicion · (?:union=unido|union=rechazado motivo=[a-z]+(?:-[a-z]+)*)$/;
const RE_UBICACION = /^mapa · ubicacion · permiso=(?:concedido|denegado)$/;
const RE_MARCAS = /^mapa · marcas · total=(?:0|[1-9]\d*) colocadas=(?:0|[1-9]\d*)$/;

function entero(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/** Solo las tres formas acordadas llegan al registro: ni texto libre ni coordenadas ni nombres. Pura. */
export function esLineaDeMapa(linea: string): boolean {
  return typeof linea === "string" && (RE_CANAL.test(linea) || RE_UBICACION.test(linea) || RE_MARCAS.test(linea));
}

/** Un motivo legible se reduce a un código corto: el texto puede traer uid, coordenadas o nombres. */
export function codigoMotivoCanal(motivo: string | null | undefined): string {
  const t = String(motivo ?? "").toLowerCase();
  if (!t.trim()) return "sin-motivo";
  if (t.includes("sin sesión") || t.includes("sin sesion") || t.includes("no hay sesión") || t.includes("no hay sesion")) return "sin-sesion";
  if (t.includes("no hay conexión") || t.includes("no hay conexion") || t.includes("sin red")) return "sin-red";
  if (t.includes("migración") || t.includes("migracion")) return "sin-migracion";
  if (t.includes("no respondió") || t.includes("no respondio") || t.includes("a tiempo")) return "sin-respuesta";
  if (t.includes("se cerró") || t.includes("se cerro")) return "cerrado";
  if (t.includes("rechaz")) return "rechazado";
  return "otro";
}

export function lineaCanalPosicion(union: "unido" | "rechazado", motivo?: string | null): string {
  return union === "unido"
    ? `mapa${SEP}canal-posicion${SEP}union=unido`
    : `mapa${SEP}canal-posicion${SEP}union=rechazado motivo=${codigoMotivoCanal(motivo)}`;
}

export function lineaUbicacion(permiso: "concedido" | "denegado"): string {
  return `mapa${SEP}ubicacion${SEP}permiso=${permiso}`;
}

export function lineaMarcas(total: number, colocadas: number): string {
  return `mapa${SEP}marcas${SEP}total=${entero(total)} colocadas=${entero(colocadas)}`;
}

/** Las líneas de lo que cambió entre dos fotos (la primera, con `antes = null`, deja la huella inicial). */
export function lineasDeCambio(antes: FotoMapa | null, ahora: FotoMapa): string[] {
  const lineas: string[] = [];
  const canal = lineaDeCanal(antes, ahora);
  if (canal) lineas.push(canal);
  const permiso = lineaDePermiso(antes, ahora);
  if (permiso) lineas.push(permiso);
  if (!antes || entero(antes.total) !== entero(ahora.total) || entero(antes.colocadas) !== entero(ahora.colocadas)) {
    lineas.push(lineaMarcas(ahora.total, ahora.colocadas));
  }
  return lineas;
}

function lineaDeCanal(antes: FotoMapa | null, ahora: FotoMapa): string | null {
  if (ahora.union !== "unido" && ahora.union !== "rechazado") return null;
  if (!antes || antes.union !== ahora.union) return lineaCanalPosicion(ahora.union, ahora.motivo);
  if (ahora.union === "rechazado" && codigoMotivoCanal(antes.motivo) !== codigoMotivoCanal(ahora.motivo)) {
    return lineaCanalPosicion("rechazado", ahora.motivo);
  }
  return null;
}

function lineaDePermiso(antes: FotoMapa | null, ahora: FotoMapa): string | null {
  if (ahora.permiso !== "concedido" && ahora.permiso !== "denegado") return null;
  if (!antes || antes.permiso !== ahora.permiso) return lineaUbicacion(ahora.permiso);
  return null;
}

/** Escribe la línea en el registro de enlaces (`enlaces.log` en la app nativa). Nunca lanza. */
export function anotarMapa(linea: string): void {
  if (typeof window === "undefined" || !esLineaDeMapa(linea)) return;
  void import("@/lib/malla/bluetooth-directo-motor")
    .then(async (m) => {
      const red = m.bluetoothDirectoActivo();
      if (red) {
        red.registro().anotar("mapa" as TipoEventoEnlace, null, linea);
        return;
      }
      // Sin motor BLE en marcha el registro sigue siendo el archivo nativo; en la web no hay registro y se calla.
      const { puenteNativo } = await import("@/lib/nativa/puente");
      await puenteNativo().llamar("ble_registro_anexar", { lineas: [linea] });
    })
    .catch(() => undefined);
}
