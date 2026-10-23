// Pruebas del entorno completo del núcleo. Solo funciones puras: entrada →
// salida con lectores/escritores de mentira; sin red, sin disco, sin mocks
// de módulos de Node. `globals` está en false: importamos de "vitest".

import { describe, it, expect } from "vitest";
import {
  capturarEntorno,
  revisarEntorno,
  duplicarEntorno,
  diferencia,
  aplicar,
} from "../entorno-completo";
import type { EntornoCompleto } from "../entorno-completo";
import { SYNCED_KEYS } from "@/lib/settings-sync";
import type { DependenciasNucleo, PaqueteSistema } from "../paquete-sistema";
import type { UiSpec } from "../ui-spec";

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

/** Guardianes del núcleo de MENTIRA: dejan la UiSpec tal cual y no ven cambios. */
const deps: DependenciasNucleo = {
  validarUiSpec: (bruto) => ({ spec: bruto as UiSpec, problemas: [] }),
  validarContraInvariantes: () => [],
};

/** Almacén de mentira con lectura cruda (como localStorage). */
function almacen(valor: Record<string, string>) {
  return { valor, leer: (clave: string) => valor[clave] ?? null };
}

function entornoVacio(nombre: string): EntornoCompleto {
  return { version: 1, nombre, paquete: paqueteEjemplo(), ajustes: {}, volumenes: [] };
}

describe("capturarEntorno", () => {
  it("toma solo claves de SYNCED_KEYS y las desarma como dato", () => {
    const a = almacen({ "appearance-config-v2": '{"tema":"oscuro"}', "otra.que.no.viaja": "1" });
    const ent = capturarEntorno(a, paqueteEjemplo(), []);
    expect(Object.keys(ent.ajustes)).toEqual(["appearance-config-v2"]);
    // El JSON crudo entró como DATO, no como texto.
    expect(ent.ajustes["appearance-config-v2"]).toEqual({ tema: "oscuro" });
  });

  it("jamás lee una clave prohibida aunque el medio la tenga", () => {
    const a = almacen({
      "appearance-config-v2": '{"tema":"claro"}',
      "starseed.ai.providers": '{"clave":"sk-test1234"}',
    });
    const ent = capturarEntorno(a, paqueteEjemplo(), []);
    expect(ent.ajustes).not.toHaveProperty("starseed.ai.providers");
  });

  it("todas las claves capturadas viajan por el canal de cuenta (SYNCED_KEYS)", () => {
    const ent = capturarEntorno(almacen({}), paqueteEjemplo(), []);
    for (const clave of Object.keys(ent.ajustes)) {
      expect(SYNCED_KEYS, `«${clave}» no es una clave de cuenta`).toContain(clave);
    }
    expect(ent.version).toBe(1);
    expect(ent.nombre).toBe("Prueba");
  });

  it("los volúmenes van por referencia: id y raiz, nunca contenido", () => {
    const vol = { id: "v1", raiz: "biblioteca/fotos", contenido: "XXXX" } as never;
    const ent = capturarEntorno(almacen({}), paqueteEjemplo(), [vol]);
    expect(ent.volumenes).toEqual([{ id: "v1", raiz: "biblioteca/fotos" }]);
    expect(String(ent.volumenes)).not.toContain("XXXX");
  });
});

