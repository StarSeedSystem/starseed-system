import { beforeEach, describe, expect, it } from "vitest";
import {
  CLAVE_MAUSBOT,
  DISENO_FABRICA_CURSOR,
  disenoParaPersonalidad,
  guardarConfigMausbot,
  leerConfigMausbot,
  resolverMausbot,
  ajustesPorDefecto,
  EVENTO_MAUSBOT,
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

describe("config del mausbot", () => {
  let eventos: string[];
  let almacen: AlmacenMemoria;

  beforeEach(() => {
    eventos = [];
    almacen = new AlmacenMemoria();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: almacen,
        dispatchEvent: (evento: Event) => {
          eventos.push(evento.type);
          return true;
        },
      },
    });
  });

  it("apagado por defecto, modo acompanante y nivel proponer", () => {
    expect(ajustesPorDefecto()).toEqual({
      encendido: false,
      modo: "acompanante",
      disenoPorDefecto: DISENO_FABRICA_CURSOR,
      porPersonalidad: {},
      actuar: "proponer",
    });
    expect(leerConfigMausbot()).toMatchObject({ v: 1, encendido: false });
  });

  it("no tumba la sesión: ventana indefinida y JSON roto vuelven al defecto", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
    expect(leerConfigMausbot()).toMatchObject({ encendido: false });
    almacen.setItem(CLAVE_MAUSBOT, "{esto no es json");
    expect(leerConfigMausbot()).toMatchObject({ modo: "acompanante" });
    almacen.setItem(CLAVE_MAUSBOT, JSON.stringify({ v: 7, encendido: true }));
    expect(leerConfigMausbot()).toMatchObject({ encendido: false, v: 1 });
    almacen.setItem(CLAVE_MAUSBOT, JSON.stringify({ v: 1, modo: "borracho", actuar: "lo-que-sea" }));
    expect(leerConfigMausbot()).toMatchObject({ modo: "acompanante", actuar: "proponer" });
  });

  it("guardarConfigMausbot aplica el parche de la cuenta y despacha el evento", () => {
    expect(guardarConfigMausbot({ encendido: true, actuar: "aplicar-bajo" })).toBe(true);
    expect(eventos).toEqual([EVENTO_MAUSBOT]);
    expect(leerConfigMausbot()).toMatchObject({ encendido: true, actuar: "aplicar-bajo" });
  });

  it("resuelve neurona, luego perfil, luego cuenta, con lo que cambie cada uno", () => {
    almacen.setItem(CLAVE_MAUSBOT, JSON.stringify({
      v: 1,
      encendido: true,
      modo: "acompanante",
      disenoPorDefecto: DISENO_FABRICA_CURSOR,
      actuar: "proponer",
      porPersonalidad: { orbe: "orbe-diseño", luna: "luna-diseño" },
      perfiles: { "p1": { encendido: false, modo: "cursor" } },
      neuronas: { "n1": { modo: "ambos", porPersonalidad: { orbe: "orbe-neurona" } } },
    }));
    const soloCuenta = resolverMausbot();
    expect(soloCuenta.encendido).toBe(true);
    // la neurona gana al perfil; el perfil a la cuenta
    expect(resolverMausbot({ perfilId: "p1" })).toMatchObject({ encendido: false, modo: "cursor" });
    expect(resolverMausbot({ perfilId: "p1" }).disenoPorDefecto).toBe(DISENO_FABRICA_CURSOR);
    expect(resolverMausbot({ perfilId: "p1", neuronaId: "n1" })).toMatchObject({
      encendido: false,
      modo: "ambos",
    });
    // «porPersonalidad» se mezcla: la neurona pisa a la cuenta solo en su entrada
    const mezcla = resolverMausbot({ perfilId: "p1", neuronaId: "n1" });
    expect(mezcla.porPersonalidad).toEqual({ orbe: "orbe-neurona", luna: "luna-diseño" });
  });

  it("neuronas y perfiles rotos vuelven a los ajustes por defecto", () => {
    almacen.setItem(CLAVE_MAUSBOT, JSON.stringify({
      v: 1,
      perfiles: { "p1": { modo: "imposible", nohabitual: true } },
      neuronas: { "n1": null },
    }));
    expect(resolverMausbot({ perfilId: "p1" })).toMatchObject({ modo: "acompanante" });
    expect(resolverMausbot({ neuronaId: "n1" })).toMatchObject({ encendido: false });
  });

  it("disenoParaPersonalidad prefiere lo asignado y si no usa el de la cuenta", () => {
    const config = resolverMausbot();
    config.porPersonalidad = { orbe: "orbe-diseño" };
    expect(disenoParaPersonalidad(config, "orbe")).toBe("orbe-diseño");
    expect(disenoParaPersonalidad(config, "luna")).toBe(DISENO_FABRICA_CURSOR);
  });
});
