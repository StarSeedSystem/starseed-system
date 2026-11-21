import { beforeEach, describe, expect, it } from "vitest";
import { readAstraura158Sse } from "@/ai/providers/astraura-158";
import { onQuantumOrbParams, quantumOrbBus } from "@/lib/aurora/quantum-orb-bus";
import type { QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";
import { publicarParamsDeOrbe158, vectorDeParams158 } from "@/lib/astraura/params-orbe-158";

const CLAVES = ["turbulence", "spikiness", "symmetry", "hueShift", "breath"];

function respuestaSse(lineas: string[]): Response {
  const codificador = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const l of lineas) c.enqueue(codificador.encode(`${l}\n`));
        c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

describe("vectorDeParams158", () => {
  it("se queda solo con las cinco claves del vector", () => {
    const v = vectorDeParams158({
      turbulence: 0.7,
      spikiness: 0.3,
      symmetry: 0.8,
      hueShift: 0.2,
      breath: 0.6,
      ignorado: 0.9,
      color: "#fff",
    });
    expect(Object.keys(v).sort()).toEqual([...CLAVES].sort());
  });

  it("recorta a 0..1 y redondea a milésimas", () => {
    const v = vectorDeParams158({ turbulence: 1.5, spikiness: -0.4, breath: 0.123456 });
    expect(v.turbulence).toBe(1);
    expect(v.spikiness).toBe(0);
    expect(v.breath).toBe(0.123);
  });

  it("descarta lo que no sea número finito", () => {
    const v = vectorDeParams158({ turbulence: "0.7", spikiness: NaN, symmetry: Infinity, breath: null });
    expect(v).toEqual({});
  });

  it("entrada que no es objeto: vector vacío", () => {
    expect(vectorDeParams158(null)).toEqual({});
    expect(vectorDeParams158("params")).toEqual({});
    expect(vectorDeParams158([0.5])).toEqual({});
  });
});

describe("publicarParamsDeOrbe158", () => {
  beforeEach(() => {
    quantumOrbBus.clear("params");
  });

  it("publica la forma anidada y la plana en el canal params", () => {
    const recibidos: Partial<QuantumOrbParams>[] = [];
    const baja = onQuantumOrbParams((p) => recibidos.push(p));

    expect(publicarParamsDeOrbe158({ params: { turbulence: 0.6, breath: 0.4 } })).toBe(true);
    expect(publicarParamsDeOrbe158({ turbulence: 0.2, symmetry: 0.9 })).toBe(true);

    expect(recibidos).toHaveLength(2);
    expect(recibidos[0]).toEqual({ turbulence: 0.6, breath: 0.4 });
    expect(recibidos[1]).toEqual({ turbulence: 0.2, symmetry: 0.9 });

    baja();
  });

  it("un vector inválido no emite nada y devuelve false", () => {
    const recibidos: Partial<QuantumOrbParams>[] = [];
    const baja = onQuantumOrbParams((p) => recibidos.push(p));

    expect(publicarParamsDeOrbe158({ nada: 1 })).toBe(false);
    expect(publicarParamsDeOrbe158(null)).toBe(false);
    expect(recibidos).toHaveLength(0);

    baja();
  });
});

describe("readAstraura158Sse — params del 1.58b", () => {
  beforeEach(() => {
    quantumOrbBus.clear("params");
  });

  it("reenvía al bus el vector que llega entre tokens, sin tocar el texto", async () => {
    const recibidos: Partial<QuantumOrbParams>[] = [];
    const baja = onQuantumOrbParams((p) => recibidos.push(p));

    const res = respuestaSse([
      'data: {"type":"token","token":"Hola"}',
      'data: {"type":"params","params":{"turbulence":0.8,"spikiness":0.2}}',
      'data: {"type":"token","token":" mundo"}',
      'data: {"type":"done","full_text":"Hola mundo"}',
    ]);
    const out = await readAstraura158Sse(res);

    expect(out.text).toBe("Hola mundo");
    expect(recibidos).toEqual([{ turbulence: 0.8, spikiness: 0.2 }]);

    baja();
  });

  it("acepta la forma plana del evento", async () => {
    const recibidos: Partial<QuantumOrbParams>[] = [];
    const baja = onQuantumOrbParams((p) => recibidos.push(p));

    await readAstraura158Sse(respuestaSse(['data: {"type":"params","symmetry":0.9,"breath":0.3}']));

    expect(recibidos).toEqual([{ symmetry: 0.9, breath: 0.3 }]);

    baja();
  });
});
