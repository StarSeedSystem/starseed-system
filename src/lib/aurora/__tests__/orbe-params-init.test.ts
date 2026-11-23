import { beforeEach, describe, expect, it } from "vitest";
import { quantumOrbBus } from "@/lib/aurora/quantum-orb-bus";
import { crearCanalOrbeParams, puenteBusACanal, type CanalBroadcastMin, type ClienteRealtimeMin } from "../canal-orbe-params";
import { inicializarCanalOrbeParams, terminarCanalOrbeParams } from "../orbe-params-init";

const esperar = () => new Promise((r) => setTimeout(r, 5));

function servidorMock(permitido = true) {
  const enviados: { tema: string; evento: string; carga: unknown }[] = [];
  const oyentes = new Map<string, Set<(m: { payload?: unknown }) => void>>();
  const abiertos: { tema: string; self: boolean }[] = [];
  function cliente(): ClienteRealtimeMin {
    return {
      channel(tema, opciones) {
        abiertos.push({ tema, self: opciones.config.broadcast.self });
        const c: CanalBroadcastMin = {
          on(_t, _f, cb) {
            if (!oyentes.has(tema)) oyentes.set(tema, new Set());
            oyentes.get(tema)!.add(cb);
            return c;
          },
          subscribe(cb) {
            setTimeout(() => cb(permitido ? "SUBSCRIBED" : "CHANNEL_ERROR", permitido ? undefined : new Error("sin permiso")), 0);
            return c;
          },
          async send(m) {
            enviados.push({ tema, evento: m.event, carga: m.payload });
            for (const cb of oyentes.get(tema) ?? []) cb({ payload: m.payload });
            return "ok";
          },
        };
        return c;
      },
      removeChannel() {},
    };
  }
  return { cliente, enviados, abiertos };
}

describe("orbe-params-init — inicialización del canal orb_params", () => {
  beforeEach(() => {
    quantumOrbBus.clear("params");
  });

  it("inicializa el canal y publica en orb_params lo que emite el bus local", async () => {
    const s = servidorMock();
    const { cliente } = s;

    const cleanup = inicializarCanalOrbeParams({ cliente: cliente() });
    await esperar();

    expect(s.abiertos).toEqual([{ tema: "orb_params", self: false }]);

    quantumOrbBus.emit("params", { turbulence: 0.4, breath: 0.9 });
    await esperar();

    expect(s.enviados[0]).toMatchObject({
      tema: "orb_params",
      evento: "params",
      carga: { params: { turbulence: 0.4, breath: 0.9 } },
    });

    cleanup();
    quantumOrbBus.emit("params", { turbulence: 0.1 });
    await esperar();
    expect(s.enviados).toHaveLength(1);
  });

  it("termina el canal y deja de publicar", async () => {
    const s = servidorMock();
    const { cliente } = s;

    const cleanup = inicializarCanalOrbeParams({ cliente: cliente() });
    await esperar();

    quantumOrbBus.emit("params", { turbulence: 0.5 });
    await esperar();
    expect(s.enviados).toHaveLength(1);

    cleanup();
    await esperar();

    quantumOrbBus.emit("params", { turbulence: 0.7 });
    await esperar();
    expect(s.enviados).toHaveLength(1);
  });

  it("no falla si el cliente es null (sin conexión realtime)", async () => {
    const cleanup = inicializarCanalOrbeParams({ cliente: null });
    expect(cleanup).toBeDefined();
    cleanup();
  });
});