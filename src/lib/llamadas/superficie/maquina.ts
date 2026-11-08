/**
 * Máquina de la SUPERFICIE de llamada (LLA1108C) — lógica PURA, sin DOM ni red.
 * Una sola superficie para todos los tipos (voz, vídeo, pantalla, transmisión en vivo, grupo) con seis
 * estados y tres tamaños. Contrato: `architecture/llamadas-telefonia.md`.
 *
 * Las transiciones de tamaño son INTERRUMPIBLES porque aquí solo se guarda el tamaño de DESTINO: la capa
 * visual interpola (CSS) hacia él y, si llega otra orden a mitad, simplemente cambia de destino sin saltos.
 */

export type TipoSuperficie = "voz" | "video" | "pantalla" | "vivo" | "grupo";
export type EstadoSuperficie = "inactiva" | "entrante" | "saliente" | "conectada" | "en-espera" | "reconectando" | "terminada";
export type TamanoSuperficie = "burbuja" | "panel" | "pantalla-completa";
export type FinSuperficie = "colgada" | "rechazada" | "sin-respuesta" | "fallo" | "perdida";

export interface Superficie {
  estado: EstadoSuperficie;
  tipo: TipoSuperficie;
  tamano: TamanoSuperficie;
  /** Tamaño al que se vuelve al salir de pantalla completa (Esc). */
  tamanoPrevio: Exclude<TamanoSuperficie, "pantalla-completa">;
  /** Epoch ms en que empezó a hablarse (sin contar el timbre). */
  desde: number | null;
  /** Milisegundos acumulados en pausa (la espera no cuenta). */
  enEsperaMs: number;
  esperaDesde: number | null;
  /** Cuando termina: duración final y por dónde fue. */
  fin: FinSuperficie | null;
  duracionMs: number | null;
  medioUsado: string | null;
  /** Si hay una renegociación de tipo en curso (para no encadenar dos). */
  cambiandoA: TipoSuperficie | null;
}

export const SUPERFICIE_INICIAL: Superficie = {
  estado: "inactiva",
  tipo: "voz",
  tamano: "burbuja",
  tamanoPrevio: "panel",
  desde: null,
  enEsperaMs: 0,
  esperaDesde: null,
  fin: null,
  duracionMs: null,
  medioUsado: null,
  cambiandoA: null,
};

export type EventoSuperficie =
  | { t: "llamar"; tipo: TipoSuperficie }
  | { t: "sonar"; tipo: TipoSuperficie }
  | { t: "conectar"; ahora: number }
  | { t: "en-espera"; ahora: number }
  | { t: "reanudar"; ahora: number }
  | { t: "enlace-perdido" }
  | { t: "enlace-recuperado" }
  | { t: "cambiar-tipo"; a: TipoSuperficie; ahora?: number }
  | { t: "tipo-cambiado"; tipo: TipoSuperficie }
  | { t: "tipo-fallido" }
  | { t: "terminar"; fin: FinSuperficie; ahora: number; medio?: string | null }
  | { t: "tamano"; tamano: TamanoSuperficie }
  | { t: "alternar-completa" }
  | { t: "escape" }
  | { t: "medio"; medio: string | null }
  | { t: "descartar" };

const VIVA = new Set<EstadoSuperficie>(["conectada", "en-espera", "reconectando"]);
const LIBRE = new Set<EstadoSuperficie>(["inactiva", "terminada"]);

export const esViva = (e: EstadoSuperficie) => VIVA.has(e);

/** Tiempo hablado hasta `ahora` (excluye la espera). 0 si no ha empezado. */
export function duracionHablada(s: Superficie, ahora: number): number {
  if (s.duracionMs !== null) return s.duracionMs;
  if (s.desde === null) return 0;
  const enEspera = s.enEsperaMs + (s.esperaDesde !== null ? Math.max(0, ahora - s.esperaDesde) : 0);
  return Math.max(0, ahora - s.desde - enEspera);
}

/** ¿Se puede pasar de `de` a `a` sin colgar? Las salas de grupo cambian invitando, no por esta vía. */
export function puedeCambiarTipo(s: Pick<Superficie, "estado" | "tipo" | "cambiandoA">, a: TipoSuperficie): { ok: boolean; motivo?: string } {
  if (s.estado !== "conectada") {
    return { ok: false, motivo: s.estado === "en-espera" ? "Reanuda la llamada para cambiar de tipo." : "Solo se cambia de tipo con la llamada conectada." };
  }
  if (s.cambiandoA) return { ok: false, motivo: "Ya se está cambiando el tipo de llamada." };
  if (s.tipo === a) return { ok: false, motivo: "Ya estás en ese tipo de llamada." };
  if (s.tipo === "grupo" || a === "grupo") return { ok: false, motivo: "Para pasar a un grupo, invita a más personas." };
  return { ok: true };
}

/** Pistas que hacen falta para cada tipo: lo que se (re)negocia sobre la MISMA conexión. */
export function pistasDeTipo(t: TipoSuperficie): { audio: boolean; camara: boolean; pantalla: boolean; emite: boolean } {
  switch (t) {
    case "voz":
      return { audio: true, camara: false, pantalla: false, emite: false };
    case "video":
    case "grupo":
      return { audio: true, camara: t === "video", pantalla: false, emite: false };
    case "pantalla":
      return { audio: true, camara: false, pantalla: true, emite: false };
    case "vivo":
      return { audio: true, camara: true, pantalla: false, emite: true };
  }
}

