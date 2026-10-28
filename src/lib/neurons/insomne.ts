/* insomne — ¿puede esta neurona seguir sirviendo con la pantalla cerrada? (puro).
 * Contrato: architecture/neurona-insomne.md. El OS LEE el estado de Insomnia; nunca
 * ejecuta `pmset` ni usa su regla de sudoers. */
export type PlataformaInsomne = "macos" | "linux" | "windows" | "servidor" | "web" | "pwa" | "android" | "ios";
export type ProveedorInsomne = "insomnia" | "caffeinate" | "systemd-inhibit" | "powercfg" | "siempre" | "wake-lock" | "no";
export type CalorInsomne = "normal" | "serio" | "critico";
export interface CapacidadInsomne {
  proveedor: ProveedorInsomne; disponible: boolean; requiereCorriente?: boolean; soloVisible?: boolean; motivo: string;
}
export interface PoliticaInsomne {
  agentes: boolean; programados: boolean; malla: boolean; servidorCerebro: boolean; biblioteca: boolean;
}
export interface EstadoInsomne {
  activo: boolean; hasta: string | null; tapaCerrada?: boolean; proveedor: ProveedorInsomne;
  motivo: string; bateria?: number; cargando?: boolean; calor?: CalorInsomne;
}
export const MINUTOS_AVISO_FIN = 15;
export const BATERIA_MINIMA = 15;

export const POLITICA_INSOMNE_DEFECTO: PoliticaInsomne = {
  agentes: true, programados: true, malla: true, servidorCerebro: true, biblioteca: true,
};

export function politicaInsomne(parcial: Partial<PoliticaInsomne> = {}): PoliticaInsomne {
  return { ...POLITICA_INSOMNE_DEFECTO, ...parcial };
}

function normalizar(v: string | undefined): string {
  return String(v ?? "").trim().toLowerCase();
}

function versionMayor(version: string): number | null {
  const m = /(\d+)/.exec(version);
  return m ? Number(m[1]) : null;
}

export function capacidadInsomne(plataforma: string, versionSO?: string): CapacidadInsomne {
  const p = normalizar(plataforma);
  const version = normalizar(versionSO);
  if (p === "servidor" || p === "server" || p === "vps") {
    return { proveedor: "siempre", disponible: true, motivo: "un servidor ya está siempre encendido" };
  }
  if (p.startsWith("macos") || p === "mac" || p === "darwin") {
    const mayor = versionMayor(version);
    const arm = /arm64|aarch64|apple[ -]?silicon/.test(`${p} ${version}`);
    if (mayor !== null && mayor >= 26 && arm) {
      return { proveedor: "insomnia", disponible: true, motivo: "Insomnia mantiene la Mac despierta con la tapa cerrada" };
    }
    return {
      proveedor: "caffeinate",
      disponible: false,
      requiereCorriente: true,
      motivo: "macOS anterior o sin Apple Silicon: solo con corriente y pantalla externa",
    };
  }
  if (p === "linux") {
    return { proveedor: "systemd-inhibit", disponible: true, motivo: "systemd-inhibit bloquea tapa, suspensión e inactividad" };
  }
  if (p === "windows") {
    return { proveedor: "powercfg", disponible: true, motivo: "powercfg deja la acción de la tapa en «no hacer nada»" };
  }
  if (p === "web" || p === "pwa" || p === "navegador") {
    return { proveedor: "wake-lock", disponible: false, soloVisible: true, motivo: "Screen Wake Lock solo mantiene despierta la pestaña visible" };
  }
  if (p === "android" || p === "ios") {
    return { proveedor: "no", disponible: false, motivo: "el sistema móvil no permite seguir con la pantalla apagada" };
  }
  return { proveedor: "no", disponible: false, motivo: `plataforma no reconocida: ${plataforma}` };
}

export interface SesionInsomniaCruda {
  startedAt?: unknown; endsAt?: unknown; extensions?: unknown; tapaCerrada?: unknown;
  bateria?: unknown; cargando?: unknown; calor?: unknown;
}

function fecha(v: unknown): { iso: string; ms: number } | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : { iso: v.trim(), ms };
}

function instante(ahora: Date | number): number {
  return ahora instanceof Date ? ahora.getTime() : ahora;
}

function extensiones(v: unknown): Array<{ iso: string; ms: number }> {
  const lista = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return lista.map(fecha).filter((f): f is { iso: string; ms: number } => f !== null);
}

export function estadoDesdeSesionInsomnia(json: SesionInsomniaCruda, ahora: Date | number): EstadoInsomne {
  const t = instante(ahora);
  const fin = fecha(json.endsAt);
  const todos = [...(fin ? [fin] : []), ...extensiones(json.extensions)];
  const ultimo = todos.reduce<{ iso: string; ms: number } | null>((mayor, f) => (!mayor || f.ms > mayor.ms ? f : mayor), null);
  const bateria = typeof json.bateria === "number" && Number.isFinite(json.bateria) ? json.bateria : undefined;
  const calor: CalorInsomne | undefined = json.calor === "normal" || json.calor === "serio" || json.calor === "critico" ? json.calor : undefined;
  const extras = {
    ...(typeof json.tapaCerrada === "boolean" ? { tapaCerrada: json.tapaCerrada } : {}),
    ...(bateria !== undefined ? { bateria } : {}),
    ...(typeof json.cargando === "boolean" ? { cargando: json.cargando } : {}),
    ...(calor !== undefined ? { calor } : {}),
  };
  if (!ultimo || !Number.isFinite(t)) {
    return { activo: false, hasta: null, proveedor: "no", motivo: "sin sesión de Insomnia legible", ...extras };
  }
  const activo = t < ultimo.ms;
  return {
    activo, hasta: ultimo.iso, proveedor: "insomnia",
    motivo: activo ? "sesión de Insomnia activa" : "sesión de Insomnia vencida", ...extras,
  };
}

export function debeSoltarTrabajo(estado: EstadoInsomne, ahora: Date | number): boolean {
  const t = instante(ahora);
  if (!Number.isFinite(t) || !estado.activo || estado.calor === "critico") return true;
  if (typeof estado.bateria === "number" && estado.bateria < BATERIA_MINIMA && !estado.cargando) return true;
  const fin = fecha(estado.hasta);
  return fin !== null && fin.ms - t < MINUTOS_AVISO_FIN * 60_000;
}
