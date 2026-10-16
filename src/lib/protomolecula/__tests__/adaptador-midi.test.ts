import { describe, expect, it, vi } from "vitest";
import { conectarMidi, type AlMidiMensaje, type DesconectarMidi } from "../adaptador-midi";
import type { FuenteControl } from "../vinculos-control";

describe("adaptador-midi", () => {
  it("conectarMidi retorna función de desconexión", () => {
    const acceso = { inputs: new Map(), outputs: new Map(), sysexEnabled: false, onstatechange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => false } as unknown as MIDIAccess;
    expect(typeof conectarMidi(acceso, () => {})).toBe("function");
  });

  it("convierte mensajes MIDI correctamente", () => {
    const acceso = crearAccesoMIDI();
    const alMensaje = vi.fn();
    const desconectar = conectarMidi(acceso, alMensaje);
    
    // Test CC
    enviarMensaje(acceso, [0xB0, 0x07, 0x40]); // CC canal 1, control 7, valor 64
    expect(alMensaje).toHaveBeenCalledWith({
      fuente: { tipo: "midi", mensaje: "cc", canal: 1, numero: 7, dispositivo: "Test" },
      bruto: 64
    });
    
    // Test nota on
    enviarMensaje(acceso, [0x90, 0x3C, 0x60]); // Nota on canal 1, nota 60, velocity 96
    expect(alMensaje).toHaveBeenCalledWith({
      fuente: { tipo: "midi", mensaje: "nota", canal: 1, numero: 60, dispositivo: "Test" },
      bruto: 96
    });
    
    // Test nota off (velocity 0)
    enviarMensaje(acceso, [0x90, 0x3C, 0x00]); // Nota on canal 1, nota 60, velocity 0
    expect(alMensaje).toHaveBeenCalledWith({
      fuente: { tipo: "midi", mensaje: "nota", canal: 1, numero: 60, dispositivo: "Test" },
      bruto: 0
    });
    
    // Test pitch bend
    enviarMensaje(acceso, [0xE0, 0x00, 0x40]); // Pitch bend canal 1, LSB=0, MSB=64 → 8192
    expect(alMensaje).toHaveBeenCalledWith({
      fuente: { tipo: "midi", mensaje: "pitch", canal: 1, dispositivo: "Test" },
      bruto: 8192
    });
    
    desconectar();
  });

  it("maneja desconexión correctamente", () => {
    const acceso = crearAccesoMIDI();
    const alMensaje = vi.fn();
    const desconectar = conectarMidi(acceso, alMensaje);
    desconectar();
    // Si no lanza error, la desconexión funcionó
    expect(true).toBe(true);
  });
});

function crearAccesoMIDI() {
  const puerto = {
    addEventListener: vi.fn((tipo, cb) => { if (tipo === "midimessage") (puerto as any)._cb = cb; }),
    removeEventListener: vi.fn(),
    name: "Test"
  } as unknown as MIDIPort;
  
  const inputsMock = {
    forEach: (cb: (p: MIDIPort) => void) => cb(puerto),
    values: () => [puerto][Symbol.iterator](),
    size: 1
  };
  
  return {
    inputs: inputsMock as unknown as MIDIInputMap,
    outputs: new Map(),
    sysexEnabled: false,
    onstatechange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => false
  } as unknown as MIDIAccess;
}

function enviarMensaje(acceso: MIDIAccess, datos: number[]) {
  const event = new MidiEventMock(datos, { name: "Test" } as unknown as EventTarget);
  // Acceder al puerto y llamar su callback
  const puerto = Array.from(acceso.inputs.values())[0];
  if (puerto && (puerto as any)._cb) (puerto as any)._cb(event);
}

class MidiEventMock implements MIDIMessageEvent {
  constructor(public data: number[], public target: EventTarget | null = null) {
    this.type = "midimessage";
    this.currentTarget = target;
    this.eventPhase = 0;
    this.bubbles = false;
    this.cancelable = false;
    this.defaultPrevented = false;
    this.composed = false;
    this.timeStamp = Date.now();
    this.isTrusted = true;
  }
  initEvent() {}
  preventDefault() {}
  stopImmediatePropagation() {}
  stopPropagation() {}
  readonly NONE = 0;
  readonly CAPTURING_PHASE = 1;
  readonly AT_TARGET = 2;
  readonly BUBBLING_PHASE = 3;
}