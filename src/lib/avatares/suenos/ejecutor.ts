/**
 * Ejecutor de sueños (Ola 1025U · U4): corre un sueño turno a turno con la IA que le den (en producción, el enrutador
 * económico: ver `generador-router.ts`) y, al terminar, deja que cada agente recuerde y evolucione un poco.
 *
 * Reglas que cumple (y que las pruebas fijan):
 *  · UNA llamada por turno, con tope: los de `TOPES_SUENO` y el de llamadas por hora de la ficha del agente
 *    (`puedeLlamar`). Cada intento se apunta en el uso de la hora, salga bien o mal.
 *  · SIN IA no se inventa nada: si el generador falla o contesta vacío, el sueño queda `sin-ia` con el motivo y los
 *    turnos que ya existían; jamás se rellena con texto de plantilla.
 *  · Se puede CANCELAR en cualquier momento (incluida una llamada en vuelo). Un sueño cancelado o cortado no deja
 *    recuerdos ni mueve rasgos: solo lo vivido hasta el final se consolida.
 *  · Al terminar: `registrarRecuerdo` por participante, en el alcance más privado donde su actor puede escribir (un
 *    agente público no guarda lo personal) y con solo lo que su recuerdo puede llevar sin abrirlo; y
 *    `registrarExperiencia` (poco, con el tope diario de la ficha y siempre reversible).
 */
import type { ChatMessage } from "@/ai/providers/types";
import { leerConfigAgente, registrarExperiencia, registrarRecuerdo } from "@/lib/avatares/agente/almacen-agente";
import { puedeLlamar, type ConfigAgente, type RasgoPercepcion } from "@/lib/avatares/agente/config-agente";
import type { NuevoRecuerdo } from "@/lib/avatares/agente/desarrollo";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { guardarUso, leerUso } from "./almacen-suenos";
import {
  TOPES_SUENO, alcanceDeRecuerdo, empujesDeSueno, enLaUltimaHora, limpiarTurno, motivoExperiencia, promptTurno,
  registrarLlamada, siguienteAutor, textoRecuerdo,
  type EstadoSueno, type Sueno, type UsoSuenos,
} from "./sueno";

/** Lo que se le pide a la IA en un turno. */
export interface PeticionIA {
  mensajes: ChatMessage[];
  /** El id del agente (`<origen>:<idOrigen>`): el enrutador aplica con él las capas y el sistema primario de su ficha. */
  agenteId: string;
  maxTokens: number;
  temperature: number;
  /** Lo que la ficha del agente permite: sin su permiso no se gasta (por defecto, no). */
  permitirPago: boolean;
  signal: AbortSignal;
}

export type RespuestaIA = { ok: true; texto: string; fuente?: string; gratis?: boolean } | { ok: false; motivo: string };
export type GeneradorIA = (p: PeticionIA) => Promise<RespuestaIA>;

export interface DepsEjecutor {
  generar: GeneradorIA;
  ahora?: () => number;
  leerConfig?: (a: AgenteMundoRef) => ConfigAgente;
  recordar?: (a: AgenteMundoRef, nuevo: NuevoRecuerdo, ahora: number) => { ok: boolean; motivo?: string };
  experiencia?: (
    a: AgenteMundoRef, empujes: Partial<Record<RasgoPercepcion, number>>, motivo: string, ahora: number,
  ) => { aplicadas: readonly unknown[]; sinCambio: readonly unknown[] };
  leerUso?: (ahora: number) => UsoSuenos;
  guardarUso?: (uso: UsoSuenos, ahora: number) => void;
  /** Se llama con el sueño nuevo después de cada turno y al terminar. */
  alAvanzar?: (sueno: Sueno) => void;
}

const MS_TURNO_DEFECTO = TOPES_SUENO.esperaTurnoMs;

function terminar(s: Sueno, estado: EstadoSueno, ahora: number, motivo?: string): Sueno {
  return { ...s, estado, terminadoEn: ahora, ...(motivo ? { motivo } : {}) };
}

/** Pide un turno a la IA con tope de espera y sin esperar a quien ignore la cancelación. Nunca lanza. */
async function pedirTurno(generar: GeneradorIA, base: Omit<PeticionIA, "signal">, signal: AbortSignal | undefined, esperaMs: number): Promise<RespuestaIA> {
  if (signal?.aborted) return { ok: false, motivo: "Cancelado." };
  const interno = new AbortController();
  let vencio = false;
  const cancelar = () => interno.abort();
  signal?.addEventListener("abort", cancelar, { once: true });
  const temporizador = setTimeout(() => {
    vencio = true;
    interno.abort();
  }, esperaMs);
  const cortado = new Promise<RespuestaIA>((resolver) => {
    interno.signal.addEventListener(
      "abort",
      () => resolver({ ok: false, motivo: vencio ? "La IA tardó demasiado en responder." : "Cancelado." }),
      { once: true },
    );
  });
  try {
    const respuesta = Promise.resolve()
      .then(() => generar({ ...base, signal: interno.signal }))
      .catch((e: unknown): RespuestaIA => ({ ok: false, motivo: e instanceof Error && e.message ? `La IA falló: ${e.message}` : "La IA falló." }));
    return await Promise.race([respuesta, cortado]);
  } finally {
    clearTimeout(temporizador);
    signal?.removeEventListener("abort", cancelar);
  }
}

