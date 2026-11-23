import { beforeEach, describe, expect, it } from "vitest";
import {
  emitQuantumOrbParams,
  onQuantumOrbParams,
  quantumOrbBus,
} from "@/lib/aurora/quantum-orb-bus";
import {
  crearCanalOrbeParams,
  type CanalBroadcastMin,
  type ClienteRealtimeMin,
} from "@/lib/aurora/canal-orbe-params";
import { montarPublicadorOrbeParams } from "@/components/aurora/orbe-params-publisher";

const esperar = () => new Promise((r) => setTimeout(r, 5));

function servidor() {
  const enviados: { tema: string; evento: string; carga: unknown }[] = [];
  const oyentes = new Map<string, Set<(m: { payload?: unknown }) => void>>();
  function cliente(): ClienteRealtimeMin {
    return {
      channel(tema) {
        const c: CanalBroadcastMin = {
          on(_t, _f, cb) {
            if (!oyentes.has(tema)) oyentes.set(tema, new Set());
            oyentes.get(tema)!.add(cb);
            return c;
          },
          subscribe(cb) {
            setTimeout(() => cb("SUBSCRIBED"), 0);
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
  return { cliente, enviados };
}

describe("orbe-params-publisher — publicación del vector de la orbe", () => {
  beforeEach(() => quantumOrbBus.clear("params"));

  it("publica en orb_params lo que se emite en el bus local", async () => {
    const s = servidor();
    const desmontar = montarPublicadorOrbeParams({ cliente: s.cliente(), ahora: () => 42 });
    await esperar();
    emitQuantumOrbParams({ turbulence: 0.4, breath: 0.9 });
    await esperar();
    expect(s.enviados).toEqual([
      {
        tema: "orb_params",
        evento: "params",
        carga: { params: { turbulence: 0.4, breath: 0.9 }, at: 42 },
      },
    ]);
    desmontar();
    emitQuantumOrbParams({ turbulence: 0.1 });
    await esperar();
    expect(s.enviados).toHaveLength(1);
  });

  it("lo remoto vuelve al bus local sin re-publicarse (sin bucle)", async () => {
    const s = servidor();
    const emisor = crearCanalOrbeParams({ cliente: s.cliente() });
    const desmontar = montarPublicadorOrbeParams({ cliente: s.cliente() });
    const recibidos: unknown[] = [];
    const desuscribir = onQuantumOrbParams((p) => recibidos.push(p));
    await esperar();
    await emisor.publicar({ turbulence: 0.6, symmetry: 0.2 });
    await esperar();
    expect(recibidos).toEqual([{ turbulence: 0.6, symmetry: 0.2 }]);
    expect(s.enviados).toHaveLength(1);
    desuscribir();
    desmontar();
    emisor.cerrar();
  });
});
