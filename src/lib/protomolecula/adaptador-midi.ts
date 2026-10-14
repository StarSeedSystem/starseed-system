/**
 * Protomolécula · ADAPTADOR WEB MIDI. Conecta los mandos MIDI reales con los vínculos:
 * convierte cada mensaje en `{ fuente: FuenteControl, bruto: number }` y avisa de altas/bajas.
 * El `navigator.requestMIDIAccess()` se INYECTA desde la interfaz: aquí no hay navegador,
 * así las pruebas pasan sin hardware. Si el navegador no ofrece Midi (Safari…), la interfaz
 * muestra «Este navegador no ofrece MIDI»; este módulo nunca finge datos.
 */
import type { FuenteControl } from "./vinculos-control";

export interface MensajeMidi { fuente: FuenteControl; bruto: number }

/** Entrada MIDI mínima (compatible con `MIDIInput` del navegador). */
export interface EntradaMidiMinima {
  name?: string | null;
  addEventListener(tipo: "midimessage", f: (ev: { data: Uint8Array | number[] }) => void): void;
  removeEventListener(tipo: "midimessage", f: (ev: { data: Uint8Array | number[] }) => void): void;
}
/** Acceso MIDI mínimo (compatible con `MIDIAccess`). */
export interface AccesoMidiMinimo {
  inputs: Map<string, EntradaMidiMinima>;
  onstatechange: ((ev: { port?: { type?: string; state?: string } | null }) => void) | null;
}

/**
 * Analiza los 3 bytes de un mensaje de canal. Devuelve `null` si no interesa
 * (reloj, sysex, mensajes incompletos…). Canal 1–16; dispositivo por nombre.
 */
export function analisisMensaje(datos: Uint8Array | number[], dispositivo?: string): MensajeMidi | null {
  if (datos.length < 3) return null;
  const estado = datos[0] & 0xf0;
  const canal = (datos[0] & 0x0f) + 1;
  if (estado === 0xb0) {
    return { fuente: { tipo: "midi", mensaje: "cc", canal, numero: datos[1], dispositivo }, bruto: datos[2] };
  }
  if (estado === 0x90 || estado === 0x80) {
    // Nota soltada = velocidad 0 (también un «note on» con velocidad 0).
    const bruto = estado === 0x80 ? 0 : datos[2];
    return { fuente: { tipo: "midi", mensaje: "nota", canal, numero: datos[1], dispositivo }, bruto };
  }
  if (estado === 0xe0) {
    // Pitch bend de 14 bits: 7 bits bajos | 7 bits altos.
    return { fuente: { tipo: "midi", mensaje: "pitch", canal, dispositivo }, bruto: (datos[1] & 0x7f) | ((datos[2] & 0x7f) << 7) };
  }
  return null;
}

/**
 * Suscribe todas las entradas presentes y las que entren después (`statechange`).
 * Devuelve la función de desconexión: deja de escuchar todo.
 */
export function conectarMidi(
  acceso: AccesoMidiMinimo,
  alMensaje: (m: MensajeMidi) => void,
): () => void {
  const escuchas = new Map<string, (ev: { data: Uint8Array | number[] }) => void>();
  const enganchar = (id: string, entrada: EntradaMidiMinima) => {
    if (escuchas.has(id)) return;
    const f = (ev: { data: Uint8Array | number[] }) => {
      const m = analisisMensaje(ev.data, entrada.name ?? undefined);
      if (m) alMensaje(m);
    };
    entrada.addEventListener("midimessage", f);
    escuchas.set(id, f);
  };
  for (const [id, entrada] of acceso.inputs) enganchar(id, entrada);
  const estadoAntes = acceso.onstatechange;
  acceso.onstatechange = (ev) => {
    estadoAntes?.(ev);
    if (ev.port?.type !== "input") return; // solo interesan entradas
    for (const [id, entrada] of acceso.inputs) enganchar(id, entrada); // altas: enganchar lo nuevo
  };
  return () => {
    for (const [id, f] of escuchas) acceso.inputs.get(id)?.removeEventListener("midimessage", f);
    escuchas.clear();
    acceso.onstatechange = estadoAntes;
  };
}
