/**
 * (NEU1108A) Los dos «Neurona de tu cuenta (anónima)» del radar de la tableta (08-11): faros propios con el
 * id de una neurona absorbida o de esta misma neurona en otro origen. Se llevan a la neurona vigente (y se
 * funden con su señal), se quitan si son «Tú» o están caducados, y los de otras cuentas no se tocan.
 *   NODE_ENV=test npx vitest run src/lib/senales/__tests__/faros-propios.test.ts
 */
import { describe, expect, it } from "vitest";
import { FARO_PROPIO_VIGENTE_MS, resolverFarosPropios, type FaroMin } from "../faros-propios";

const AHORA = Date.parse("2026-11-08T01:30:00Z");
const BOARD = "e0b9faf2-0000-4000-8000-000000000001";
const NUEVA = "26f5a00d-0000-4000-8000-000000000008";
const MAC = "62d50afc-0000-4000-8000-000000000002";
const MAC_WEB = "f41ed104-0000-4000-8000-000000000005";
const alias: Record<string, string> = { [NUEVA]: BOARD, [MAC_WEB]: MAC };
const vigente = (id: string) => alias[id] ?? id;
const faro = (deviceId: string, extra: Partial<FaroMin>): FaroMin => ({ deviceId, label: null, own: true, at: AHORA - 60_000, ...extra });

describe("resolverFarosPropios", () => {
  it("en la tableta: el faro de la Mac en Chrome (absorbida) va a «MaggaBook»; el de la app vieja de la tableta es «Tú»", () => {
    const { faros, fuera } = resolverFarosPropios(
      [
        faro("mesh-mac-chrome", { neuronId: MAC_WEB }),
        faro("mesh-tableta-vercel", { neuronId: BOARD, at: AHORA - 25 * 60_000 }), // la app de antes de reinstalar
        faro("mesh-tableta-127-vieja", { neuronId: NUEVA }), // con el id de antes de fusionar
      ],
      { miNeurona: BOARD, neuronas: new Map([[MAC, "MaggaBook"]]), vigente, ahora: AHORA },
    );
    expect(faros).toEqual([{ deviceId: "mesh-mac-chrome", neuronId: MAC, label: "MaggaBook", own: true, at: AHORA - 60_000 }]);
    expect(fuera.map((f) => [f.faro.deviceId, f.motivo])).toEqual([
      ["mesh-tableta-vercel", "esta-neurona"],
      ["mesh-tableta-127-vieja", "esta-neurona"],
    ]);
  });

  it("propio sin neurona conocida: se queda si se renovó en su ciclo; si no, caducado", () => {
    const reciente = faro("mesh-x", { at: AHORA - 2 * 60_000 });
    const viejo = faro("mesh-y", { neuronId: "desconocida", at: AHORA - FARO_PROPIO_VIGENTE_MS - 1 });
    const r = resolverFarosPropios([reciente, viejo], { miNeurona: BOARD, neuronas: new Map(), vigente, ahora: AHORA });
    expect(r.faros.map((f) => f.deviceId)).toEqual(["mesh-x"]);
    expect(r.fuera).toEqual([{ faro: viejo, motivo: "caducado" }]);
  });

  it("los faros de otras cuentas no se tocan (siguen anónimos por diseño), ni aunque digan un id de los tuyos", () => {
    const ajeno = { deviceId: "mesh-ajeno", label: null, own: false, at: AHORA - 29 * 60_000, neuronId: BOARD };
    const r = resolverFarosPropios([ajeno], { miNeurona: BOARD, neuronas: new Map([[MAC, "MaggaBook"]]), vigente, ahora: AHORA });
    expect(r.faros).toEqual([ajeno]);
    expect(r.fuera).toEqual([]);
  });

  it("nunca lanza con datos raros", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(resolverFarosPropios([null as any, { deviceId: 5 } as any], { miNeurona: null, neuronas: new Map(), ahora: AHORA }).faros).toEqual([]);
  });
});
