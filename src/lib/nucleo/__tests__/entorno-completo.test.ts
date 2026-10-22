import { describe, it, expect } from "vitest";
import {
  capturarEntorno,
  duplicarEntorno,
  diferencia,
  aplicar,
  revisarEntorno,
  type EntornoCompleto,
} from "../entorno-completo";
import type { DependenciasNucleo, PaqueteSistema } from "../paquete-sistema";
import { SYNCED_KEYS, isNeverSyncedKey } from "@/lib/settings-sync";

function paquete(nombre = "Prueba"): PaqueteSistema {
  return {
    id: "p1", nombre, autor: { perfil: "test", nombre: "Test" }, creadoEn: 0,
    uiSpec: { version: 1, superficie: "os:test", bloques: [] },
    permisosPedidos: [], requiere: [], version: 1,
  };
}

const depsLimpio: DependenciasNucleo = {
  validarUiSpec: () => ({ spec: paquete().uiSpec, problemas: [] }),
  validarContraInvariantes: () => [],
};

function entorno(parcial: Partial<EntornoCompleto> = {}): EntornoCompleto {
  return {
    version: 1, nombre: "Base", paquete: paquete(),
    ajustes: {}, volumenes: [], ...parcial,
  };
}

function lector(valores: Record<string, string>) {
  return { leer: (clave: string) => valores[clave] ?? null };
}

describe("capturarEntorno", () => {
  it("solo pide claves de SYNCED_KEYS y jamás las vetadas", () => {
    const valores: Record<string, string> = {
      "appearance-config-v2": '{"tema":"claro"}',
      "starseed.ai.providers": '{"apiKey":"no-debe-viajar"}',
    };
    const pedidas: string[] = [];
    const rastreador = { leer: (clave: string) => { pedidas.push(clave); return valores[clave] ?? null; } };
    const ent = capturarEntorno(rastreador, paquete(), []);
    expect(ent.ajustes).toHaveProperty("appearance-config-v2");
    expect(ent.ajustes).not.toHaveProperty("starseed.ai.providers");
    expect(pedidas).not.toContain("starseed.ai.providers");
    expect(Object.keys(ent.ajustes).every((k) => (SYNCED_KEYS as readonly string[]).includes(k))).toBe(true);
    expect(Object.keys(ent.ajustes).some(isNeverSyncedKey)).toBe(false);
  });

  it("los volúmenes van por referencia, nunca con contenido", () => {
    const ent = capturarEntorno(lector({}), paquete(), [{ id: "v1", raiz: "/datos" }]);
    expect(ent.volumenes).toEqual([{ id: "v1", raiz: "/datos" }]);
    expect(ent.volumenes[0]).not.toHaveProperty("contenido");
  });
});

describe("revisarEntorno", () => {
  it("un entorno limpio es instalable con guardianes del núcleo", () => {
    const ent = entorno({ ajustes: { "appearance-config-v2": { tema: "oscuro" } } });
    const res = revisarEntorno(ent, depsLimpio);
    expect(res.motivos).toEqual([]);
    expect(res.seguro).toBe(true);
    expect(res.instalable).toBe(true);
  });

  it("un secreto en los ajustes bloquea con su motivo", () => {
    const ent = entorno({
      ajustes: { "starseed.aurora.voice.v1": { apiKey: "sk-test1234secret" } },
    });
    const res = revisarEntorno(ent, depsLimpio);
    expect(res.instalable).toBe(false);
    expect(res.motivos.some((m) => m.toLowerCase().includes("secreto"))).toBe(true);
  });

  it("una clave prohibida bloquea con su motivo", () => {
    const ent = entorno({ ajustes: { "starseed.ai.providers": "{}" } });
    const res = revisarEntorno(ent, depsLimpio);
    expect(res.instalable).toBe(false);
    expect(res.motivos.some((m) => m.includes("clave prohibida"))).toBe(true);
  });

  it("una clave no sincronizable también bloquea", () => {
    const ent = entorno({ ajustes: { "clave.inventada": "x" } });
    const res = revisarEntorno(ent, depsLimpio);
    expect(res.instalable).toBe(false);
    expect(res.motivos.some((m) => m.includes("no sincronizable"))).toBe(true);
  });

  it("sin guardianes falla cerrado: nada es instalable", () => {
    const res = revisarEntorno(entorno());
    expect(res.instalable).toBe(false);
  });
});

describe("duplicarEntorno", () => {
  it("no comparte referencias de ajustes, paquete ni volúmenes", () => {
    const original = entorno({
      ajustes: { "appearance-config-v2": { tema: "oscuro" } },
      volumenes: [{ id: "v1", raiz: "/x" }],
    });
    const copia = duplicarEntorno(original, "Copia");
    expect(copia.nombre).toBe("Copia");
    expect(copia.paquete.nombre).toBe("Copia");
    expect(copia.ajustes).not.toBe(original.ajustes);
    expect(copia.ajustes["appearance-config-v2"]).not.toBe(original.ajustes["appearance-config-v2"]);
    expect(copia.paquete).not.toBe(original.paquete);
    expect(copia.paquete.uiSpec).not.toBe(original.paquete.uiSpec);
    expect(copia.volumenes).not.toBe(original.volumenes);
    expect(copia.volumenes[0]).not.toBe(original.volumenes[0]);
  });
});

describe("diferencia", () => {
  it("detecta añadidas, quitadas, cambiadas e iguales", () => {
    const a = entorno({ ajustes: { k1: 1, k2: 2, k3: "igual" } });
    const b = entorno({ ajustes: { k2: 3, k3: "igual", k4: 4 } });
    const d = diferencia(a, b);
    expect(d.anadidas).toEqual(["k4"]);
    expect(d.quitadas).toEqual(["k1"]);
    expect(d.cambiadas).toEqual(["k2"]);
    expect(d.iguales).toEqual(["k3"]);
  });
});

describe("aplicar y deshacer", () => {
  it("deja todo igual al deshacer y omite las claves vetadas", () => {
    const estado: Record<string, unknown> = { "appearance-config-v2": "viejo" };
    const escritas: string[] = [];
    const acciones = {
      leer: (clave: string) => (clave in estado ? JSON.stringify(estado[clave]) : null),
      escribir: (clave: string, valor: unknown) => {
        escritas.push(clave);
        if (valor === null) delete estado[clave];
        else estado[clave] = valor;
      },
    };
    const ent = entorno({
      ajustes: { "appearance-config-v2": "nuevo", "starseed.ai.providers": { x: 1 } },
    });
    const { deshacer, cambios, omitidas } = aplicar(ent, acciones);
    expect(cambios).toEqual(["appearance-config-v2"]);
    expect(omitidas).toContain("starseed.ai.providers");
    expect(estado["appearance-config-v2"]).toBe("nuevo");
    expect(escritas).not.toContain("starseed.ai.providers");
    deshacer();
    expect(estado["appearance-config-v2"]).toBe("viejo");
  });
});
