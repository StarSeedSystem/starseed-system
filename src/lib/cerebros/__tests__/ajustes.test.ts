import { describe, it, expect } from "vitest";
import {
  Capacidad, AjustesObjetivo, AjustesCerebro,
  CAPACIDADES, AJUSTES_POR_DEFECTO, APLICACION,
  leerAjustes, conAjustes, ajustesEfectivos,
} from "../ajustes";

describe("herencia", () => {
  it("leerAjustes toma valores del cerebro y usa defecto para lo vacío", () => {
    const a = leerAjustes({ scope: "group", config: { ajustes: { cerebro: { privacidad: "grupo", cifradoLocal: true, acceso: [{ quien: "x", nivel: "escribir" }] } } } });
    expect(a.cerebro.privacidad).toBe("grupo");
    expect(a.cerebro.cifradoLocal).toBe(true);
    expect(a.cerebro.acceso).toHaveLength(1);
  });

  it("ajustesEfectivos: memoria pisa campo a campo", () => {
    const a: AjustesCerebro = leerAjustes({ scope: "account", config: { ajustes: { memorias: { m1: { privacidad: "publico", acceso: [{ quien: "g", nivel: "leer" }] } } } } });
    const e = ajustesEfectivos(a, { tipo: "memoria", id: "m1" });
    expect(e.privacidad).toBe("publico");
    expect(e.acceso).toEqual([{ quien: "g", nivel: "leer" }]);
    expect(e.cifradoLocal).toBe(false); // hereda del cerebro
  });

  it("ajustesEfectivos: carpeta pisa medios parcialmente", () => {
    const a: AjustesCerebro = leerAjustes({ scope: "group", config: { ajustes: { carpetas: { c1: { medios: { capacidades: { texto: "manual" } } } } } } });
    const e = ajustesEfectivos(a, { tipo: "carpeta", id: "c1" });
    expect(e.medios.capacidades.texto).toBe("manual");
  });
});

describe("conAjustes", () => {
  it("no guarda copias iguales al cerebro", () => {
    const cfg = { ajustes: { cerebro: { privacidad: "privado", cifradoLocal: false, acceso: [], sync: { direccion: "ambas", auto: true, destinos: [] }, medios: { capacidades: { texto: "auto" }, almacenamiento: [] } }, memorias: {} } };
    const res = conAjustes(cfg, { tipo: "memoria", id: "m1" }, { privacidad: "privado" });
    const a = leerAjustes({ scope: "account", config: res });
    expect(a.memorias["m1"]).toBeUndefined();
  });

  it("guarda solo lo que difiere para memoria", () => {
    const res = conAjustes({ ajustes: {} }, { tipo: "memoria", id: "m1" }, { privacidad: "publico", acceso: [{ quien: "a", nivel: "leer" }] });
    const a = leerAjustes({ scope: "account", config: res });
    expect(a.memorias["m1"]).toBeDefined();
    expect(a.memorias["m1"]!.privacidad).toBe("publico");
  });

  it("cerebro completo actualiza sin perder memoria/carpetas", () => {
    const cfg = { ajustes: { cerebro: { privacidad: "privado" }, memorias: { m1: { acceso: [{ quien: "a", nivel: "leer" }] } } } };
    const res = conAjustes(cfg, { tipo: "cerebro" }, { cifradoLocal: true });
    const a = leerAjustes({ scope: "account", config: res });
    expect(a.cerebro.cifradoLocal).toBe(true);
    expect(a.memorias["m1"]).toBeDefined();
  });
});

describe("datos rotos", () => {
  it("leerAjustes resiste config nulo o no-objeto", () => {
    expect(leerAjustes({}).cerebro.privacidad).toBe("privado");
    expect(leerAjustes({ config: null }).cerebro.privacidad).toBe("privado");
  });

  it("leerAjustes ignora ajustes como array", () => {
    const a = leerAjustes({ config: { ajustes: [] } });
    expect(a.cerebro.privacidad).toBe("privado");
  });

  it("ajustesEfectivos funciona con memoria inexistente", () => {
    const a: AjustesCerebro = leerAjustes({ scope: "profile", config: {} });
    const e = ajustesEfectivos(a, { tipo: "carpeta", id: "noexiste" });
    expect(e.privacidad).toBe("privado");
    expect(e.cifradoLocal).toBe(false);
  });
});

describe("APLICACION", () => {
  it("almacenamiento y privacidad se aplican; acceso y cifrado solo se guardan; capacidades solo se guardan", () => {
    expect(APLICACION["medios.almacenamiento"]).toBe("se-aplica");
    expect(APLICACION["privacidad"]).toBe("se-aplica");
    expect(APLICACION["acceso"]).toBe("solo-se-guarda");
    expect(APLICACION["cifradoLocal"]).toBe("solo-se-guarda");
    expect(APLICACION["medios.capacidades"]).toBe("solo-se-guarda");
    expect(APLICACION["sync"]).toBe("se-aplica");
  });
});

describe("exportaciones", () => {
  it("CAPACIDADES tiene 6 capacidades en español", () => {
    expect(CAPACIDADES).toHaveProperty("texto", "Texto");
    expect(CAPACIDADES).toHaveProperty("video", "Vídeo");
    expect(Object.keys(CAPACIDADES)).toHaveLength(6);
  });
});
