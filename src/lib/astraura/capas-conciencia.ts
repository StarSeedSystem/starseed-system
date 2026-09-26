/**
 * Capas de conciencia de Astraura 1.58 (Ola 365 · 2026-09-26) — módulo PURO.
 *
 * Alex: «un switch y un indicador de si está activo el modo 1.58 bit ya sea local o mesh o en
 * la nube o todas activas con las capas de conciencia… switches de encendido y apagado de
 * cada capa o de ese modelo en general para entonces usar el enrutador automático con las
 * APIs y modelos gratuitos… todas las capas activas por predeterminado y un nivelador de uso
 * preferencial al enrutador, a alguna API o modelo específico o al sistema de múltiples capas
 * de conciencia local y colectiva de Astraura 1.58 con el aprendizaje continuo».
 *
 * Las preferencias viven como campos de NIVEL SUPERIOR de `IntelligenceSettings`
 * (`starseed.astraura.intelligence.v1`, que ya se sincroniza con la cuenta). Cada booleano se
 * lee como `!== false`: lo no guardado cuenta como ENCENDIDO, sin migrar datos de nadie.
 */
export type CapaConciencia = "local" | "mesh" | "nube" | "colectiva";

export const CAPAS: readonly CapaConciencia[] = ["local", "mesh", "nube", "colectiva"];

export interface EspecificoCapas {
  fuente: string;
  modelo?: string;
}

export interface PreferenciaCapas {
  activo: boolean;
  capas: Record<CapaConciencia, boolean>;
  nivelador: number;
  especifico: EspecificoCapas | null;
}

export const NIVELADOR_DEFECTO = 80;

export const PREFERENCIA_CAPAS_DEFECTO: PreferenciaCapas = {
  activo: true,
  capas: { local: true, mesh: true, nube: true, colectiva: true },
  nivelador: NIVELADOR_DEFECTO,
  especifico: null,
};

export interface CamposCapas {
  astraura158Activo?: boolean;
  capa158Local?: boolean;
  capa158Mesh?: boolean;
  capa158Nube?: boolean;
  capa158Colectiva?: boolean;
  nivelador158?: number;
  especifico158?: EspecificoCapas | null;
}

export function leerPreferenciaCapas(campos?: CamposCapas | null): PreferenciaCapas {
  const c = campos ?? {};
  const rawNivelador = c.nivelador158;
  let nivelador = NIVELADOR_DEFECTO;
  if (typeof rawNivelador === "number" && Number.isFinite(rawNivelador)) {
    nivelador = Math.round(Math.max(0, Math.min(100, rawNivelador)));
  }
  const esp = c.especifico158;
  const especifico =
    esp != null && typeof esp.fuente === "string" && esp.fuente.length > 0
      ? { fuente: esp.fuente, modelo: esp.modelo }
      : null;
  return {
    activo: c.astraura158Activo !== false,
    capas: {
      local: c.capa158Local !== false,
      mesh: c.capa158Mesh !== false,
      nube: c.capa158Nube !== false,
      colectiva: c.capa158Colectiva !== false,
    },
    nivelador,
    especifico,
  };
}

/** Clave donde `IntelligenceSettings` guarda (y sincroniza) estos campos: la misma que
 * `INTELLIGENCE_KEY` del enrutador (una prueba lo comprueba). */
export const CLAVE_INTELIGENCIA = "starseed.astraura.intelligence.v1";

/**
 * Preferencia GUARDADA, leída al momento y sin importar el enrutador: la usan módulos que el
 * propio enrutador importa (el proveedor 1.58) y la LAN, que tienen que ver el interruptor en
 * cuanto cambia. Sin almacenamiento o con datos rotos, los valores por defecto (todo
 * encendido), igual que el enrutador.
 */
export function preferenciaCapasGuardada(almacen?: Pick<Storage, "getItem"> | null): PreferenciaCapas {
  try {
    const a = almacen === undefined ? (typeof window !== "undefined" ? window.localStorage : null) : almacen;
    const raw = a?.getItem(CLAVE_INTELIGENCIA);
    const datos: unknown = raw ? JSON.parse(raw) : null;
    return leerPreferenciaCapas(datos && typeof datos === "object" ? (datos as CamposCapas) : null);
  } catch {
    return leerPreferenciaCapas(null);
  }
}

export function aCampos(p: PreferenciaCapas): CamposCapas {
  return {
    astraura158Activo: p.activo,
    capa158Local: p.capas.local,
    capa158Mesh: p.capas.mesh,
    capa158Nube: p.capas.nube,
    capa158Colectiva: p.capas.colectiva,
    nivelador158: p.nivelador,
    especifico158: p.especifico,
  };
}

export function fuentesApagadas(p: PreferenciaCapas): string[] {
  const resultado: string[] = [];
  if (!p.activo || !p.capas.local) resultado.push("astraura-158-local");
  if (!p.activo || !p.capas.nube) resultado.push("astraura-158-nube");
  return resultado;
}

