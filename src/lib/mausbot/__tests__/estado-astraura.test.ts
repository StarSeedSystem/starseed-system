import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { quantumOrbBus, emitQuantumOrbState } from "@/lib/aurora/quantum-orb-bus";
import {
  MS_DORMIDO, MS_ORGULLO, MS_SOMNOLIENCIA, TIC_ESTADO_MS,
  emitirAccionAgente, expresionAhora, onAccionAgente, reducirEstado,
  suscribirEstadoMausbot, type EstadoVivoMausbot,
} from "@/lib/mausbot/estado-astraura";

const VIVIDO_INICIAL = (ahora = 0): EstadoVivoMausbot =>
  ({ orbe: "idle", trabajando: false, orgulloHasta: 0, ultimaActividad: ahora });

describe("reducirEstado (reductor temporal puro)", () => {
  it("la orbe fija la expresión base y refresca la actividad", () => {
    const v = reducirEstado(VIVIDO_INICIAL(10), { tipo: "orbe", voz: "thinking" }, 500);
    expect(v.orbe).toBe("thinking");
    expect(v.ultimaActividad).toBe(500);
    expect(v.trabajando).toBe(false);
    expect(v.orgulloHasta).toBe(0);
  });

  it("«inicio» lo pone a trabajar y «fin» guarda el orgullo 1,5 s", () => {
    const trabajando = reducirEstado(VIVIDO_INICIAL(10), { tipo: "accion", accion: "inicio" }, 1_000);
    expect(trabajando.trabajando).toBe(true);
    expect(trabajando.ultimaActividad).toBe(1_000);
    const acabado = reducirEstado(trabajando, { tipo: "accion", accion: "fin" }, 2_000);
    expect(acabado.trabajando).toBe(false);
    expect(acabado.orgulloHasta).toBe(2_000 + MS_ORGULLO);
  });

  it("el tic no cambia nada", () => {
    const antes = reducirEstado(VIVIDO_INICIAL(0), { tipo: "orbe", voz: "speaking" }, 100);
    expect(reducirEstado(antes, { tipo: "tic" }, 900)).toBe(antes);
  });
});

describe("expresionAhora (el temporizador, con relojes falsos)", () => {
  it("durante la acción manda «working», aunque la orbe pida otra cosa", () => {
    const v = reducirEstado(VIVIDO_INICIAL(0), { tipo: "orbe", voz: "idle" }, 100);
    const trabajando = reducirEstado(v, { tipo: "accion", accion: "inicio" }, 200);
    expect(expresionAhora(trabajando, 5_000)).toBe("working");
  });

  it("al acabar, «proud» solo durante el rato del orgullo", () => {
    const v = reducirEstado(VIVIDO_INICIAL(0), { tipo: "orbe", voz: "listening" }, 100);
    const acabado = reducirEstado(v, { tipo: "accion", accion: "fin" }, 1_000);
    expect(expresionAhora(acabado, 1_000 + MS_ORGULLO - 1)).toBe("proud");
    expect(expresionAhora(acabado, 1_000 + MS_ORGULLO)).toBe("listening");
  });

  it("sin nada 2 minutos se somnolienta y a los 10 se duerme", () => {
    const v = reducirEstado(VIVIDO_INICIAL(0), { tipo: "orbe", voz: "speaking" }, 0);
    expect(expresionAhora(v, MS_SOMNOLIENCIA - 1)).toBe("happy");
    expect(expresionAhora(v, MS_SOMNOLIENCIA)).toBe("drowsy");
    expect(expresionAhora(v, MS_DORMIDO - 1)).toBe("drowsy");
    expect(expresionAhora(v, MS_DORMIDO)).toBe("sleeping");
  });

  it("el trabajo activo manda aunque hubiera pasado el silencio", () => {
    const v = reducirEstado(VIVIDO_INICIAL(0), { tipo: "orbe", voz: "idle" }, 0);
    const trabajando = reducirEstado(v, { tipo: "accion", accion: "inicio" }, 0);
    expect(expresionAhora(trabajando, MS_DORMIDO + 1)).toBe("working");
  });
});

describe("suscribirEstadoMausbot (bus vivo)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    quantumOrbBus.clear("state");
    vi.useRealTimers();
  });

  it("avisa de la expresión inicial y de lo que la orbe pida", () => {
    const vistas: string[] = [];
    const quitar = suscribirEstadoMausbot((e) => vistas.push(e));
    vi.setSystemTime(10_000);
    expect(vistas).toEqual(["idle"]);
    emitQuantumOrbState("thinking");
    expect(vistas).toEqual(["idle", "thinking"]);
    quitar();
  });

  it("una acción del agente lo pone «working» y «proud» 1,5 s al acabar", () => {
    const vistas: string[] = [];
    const quitar = suscribirEstadoMausbot((e) => vistas.push(e));
    vi.setSystemTime(20_000);
    emitirAccionAgente("inicio");
    expect(vistas).toEqual(["idle", "working"]);
    vi.setSystemTime(25_000);
    emitirAccionAgente("fin");
    expect(vistas).toEqual(["idle", "working", "proud"]);
    vi.advanceTimersByTime(MS_ORGULLO + 50);
    expect(vistas).toEqual(["idle", "working", "proud", "idle"]);
    quitar();
  });

  it("el silencio lo somnolienta con el tic grueso y la baja suelta todo", () => {
    const vistas: string[] = [];
    const quitar = suscribirEstadoMausbot((e) => vistas.push(e));
    vi.advanceTimersByTime(MS_SOMNOLIENCIA + TIC_ESTADO_MS);
    expect(vistas).toContain("drowsy");
    quitar();
  });
});
