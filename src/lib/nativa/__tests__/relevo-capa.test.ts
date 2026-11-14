import { describe, expect, it } from "vitest";
import { decidirRelevoNativo, identidadWeb, type ContextoRelevo } from "../relevo-capa";
import type { EstadoServidorLocal } from "../estado-servidor-local";

const ctx = (o: Partial<ContextoRelevo> = {}): ContextoRelevo => ({
  enLlamada: false,
  escribiendo: false,
  enLinea: true,
  yaPedidas: new Set(),
  ...o,
});
const estado = (o: Partial<EstadoServidorLocal> = {}): EstadoServidorLocal => ({
  fase: "local",
  capa_nueva: "BUILDNUEVA",
  web_corre: "aaa111/1111111111",
  web_nueva: "bbb222/2222222222",
  web_publicada: "ccc333/2222222222",
  relevo: "capa-lista",
  ...o,
});

describe("ACT1114H · relevo de capa en la misma sesión", () => {
  it("capa lista distinta de lo que corre y momento seguro: aplicar", () => {
    const r = decidirRelevoNativo(estado(), ctx());
    expect(r.accion).toBe("aplicar");
    expect(r.clave).toBe("BUILDNUEVA");
  });
  it("misma web (mismo sha, otro id de build): no hay nada que cambiar", () => {
    expect(decidirRelevoNativo(estado({ web_nueva: "zzz999/1111111111" }), ctx()).accion).toBe("nada");
  });
  it("nunca durante una llamada o mientras suena: espera", () => {
    const r = decidirRelevoNativo(estado(), ctx({ enLlamada: true }));
    expect(r).toMatchObject({ accion: "esperar", decision: "esperar-llamada" });
  });
  it("escribiendo o sin red: espera", () => {
    expect(decidirRelevoNativo(estado(), ctx({ escribiendo: true })).decision).toBe("esperar-escritura");
    expect(decidirRelevoNativo(estado(), ctx({ enLinea: false })).decision).toBe("esperar-red");
  });
  it("sin capa lista (o incompleta: la nativa no la anuncia): nada", () => {
    expect(decidirRelevoNativo(estado({ capa_nueva: null, web_nueva: null }), ctx()).accion).toBe("nada");
  });
  it("una vez por build: si ya se pidió (o falló), no se insiste", () => {
    const r = decidirRelevoNativo(estado(), ctx({ yaPedidas: new Set(["BUILDNUEVA"]) }));
    expect(r.accion).toBe("nada");
    // otra capa distinta sí se puede pedir
    expect(decidirRelevoNativo(estado({ capa_nueva: "OTRA" }), ctx({ yaPedidas: new Set(["BUILDNUEVA"]) })).accion).toBe("aplicar");
  });
  it("sin dato de qué corre o de qué trae la capa: no se adivina", () => {
    expect(decidirRelevoNativo(estado({ web_corre: null }), ctx()).accion).toBe("nada");
    expect(decidirRelevoNativo(estado({ web_nueva: null }), ctx()).accion).toBe("nada");
  });
  it("el servidor local no sirve (reiniciando, web publicada) o no hay estado: nada", () => {
    expect(decidirRelevoNativo(estado({ fase: "reiniciando" }), ctx()).accion).toBe("nada");
    expect(decidirRelevoNativo(estado({ fase: "web-publicada" }), ctx()).accion).toBe("nada");
    expect(decidirRelevoNativo(null, ctx()).accion).toBe("nada");
  });
  it("identidadWeb: manda el sha; sin sha, el id; «desconocida» no es nada", () => {
    expect(identidadWeb("a/ABCDEF1234")).toBe("sha:abcdef1234");
    expect(identidadWeb("solo-id")).toBe("build:solo-id");
    expect(identidadWeb("?/")).toBeNull();
    expect(identidadWeb(null)).toBeNull();
  });
});