export function destinoNivelador(n: number): "enrutador" | "especifico" | "capas" {
  if (n < 34) return "enrutador";
  if (n < 67) return "especifico";
  return "capas";
}

/**
 * Sesgo (puntos de ranking) que el nivelador suma a un candidato.
 *
 * Es RELATIVO a la posición por defecto (80): con el nivelador sin tocar no cambia nada del
 * enrutado de siempre (1.58 primero por su propia prioridad, la dificultad manda en lo
 * difícil). Subirlo empuja hacia las capas 1.58 (hasta +5 a 100), bajarlo hacia el enrutador
 * libre (1.58 hasta −19, el resto hasta +10 a 0); el modelo específico, si hay uno, gana
 * cerca del centro (hasta +14 en 50). En tareas difíciles o de visión (`dificil`) el
 * empujón POSITIVO a 1.58 no se aplica: el modelo 2B no debe ganar lo que no sabe hacer.
 */
export function sesgoNivelador(
  p: PreferenciaCapas,
  fuente: string,
  modelo?: string,
  opciones: { dificil?: boolean } = {},
): number {
  const n = p.nivelador;
  if (!p.activo) return 0;
  if (fuente.startsWith("astraura-158")) {
    const d = Math.round(((n - NIVELADOR_DEFECTO) / 50) * 12);
    return opciones.dificil && d > 0 ? 0 : d;
  }
  if (
    p.especifico != null &&
    fuente === p.especifico.fuente &&
    (!p.especifico.modelo || modelo === p.especifico.modelo)
  ) {
    return Math.round((1 - Math.abs(n - 50) / 50) * 14);
  }
  return Math.round(((NIVELADOR_DEFECTO - n) / 50) * 6);
}

export type EstadoCapa = "apagada" | "sin-senal" | "activa" | "sincronizada";

export interface SaludCapas {
  local?: boolean | null;
  nube?: boolean | null;
  vecinosMesh?: number | null;
  colectivaConectada?: boolean | null;
  chatUsa158?: boolean | null;
}

export function estadoCapas(
  p: PreferenciaCapas,
  s: SaludCapas,
): Record<CapaConciencia, EstadoCapa> {
  const r = {} as Record<CapaConciencia, EstadoCapa>;
  for (const capa of CAPAS) {
    if (!p.activo || !p.capas[capa]) {
      r[capa] = "apagada";
      continue;
    }
    if (capa === "local") {
      const v = s.local;
      r.local = v == null ? "sin-senal" : v ? (s.chatUsa158 ? "sincronizada" : "activa") : "sin-senal";
    } else if (capa === "nube") {
      const v = s.nube;
      r.nube = v == null ? "sin-senal" : v ? (s.chatUsa158 ? "sincronizada" : "activa") : "sin-senal";
    } else if (capa === "mesh") {
      const v = s.vecinosMesh;
      r.mesh = v == null ? "sin-senal" : v > 0 ? "sincronizada" : v === 0 ? "activa" : "sin-senal";
    } else {
      const v = s.colectivaConectada;
      r.colectiva = v == null ? "sin-senal" : v ? "sincronizada" : "sin-senal";
    }
  }
  return r;
}

export interface ResumenCapas {
  modo: "capas" | "enrutador";
  encendidas: number;
  sincronizadas: number;
  etiqueta: string;
}

export function resumenCapas(p: PreferenciaCapas, s: SaludCapas): ResumenCapas {
  if (!p.activo) {
    return { modo: "enrutador", encendidas: 0, sincronizadas: 0, etiqueta: "Enrutador libre" };
  }
  const estados = estadoCapas(p, s);
  let encendidas = 0;
  let sincronizadas = 0;
  for (const capa of CAPAS) {
    const e = estados[capa];
    if (e !== "apagada") encendidas++;
    if (e === "sincronizada") sincronizadas++;
  }
  return {
    modo: "capas",
    encendidas,
    sincronizadas,
    etiqueta: `1.58 · ${encendidas}/4 capas`,
  };
}

export const ETIQUETA_CAPA: Record<CapaConciencia, { nombre: string; descripcion: string }> = {
  local: {
    nombre: "Local",
    descripcion: "BitNet 1.58 en esta neurona, sin conexión y sin coste",
  },
  mesh: {
    nombre: "Mesh",
    descripcion: "Otras neuronas de la red mesh y la LAN",
  },
  nube: {
    nombre: "Nube",
    descripcion: "El backend 1.58 publicado para la web y la app",
  },
  colectiva: {
    nombre: "Colectiva",
    descripcion: "Memoria y aprendizaje continuo compartidos (pronto también en Oracle)",
  },
};

export const ETIQUETA_ESTADO: Record<EstadoCapa, string> = {
  apagada: "Apagada",
  "sin-senal": "Sin señal",
  activa: "Activa",
  sincronizada: "Sincronizada con el chat",
};
