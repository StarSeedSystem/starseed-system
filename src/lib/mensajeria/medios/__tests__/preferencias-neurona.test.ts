// @vitest-environment jsdom
/**
 * (NEU1107B) Medios de transmisión preferidos de cada NEURONA: lo que sale de este aparato los usa salvo
 * que el chat tenga los suyos (chat → neurona → generales). Un estado guardado por una web anterior (sin
 * `porNeurona`) sigue valiendo.
 *   NODE_ENV=test npx vitest run src/lib/mensajeria/medios/__tests__/preferencias-neurona.test.ts
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  CLAVE_PREFERENCIAS_MEDIO,
  cambiarPreferenciasChat,
  cambiarPreferenciasNeurona,
  efectivasDe,
  estadoPreferenciasMedio,
  leerEstado,
  neuronaDeEsteMedio,
  preferenciasEfectivas,
  propiasDeNeurona,
} from "../preferencias-store";
import type { PreferenciasMedio } from "../tipos";

const NEURONA = "62d50afc-0000-4000-8000-000000000002";
const sinInternet: PreferenciasMedio = { modo: "elegidos", elegidos: ["local", "wifi-local", "lora"], siNinguno: "esperar" };
const soloServidor: PreferenciasMedio = { modo: "elegidos", elegidos: ["servidor"], siNinguno: "avisar" };

beforeEach(() => {
  window.localStorage.clear();
});

describe("medios por neurona", () => {
  it("orden: chat → neurona → generales", () => {
    const e = leerEstado(JSON.stringify({ global: { modo: "auto" }, porChat: { "dm:1": soloServidor }, porNeurona: { [NEURONA]: sinInternet } }));
    expect(efectivasDe(e, "dm:1", NEURONA)).toEqual(soloServidor);
    expect(efectivasDe(e, "dm:2", NEURONA)).toEqual(sinInternet);
    expect(efectivasDe(e, "dm:2", "otra-neurona")).toMatchObject({ modo: "auto" });
    expect(efectivasDe(e, null, null)).toMatchObject({ modo: "auto" });
    expect(propiasDeNeurona(e, NEURONA)).toEqual(sinInternet);
    expect(propiasDeNeurona(e, null)).toBeNull();
  });

  it("al enviar se usan las de la neurona de ESTE medio; volver a los generales las quita", () => {
    window.localStorage.setItem("starseed.neuron.device-id", NEURONA);
    expect(neuronaDeEsteMedio()).toBe(NEURONA);
    cambiarPreferenciasNeurona(NEURONA, sinInternet);
    expect(preferenciasEfectivas("neurona:x")).toEqual(sinInternet);
    // Un chat con los suyos manda.
    cambiarPreferenciasChat("neurona:x", soloServidor);
    expect(preferenciasEfectivas("neurona:x")).toEqual(soloServidor);
    cambiarPreferenciasNeurona(NEURONA, null);
    expect(estadoPreferenciasMedio().porNeurona).toBeUndefined();
    expect(preferenciasEfectivas("dm:sin-propias")).toMatchObject({ modo: "auto" });
    // Lo demás del almacén no se toca.
    expect(JSON.parse(window.localStorage.getItem(CLAVE_PREFERENCIAS_MEDIO) ?? "{}").porChat["neurona:x"]).toEqual(soloServidor);
  });

  it("un estado de una web anterior (sin porNeurona) sigue igual; basura en porNeurona se ignora", () => {
    const viejo = leerEstado(JSON.stringify({ global: soloServidor, porChat: {} }));
    expect(viejo.porNeurona).toBeUndefined();
    expect(efectivasDe(viejo, null, NEURONA)).toEqual(soloServidor);
    const raro = leerEstado(JSON.stringify({ porNeurona: { "": sinInternet, [NEURONA]: { modo: "elegidos", elegidos: ["inventado", "lora"] } } }));
    expect(Object.keys(raro.porNeurona ?? {})).toEqual([NEURONA]);
    expect(raro.porNeurona?.[NEURONA].elegidos).toEqual(["lora"]);
  });
});
