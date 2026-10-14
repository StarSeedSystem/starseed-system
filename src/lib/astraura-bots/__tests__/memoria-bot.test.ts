// Pruebas de la memoria propia del bot (BOT1011Q): cuota, olvido y transferencia.

import { describe, expect, it } from "vitest";
import {
  CUOTA_POR_MEDIO,
  cuotaPara,
  planTransferencia,
  puntuar,
  regular,
  type DestinoTransferencia,
  type RecuerdoBot,
} from "../memoria-bot";

const AHORA = 1_800_000_000_000; // marca fija: determinismo en todos los tests
const DIA = 24 * 60 * 60 * 1000;

function recuerdo(parcial: Partial<RecuerdoBot> & { id: string }): RecuerdoBot {
  return {
    botId: "astraura:perf-1",
    alcance: "publica",
    texto: `recuerdo ${parcial.id}`,
    origen: "prueba",
    at: AHORA,
    bytes: 10,
    usos: 0,
    ...parcial,
  };
}

const origen = { neurona: "local", cuentaId: "cuenta-1" };
const otraPropia: DestinoTransferencia = { neurona: "portatil", cuentaId: "cuenta-1", tipo: "propia" };
const ajena: DestinoTransferencia = { neurona: "nube", cuentaId: "cuenta-2", tipo: "propia" };
const grupoA: DestinoTransferencia = { neurona: "srv-a", cuentaId: "cuenta-2", tipo: "servidor-grupo", grupoId: "grupo-a" };
const grupoB: DestinoTransferencia = { neurona: "srv-b", cuentaId: "cuenta-2", tipo: "grupo", grupoId: "grupo-b" };

describe("cuota por medio", () => {
  it("declara las cinco cuotas en orden creciente web < xr < pwa < nativo < servidor", () => {
    expect(CUOTA_POR_MEDIO.web).toBe(5 * 1024 * 1024);
    expect(CUOTA_POR_MEDIO.servidor).toBe(2 * 1024 * 1024 * 1024);
    expect(CUOTA_POR_MEDIO.web).toBeLessThan(CUOTA_POR_MEDIO.xr);
    expect(CUOTA_POR_MEDIO.xr).toBeLessThan(CUOTA_POR_MEDIO.pwa);
    expect(CUOTA_POR_MEDIO.pwa).toBeLessThan(CUOTA_POR_MEDIO.nativo);
    expect(CUOTA_POR_MEDIO.nativo).toBeLessThan(CUOTA_POR_MEDIO.servidor);
  });

  it("es editable con un factor y nunca baja de cero", () => {
    expect(cuotaPara("web", 2)).toBe(2 * CUOTA_POR_MEDIO.web);
    expect(cuotaPara("web", 0)).toBe(0);
    expect(cuotaPara("web")).toBe(CUOTA_POR_MEDIO.web);
  });
});

describe("puntuar", () => {
  it("premia los usos y la recencia (vida media 30 días)", () => {
    const nuevo = recuerdo({ id: "n" });
    const usado = recuerdo({ id: "u", usos: 9 });
    const viejo = recuerdo({ id: "v", at: AHORA - 30 * DIA });
    expect(puntuar(nuevo, AHORA)).toBeCloseTo(1);
    expect(puntuar(usado, AHORA)).toBeCloseTo(10);
    expect(puntuar(viejo, AHORA)).toBeCloseTo(0.5);
    expect(puntuar(usado, AHORA)).toBeGreaterThan(puntuar(nuevo, AHORA));
    expect(puntuar(nuevo, AHORA)).toBeGreaterThan(puntuar(viejo, AHORA));
  });
});

describe("regular", () => {
  it("respeta la cuota olvidando primero lo de menor puntuación", () => {
    const lista = [
      recuerdo({ id: "viejo", at: AHORA - 90 * DIA }),
      recuerdo({ id: "medio", at: AHORA - 10 * DIA }),
      recuerdo({ id: "nuevo" }),
    ];
    const { conservar, olvidar } = regular(lista, 20, AHORA);
    expect(conservar.map((r) => r.id)).toEqual(["medio", "nuevo"]);
    expect(olvidar.map((r) => r.id)).toEqual(["viejo"]);
  });

  it("nunca olvida un recuerdo fijado aunque sea el más viejo", () => {
    const lista = [
      recuerdo({ id: "fijado", at: AHORA - 900 * DIA, fijado: true }),
      recuerdo({ id: "nuevo" }),
    ];
    const { conservar, olvidar } = regular(lista, 10, AHORA);
    expect(conservar.map((r) => r.id)).toEqual(["fijado"]);
    expect(olvidar.map((r) => r.id)).toEqual(["nuevo"]);
  });

  it("con cuota cero conserva solo lo fijado", () => {
    const lista = [recuerdo({ id: "a" }), recuerdo({ id: "b", fijado: true })];
    const { conservar, olvidar } = regular(lista, 0, AHORA);
    expect(conservar.map((r) => r.id)).toEqual(["b"]);
    expect(olvidar.map((r) => r.id)).toEqual(["a"]);
  });

  it("es determinista: desempata por id ante puntuaciones iguales", () => {
    const lista = [recuerdo({ id: "b" }), recuerdo({ id: "a" }), recuerdo({ id: "c" })];
    const una = regular(lista, 20, AHORA);
    const otra = regular([...lista].reverse(), 20, AHORA);
    expect(una.olvidar.map((r) => r.id)).toEqual(["a"]);
    expect(otra.olvidar.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("planTransferencia", () => {
  it("lo personal y lo del perfil solo van a neuronas propias de la misma cuenta", () => {
    const lista = [
      recuerdo({ id: "p", alcance: "personal" }),
      recuerdo({ id: "f", alcance: "perfil" }),
    ];
    const plan = planTransferencia(lista, origen, [otraPropia, ajena, grupoA]);
    expect(plan).toHaveLength(1);
    expect(plan[0].destino).toBe(otraPropia);
    expect(plan[0].ids).toEqual(["p", "f"]);
  });

  it("lo de grupo solo viaja a destinos de ese grupo", () => {
    const lista = [recuerdo({ id: "g", alcance: "grupo", grupoId: "grupo-a" })];
    const plan = planTransferencia(lista, origen, [otraPropia, grupoA, grupoB, ajena]);
    expect(plan).toHaveLength(1);
    expect(plan[0].destino).toBe(grupoA);
    expect(plan[0].ids).toEqual(["g"]);
  });

  it("lo público viaja libre a todos los destinos", () => {
    const lista = [recuerdo({ id: "pub" })];
    const plan = planTransferencia(lista, origen, [otraPropia, ajena, grupoA]);
    expect(plan).toHaveLength(3);
    for (const tramo of plan) expect(tramo.ids).toEqual(["pub"]);
  });

  it("nunca se transfiere a la propia neurona de origen", () => {
    const lista = [recuerdo({ id: "pub" })];
    const plan = planTransferencia(lista, origen, [
      { neurona: "local", cuentaId: "cuenta-1", tipo: "propia" },
    ]);
    expect(plan).toEqual([]);
  });

  it("no duplica un recuerdo dos veces al mismo destino aunque venga repetido", () => {
    const lista = [recuerdo({ id: "pub" }), recuerdo({ id: "pub" })];
    const plan = planTransferencia(lista, origen, [otraPropia]);
    expect(plan[0].ids).toEqual(["pub"]);
  });

  it("devuelve un plan vacío sin destinos o sin recuerdos", () => {
    expect(planTransferencia([recuerdo({ id: "x" })], origen, [])).toEqual([]);
    expect(planTransferencia([], origen, [otraPropia])).toEqual([]);
  });
});
