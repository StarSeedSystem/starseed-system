export type EstadoSeguimiento = "por-responder" | "esperando" | "resuelto";

export interface HiloLite {
  id: string;
  ultimoRemitenteId: string | null;
  ultimoMensajeAt: string | number | Date;
  ultimoEsMio?: boolean;
  miUltimoMensajeAt?: string | number | Date | null;
  enviadoPorMi?: boolean;
}

export interface ConfigSeguimiento {
  horasSinRespuesta?: number; // para pasar a por-responder
  diasEsperando?: number; // para pasar a esperando
}

export interface SeguimientoHilo {
  hiloId: string;
  estado: EstadoSeguimiento;
  horasDesdeUltimo?: number;
  diasDesdeMiUltimo?: number;
}

const HORAS_POR_RESPONDER_DEF = 24;
const DIAS_ESPERANDO_DEF = 14;

function aMs(ts: string | number | Date): number {
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "number") return ts;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return 0;
  return t;
}

function horasEntre(desde: string | number | Date, ahoraMs: number): number {
  const ms = aMs(desde);
  if (ms === 0) return 0;
  const diff = ahoraMs - ms;
  if (diff <= 0) return 0;
  return diff / (1000 * 60 * 60);
}

function diasEntre(desde: string | number | Date | null | undefined, ahoraMs: number): number {
  if (!desde) return 0;
  const ms = aMs(desde);
  if (ms === 0) return 0;
  const diff = ahoraMs - ms;
  if (diff <= 0) return 0;
  return diff / (1000 * 60 * 60 * 24);
}

function ultimoEsDeOtro(hilo: HiloLite, yo: string): boolean {
  if (typeof hilo.ultimoEsMio === "boolean") {
    return !hilo.ultimoEsMio;
  }
  if (hilo.ultimoRemitenteId === yo) return false;
  if (hilo.ultimoRemitenteId === null) return false;
  return true;
}

function yoEnvieUltimo(hilo: HiloLite): boolean {
  if (typeof hilo.ultimoEsMio === "boolean") {
    return hilo.ultimoEsMio;
  }
  if (typeof hilo.enviadoPorMi === "boolean") {
    return hilo.enviadoPorMi;
  }
  return false;
}

export function clasificarHilo(
  hilo: HiloLite,
  yo: string,
  ahora: string | number | Date,
  cfg?: ConfigSeguimiento
): EstadoSeguimiento {
  const ahoraMs = aMs(ahora);
  const hResp = typeof cfg?.horasSinRespuesta === "number" ? cfg.horasSinRespuesta : HORAS_POR_RESPONDER_DEF;
  const dEsp = typeof cfg?.diasEsperando === "number" ? cfg.diasEsperando : DIAS_ESPERANDO_DEF;

  if (ultimoEsDeOtro(hilo, yo)) {
    const h = horasEntre(hilo.ultimoMensajeAt, ahoraMs);
    if (h > hResp) {
      return "por-responder";
    }
    return "resuelto";
  }

  if (yoEnvieUltimo(hilo)) {
    const d = diasEntre(hilo.miUltimoMensajeAt || hilo.ultimoMensajeAt, ahoraMs);
    if (d > dEsp) {
      return "esperando";
    }
    return "resuelto";
  }

  return "resuelto";
}

export function resumenSeguimiento(hilos: HiloLite[]): Record<EstadoSeguimiento, number> {
  const res: Record<EstadoSeguimiento, number> = {
    "por-responder": 0,
    esperando: 0,
    resuelto: 0,
  };
  for (const h of hilos) {
    // Sin yo/ahora pasamos a heurística: si ultimo no es mío conocido? pero sin yo, mejor clasificar por flags
    // pero requerimos firma; usamos ultimoEsMio/enviadoPorMi si existen
    if (typeof h.ultimoEsMio === "boolean") {
      if (!h.ultimoEsMio) {
        res["por-responder"]++;
        continue;
      }
      if (h.ultimoEsMio) {
        res.esperando++;
        continue;
      }
    }
    res.resuelto++;
  }
  return res;
}