/** Al despertar: cada quien que habló recuerda y evoluciona un poco. Lo que no se pudo guardar se dice. */
function consolidar(s: Sueno, d: Required<Pick<DepsEjecutor, "recordar" | "experiencia">>, ahora: number): Sueno {
  const avisos: string[] = [];
  let recuerdos = 0;
  let rasgos = 0;
  for (const p of s.participantes) {
    if (!s.turnos.some((t) => t.autorId === p.id)) continue;
    try {
      const r = d.recordar(p, { texto: textoRecuerdo(s, p), alcance: alcanceDeRecuerdo(p), origen: "sueño" }, ahora);
      if (r.ok) recuerdos += 1;
      else avisos.push(`${p.nombre}: no guardó el recuerdo (${r.motivo ?? "no se pudo"}).`);
    } catch {
      avisos.push(`${p.nombre}: no guardó el recuerdo (el almacenamiento falló).`);
    }
    try {
      const e = d.experiencia(p, empujesDeSueno(s, p), motivoExperiencia(s), ahora);
      rasgos += e.aplicadas.length;
      if (e.aplicadas.length === 0 && e.sinCambio.length > 0) avisos.push(`${p.nombre}: sus rasgos ya se movieron hoy todo lo permitido.`);
    } catch {
      avisos.push(`${p.nombre}: no se pudo anotar su experiencia.`);
    }
  }
  return { ...s, consolidacion: { recuerdos, rasgos, avisos: avisos.slice(0, 12) } };
}

/**
 * Corre el sueño hasta el final, hasta quedarse sin IA, sin cupo o hasta que se cancele. Devuelve el sueño final
 * (nunca lanza). Los intermedios salen por `alAvanzar`.
 */
export async function ejecutarSueno(inicial: Sueno, deps: DepsEjecutor, signal?: AbortSignal, esperaTurnoMs: number = MS_TURNO_DEFECTO): Promise<Sueno> {
  const ahora = deps.ahora ?? Date.now;
  const leerConfig = deps.leerConfig ?? leerConfigAgente;
  const leerElUso = deps.leerUso ?? leerUso;
  const guardarElUso = deps.guardarUso ?? guardarUso;
  const recordar = deps.recordar ?? ((a, nuevo, t) => registrarRecuerdo(a, nuevo, t));
  const experiencia = deps.experiencia ?? ((a, e, m, t) => registrarExperiencia(a, e, m, t));
  const avisar = (s: Sueno) => {
    try {
      deps.alAvanzar?.(s);
    } catch {
      /* quien escucha no puede romper el sueño */
    }
  };

  let s: Sueno = { ...inicial, estado: "en-curso" };
  const cortar = (estado: EstadoSueno, motivo: string): Sueno => {
    const fin = terminar(s, estado, ahora(), motivo);
    avisar(fin);
    return fin;
  };

  for (let autor = siguienteAutor(s); autor; autor = siguienteAutor(s)) {
    if (signal?.aborted) return cortar("cancelado", "Lo cancelaste antes de que terminara.");

    const config = leerConfig(autor);
    const tNow = ahora();
    const uso = leerElUso(tNow);
    const llamadas = enLaUltimaHora(uso.llamadas[autor.id], tNow);
    if (!puedeLlamar(config.motores, llamadas)) {
      return cortar("interrumpido", `${autor.nombre} llegó a su tope de ${config.motores.topePorHora} llamadas por hora. El sueño se paró aquí; no se llama a la IA de más.`);
    }
    // El intento cuenta aunque falle: el tope protege la cuota, no el éxito.
    guardarElUso(registrarLlamada(uso, autor.id, tNow), tNow);

    const r = await pedirTurno(
      deps.generar,
      {
        mensajes: promptTurno(autor, s, config),
        agenteId: autor.id,
        maxTokens: TOPES_SUENO.maxTokensTurno,
        temperature: 0.85,
        permitirPago: config.motores.permitirPago,
      },
      signal,
      esperaTurnoMs,
    );
    if (signal?.aborted) return cortar("cancelado", "Lo cancelaste antes de que terminara.");
    if (!r.ok) return cortar("sin-ia", r.motivo || "No hay una IA disponible ahora mismo.");

    const texto = limpiarTurno(r.texto, autor.nombre);
    if (!texto) return cortar("sin-ia", "La IA respondió vacío: no se inventa el turno.");

    s = { ...s, turnos: [...s.turnos, { autorId: autor.id, autorNombre: autor.nombre, texto, at: ahora() }] };
    avisar(s);
  }

  const fin = consolidar(terminar(s, "completo", ahora()), { recordar, experiencia }, ahora());
  avisar(fin);
  return fin;
}