describe("revisarEntorno", () => {
  it("un entorno limpio, con guardianes, es instalable", () => {
    const ent: EntornoCompleto = {
      ...entornoVacio("Limpio"),
      ajustes: { "appearance-config-v2": { tema: "oscuro" } },
    };
    const res = revisarEntorno(ent, deps);
    expect(res.seguro).toBe(true);
    expect(res.motivos).toEqual([]);
  });

  it("un secreto en los ajustes lo bloquea, con su motivo", () => {
    const ent: EntornoCompleto = {
      ...entornoVacio("Con secreto"),
      ajustes: { "appearance-config-v2": '{"apiKey":"sk-test1234secreto"}' },
    };
    const res = revisarEntorno(ent, deps);
    expect(res.seguro).toBe(false);
    expect(res.motivos.some((m) => m.includes("secreto detectado en los ajustes"))).toBe(true);
    // Enmascarado: nunca el secreto tal cual.
    for (const m of res.motivos) expect(m).not.toContain("sk-test1234secreto");
  });

  it("una clave prohibida en los ajustes lo bloquea y dice cuál", () => {
    const ent: EntornoCompleto = {
      ...entornoVacio("Con prohibida"),
      ajustes: { "starseed.connectors.creds.v1": "{}" },
    };
    const res = revisarEntorno(ent, deps);
    expect(res.seguro).toBe(false);
    expect(res.motivos.join("\n")).toContain("starseed.connectors.creds.v1");
    expect(res.motivos.join("\n")).toContain("jamás viajan");
  });

  it("un secreto dentro del paquete lo bloquea igual (revisión del paquete)", () => {
    const ent: EntornoCompleto = {
      ...entornoVacio("Paquete sucio"),
      paquete: { ...paqueteEjemplo(), permisosPedidos: ["sk-larga1234567890"] },
    };
    const res = revisarEntorno(ent, deps);
    expect(res.seguro).toBe(false);
    expect(res.motivos.join("\n")).toContain("secreto detectado en el paquete");
  });

  it("sin guardianes del núcleo no es revisable: no instalable", () => {
    const res = revisarEntorno(entornoVacio("Cerrado"));
    expect(res.seguro).toBe(false);
  });

  it("una ruta absoluta de disco en los ajustes también la bloquea", () => {
    const ent: EntornoCompleto = {
      ...entornoVacio("Con ruta"),
      ajustes: { "starseed.aurora.voice.v1": { voz: "/Users/alex/voces/mia" } },
    };
    const res = revisarEntorno(ent, deps);
    expect(res.seguro).toBe(false);
    expect(res.motivos.join("\n")).toContain("/Users/…");
  });
});

describe("duplicarEntorno", () => {
  it("duplica con nombre nuevo sin compartir referencias (ajustes, paquete y volúmenes)", () => {
    const original: EntornoCompleto = {
      ...entornoVacio("Orig"),
      ajustes: { "appearance-config-v2": { tema: "oscuro", capturas: [1, 2] } },
      volumenes: [{ id: "v1", raiz: "biblioteca/fotos" }],
      paquete: { ...paqueteEjemplo(), permisosPedidos: ["dock"], agentes: ["aurora"] },
    };
    const copia = duplicarEntorno(original, "Copia");
    expect(copia.nombre).toBe("Copia");
    expect(copia.ajustes).toEqual(original.ajustes);
    expect(copia.ajustes["appearance-config-v2"]).not.toBe(original.ajustes["appearance-config-v2"]);
    // Editar la copia no toca al original, ni al revés.
    (copia.ajustes["appearance-config-v2"] as { capturas: number[] }).capturas.push(3);
    expect((original.ajustes["appearance-config-v2"] as { capturas: number[] }).capturas).toEqual([1, 2]);
    // El paquete duplicado tampoco comparte sus listas.
    copia.paquete.permisosPedidos.push("otro");
    expect(original.paquete.permisosPedidos).toEqual(["dock"]);
    copia.paquete.agentes?.push("otro");
    expect(original.paquete.agentes).toEqual(["aurora"]);
    // Y cada volumen es su copia: el original sigue con el suyo.
    expect(copia.volumenes).toEqual(original.volumenes);
    expect(copia.volumenes[0]).not.toBe(original.volumenes[0]);
  });
});

