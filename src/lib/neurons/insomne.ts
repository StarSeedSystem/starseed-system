"use client";

/*
 * insomne — «siempre disponible con la pantalla cerrada» (2026-10-27 · INS1027).
 * Mientras dura la sesión de Insomnia (u otro proveedor), la neurona sigue sirviendo con la
 * tapa cerrada: agentes, procesos programados, malla P2P, servidor de su cerebro y Biblioteca.
 * El OS SOLO LEE el estado de Insomnia: nunca ejecuta `pmset` ni usa su regla de sudoers
 * (la sesión la empieza la persona en su barra de menús). PURO: la lectura de disco la hace
 * `insomne-servidor.ts`, tarea aparte. Contrato: architecture/neurona-insomne.md.
 */

export type PlataformaInsomne = "macos" | "linux" | "windows" | "servidor" | "web" | "pwa" | "android" | "ios";
export type ProveedorInsomne = "insomnia" | "caffeinate" | "systemd-inhibit" | "powercfg" | "siempre" | "wake-lock" | "no";
/** Calor del aparato: Insomnia baja el consumo o termina la sesión según lo serio. */
export type CalorInsomne = "ok" | "serio" | "critico";

/** Estado de una neurona insomne (lo que viaja en la presencia y enseña la ficha). */
export interface EstadoInsomne {
  /** La sesión está viva y la neurona sigue disponible con la pantalla cerrada. */
  activo: boolean;
  /** Hora de fin de la sesión (ISO 8601); presente solo si está activo. */
  hasta?: string;
  /** La tapa/pantalla está cerrada (sale de `state.json` de Insomnia). */
  tapaCerrada?: boolean;
  proveedor: ProveedorInsomne;
  motivo: string;
  bateria?: { porcentaje: number; cargando: boolean };
  calor?: CalorInsomne;
}

/** Qué sigue funcionando mientras la neurona está insomne (todo encendido por defecto). */
export interface PoliticaInsomne {
  agentes: boolean; // lo que escriben los agentes del enjambre aquí
  programados: boolean; // rutinas, directores, vigías
  malla: boolean; // su parte de la malla P2P: relé, faros, réplicas
  servidorCerebro: boolean;
  biblioteca: boolean;
}

export const politicaInsomne: PoliticaInsomne = { agentes: true, programados: true, malla: true, servidorCerebro: true, biblioteca: true };

/** Lo que cada plataforma puede y con qué (§2 del contrato; puro). */
export interface CapacidadInsomne {
  plataforma: PlataformaInsomne;
  proveedor: ProveedorInsomne;
  /** Puede seguir sirviendo con la tapa/pantalla cerrada. */
  conPantallaCerrada: boolean;
  /** Solo mientras esté enchufada (caffeinate -s necesita corriente y pantalla externa). */
  soloConCorriente: boolean;
  /** Wake Lock: solo con la pestaña a la vista; se dice tal cual. */
  soloVisible: boolean;
  motivo: string;
}

/** ¿Es macOS 26 (o más) en Apple Silicon? La única combinación con Insomnia. */
export function esMacInsomnie(versionSO: string): boolean {
  const major = /^\s*(\d+)/.exec(versionSO);
  const arm = /arm|aarch64|\bM[1-9]\b/i.test(versionSO);
  return !!major && Number(major[1]) >= 26 && arm;
}

/** Proveedor insomne de una plataforma (§2 del contrato; puro y sin finger: lo que no puede, se dice). */
export function capacidadInsomne(plataforma: PlataformaInsomne, versionSO: string = ""): CapacidadInsomne {
  switch (plataforma) {
    case "macos":
      if (esMacInsomnie(versionSO)) {
        return { plataforma, proveedor: "insomnia", conPantallaCerrada: true, soloConCorriente: false, soloVisible: false, motivo: "Insomnia mantiene su sesión, la persona la empieza en su barra de menús; el OS solo lee su estado" };
      }
      return { plataforma, proveedor: "caffeinate", conPantallaCerrada: true, soloConCorriente: true, soloVisible: false, motivo: "caffeinate -s del servicio com.starseed.despierto: solo con corriente y pantalla externa" };
    case "linux":
      return { plataforma, proveedor: "systemd-inhibit", conPantallaCerrada: true, soloConCorriente: false, soloVisible: false, motivo: "systemd-inhibit --what=handle-lid-switch:sleep:idle mientras dure la sesión" };
    case "windows":
      return { plataforma, proveedor: "powercfg", conPantallaCerrada: true, soloConCorriente: false, soloVisible: false, motivo: "acción de la tapa «no hacer nada» por powercfg mientras dure la sesión (y se restaura)" };
    case "servidor":
      return { plataforma, proveedor: "siempre", conPantallaCerrada: true, soloConCorriente: false, soloVisible: false, motivo: "no aplica: ya es siempre encendido" };
    case "web":
    case "pwa":
      return { plataforma, proveedor: "wake-lock", conPantallaCerrada: false, soloConCorriente: false, soloVisible: true, motivo: "Screen Wake Lock API: solo con la pestaña a la vista" };
    case "android":
    case "ios":
      return { plataforma, proveedor: "no", conPantallaCerrada: false, soloConCorriente: false, soloVisible: false, motivo: "no compatible: el sistema móvil decide por su cuenta" };
  }
}

/** Si quedan menos de 15 min, una batería por debajo del 15 % sin cargar, o calor crítico: soltar con relevo. */
export const MINUTOS_SOLTEAR = 15;
export const BATERIA_SOLTEAR = 15;

/** ¿Debe esta neurona devolver el trabajo que llevaba (relevo de la colmena)? Puro; un servidor «siempre» nunca suelta. */
export function debeSoltarTrabajo(estado: EstadoInsomne, ahora: number = Date.now()): boolean {
  if (estado.proveedor === "siempre") return false;
  if (!estado.activo) return true;
  const fin = Date.parse(estado.hasta ?? "");
  if (!Number.isFinite(fin)) return true;
  if (fin - ahora < MINUTOS_SOLTEAR * 60_000) return true;
  if (estado.bateria && !estado.bateria.cargando && estado.bateria.porcentaje < BATERIA_SOLTEAR) return true;
  return estado.calor === "critico";
}

/** La sesión cruda que Insomnia deja en `session.json` (`startedAt`, `endsAt` en ISO 8601, `extensions`). */
export interface SesionInsomniaJson {
  startedAt?: unknown;
  endsAt?: unknown;
  extensions?: unknown;
}

/** De la sesión cruda de Insomnia a nuestro `EstadoInsomne`. Puro; sesión vencida o ilegible → inactiva. */
export function estadoDesdeSesionInsomnia(json: unknown, ahora: number): EstadoInsomne {
  const sesion = (typeof json === "object" && json !== null ? json : {}) as Partial<SesionInsomniaJson>;
  const fin = typeof sesion.endsAt === "string" ? Date.parse(sesion.endsAt) : NaN;
  if (!Number.isFinite(fin)) {
    return { activo: false, proveedor: "insomnia", motivo: "no se pudo leer la sesión de Insomnia (sin endsAt legible)" };
  }
  if (fin <= ahora) {
    return { activo: false, proveedor: "insomnia", motivo: "la sesión de Insomnia terminó: devolver el trabajo con relevo" };
  }
  return {
    activo: true,
    proveedor: "insomnia",
    hasta: new Date(fin).toISOString(),
    motivo: typeof sesion.startedAt === "string" ? `sesión de Insomnia desde ${sesion.startedAt}` : "sesión de Insomnia activa",
  };
}
