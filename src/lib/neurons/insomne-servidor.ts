/* insomne-servidor — lee el estado de Insomnia solo en servidor (lectura).
 * Contrato: architecture/neurona-insomne.md. Nunca ejecuta pmset ni usa sudoers. */
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { estadoDesdeSesionInsomnia, type EstadoInsomne, type SesionInsomniaCruda } from "./insomne";

export const RUTA_SESION_INSOMNIA = join(homedir(), "Library", "Application Support", "Insomnia", "session.json");
export const RUTA_STATE_INSOMNIA = join(homedir(), "Library", "Application Support", "Insomnia", "state.json");

function leerJson(p: string): unknown {
  try {
    if (!existsSync(p)) return null;
    const raw = readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mezclarSesion(base: unknown, extra: unknown): SesionInsomniaCruda {
  const sesion: SesionInsomniaCruda = typeof base === "object" && base !== null ? { ...(base as Record<string, unknown>) } : {};
  if (typeof extra === "object" && extra !== null) {
    const e = extra as Record<string, unknown>;
    if (e.endsAt !== undefined && sesion.endsAt === undefined) sesion.endsAt = e.endsAt;
    if (e.startedAt !== undefined && sesion.startedAt === undefined) sesion.startedAt = e.startedAt;
    if (e.extensions !== undefined && sesion.extensions === undefined) sesion.extensions = e.extensions;
    if (e.tapaCerrada !== undefined && sesion.tapaCerrada === undefined) sesion.tapaCerrada = e.tapaCerrada;
    if (e.bateria !== undefined && sesion.bateria === undefined) sesion.bateria = e.bateria;
    if (e.cargando !== undefined && sesion.cargando === undefined) sesion.cargando = e.cargando;
    if (e.calor !== undefined && sesion.calor === undefined) sesion.calor = e.calor;
  }
  return sesion;
}

export function estadoInsomneDesdeSistema(ahora: Date | number = new Date()): EstadoInsomne {
  const plat = platform();
  if (plat !== "darwin") {
    return { activo: false, hasta: null, proveedor: "no", motivo: "sin proveedor activo" };
  }
  const sesion = mezclarSesion(leerJson(RUTA_SESION_INSOMNIA), leerJson(RUTA_STATE_INSOMNIA));
  return estadoDesdeSesionInsomnia(sesion, ahora);
}
