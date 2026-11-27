/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Sala de sonido · MOTOR DE COLA COMÚN (NFC1126K · §11).
 * ---------------------------------------------------------------------------
 * Varias neuronas comparten un mismo sistema de sonido. Cualquiera añade
 * audio suyo (archivo, sonido, producción o app), todas ven la misma cola y
 * el mismo estado de reproducción, y el control se reparte según el modo:
 * una neurona, las elegidas o todas. La visibilidad de lo que suena se decide
 * aparte: público, contactos, solo la sala o nada.
 *
 * Módulo PURO: sin red, sin disco, sin reloj de sistema. El `ahora` siempre
 * entra por parámetro y pertenece al reloj común de `./reloj`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** De dónde sale el audio que alguien aporta a la cola. */
export type TipoFuente = "archivo" | "sonido" | "produccion" | "app";

/** Quién puede mandar sobre la reproducción. */
export type ControlSala = "una" | "elegidas" | "todas";

/** Quién puede ver lo que suena. */
export type VisibilidadSonido = "publico" | "contactos" | "sala" | "nada";

/** Un audio aportado por una neurona. */
export interface FuenteAudio {
  id: string;
  tipo: TipoFuente;
  nombre: string;
  duracionMs?: number;
  aportadaPor: string;
}

/** Una entrada de la cola común, con su orden de llegada. */
export interface EntradaCola {
  id: string;
  fuente: FuenteAudio;
  anadidaPor: string;
  orden: number;
}

/** Estado de reproducción compartido, medido en el reloj común. */
export interface EstadoReproduccion {
  entradaId: string | null;
  posicionMs: number;
  reproduciendo: boolean;
  actualizadoEn: number;
}

/** La sala completa: cola, estado, control y visibilidad. */
export interface SalaSonido {
  salaId: string;
  cola: EntradaCola[];
  reproduccion: EstadoReproduccion;
  control: ControlSala;
  controladores: string[];
  visibilidad: VisibilidadSonido;
  oyentes: string[];
}

/** Techo de la cola: una sala no puede crecer sin límite en una neurona humilde. */
export const MAX_COLA = 500;

/** Opciones al abrir una sala. */
export interface OpcionesSala {
  creador: string;
  oyentes?: string[];
  control?: ControlSala;
  controladores?: string[];
  visibilidad?: VisibilidadSonido;
}

/** Ids únicos conservando el orden de llegada. */
function unicos(lista: readonly string[]): string[] {
  return [...new Set(lista.filter((n) => n.trim().length > 0))];
}

/** Orden determinista de la cola: primero el orden de llegada, luego el id. */
function ordenar(cola: readonly EntradaCola[]): EntradaCola[] {
  return [...cola].sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));
}

/** Normaliza los controladores al modo: una sola, una lista o todas (sin lista). */
function normalizarControladores(
  control: ControlSala,
  propuestos: readonly string[],
  respaldo: string,
  oyentes: readonly string[],
): string[] {
  if (control === "todas") return [];
  const candidatos = unicos(propuestos).filter((n) => oyentes.includes(n));
  if (control === "una") return [candidatos[0] ?? respaldo];
  return candidatos.length > 0 ? candidatos : [respaldo];
}

export function crearSala(salaId: string, opciones: OpcionesSala): SalaSonido {
  const oyentes = unicos([opciones.creador, ...(opciones.oyentes ?? [])]);
  const control = opciones.control ?? "una";
  return {
    salaId,
    cola: [],
    reproduccion: { entradaId: null, posicionMs: 0, reproduciendo: false, actualizadoEn: 0 },
    control,
    controladores: normalizarControladores(
      control,
      opciones.controladores ?? [opciones.creador],
      opciones.creador,
      oyentes,
    ),
    visibilidad: opciones.visibilidad ?? "sala",
    oyentes,
  };
}