describe("diferencia", () => {
  it("detecta añadidas, quitadas, cambiadas e iguales", () => {
    const a: EntornoCompleto = { ...entornoVacio("A"), ajustes: { k1: 1, k2: 2 } };
    const b: EntornoCompleto = { ...entornoVacio("B"), ajustes: { k1: 1, k2: 3, k3: 4 } };
    const d = diferencia(a, b);
    expect(d.anadidas).toEqual(["k3"]);
    expect(d.quitadas).toEqual([]);
    expect(d.cambiadas).toEqual(["k2"]);
    expect(d.iguales).toEqual(["k1"]);
  });

  it("compara como DATO: el número 1 y el texto «1» no son iguales", () => {
    const a: EntornoCompleto = { ...entornoVacio("A"), ajustes: { k: 1 } };
    const b: EntornoCompleto = { ...entornoVacio("B"), ajustes: { k: "1" } };
    expect(diferencia(a, b).cambiadas).toEqual(["k"]);
  });

  it("claves que solo el segundo tiene van a añadidas; las que solo el primero, a quitadas", () => {
    const a: EntornoCompleto = { ...entornoVacio("A"), ajustes: { vieja: 1 } };
    const b: EntornoCompleto = { ...entornoVacio("B"), ajustes: { nueva: 1 } };
    const d = diferencia(a, b);
    expect(d.quitadas).toEqual(["vieja"]);
    expect(d.anadidas).toEqual(["nueva"]);
  });
});

describe("aplicar y deshacer", () => {
  /** Escritor de mentira: `null` quita la clave, otro valor la guarda como dato. */
  function escritor(estados: Record<string, unknown>) {
    return {
      leer: (clave: string) => {
        const v = estados[clave];
        return v === undefined ? null : JSON.stringify(v);
      },
      escribir: (clave: string, valor: unknown) => {
        if (valor === null) delete estados[clave];
        else estados[clave] = valor;
      },
    };
  }

  it("solo escribe claves sincronizadas; lo prohibido va en omitidas", () => {
    const estados: Record<string, unknown> = {};
    const w = escritor(estados);
    const ent: EntornoCompleto = {
      ...entornoVacio("App"),
      ajustes: {
        "starseed.cursorfx.v1": "on",
        "starseed.ai.providers": '{"clave":"sk-X"}',
      },
    };
    const { cambios, omitidas } = aplicar(ent, w);
    expect(cambios).toEqual(["starseed.cursorfx.v1"]);
    expect(omitidas).toEqual(["starseed.ai.providers"]);
    expect(estados).not.toHaveProperty("starseed.ai.providers");
    expect(estados["starseed.cursorfx.v1"]).toBe("on");
  });

  it("aplicar y deshacer dejan TODO igual, piedra por piedra", () => {
    const estados: Record<string, unknown> = {
      "starseed.cursorfx.v1": "off",
      "appearance-config-v2": { tema: "claro" },
    };
    const antes = JSON.parse(JSON.stringify(estados)) as Record<string, unknown>;
    const w = escritor(estados);
    const ent: EntornoCompleto = {
      ...entornoVacio("App"),
      ajustes: {
        "starseed.cursorfx.v1": "on",
        "appearance-config-v2": { tema: "oscuro" },
        "starseed.map.view.v1": { zoom: 3 }, // no existía antes del aplicar
      },
    };
    const { deshacer } = aplicar(ent, w);
    expect(estados["starseed.cursorfx.v1"]).toBe("on");
    expect(estados["starseed.map.view.v1"]).toEqual({ zoom: 3 });
    deshacer();
    expect(estados["starseed.cursorfx.v1"]).toBe("off");
    expect(estados["appearance-config-v2"]).toEqual({ tema: "claro" });
    expect(estados).not.toHaveProperty("starseed.map.view.v1");
    expect(estados).toEqual(antes);
  });

  it("segunda ronda: aplicar dos veces y deshacer dos veces, sin rastro", () => {
    const estados: Record<string, unknown> = {};
    const w = escritor(estados);
    const ent: EntornoCompleto = { ...entornoVacio("Dobles"), ajustes: { "starseed.map.location.v1": "off" } };
    const primero = aplicar(ent, w);
    primero.deshacer();
    const segundo = aplicar(ent, w);
    segundo.deshacer();
    expect(estados).toEqual({});
  });
});
