import { beforeEach, describe, expect, it } from "vitest";
import { emitQuantumOrbParams, quantumOrbBus } from "@/lib/aurora/quantum-orb-bus";
import {
  EVENTO_ORBE_PARAMS,
  TEMA_ORBE_PARAMS,
  crearCanalOrbeParams,
  leerAnuncioOrbe,
  puenteBusACanal,
  type CanalBroadcastMin,
  type ClienteRealtimeMin,
} from "../canal-orbe-params";

const esperar = () => new Promise((r) => setTimeout(r, 5));

function servidor(permitido = true) {
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

describe("canal orb_params — telemetría visual de la orbe", () => {
  beforeEach(() => quantumOrbBus.clear("params"));

  it("abre el tema orb_params en difusión y publica el vector completo con su marca de tiempo", async () => {
    const s = servidor();
    const canal = crearCanalOrbeParams({ cliente: s.cliente(), ahora: () => 1234 });
    await esperar();
    expect(TEMA_ORBE_PARAMS).toBe("orb_params");
    expect(EVENTO_ORBE_PARAMS).toBe("params");
    expect(s.abiertos).toEqual([{ tema: "orb_params", self: false }]);
    const vector = { turbulence: 0.7, spikiness: 0.3, symmetry: 0.8, hueShift: 0.2, breath: 0.6 };
    expect(await canal.publicar(vector)).toBe(true);
    expect(s.enviados).toEqual([{ tema: "orb_params", evento: "params", carga: { params: vector, at: 1234 } }]);
    canal.cerrar();
  });

  it("no publica antes de estar unido ni un vector vacío o inválido", async () => {
    const s = servidor();
    const canal = crearCanalOrbeParams({ cliente: s.cliente() });
    expect(await canal.publicar({ turbulence: 0.5 })).toBe(false);
    await esperar();
    expect(await canal.publicar({})).toBe(false);
    expect(await canal.publicar({ turbulence: Number.NaN })).toBe(false);
    expect(s.enviados).toEqual([]);
    canal.cerrar();
  });

  it("reparte a los suscriptores el anuncio validado y acota los valores a 0..1", async () => {
    const s = servidor();
    const emisor = crearCanalOrbeParams({ cliente: s.cliente() });
    const receptor = crearCanalOrbeParams({ cliente: s.cliente() });
    const recibidos: unknown[] = [];
    receptor.suscribir((a) => recibidos.push(a));
    await esperar();
    await emisor.publicar({ turbulence: 1.5, spikiness: -0.3, symmetry: 0.5 });
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0]).toMatchObject({ params: { turbulence: 1, spikiness: 0, symmetry: 0.5 } });
    emisor.cerrar();
    receptor.cerrar();
  });

  it("ignora cargas basura y rechaza la unión con motivo", async () => {
    expect(leerAnuncioOrbe(null)).toBeNull();
    expect(leerAnuncioOrbe({ params: { nope: 1 } })).toBeNull();
    expect(leerAnuncioOrbe({ params: { breath: 0.4 } })).toMatchObject({ params: { breath: 0.4 } });
    const s = servidor(false);
    const canal = crearCanalOrbeParams({ cliente: s.cliente() });
    await esperar();
    expect(canal.estado().union).toBe("rechazado");
    expect(canal.estado().motivo).toMatch(/orb_params/);
    expect(await canal.publicar({ breath: 0.5 })).toBe(false);
    canal.cerrar();
  });

  it("el puente publica en orb_params lo que emite el bus local de la orbe", async () => {
    const s = servidor();
    const canal = crearCanalOrbeParams({ cliente: s.cliente() });
    const desenganchar = puenteBusACanal(canal);
    await esperar();
    emitQuantumOrbParams({ turbulence: 0.4, breath: 0.9 });
    await esperar();
    expect(s.enviados[0]).toMatchObject({
      tema: "orb_params",
      evento: "params",
      carga: { params: { turbulence: 0.4, breath: 0.9 } },
    });
    desenganchar();
    emitQuantumOrbParams({ turbulence: 0.1 });
    await esperar();
    expect(s.enviados).toHaveLength(1);
    canal.cerrar();
  });
});
