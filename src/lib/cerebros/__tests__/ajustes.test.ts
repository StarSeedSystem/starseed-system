import { describe, it, expect } from "vitest";
import {
  leerAjustes,
  conAjustes,
  ajustesEfectivos,
  CAPACIDADES,
  APLICACION,
  AJUSTES_POR_DEFECTO,
} from "../ajustes";

describe("ajustes del cerebro (§8)", () => {
  it("leerAjustes usa por defecto según el scope del cerebro", () => {
    expect(leerAjustes({ scope: "account" }).cerebro.privacidad).toBe("privado");
    expect(leerAjustes({ scope: "profile" }).cerebro.privacidad).toBe("privado");
    expect(leerAjustes({ scope: "group" }).cerebro.privacidad).toBe("grupo");
    expect(leerAjustes({ scope: "page" }).cerebro.privacidad).toBe("grupo");
    expect(leerAjustes({ scope: null }).cerebro.privacidad).toBe("privado");
  });

  it("leerAjustes lee defensivamente config.ajustes y no lanza con datos rotos", () => {
    const conConfig = leerAjustes({
      scope: "account",
      config: { ajustes: { cerebro: { cifradoLocal: true, privacidad: "publico" } } },
    });
    expect(conConfig.cerebro.cifradoLocal).toBe(true);
    expect(conConfig.cerebro.privacidad).toBe("privado"); // el scope pisa lo guardado

    const sinConfig = leerAjustes({ scope: "group" });
    expect(sinConfig.cerebro.privacidad).toBe("grupo");

    const rotos = leerAjustes({ scope: "account", config: { ajustes: "no-es-objeto" } });
    expect(rotos.cerebro.privacidad).toBe("privado");
  });

  it("herencia: memoria/carpleta pisa al cerebro, campo a campo", () => {
    const ajustes = leerAjustes({ scope: "account" });
    const conMemoria = conAjustes(
      { ajustes },
      { tipo: "memoria", id: "m1" },
      { cifradoLocal: true, privacidad: "publico" }
    );
    const efectivoMemoria = ajustesEfectivos(
      conMemoria.ajustes as { cerebro: { privacidad: string; cifradoLocal: boolean }; memorias: Record<string, Partial<{ privacidad: string; cifradoLocal: boolean }>>; carpetas: Record<string, unknown> },
      { tipo: "memoria", id: "m1" }
    );
    expect(efectivoMemoria.privacidad).toBe("publico");
    expect(efectivoMemoria.cifradoLocal).toBe(true);
  });

  it("no guarda copias iguales del cerebro en memoria/carpleta (solo lo que difiere)", () => {
    const config = conAjustes(
      {},
      { tipo: "memoria", id: "m1" },
      { privacidad: "privado", cifradoLocal: false }
    );
    const ajustes = (config.ajustes as unknown) as { cerebro: { privacidad: string; cifradoLocal: boolean }; memorias: Record<string, Partial<{ privacidad: string; cifradoLocal: boolean }>>; carpetas: Record<string, unknown> };
    expect(ajustes.memorias["m1"]).toEqual({});
  });

  it("conAjustes guarda SOLO lo que difiere para memoria y carpeta", () => {
    const base = leerAjustes({ scope: "group" });
    const config = conAjustes({ ajustes: base }, { tipo: "carpeta", id: "c1" }, { acceso: [{ quien: "alex", nivel: "leer" }] });
    const ajustes = config.ajustes as { cerebro: { acceso: unknown[] }; carpetas: Record<string, Partial<{ acceso: unknown[] }>> };
    expect(ajustes.carpetas["c1"]).toEqual({ acceso: [{ quien: "alex", nivel: "leer" }] });
  });

  it("APLICACION y CAPACIDADES son los valores exactos del contrato", () => {
    expect(CAPACIDADES).toHaveProperty("texto");
    expect(APLICACION["medios.almacenamiento"]).toBe("se-aplica");
    expect(APLICACION["privacidad"]).toBe("se-aplica");
    expect(APLICACION["acceso"]).toBe("solo-se-guarda");
    expect(APLICACION["cifradoLocal"]).toBe("solo-se-guarda");
    expect(APLICACION["sync"]).toBe("se-aplica");
    expect(APLICACION["medios.capacidades"]).toBe("solo-se-guarda");
  });

  it("AJUSTES_POR_DEFECTO tiene los campos mínimos y estructura correcta", () => {
    expect(AJUSTES_POR_DEFECTO.cerebro).toBeDefined();
    expect(AJUSTES_POR_DEFECTO.memorias).toEqual({});
    expect(AJUSTES_POR_DEFECTO.carpetas).toEqual({});
    expect(AJUSTES_POR_DEFECTO.cerebro.cifradoLocal).toBe(false);
    expect(AJUSTES_POR_DEFECTO.cerebro.privacidad).toBe("privado");
  });
});
