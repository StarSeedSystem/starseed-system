import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitQuantumOrbState, quantumOrbBus } from "@/lib/aurora/quantum-orb-bus";
import {
  ADORMECER_MS, DORMIR_MS, ORGULLO_MS, emitirAccionAgente, estadoPorAccion,
  onAccionAgente, suscribirEstadoMausbot,
} from "@/lib/mausbot/estado-astraura";

beforeEach(() => {
  quantumOrbBus.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("aviso de acción de los bots de Astraura", () => {
  it("estadoPorAccion: «working» mientras actúa y «proud» al acabar", () => {
    expect(estadoPorAccion({ accion: "clic", fase: "empezar" })).toBe("working");
    expect(estadoPorAccion({ accion: "clic", fase: "acabar" })).toBe("proud");
  });

  it("onAccionAgente entrega cada aviso y desuscribirse lo aparta", () => {
    const recibidos: string[] = [];
    const baja = onAccionAgente((a) => recibidos.push(`${a.accion}:${a.fase}`));
    emitirAccionAgente({ accion: "escribir", fase: "empezar" });
    baja();
    emitirAccionAgente({ accion: "escribir", fase: "acabar" });
    expect(recibidos).toEqual(["escribir:empezar"]);
  });
});

describe("suscribirEstadoMausbot (contrato §3 y §6)", () => {
  it("traduce la voz de la orbe al estado del Mausbot", () => {
    const estados: string[] = [];
    const baja = suscribirEstadoMausbot((e) => estados.push(e));
    emitQuantumOrbState("thinking");
    emitQuantumOrbState("error");
    emitQuantumOrbState("speaking");
    baja();
    expect(estados).toEqual(["thinking", "confused", "happy"]);
  });

  it("una acción pone «working» y, al acabar, «proud» 1,5 s hasta «idle»", () => {
    const estados: string[] = [];
    const baja = suscribirEstadoMausbot((e) => estados.push(e));
    emitirAccionAgente({ accion: "clic", fase: "empezar" });
    emitirAccionAgente({ accion: "clic", fase: "acabar" });
    expect(estados.at(-2)).toBe("working");
    expect(estados.at(-1)).toBe("proud");
    vi.advanceTimersByTime(ORGULLO_MS - 1);
    expect(estados.at(-1)).toBe("proud");
    vi.advanceTimersByTime(1);
    expect(estados.at(-1)).toBe("idle");
    baja();
  });

  it("sin señal 2 min entra «drowsy» y 10 min «sleeping»", () => {
    const estados: string[] = [];
    const baja = suscribirEstadoMausbot((e) => estados.push(e));
    vi.advanceTimersByTime(ADORMECER_MS);
    expect(estados).toEqual(["drowsy"]);
    vi.advanceTimersByTime(DORMIR_MS - ADORMECER_MS);
    expect(estados).toEqual(["drowsy", "sleeping"]);
    baja();
  });

  it("cada señal reencola el adormecer y el dormir", () => {
    const estados: string[] = [];
    const baja = suscribirEstadoMausbot((e) => estados.push(e));
    vi.advanceTimersByTime(ADORMECER_MS - 1000);
    emitQuantumOrbState("listening");
    vi.advanceTimersByTime(ADORMECER_MS - 1000);
    expect(estados).toEqual(["listening"]);
    vi.advanceTimersByTime(1000);
    expect(estados).toEqual(["listening", "drowsy"]);
    baja();
  });

  it("desuscribirse cancela orgullo, adormecer y dormir", () => {
    const estados: string[] = [];
    const baja = suscribirEstadoMausbot((e) => estados.push(e));
    emitirAccionAgente({ accion: "navegar", fase: "acabar" });
    baja();
    vi.advanceTimersByTime(ORGULLO_MS + DORMIR_MS);
    emitQuantumOrbState("idle");
    expect(estados).toEqual(["proud"]);
  });
});

