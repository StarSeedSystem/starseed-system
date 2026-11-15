// @vitest-environment jsdom
/**
 * (NEU1115G) Un alias de fusión sincronizado NO mueve a un aparato a la neurona de otro: solo si la
 * fusión la hizo este mismo origen. Caso del móvil del 15-11.
 *   NODE_ENV=test npx vitest run src/lib/neurons/__tests__/alias-no-mueve-aparato.test.ts
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _detenerLatidoParaPruebas, resolverAliasEsteMedio } from "../neurons";
import { CLAVE_FUSIONES } from "../fusion-alias";

const TABLET = "e0b9faf2-aaaa-4000-8000-000000000001";
const MOVIL = "659d5e03-bbbb-4000-8000-000000000002";
const SYNC = "sync-del-movil-0001";

function preparar(por?: string) {
  window.localStorage.clear();
  window.localStorage.setItem("starseed.neuron.device-id", MOVIL);
  window.localStorage.setItem("starseed.device.id", SYNC);
  window.localStorage.setItem(CLAVE_FUSIONES, JSON.stringify({ v: 1, alias: { [MOVIL]: { a: TABLET, ts: 1, ...(por ? { por } : {}) } }, respaldos: [] }));
}

describe("resolverAliasEsteMedio", () => {
  beforeEach(() => _detenerLatidoParaPruebas());

  it("un alias hecho desde otro aparato (o antiguo, sin autor) no mueve a este aparato", () => {
    preparar();
    expect(resolverAliasEsteMedio()).toBe(MOVIL);
    preparar("sync-de-la-tableta");
    expect(resolverAliasEsteMedio()).toBe(MOVIL);
    expect(window.localStorage.getItem("starseed.neuron.device-id")).toBe(MOVIL);
  });

  it("la fusión que hizo este mismo origen sí se sigue", () => {
    preparar(SYNC);
    expect(resolverAliasEsteMedio()).toBe(TABLET);
  });
});
