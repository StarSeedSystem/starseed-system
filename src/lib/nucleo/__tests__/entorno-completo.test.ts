import { describe, it, expect } from "vitest";
import { aplicar, capturarEntorno, diferencia, duplicarEntorno, revisarEntorno } from "../entorno-completo";
import type { EntornoCompleto } from "../entorno-completo";
import type { DependenciasNucleo, PaqueteSistema } from "../paquete-sistema";
import type { UiSpec } from "../ui-spec";

const uiSpec = { version: 1, superficie: "os:test", bloques: [] } as unknown as UiSpec;
const paquete = (): PaqueteSistema => ({
  id: "p1", nombre: "Base", autor: { perfil: "t", nombre: "T" }, creadoEn: 0,
  uiSpec, permisosPedidos: [], requiere: [], version: 1,
});
const deps: DependenciasNucleo = {
  validarUiSpec: () => ({ spec: uiSpec, problemas: [] }),
  validarContraInvariantes: () => [],
};
const almacen = (inicial: Record<string, string> = {}) => {
  const m = new Map(Object.entries(inicial));
  return {
    m,
    leer: (k: string) => m.get(k) ?? null,
    escribir: (k: string, v: string | null) => void (v === null ? m.delete(k) : m.set(k, v)),
  };
};
const entorno = (ajustes: Record<string, string>): EntornoCompleto => ({
  version: 1, nombre: "E", paquete: paquete(), ajustes, volumenes: [{ id: "v", raiz: "/datos" }],
});

describe("capturarEntorno", () => {
  it("solo toma claves sincronizadas y jamás las prohibidas", () => {
    const a = almacen({
      "appearance-config-v2": '{"tema":"oscuro"}',
      "starseed.ai.providers": '{"k":"x"}',
      "clave-ajena": "1",
    });
    const e = capturarEntorno(a, paquete(), []);
    expect(Object.keys(e.ajustes)).toEqual(["appearance-config-v2"]);
  });

  it("los volúmenes van por referencia, sin contenido", () => {
    const vol = { id: "v", raiz: "/datos", contenido: "secreto" } as { id: string; raiz: string };
    const e = capturarEntorno(almacen(), paquete(), [vol]);
    expect(e.volumenes).toEqual([{ id: "v", raiz: "/datos" }]);
    expect(e.volumenes[0]).not.toBe(vol);
  });
});

describe("revisarEntorno", () => {
  it("un entorno limpio es instalable", () => {
    const r = revisarEntorno(entorno({ "appearance-config-v2": "{}" }), deps);
    expect(r.instalable).toBe(true);
    expect(r.motivos).toEqual([]);
  });

  it("un secreto en los ajustes lo bloquea con su motivo", () => {
    const r = revisarEntorno(entorno({ "appearance-config-v2": '{"k":"sk-abcdef123456"}' }), deps);
    expect(r.instalable).toBe(false);
    expect(r.motivos.join(" ")).toContain("ajustes");
  });

  it("una clave prohibida lo bloquea con su motivo", () => {
    const r = revisarEntorno(entorno({ "starseed.ai.providers": "{}" }), deps);
    expect(r.instalable).toBe(false);
    expect(r.motivos).toContain("clave prohibida en los ajustes: starseed.ai.providers");
  });

  it("un paquete sin núcleo configurado falla cerrado", () => {
    expect(revisarEntorno(entorno({}), null).instalable).toBe(false);
  });
});

describe("duplicarEntorno", () => {
  it("no comparte referencias con el original", () => {
    const o = entorno({ a: "1" });
    const c = duplicarEntorno(o, "Copia");
    expect(c.nombre).toBe("Copia");
    expect(c.paquete.nombre).toBe("Copia");
    expect(o.paquete.nombre).toBe("Base");
    expect(c.ajustes).not.toBe(o.ajustes);
    expect(c.volumenes).not.toBe(o.volumenes);
    expect(c.volumenes[0]).not.toBe(o.volumenes[0]);
    expect(c.paquete.uiSpec).not.toBe(o.paquete.uiSpec);
    c.volumenes[0].raiz = "/otra";
    expect(o.volumenes[0].raiz).toBe("/datos");
  });
});

describe("diferencia", () => {
  it("distingue añadidas, quitadas y cambiadas", () => {
    const d = diferencia(entorno({ a: "1", b: "2", c: "3" }), entorno({ a: "1", b: "9", d: "4" }));
    expect(d).toEqual({ anadidas: ["d"], quitadas: ["c"], cambiadas: ["b"] });
  });
});

describe("aplicar", () => {
  it("aplicar y deshacer dejan todo igual", () => {
    const a = almacen({ "os.trinity.fab": "true", "appearance-config-v2": "viejo" });
    const antes = new Map(a.m);
    const r = aplicar(entorno({ "appearance-config-v2": '{"n":1}', "os.trinity.fab.pos": "{}" }), a);
    expect(a.m.get("appearance-config-v2")).toBe('{"n":1}');
    expect(a.m.has("os.trinity.fab.pos")).toBe(true);
    expect(r.cambios).toHaveLength(2);
    r.deshacer();
    expect(a.m).toEqual(antes);
  });

  it("ignora las claves prohibidas aunque vengan en el entorno", () => {
    const a = almacen();
    const r = aplicar(entorno({ "starseed.ai.providers": "{}" }), a);
    expect(r.cambios).toEqual([]);
    expect(a.m.size).toBe(0);
  });
});
