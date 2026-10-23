import { describe, it, expect } from "vitest";
import { capturarEntorno, revisarEntorno, duplicarEntorno, diferencia, aplicar } from "../entorno-completo";
import type { EntornoCompleto } from "../entorno-completo";
import type { DependenciasNucleo, PaqueteSistema } from "../paquete-sistema";

const deps: DependenciasNucleo = {
  validarUiSpec: (bruto) => ({ spec: bruto as never, problemas: [] }),
  validarContraInvariantes: () => [],
};

const paquete = (): PaqueteSistema => ({
  id: "p1", nombre: "Mi entorno", autor: { perfil: "a", nombre: "Ana" }, creadoEn: 1,
  uiSpec: { version: 1, superficie: "os:escritorio", bloques: [] },
  permisosPedidos: [], requiere: [], version: 1,
});

const entorno = (ajustes: Record<string, unknown> = {}): EntornoCompleto => ({
  version: 1, nombre: "Mi entorno", paquete: paquete(), ajustes, volumenes: [{ id: "v1", raiz: "banda-0" }],
});

const almacen = (inicial: Record<string, string> = {}) => {
  const datos = { ...inicial };
  return {
    datos,
    leer: (c: string) => (c in datos ? datos[c] : null),
    escribir: (c: string, v: string | null) => { if (v === null) delete datos[c]; else datos[c] = v; },
  };
};

describe("capturarEntorno", () => {
  it("toma las claves sincronizadas y ninguna prohibida", () => {
    const a = almacen({
      "appearance-config-v2": '{"tema":"oscuro"}',
      "starseed.ai.providers": '{"x":1}',
      "starseed.connectors.creds.v1": "{}",
    });
    const e = capturarEntorno(a, paquete(), []);
    expect(e.ajustes["appearance-config-v2"]).toEqual({ tema: "oscuro" });
    expect(Object.keys(e.ajustes)).not.toContain("starseed.ai.providers");
    expect(Object.keys(e.ajustes)).not.toContain("starseed.connectors.creds.v1");
  });

  it("los volúmenes viajan por referencia, sin contenido", () => {
    const e = capturarEntorno(almacen(), paquete(), [{ id: "v", raiz: "r", contenido: "SECRETO" } as never]);
    expect(e.volumenes).toEqual([{ id: "v", raiz: "r" }]);
  });
});

describe("revisarEntorno", () => {
  it("un entorno limpio es instalable", () => {
    const r = revisarEntorno(entorno({ "appearance-config-v2": { tema: "claro" } }), deps);
    expect(r.motivos).toEqual([]);
    expect(r.instalable).toBe(true);
  });

  it("un secreto en los ajustes bloquea con su motivo", () => {
    const r = revisarEntorno(entorno({ "appearance-config-v2": { nota: "sk-abcdef123456" } }), deps);
    expect(r.instalable).toBe(false);
    expect(r.motivos.join(" ")).toContain("secreto");
  });

  it("una clave prohibida bloquea con su motivo", () => {
    const r = revisarEntorno(entorno({ "starseed.ai.providers": {} }), deps);
    expect(r.instalable).toBe(false);
    expect(r.motivos).toContain("clave prohibida en los ajustes: starseed.ai.providers");
  });

  it("sin guardianes del núcleo falla cerrado", () => {
    expect(revisarEntorno(entorno(), null).instalable).toBe(false);
  });
});

describe("duplicarEntorno", () => {
  it("no comparte referencias con el original", () => {
    const o = entorno({ "appearance-config-v2": { tema: "claro" } });
    const c = duplicarEntorno(o, "Copia");
    expect(c.nombre).toBe("Copia");
    expect(c.paquete.nombre).toBe("Copia");
    expect(o.paquete.nombre).toBe("Mi entorno");
    expect(c.ajustes["appearance-config-v2"]).toEqual({ tema: "claro" });
    expect(c.ajustes["appearance-config-v2"]).not.toBe(o.ajustes["appearance-config-v2"]);
    expect(c.volumenes[0]).not.toBe(o.volumenes[0]);
    expect(c.paquete.uiSpec).not.toBe(o.paquete.uiSpec);
  });
});

describe("diferencia", () => {
  it("separa añadidas, quitadas, cambiadas e iguales", () => {
    const d = diferencia(entorno({ a: 1, b: 2, c: 3 }), entorno({ b: 2, c: 4, d: 5 }));
    expect(d).toEqual({ anadidas: ["d"], quitadas: ["a"], cambiadas: ["c"], iguales: ["b"] });
  });
});

describe("aplicar", () => {
  it("aplicar y deshacer dejan todo igual", () => {
    const a = almacen({ "appearance-config-v2": '{"tema":"claro"}' });
    const antes = { ...a.datos };
    const r = aplicar(entorno({ "appearance-config-v2": { tema: "oscuro" }, "starseed.dock.items.v2": [1] }), a, deps);
    expect(r.aplicado).toBe(true);
    expect(JSON.parse(a.datos["appearance-config-v2"])).toEqual({ tema: "oscuro" });
    expect(a.datos["starseed.dock.items.v2"]).toBe("[1]");
    r.deshacer();
    expect(a.datos).toEqual(antes);
  });

  it("no escribe nada si el entorno no es instalable", () => {
    const a = almacen();
    const r = aplicar(entorno({ "starseed.ai.providers": {} }), a, deps);
    expect(r.aplicado).toBe(false);
    expect(a.datos).toEqual({});
  });
});