/** Añade audio a la cola; si la sala estaba vacía, empieza a sonar. */
export function anadirACola(sala: SalaSonido, fuente: FuenteAudio, quien: string, ahora: number): SalaSonido {
  if (sala.cola.length >= MAX_COLA) return sala;
  const orden = sala.cola.reduce((maximo, e) => Math.max(maximo, e.orden), 0) + 1;
  const entrada: EntradaCola = {
    id: `${sala.salaId}:${fuente.id}:${orden}`,
    fuente,
    anadidaPor: quien,
    orden,
  };
  const cola = ordenar([...sala.cola, entrada]);
  const reproducePrimera = sala.reproduccion.entradaId === null;
  const reproduccion: EstadoReproduccion = reproducePrimera
    ? { entradaId: entrada.id, posicionMs: 0, reproduciendo: true, actualizadoEn: ahora }
    : sala.reproduccion;
  return { ...sala, cola, reproduccion };
}

/** Devuelve la siguiente entrada de la cola, con vuelta al principio. */
export function siguienteEntrada(sala: SalaSonido): EntradaCola | null {
  if (sala.cola.length === 0) return null;
  const cola = ordenar(sala.cola);
  const actual = cola.findIndex((e) => e.id === sala.reproduccion.entradaId);
  if (actual === -1) return cola[0];
  return cola[(actual + 1) % cola.length];
}

/** Salta a una entrada concreta, solo si quien lo pide tiene el control. */
export function saltarA(sala: SalaSonido, entradaId: string, quien: string, ahora: number): SalaSonido {
  if (!puedeControlar(sala, quien)) return sala;
  if (!sala.cola.some((e) => e.id === entradaId)) return sala;
  return {
    ...sala,
    reproduccion: { entradaId, posicionMs: 0, reproduciendo: true, actualizadoEn: ahora },
  };
}

/** Pasa a la siguiente entrada de la cola. */
export function avanzar(sala: SalaSonido, quien: string, ahora: number): SalaSonido {
  if (!puedeControlar(sala, quien)) return sala;
  const siguiente = siguienteEntrada(sala);
  if (!siguiente) {
    return {
      ...sala,
      reproduccion: { entradaId: null, posicionMs: 0, reproduciendo: false, actualizadoEn: ahora },
    };
  }
  return saltarA(sala, siguiente.id, quien, ahora);
}

/** ¿Esta neurona puede controlar la reproducción ahora mismo? */
export function puedeControlar(sala: SalaSonido, neurona: string): boolean {
  if (!sala.oyentes.includes(neurona)) return false;
  return sala.control === "todas" || sala.controladores.includes(neurona);
}

/** Lista efectiva de neuronas con control, según el modo. */
export function controladoresEfectivos(sala: SalaSonido): string[] {
  if (sala.control === "todas") return [...sala.oyentes];
  return sala.controladores.filter((n) => sala.oyentes.includes(n));
}

/** Cambia el modo de control y sus controladores; solo puede quien ya controla. */
export function cambiarControl(
  sala: SalaSonido,
  quien: string,
  control: ControlSala,
  controladores: string[],
): SalaSonido {
  if (!puedeControlar(sala, quien)) return sala;
  return {
    ...sala,
    control,
    controladores: normalizarControladores(control, controladores, quien, sala.oyentes),
  };
}

/** Posición esperada en el reloj común, sin pasarse de la duración conocida. */
export function posicionEn(sala: SalaSonido, ahoraMs: number): number {
  const r = sala.reproduccion;
  if (!r.reproduciendo) return r.posicionMs;
  const avance = r.posicionMs + Math.max(0, ahoraMs - r.actualizadoEn);
  const duracion = sala.cola.find((e) => e.id === r.entradaId)?.fuente.duracionMs;
  return duracion === undefined ? avance : Math.min(avance, duracion);
}

/** ¿Quién puede ver lo que suena? */
export function visibilidadPermitida(
  sala: Pick<SalaSonido, "visibilidad" | "oyentes">,
  observador: string,
  esContacto = false,
): boolean {
  if (sala.visibilidad === "publico") return true;
  if (sala.visibilidad === "nada") return false;
  if (sala.visibilidad === "sala") return sala.oyentes.includes(observador);
  return esContacto;
}
