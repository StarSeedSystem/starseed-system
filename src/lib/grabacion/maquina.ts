/**
 * Estados de la grabadora (reductor puro, sin DOM ni temporizadores).
 * ─────────────────────────────────────────────────────────────────────────────
 *   inactiva ─PEDIR→ preparando ─PERMISO_OK→ cuenta-atras ─EMPEZAR→ grabando ⇄ pausada
 *                       │  └SIN_PERMISO→ inactiva (con aviso)             │       │
 *                       └FALLO→ error                       PARAR (desde grabando o pausada)
 *                                                                          ↓
 *                                       lista ←LISTO─ procesando ←─────────┘
 *   lista/error ─DESCARTAR→ inactiva · lista/error/inactiva ─PEDIR→ preparando
 *
 * Una transición que no corresponde devuelve EL MISMO objeto (así `useSyncExternalStore` no
 * vuelve a pintar y las pruebas pueden comprobar con `toBe`). La duración se calcula aparte
 * (`duracionMs`) a partir de un reloj, para que pintar el cronómetro no cambie el estado.
 */

import {
  INSTANTANEA_INICIAL,
  type Instantanea,
  type ResultadoGrabacion,
  type SuperficieGrabada,
} from "./tipos";

export type EventoGrabadora =
  | { tipo: "PEDIR" }
  | {
      tipo: "PERMISO_OK";
      cuentaAtras: number;
      superficie: SuperficieGrabada;
      conMicrofono: boolean;
      conSonidoSistema: boolean;
      conCamara: boolean;
      mimeType: string | null;
      avisos: string[];
    }
  | { tipo: "SIN_PERMISO"; aviso: string }
  | { tipo: "FALLO"; mensaje: string }
  | { tipo: "TICK_CUENTA" }
  | { tipo: "EMPEZAR"; ahora: number }
  | { tipo: "PAUSAR"; ahora: number }
  | { tipo: "REANUDAR"; ahora: number }
  | { tipo: "PARAR"; ahora: number }
  | { tipo: "BYTES"; bytes: number }
  | { tipo: "AVISO"; aviso: string }
  | { tipo: "LISTO"; resultado: ResultadoGrabacion }
  | { tipo: "CAPTURA"; captura: ResultadoGrabacion }
  | { tipo: "CANCELAR" }
  | { tipo: "DESCARTAR" }
  | { tipo: "DESCARTAR_CAPTURA" };

/** Fases en las que ya hay una sesión viva (con recursos que liberar). */
export const FASES_ACTIVAS = ["preparando", "cuenta-atras", "grabando", "pausada", "procesando"] as const;

export function estaOcupada(s: Pick<Instantanea, "fase">): boolean {
  return (FASES_ACTIVAS as readonly string[]).includes(s.fase);
}

export function estaGrabando(s: Pick<Instantanea, "fase">): boolean {
  return s.fase === "grabando" || s.fase === "pausada";
}

/** Duración de lo grabado, sin contar las pausas. */
export function duracionMs(s: Pick<Instantanea, "fase" | "acumuladoMs" | "tramoDesde">, ahora: number): number {
  const enCurso = s.fase === "grabando" && s.tramoDesde !== null ? Math.max(0, ahora - s.tramoDesde) : 0;
  return s.acumuladoMs + enCurso;
}

export function reducir(s: Instantanea, ev: EventoGrabadora): Instantanea {
  switch (ev.tipo) {
    case "PEDIR":
      if (s.fase !== "inactiva" && s.fase !== "lista" && s.fase !== "error") return s;
      // Se conserva la captura de pantalla (es independiente); el vídeo anterior se descarta aquí.
      return { ...INSTANTANEA_INICIAL, fase: "preparando", captura: s.captura };

    case "PERMISO_OK":
      if (s.fase !== "preparando") return s;
      return {
        ...s,
        fase: "cuenta-atras",
        cuenta: Math.max(0, Math.floor(ev.cuentaAtras)),
        superficie: ev.superficie,
        conMicrofono: ev.conMicrofono,
        conSonidoSistema: ev.conSonidoSistema,
        conCamara: ev.conCamara,
        mimeType: ev.mimeType,
        avisos: ev.avisos,
      };

    case "SIN_PERMISO":
      if (s.fase !== "preparando") return s;
      return { ...INSTANTANEA_INICIAL, captura: s.captura, avisos: [ev.aviso] };

    case "FALLO":
      // Un fallo puede llegar desde cualquier fase viva (error del grabador a mitad de grabación).
      if (s.fase === "inactiva" || s.fase === "lista") return s;
      return { ...s, fase: "error", error: ev.mensaje, tramoDesde: null, cuenta: 0 };

    case "TICK_CUENTA":
      if (s.fase !== "cuenta-atras") return s;
      return { ...s, cuenta: Math.max(0, s.cuenta - 1) };

    case "EMPEZAR":
      if (s.fase !== "cuenta-atras") return s;
      return { ...s, fase: "grabando", cuenta: 0, acumuladoMs: 0, tramoDesde: ev.ahora, bytes: 0 };

    case "PAUSAR":
      if (s.fase !== "grabando") return s;
      return { ...s, fase: "pausada", acumuladoMs: duracionMs(s, ev.ahora), tramoDesde: null };

    case "REANUDAR":
      if (s.fase !== "pausada") return s;
      return { ...s, fase: "grabando", tramoDesde: ev.ahora };

    case "PARAR":
      if (s.fase !== "grabando" && s.fase !== "pausada") return s;
      return { ...s, fase: "procesando", acumuladoMs: duracionMs(s, ev.ahora), tramoDesde: null };

    case "BYTES":
      if (!estaGrabando(s) && s.fase !== "procesando") return s;
      return ev.bytes === s.bytes ? s : { ...s, bytes: ev.bytes };

    case "AVISO":
      if (s.avisos.includes(ev.aviso)) return s;
      return { ...s, avisos: [...s.avisos, ev.aviso] };

    case "LISTO":
      if (s.fase !== "procesando") return s;
      return { ...s, fase: "lista", resultado: ev.resultado, bytes: ev.resultado.bytes, acumuladoMs: ev.resultado.duracionMs };

    case "CAPTURA":
      return { ...s, captura: ev.captura };

    case "CANCELAR":
      if (s.fase !== "preparando" && s.fase !== "cuenta-atras") return s;
      return { ...INSTANTANEA_INICIAL, captura: s.captura };

    case "DESCARTAR":
      if (s.fase !== "lista" && s.fase !== "error") return s;
      return { ...INSTANTANEA_INICIAL, captura: s.captura };

    case "DESCARTAR_CAPTURA":
      return s.captura ? { ...s, captura: null } : s;

    default:
      return s;
  }
}
