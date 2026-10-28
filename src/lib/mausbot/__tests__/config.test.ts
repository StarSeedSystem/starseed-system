import { beforeEach, describe, expect, it } from "vitest";
import {
  CLAVE_MAUSBOT,
  EVENTO_MAUSBOT,
  configMausbotPorDefecto,
  disenoParaPersonalidad,
  guardarConfigMausbot,
  leerConfigMausbot,
  resolverMausbot,
  sanearConfigMausbot,
} from "../config";

class AlmacenMemoria {
  private readonly datos = new Map<string, string>();
  getItem(clave: string): string | null {
    return this.datos.get(clave) ?? null;
  }
  setItem(clave: string, valor: string): void {
    this.datos.set(clave, valor);
  }
}

describe("config del Mausbot", () => {
  let eventos: string[];

  beforeEach(() => {
    eventos = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: new AlmacenMemoria(),
        dispatchEvent: (evento: Event) => {
          eventos.push(evento.type);
          return true;
        },
      },
    });
  });

  it("nace apagado, en modo acompañante y sin permiso de aplicar", () => {
    expect(leerConfigMausbot()).toEqual({
      v: 1,
      encendido: false,
      modo: "acompanante",
      disenoPorDefecto: "fabrica-cursor",
      porPersonalidad: {},
      actuar: "proponer",
      perfiles: {},
      neuronas: {},
    });
    expect(configMausbotPorDefecto()).toEqual(leerConfigMausbot());
  });

  it("usa los valores por defecto con JSON roto o versión ajena", () => {
    window.localStorage.setItem(CLAVE_MAUSBOT, "{no es json");
    expect(leerConfigMausbot().encendido).toBe(false);
    window.localStorage.setItem(CLAVE_MAUSBOT, JSON.stringify({ v: 2, encendido: true }));
    expect(leerConfigMausbot()).toEqual(configMausbotPorDefecto());
  });

  it("descarta valores inválidos en vez de guardarlos", () => {
    const saneada = sanearConfigMausbot({
      v: 1,
      encendido: "sí",
      modo: "volador",
      disenoPorDefecto: "  ",
      actuar: "destruir",
      porPersonalidad: { aurora: "estrella", vacia: 7 },
      perfiles: { p1: { modo: "cursor" }, "": { modo: "ambos" } },
      neuronas: null,
    });
    expect(saneada.encendido).toBe(false);
    expect(saneada.modo).toBe("acompanante");
    expect(saneada.disenoPorDefecto).toBe("fabrica-cursor");
    expect(saneada.actuar).toBe("proponer");
    expect(saneada.porPersonalidad).toEqual({ aurora: "estrella" });
    expect(saneada.perfiles).toEqual({ p1: { modo: "cursor" } });
    expect(saneada.neuronas).toEqual({});
  });

  it("guarda, lee y avisa con el evento del Mausbot", () => {
    const guardada = guardarConfigMausbot({
      encendido: true,
      modo: "cursor",
      actuar: "aplicar-bajo",
      porPersonalidad: { aurora: "orbita" },
    });
    expect(guardada.encendido).toBe(true);
    expect(leerConfigMausbot()).toMatchObject({
      encendido: true,
      modo: "cursor",
      actuar: "aplicar-bajo",
      porPersonalidad: { aurora: "orbita" },
    });
    expect(eventos).toEqual([EVENTO_MAUSBOT]);
  });

  it("combina los cambios de un perfil y de una neurona sin pisar los demás", () => {
    guardarConfigMausbot({ perfiles: { p1: { modo: "cursor", actuar: "nada" } } });
    guardarConfigMausbot({ perfiles: { p1: { encendido: true } } });
    guardarConfigMausbot({ neuronas: { n1: { disenoPorDefecto: "nube" } } });
    expect(leerConfigMausbot().perfiles.p1).toEqual({
      modo: "cursor",
      actuar: "nada",
      encendido: true,
    });
    expect(leerConfigMausbot().neuronas.n1).toEqual({ disenoPorDefecto: "nube" });
  });

  it("resuelve neurona > perfil > cuenta y mezcla las personalidades", () => {
    guardarConfigMausbot({
      encendido: true,
      modo: "ambos",
      disenoPorDefecto: "cuenta",
      actuar: "aplicar",
      porPersonalidad: { aurora: "cuenta-aurora", orbe: "cuenta-orbe" },
      perfiles: {
        p1: {
          modo: "cursor",
          porPersonalidad: { aurora: "perfil-aurora" },
        },
      },
      neuronas: { n1: { encendido: false, actuar: "proponer" } },
    });
    const resuelto = resolverMausbot({ perfilId: "p1", neuronaId: "n1" });
    expect(resuelto).toEqual({
      encendido: false,
      modo: "cursor",
      disenoPorDefecto: "cuenta",
      porPersonalidad: { aurora: "perfil-aurora", orbe: "cuenta-orbe" },
      actuar: "proponer",
    });
    expect(resolverMausbot().encendido).toBe(true);
    expect(resolverMausbot({ perfilId: "inexistente" }).modo).toBe("ambos");
  });

  it("elige el diseño de cada personalidad con la fábrica como reserva", () => {
    const cfg = guardarConfigMausbot({
      disenoPorDefecto: "fabrica-cursor",
      porPersonalidad: { aurora: "orbita" },
    });
    expect(disenoParaPersonalidad(cfg, "aurora")).toBe("orbita");
    expect(disenoParaPersonalidad(cfg, "desconocida")).toBe("fabrica-cursor");
  });
});
