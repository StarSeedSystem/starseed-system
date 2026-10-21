import { describe, it, expect } from "vitest";
import {
  EntornoCompleto,
  capturarEntorno,
  duplicarEntorno,
  diferencia,
  aplicar,
  revisarEntorno,
} from "../entorno-completo";
import type { PaqueteSistema } from "../paquete-sistema";

function paqueteEjemplo(): PaqueteSistema {
  return {
    id: "p1",
    nombre: "Prueba",
    autor: { perfil: "test", nombre: "Test" },
    creadoEn: 0,
    uiSpec: { version: 1, superficie: "os:test", bloques: [] },
    permisosPedidos: [],
    requiere: [],
    version: 1,
  };
}

function lectorSimple(ajustes: Record<string, unknown>) {
  return {
    leer: (clave: string) => {
      const val = ajustes[clave];
      return val === undefined ? null : JSON.stringify(val);
    },
  };
}

describe("capturarEntorno", () => {
  it("toma solo claves de SYNCED_KEYS y nunca de NEVER_SYNCED_KEYS", () => {
    const ajustesLocales = {
      "appearance-config-v2": '{"tema":"oscuro"}',
      "starseed.ai.providers": '{"secreto":"no-debe-viajar"}',
    };
    const ent = capturarEntorno(lectorSimple(ajustesLocales), paqueteEjemplo(), [{ id: "v1", raiz: "/datos" }]);
    expect(ent.ajustes).toHaveProperty("appearance-config-v2");
    expect(ent.ajustes).not.toHaveProperty("starseed.ai.providers");
  });

  it("los volúmenes van por referencia, nunca con contenido", () => {
    const vol = { id: "v1", raiz: "/datos" };
    const ent = capturarEntorno(lectorSimple({}), paqueteEjemplo(), [vol]);
    expect(ent.volumenes).toHaveLength(1);
    expect(ent.volumenes[0].id).toBe("v1");
    expect(ent.volumenes[0].raiz).toBe("/datos");
    expect((ent.volumenes[0] as unknown)).not.toHaveProperty("contenido");
  });
});

describe("revisarEntorno", () => {
  it("un secreto en ajustes bloquea como no instalable", () => {
    const ent: EntornoCompleto = {
      version: 1,
      nombre: "Secreto",
      paquete: paqueteEjemplo(),
      ajustes: { "starseed.ai.providers": '{"apiKey":"sk-test1234secret"}' },
      volumenes: [],
    };
    const res = revisarEntorno(ent);
    expect(res.seguro).toBe(false);
    expect(res.motivos.some((m) => m.toLowerCase().includes("secreto"))).toBe(true);
  });

  it("una clave prohibida en ajustes bloquea con su motivo", () => {
    const ent: EntornoCompleto = {
      version: 1,
      nombre: "Prohibido",
      paquete: paqueteEjemplo(),
      ajustes: { "starseed.connectors.creds.v1": "{}" },
      volumenes: [],
    };
    const res = revisarEntorno(ent);
    expect(res.seguro).toBe(false);
    expect(res.motivos.some((m) => m.includes("clave prohibida"))).toBe(true);
  });
});

describe("duplicarEntorno", () => {
  it("duplica sin compartir referencias de ajustes ni volúmenes", () => {
    const original: EntornoCompleto = {
      version: 1,
      nombre: "Orig",
      paquete: paqueteEjemplo(),
      ajustes: { "appearance-config-v2": true },
      volumenes: [{ id: "v1", raiz: "/x" }],
    };
    const copia = duplicarEntorno(original, "Copia");
    expect(copia.nombre).toBe("Copia");
    expect(copia.ajustes).toEqual(original.ajustes);
    expect(copia.ajustes).not.toBe(original.ajustes);
    expect(copia.volumenes).toEqual(original.volumenes);
    expect(copia.volumenes).not.toBe(original.volumenes);
  });
});

describe("diferencia", () => {
  it("detecta anadidas, quitadas, cambiadas e iguales", () => {
    const a: EntornoCompleto = {
      version: 1,
      nombre: "A",
      paquete: paqueteEjemplo(),
      ajustes: { k1: 1, k2: 2 },
      volumenes: [],
    };
    const b: EntornoCompleto = {
      version: 1,
      nombre: "B",
      paquete: paqueteEjemplo(),
      ajustes: { k2: 3, k3: 4 },
      volumenes: [],
    };
    const d = diferencia(a, b);
    expect(d.anadidas).toContain("k3");
    expect(d.quitadas).toContain("k1");
    expect(d.cambiadas).toContain("k2");
    expect(d.iguales).toHaveLength(0);
  });
});

describe("aplicar y deshacer", () => {
  it("aplicar y deshacer dejan todo igual", () => {
    const ajustesOriginales: Record<string, unknown> = {
      "appearance-config-v2": false,
    };
    const acciones = {
      leer: (clave: string) => {
        const val = ajustesOriginales[clave];
        return val === undefined ? null : JSON.stringify(val);
      },
      escribir: (clave: string, valor: unknown) => {
        if (valor === null) {
          delete ajustesOriginales[clave];
        } else {
          ajustesOriginales[clave] = valor;
        }
      },
    };
    const ent: EntornoCompleto = {
      version: 1,
      nombre: "App",
      paquete: paqueteEjemplo(),
      ajustes: { "appearance-config-v2": true, "starseed.cursorfx.v1": "on" },
      volumenes: [],
    };
    const { deshacer } = aplicar(ent, acciones);
    expect(ajustesOriginales).toHaveProperty("appearance-config-v2", true);
    expect(ajustesOriginales).toHaveProperty("starseed.cursorfx.v1", "on");
    deshacer();
    expect(ajustesOriginales).toHaveProperty("appearance-config-v2", false);
    expect(ajustesOriginales["starseed.cursorfx.v1"]).toBeUndefined();
  });
});
