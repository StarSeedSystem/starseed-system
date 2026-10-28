import { beforeEach, describe, expect, it } from "vitest";
import {
  CLAVE_MAUSBOT, CONFIG_MAUSBOT_DEFECTO, DISENO_MAUSBOT_FABRICA, EVENTO_MAUSBOT, disenoParaPersonalidad,
  fusionarResolucion, guardarConfigMausbot, leerConfigMausbot, normalizarConfigMausbot, resolverMausbot,
  type ParcheMausbot,
} from "../config";

class AlmacenMemoria {
  private readonly datos = new Map<string, string>();
  getItem(clave: string): string | null { return this.datos.get(clave) ?? null; }
  setItem(clave: string, valor: string): void { this.datos.set(clave, valor); }
}
describe("config del mausbot", () => {
  let eventos: string[];
  beforeEach(() => {
    eventos = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: new AlmacenMemoria(),
        dispatchEvent: (evento: Event) => { eventos.push(evento.type); return true; },
      },
    });
  });
  it("declara la clave, el evento y el diseño de fábrica", () => {
    expect(CLAVE_MAUSBOT).toBe("starseed.mausbot.v1");
    expect(EVENTO_MAUSBOT).toBe("starseed:mausbot");
    expect(DISENO_MAUSBOT_FABRICA).toBe("fabrica-cursor");
  });
  it("apagada por defecto, en modo acompañante y con permiso de proponer", () => {
    expect(CONFIG_MAUSBOT_DEFECTO).toMatchObject({
      v: 1, encendido: false, modo: "acompanante", actuar: "proponer",
    });
    expect(leerConfigMausbot()).toEqual(normalizarConfigMausbot(CONFIG_MAUSBOT_DEFECTO));
  });
  it("lee y sanea lo guardado", () => {
    window.localStorage.setItem(CLAVE_MAUSBOT, JSON.stringify({
      v: 1, encendido: true, modo: "ambos", actuar: "aplicar-bajo",
      porPersonalidad: { sol: "orbe-luna" },
      perfiles: { p1: { encendido: false } },
      neuronas: { n1: { modo: "cursor" } },
    }));
    const cfg = leerConfigMausbot();
    expect(cfg).toMatchObject({
      v: 1, encendido: true, modo: "ambos", actuar: "aplicar-bajo", porPersonalidad: { sol: "orbe-luna" },
    });
    expect(cfg.perfiles.p1).toEqual({ encendido: false });
    expect(cfg.neuronas.n1).toEqual({ modo: "cursor" });
  });
  it("cae al defecto con JSON roto, basura o versión desconocida", () => {
    window.localStorage.setItem(CLAVE_MAUSBOT, "{no soy json");
    expect(leerConfigMausbot().encendido).toBe(false);
    window.localStorage.setItem(CLAVE_MAUSBOT, "42");
    expect(leerConfigMausbot().modo).toBe("acompanante");
    window.localStorage.setItem(CLAVE_MAUSBOT, JSON.stringify({ v: 99, encendido: true }));
    expect(leerConfigMausbot().encendido).toBe(false);
    expect(eventos).toEqual([]);
  });
  it("sanea valores imposibles en lugar de explotar", () => {
    window.localStorage.setItem(CLAVE_MAUSBOT, JSON.stringify({
      v: 1, modo: "volar", actuar: "todo", porPersonalidad: { sol: 7, luna: "luna-azul" },
    }));
    expect(leerConfigMausbot()).toMatchObject({
      modo: "acompanante", actuar: "proponer", porPersonalidad: { luna: "luna-azul" },
    });
  });
  it("guarda un parche y conserva lo que no cambia", () => {
    expect(guardarConfigMausbot({ encendido: true, porPersonalidad: { sol: "sol-dorado" } })).toBe(true);
    expect(leerConfigMausbot()).toMatchObject({
      encendido: true, modo: "acompanante", porPersonalidad: { sol: "sol-dorado" },
    });
    expect(eventos).toEqual([EVENTO_MAUSBOT]);
    guardarConfigMausbot({
      disenoPorDefecto: "orbe-luna", perfiles: { p1: { modo: "cursor" } }, neuronas: { n1: { encendido: true } },
    });
    expect(leerConfigMausbot()).toMatchObject({
      encendido: true, disenoPorDefecto: "orbe-luna", porPersonalidad: { sol: "sol-dorado" },
      perfiles: { p1: { modo: "cursor" } }, neuronas: { n1: { encendido: true } },
    });
    expect(eventos).toEqual([EVENTO_MAUSBOT, EVENTO_MAUSBOT]);
  });
  it("rechaza un parche con valores imposibles sin perder lo guardado", () => {
    guardarConfigMausbot({ modo: "cursor" });
    const malo = { modo: "volar", actuar: "todo", porPersonalidad: { sol: 7 } } as unknown as ParcheMausbot;
    expect(guardarConfigMausbot(malo)).toBe(true);
    expect(leerConfigMausbot()).toMatchObject({ modo: "cursor", actuar: "proponer", porPersonalidad: {} });
  });
  it("sobrevive sin localStorage", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { dispatchEvent: (evento: Event) => { eventos.push(evento.type); return true; } },
    });
    expect(leerConfigMausbot().encendido).toBe(false);
    expect(guardarConfigMausbot({ encendido: true })).toBe(false);
    expect(eventos).toEqual([]); // sin almacenamiento tampoco hay evento
  });
  it("resuelve neurona › perfil › cuenta", () => {
    const cfg = normalizarConfigMausbot({
      v: 1, encendido: false, modo: "acompanante", disenoPorDefecto: "cuenta-luna",
      perfiles: { p1: { encendido: true, disenoPorDefecto: "perfil-estrella", porPersonalidad: { sol: "perfil-sol" } } },
      neuronas: { n1: { encendido: false, modo: "ambos", porPersonalidad: { sol: "neurona-sol", luna: "neurona-luna" } }, n2: {} },
    });
    const perNeurona = fusionarResolucion(cfg, "p1", "n1");
    expect(perNeurona.encendido).toBe(false); // la neurona manda sobre el perfil
    expect(perNeurona).toMatchObject({ modo: "ambos", disenoPorDefecto: "perfil-estrella" });
    expect(perNeurona.porPersonalidad).toEqual({ sol: "neurona-sol", luna: "neurona-luna" });
    expect(fusionarResolucion(cfg, "p1").encendido).toBe(true);
    expect(fusionarResolucion(cfg, "p1").porPersonalidad).toEqual({ sol: "perfil-sol" });
    expect(fusionarResolucion(cfg, undefined, "n2").modo).toBe("acompanante");
    expect(fusionarResolucion(cfg, "p-x", "n-x")).toMatchObject({
      encendido: false, modo: "acompanante", disenoPorDefecto: "cuenta-luna", actuar: "proponer",
    });
    expect(fusionarResolucion(cfg, "p-x", "n-x").porPersonalidad).toEqual({});
  });
  it("resolverMausbot lee del almacén con ids de perfil y neurona", () => {
    guardarConfigMausbot({ perfiles: { pf: { encendido: true } }, neuronas: { nr: { modo: "ambos" } } });
    expect(resolverMausbot({ perfilId: "pf", neuronaId: "nr" })).toMatchObject({
      encendido: true, modo: "ambos",
    });
    expect(resolverMausbot({ perfilId: "pf" }).encendido).toBe(true);
    expect(resolverMausbot()).toMatchObject({ encendido: false, modo: "acompanante" });
  });
  it("los diseños por personalidad heredan al resolver", () => {
    guardarConfigMausbot({
      disenoPorDefecto: "cuenta-luna",
      porPersonalidad: { sabio: "cuerpo-hexagono" },
      perfiles: { pf: { porPersonalidad: { poetisa: "cuerpo-estrella" } } },
    });
    const resuelta = resolverMausbot({ perfilId: "pf" });
    expect(disenoParaPersonalidad(resuelta, "poetisa")).toBe("cuerpo-estrella");
    expect(disenoParaPersonalidad(resuelta, "sabio")).toBe("cuerpo-hexagono");
    expect(disenoParaPersonalidad(resuelta, "otra")).toBe("cuenta-luna"); // sin el suyo: el de la cuenta
    expect(disenoParaPersonalidad(CONFIG_MAUSBOT_DEFECTO, "otra")).toBe(DISENO_MAUSBOT_FABRICA);
  });
});