/** Qué pistas hay que añadir y quitar al pasar de un tipo a otro (el resto no se toca). */
export function diferenciaPistas(de: TipoSuperficie, a: TipoSuperficie) {
  const x = pistasDeTipo(de);
  const y = pistasDeTipo(a);
  return {
    anadir: (["audio", "camara", "pantalla"] as const).filter((k) => y[k] && !x[k]),
    quitar: (["audio", "camara", "pantalla"] as const).filter((k) => x[k] && !y[k]),
  };
}

/** Tamaño de salida natural al empezar: el timbre pide atención; lo demás, la píldora discreta. */
function tamanoInicial(estado: EstadoSuperficie): Exclude<TamanoSuperficie, "pantalla-completa"> {
  return estado === "entrante" ? "panel" : "panel";
}

export function reducirSuperficie(s: Superficie, ev: EventoSuperficie): Superficie {
  switch (ev.t) {
    case "llamar":
      if (!LIBRE.has(s.estado)) return s;
      return { ...SUPERFICIE_INICIAL, estado: "saliente", tipo: ev.tipo, tamano: tamanoInicial("saliente"), tamanoPrevio: "panel" };
    case "sonar":
      if (!LIBRE.has(s.estado)) return s;
      return { ...SUPERFICIE_INICIAL, estado: "entrante", tipo: ev.tipo, tamano: tamanoInicial("entrante"), tamanoPrevio: "panel" };
    case "conectar":
      if (s.estado !== "entrante" && s.estado !== "saliente") return s;
      // Al conectar, lo que se veía como timbre se recoge a la píldora si no es pantalla completa.
      return { ...s, estado: "conectada", desde: ev.ahora, tamano: s.tamano === "pantalla-completa" ? s.tamano : "burbuja", tamanoPrevio: "burbuja" };
    case "en-espera":
      if (s.estado !== "conectada") return s;
      return { ...s, estado: "en-espera", esperaDesde: ev.ahora };
    case "reanudar":
      if (s.estado !== "en-espera") return s;
      return { ...s, estado: "conectada", enEsperaMs: s.enEsperaMs + (s.esperaDesde !== null ? Math.max(0, ev.ahora - s.esperaDesde) : 0), esperaDesde: null };
    case "enlace-perdido":
      if (s.estado !== "conectada" && s.estado !== "en-espera") return s;
      return { ...s, estado: "reconectando" };
    case "enlace-recuperado":
      return s.estado === "reconectando" ? { ...s, estado: "conectada" } : s;
    case "cambiar-tipo": {
      if (!puedeCambiarTipo(s, ev.a).ok) return s;
      return { ...s, cambiandoA: ev.a };
    }
    case "tipo-cambiado":
      return s.cambiandoA ? { ...s, tipo: ev.tipo, cambiandoA: null } : { ...s, tipo: ev.tipo };
    case "tipo-fallido":
      return s.cambiandoA ? { ...s, cambiandoA: null } : s;
    case "terminar": {
      if (LIBRE.has(s.estado)) return s;
      const base: Superficie = { ...s, esperaDesde: s.esperaDesde };
      const dur = s.desde === null ? 0 : duracionHablada(base, ev.ahora);
      return {
        ...s,
        estado: "terminada",
        fin: ev.fin,
        duracionMs: dur,
        medioUsado: ev.medio ?? s.medioUsado,
        cambiandoA: null,
        // El resumen se lee mejor en panel; se sale de pantalla completa.
        tamano: "panel",
        tamanoPrevio: "panel",
      };
    }
    case "tamano":
      if (s.estado === "inactiva") return s;
      if (ev.tamano === "pantalla-completa") return s.tamano === ev.tamano ? s : { ...s, tamano: ev.tamano, tamanoPrevio: s.tamano as Superficie["tamanoPrevio"] };
      return { ...s, tamano: ev.tamano, tamanoPrevio: ev.tamano };
    case "alternar-completa":
      if (s.estado === "inactiva") return s;
      return reducirSuperficie(s, { t: "tamano", tamano: s.tamano === "pantalla-completa" ? s.tamanoPrevio : "pantalla-completa" });
    case "escape":
      return s.tamano === "pantalla-completa" ? { ...s, tamano: s.tamanoPrevio } : s;
    case "medio":
      return { ...s, medioUsado: ev.medio };
    case "descartar":
      return s.estado === "terminada" ? SUPERFICIE_INICIAL : s;
  }
}

/** Texto del estado en español neutro (también para lectores de pantalla). */
export function textoEstado(s: Pick<Superficie, "estado" | "tipo" | "fin">, nombre: string): string {
  const que = { voz: "llamada de voz", video: "videollamada", pantalla: "pantalla compartida", vivo: "transmisión en vivo", grupo: "llamada de grupo" }[s.tipo];
  switch (s.estado) {
    case "entrante":
      return `${nombre} te llama (${que})`;
    case "saliente":
      return `Llamando a ${nombre}…`;
    case "conectada":
      return `${que[0].toUpperCase()}${que.slice(1)} con ${nombre}`;
    case "en-espera":
      return `${nombre}: llamada en espera`;
    case "reconectando":
      return `Reconectando con ${nombre}…`;
    case "terminada":
      return s.fin === "rechazada" ? "Llamada rechazada" : s.fin === "sin-respuesta" ? "Sin respuesta" : s.fin === "fallo" ? "La llamada falló" : s.fin === "perdida" ? "Llamada perdida" : "Llamada terminada";
    default:
      return "";
  }
}

/** Opciones de tamaño disponibles (el timbre y el resumen no se hacen píldora). */
export function tamanosPermitidos(estado: EstadoSuperficie): TamanoSuperficie[] {
  if (estado === "entrante" || estado === "terminada") return ["panel", "pantalla-completa"];
  if (estado === "inactiva") return [];
  return ["burbuja", "panel", "pantalla-completa"];
}
