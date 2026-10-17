/**
 * Protomolécula · ADAPTADOR WEB MIDI (F6, contrato §4.4). Convierte cada mensaje de un mando MIDI
 * en `{ fuente, bruto }`, que es lo que recibe `vinculos-control.ts#procesar`.
 *
 * El acceso del navegador se INYECTA: este módulo nunca toca `navigator` por su cuenta. La interfaz
 * llama a `pedirAccesoMidi(navigator)` SOLO cuando la persona pulsa «Conectar mandos» (es ahí cuando
 * el navegador pide el permiso) y, si no hay Web MIDI, enseña el motivo: no se finge ningún mando.
 * Hoy no hay ningún mando real conectado ni probado: las pruebas usan entradas simuladas.
 */
import type { FuenteControl } from "./vinculos-control";

export type FuenteMidi = Extract<FuenteControl, { tipo: "midi" }>;
export interface MensajeMidi { fuente: FuenteMidi; bruto: number }
export interface EventoMensajeMidi { data: Uint8Array | null }
/** Lo mínimo de `MIDIInput` que se usa (el real del navegador encaja). */
export interface EntradaMidi {
  id: string;
  name: string | null;
  state: string;
  addEventListener(tipo: "midimessage", f: (ev: EventoMensajeMidi) => void): void;
  removeEventListener(tipo: "midimessage", f: (ev: EventoMensajeMidi) => void): void;
}
/** Lo mínimo de `MIDIAccess`: las entradas y el aviso de altas y bajas de aparatos. */
export interface AccesoMidi {
  inputs: { forEach(f: (entrada: EntradaMidi) => void): void };
  addEventListener(tipo: "statechange", f: () => void): void;
  removeEventListener(tipo: "statechange", f: () => void): void;
}
export interface NavegadorMidi { requestMIDIAccess?: (opciones?: { sysex?: boolean }) => Promise<AccesoMidi> }
export type ResultadoAcceso = { ok: true; acceso: AccesoMidi } | { ok: false; motivo: string };

export const SIN_MIDI = "Este navegador no ofrece MIDI";
export const SIN_PERMISO = "No hay permiso para usar MIDI en este sitio: actívalo en los ajustes del navegador (Firefox pide además aceptar el permiso del sitio)";

/** Saber si hay Web MIDI sin pedir permiso (para pintar el botón o el motivo). */
export const hayMidi = (nav?: NavegadorMidi | null): boolean => typeof nav?.requestMIDIAccess === "function";

/** Solo al pulsar «Conectar mandos». Sin sysex: no hace falta para mandos y pide un permiso mayor. */
export async function pedirAccesoMidi(nav?: NavegadorMidi | null): Promise<ResultadoAcceso> {
  const pedir = nav?.requestMIDIAccess;
  if (typeof pedir !== "function") return { ok: false, motivo: SIN_MIDI };
  try {
    return { ok: true, acceso: await pedir.call(nav, { sysex: false }) };
  } catch (e) {
    const nombre = typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "";
    if (nombre === "NotAllowedError" || nombre === "SecurityError") return { ok: false, motivo: SIN_PERMISO };
    return { ok: false, motivo: `El navegador no pudo abrir MIDI${nombre ? ` (${nombre})` : ""}` };
  }
}

/**
 * Bytes de un mensaje → fuente + valor bruto. 0xB0 control (CC), 0x90/0x80 nota (velocidad 0 = soltar),
 * 0xE0 pitch bend de 14 bits (0–16383, centro 8192). Canal 1–16. Lo demás (reloj, sysex, cambios de
 * programa, presión) se ignora: devuelve null.
 */
export function analizarMensaje(datos: ArrayLike<number> | null, dispositivo?: string): MensajeMidi | null {
  if (!datos || datos.length < 3) return null;
  const estado = datos[0], d1 = datos[1], d2 = datos[2];
  if (estado < 0x80 || estado >= 0xf0 || d1 > 0x7f || d2 > 0x7f || d1 < 0 || d2 < 0) return null;
  const base = { tipo: "midi" as const, canal: (estado & 0x0f) + 1, ...(dispositivo ? { dispositivo } : {}) };
  switch (estado & 0xf0) {
    case 0xb0: return { fuente: { ...base, mensaje: "cc", numero: d1 }, bruto: d2 };
    case 0x90: return { fuente: { ...base, mensaje: "nota", numero: d1 }, bruto: d2 };
    case 0x80: return { fuente: { ...base, mensaje: "nota", numero: d1 }, bruto: 0 };
    case 0xe0: return { fuente: { ...base, mensaje: "pitch" }, bruto: (d2 << 7) | d1 };
    default: return null;
  }
}

/** Nombre con el que se guarda el aparato en el vínculo (el id si el navegador no da nombre). */
export const nombreEntrada = (e: EntradaMidi): string => (e.name && e.name.trim()) || e.id;

/**
 * Escucha todas las entradas conectadas y las que se enchufen después (altas y bajas por
 * `statechange`). Devuelve la función que lo desconecta todo; tras llamarla no llega nada más.
 */
export function conectarMidi(
  acceso: AccesoMidi,
  alMensaje: (m: MensajeMidi) => void,
  alCambiarDispositivos?: (nombres: string[]) => void,
): () => void {
  const oyentes = new Map<string, { entrada: EntradaMidi; f: (ev: EventoMensajeMidi) => void }>();
  let activo = true;
  const soltar = (id: string) => {
    const o = oyentes.get(id);
    if (o) o.entrada.removeEventListener("midimessage", o.f);
    oyentes.delete(id);
  };
  const sincronizar = () => {
    if (!activo) return;
    const vivas = new Map<string, EntradaMidi>();
    acceso.inputs.forEach((e) => { if (e.state !== "disconnected") vivas.set(e.id, e); });
    for (const [id, o] of [...oyentes]) if (vivas.get(id) !== o.entrada) soltar(id);
    for (const [id, e] of vivas) {
      if (oyentes.has(id)) continue;
      const f = (ev: EventoMensajeMidi) => {
        const m = analizarMensaje(ev.data, nombreEntrada(e));
        if (m && activo) alMensaje(m);
      };
      e.addEventListener("midimessage", f);
      oyentes.set(id, { entrada: e, f });
    }
    alCambiarDispositivos?.([...oyentes.values()].map((o) => nombreEntrada(o.entrada)));
  };
  acceso.addEventListener("statechange", sincronizar);
  sincronizar();
  return () => {
    if (!activo) return;
    activo = false;
    acceso.removeEventListener("statechange", sincronizar);
    for (const id of [...oyentes.keys()]) soltar(id);
  };
}
