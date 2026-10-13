import { describe, expect, it } from "vitest";
import {
  ArchivoMemoria,
  normalizar,
  quitarFrontmatter,
  seccionesDe,
  planFusion,
  type PlanFusion,
  type BrainIncludes,
  type BrainServer
} from "../fusion";
import type { Brain } from "@/lib/brains/brains";

// Helper para crear cerebros de prueba
function crearBrain(id: string, overrides: Partial<Brain> = {}): Brain {
  return {
    id,
    owner: "test-owner",
    name: `Cerebro ${id}`,
    scope: "account",
    scope_ref: null,
    description: `Descripción del cerebro ${id}`,
    config: {
      ...(overrides.config || {}),
      fusionados: [],
      fusionadoEn: ""
    },
    includes: {
      vaults: [],
      backends: [],
      personalities: [],
      runtimes: [],
      tokens: [],
      memories: [],
      connections: [],
      bindScope: false,
      permissions: [],
      aiProvider: undefined
    },
    servers: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

// Helper para crear archivos de memoria de prueba
function crearArchivoMemoria(
  id: string | undefined,
  brainId: string,
  name: string,
  content: string,
  updatedAt: string | null = "2026-01-01T00:00:00.000Z",
  meta: Record<string, unknown> | null = null
): ArchivoMemoria {
  return {
    id,
    brain_id: brainId,
    name,
    content,
    updated_at: updatedAt,
    meta
  };
}

describe("funciones auxiliares de fusión", () => {
  describe("quitarFrontmatter", () => {
    it("elimina frontmatter YAML inicial", () => {
      const texto = "---\ntype: memory\n---\n\n# Memoria\n\nContenido";
      expect(quitarFrontmatter(texto)).toBe("# Memoria\n\nContenido");
    });

    it("elimina frontmatter con saltos adicionales", () => {
      const texto = "---\ntype: memory\n---\n\n\n# Memoria\n\nContenido";
      expect(quitarFrontmatter(texto)).toBe("# Memoria\n\nContenido");
    });

    it("deja texto sin frontmatter unchanged", () => {
      const texto = "# Memoria\n\nContenido";
      expect(quitarFrontmatter(texto)).toBe("# Memoria\n\nContenido");
    });

    it("maneja texto vacío", () => {
      expect(quitarFrontmatter("")).toBe("");
    });
  });

  describe("normalizar", () => {
    it("elimina frontmatter, colapsa espacios y aplica trim", () => {
      const texto = "---\ntype: memory\n---\n\n  #  Memoria  \n\n  Contenido   con   espacios  ";
      expect(normalizar(texto)).toBe("# Memoria Contenido con espacios");
    });

    it("normaliza texto simple", () => {
      const texto = "  Hola   mundo  ";
      expect(normalizar(texto)).toBe("Hola mundo");
    });

    it("deja texto ya normalizado unchanged", () => {
      const texto = "# Memoria\n\nContenido";
      expect(normalizar(texto)).toBe("# Memoria Contenido");
    });
  });

  describe("seccionesDe", () => {
    it("divide por secciones ## y devuelve cabecera + secciones", () => {
      const texto = "# Cabecera\n\n## Sección 1\nContenido 1\n\n## Sección 2\nContenido 2";
      const resultado = seccionesDe(texto);
      expect(resultado.length).toBe(3);
      // Cabecera: todo antes del primer \n## 
      expect(resultado[0]).toBe("# Cabecera\n\n");
      // Primera sección: desde el primer \n## hasta el segundo \n## (incluyendo su contenido y los saltos después)
      expect(resultado[1]).toBe("## Sección 1\nContenido 1\n\n");
      // Segunda sección: desde el segundo \n## hasta el final
      expect(resultado[2]).toBe("## Sección 2\nContenido 2");
    });

    it("maneja texto sin secciones ##", () => {
      const texto = "# Solo cabecera\n\nSin secciones";
      const resultado = seccionesDe(texto);
      expect(resultado.length).toBe(1);
      expect(resultado[0]).toBe(texto);
    });

    it("maneja múltiples saltos de línea", () => {
      const texto = "# Cabecera\n\n\n## Sección\n\nContenido\n\n\n";
      const resultado = seccionesDe(texto);
      expect(resultado.length).toBe(2);
      expect(resultado[0]).toBe("# Cabecera\n\n\n"); // Cabecera
      expect(resultado[1]).toBe("## Sección\n\nContenido\n\n\n"); // Sección
    });

    it("maneja texto vacío", () => {
      const texto = "";
      const resultado = seccionesDe(texto);
      expect(resultado.length).toBe(1);
      expect(resultado[0]).toBe("");
    });
  });
});

describe("planFusion", () => {
  const fecha = "2026-10-13";

  describe("reglas de archivos de memoria", () => {
    it("archivo ausente en el destino → copiar", () => {
      const destino = crearBrain("destino");
      const origen = crearBrain("origen");
      
      const archivos: ArchivoMemoria[] = [
        crearArchivoMemoria(undefined, "origen", "memoria.md", "# Contenido origen")
      ];
      
      const prefs: Record<string, unknown> = {};
      
      const resultado = planFusion({ destino, origenes: [origen], archivos, prefs, fecha });
      
      expect(resultado.archivos.length).toBe(1);
      const archivoPlan = resultado.archivos[0];
      expect(archivoPlan.name).toBe("memoria.md");
      expect(archivoPlan.accion).toBe("copiar");
      expect(archivoPlan.contenido).toBe("# Contenido origen");
      expect(archivoPlan.bytesQueEntran).toBeGreaterThan(0);
      expect(archivoPlan.desde).toEqual(["origen"]);
      expect(archivoPlan.idDestino).toBeUndefined();
    });

    it("igual tras normalizar → omitir", () => {
      const destino = crearBrain("destino");
      const origen = crearBrain("origen");
      
      const archivos: ArchivoMemoria[] = [
        crearArchivoMemoria("destino-file-id", "destino", "memoria.md", "  # Memoria  \n\n  Contenido  "),
        crearArchivoMemoria("origen-file-id", "origen", "memoria.md", "# Memoria\n\nContenido")
      ];
      
      const prefs: Record<string, unknown> = {};
      
      const resultado = planFusion({ destino, origenes: [origen], archivos, prefs, fecha });
      
      expect(resultado.archivos.length).toBe(1);
      const archivoPlan = resultado.archivos[0];
      expect(archivoPlan.name).toBe("memoria.md");
      expect(archivoPlan.accion).toBe("omitir");
      expect(archivoPlan.bytesQueEntran).toBe(0);
      expect(archivoPlan.desde).toEqual(["destino", "origen"]);
      expect(archivoPlan.idDestino).toBe("destino-file-id");
    });

    it("distinto → anexar solo secciones nuevas", () => {
      const destino = crearBrain("destino");
      const origen = crearBrain("origen");
      
      const archivos: ArchivoMemoria[] = [
        crearArchivoMemoria(undefined, "destino", "memoria.md", "# Memoria\n\n## Sección 1\nContenido 1"),
        crearArchivoMemoria(undefined, "origen", "memoria.md", "# Memoria\n\n## Sección 1\nContenido 1\n\n## Sección 2\nContenido 2")
      ];
      
      const prefs: Record<string, unknown> = {};
      
      const resultado = planFusion({ destino, origenes: [origen], archivos, prefs, fecha });
      
      expect(resultado.archivos.length).toBe(1);
      const archivoPlan = resultado.archivos[0];
      expect(archivoPlan.name).toBe("memoria.md");
      expect(archivoPlan.accion).toBe("anexar");
      expect(archivoPlan.contenido).toContain("## Fusionado de «memoria»");
      expect(archivoPlan.contenido).toContain("## Sección 2\nContenido 2");
      expect(archivoPlan.bytesQueEntran).toBeGreaterThan(0);
      expect(archivoPlan.desde).toEqual(["destino", "origen"]);
      expect(archivoPlan.idDestino).toBeDefined();
    });

    it("si no queda ninguna sección nueva → omitir", () => {
      const destino = crearBrain("destino");
      const origen = crearBrain("origen");
      
      const archivos: ArchivoMemoria[] = [
        crearArchivoMemoria("destino-file-id", "destino", "memoria.md", "# Memoria\n\n## Sección 1\nContenido 1"),
        crearArchivoMemoria("origen-file-id", "origen", "memoria.md", "# Memoria\n\n## Sección 1\nContenido 1")
      ];
      
      const prefs: Record<string, unknown> = {};
      
      const resultado = planFusion({ destino, origenes: [origen], archivos, prefs, fecha });
      
      expect(resultado.archivos.length).toBe(1);
      const archivoPlan = resultado.archivos[0];
      expect(archivoPlan.name).toBe("memoria.md");
      expect(archivoPlan.accion).toBe("omitir");
      expect(archivoPlan.bytesQueEntran).toBe(0);
      expect(archivoPlan.desde).toEqual(["destino", "origen"]);
      expect(archivoPlan.idDestino).toBe("destino-file-id");
    });
  });

  describe("caso real de 2026-10-13", () => {
    it("entran solo las 3 actualizaciones, una vez, bajo el encabezado de fusión", () => {
      // Destino con varias secciones (simulando c7755fd9)
      const destino = crearBrain("c7755fd9");
      // Origen con el tipo: memory y 3 actualizaciones (simulando 3ab250b8)
      const origen = crearBrain("3ab250b8");
      
      const archivos: ArchivoMemoria[] = [
        // Archivo memory.md en destino
        crearArchivoMemoria(
          undefined, 
          "c7755fd9", 
          "memory.md", 
          "# Memoria\n\n## Hechos clave\n\n## Contexto actual"
        ),
        // Archivo memory.md en origen con 3 actualizaciones
        crearArchivoMemoria(
          undefined,
          "3ab250b8",
          "memory.md",
          "---\ntype: memory\n---\n\n# Memoria\n\nHechos/estado genéricos (fallback).\n\n## Actualización automática de Astraura · 10/1\nPrimera actualización\n\n## Actualización automática de Astraura · 10/2\nSegunda actualización\n\n## Actualización automática de Astraura · 10/3\nTercera actualización"
        )
      ];
      
      const prefs: Record<string, unknown> = {};
      
      const resultado = planFusion({ destino, origenes: [origen], archivos, prefs, fecha });
      
      expect(resultado.archivos.length).toBe(1);
      const archivoPlan = resultado.archivos[0];
      expect(archivoPlan.name).toBe("memory.md");
      expect(archivoPlan.accion).toBe("anexar"); // Porque el destino ya tenía el archivo
      
      // Verificar que contiene las 3 actualizaciones bajo encabezados de fusión
      expect(archivoPlan.contenido).toContain("## Fusionado de «memory» (3ab250b8) · 2026-10-13");
      expect(archivoPlan.contenido).toMatch(/## Actualización automática de Astraura · 10\/1\nPrimera actualización/);
      expect(archivoPlan.contenido).toMatch(/## Actualización automática de Astraura · 10\/2\nSegunda actualización/);
      expect(archivoPlan.contenido).toMatch(/## Actualización automática de Astraura · 10\/3\nTercera actualización/);
      
      // Verificar que no se duplica nada al repetir la fusión
      const resultado2 = planFusion({ 
        destino: { 
          ...destino, 
          // Simular que ya tenemos el archivo fusionado
          config: { ...destino.config, fusionados: ["3ab250b8"], fusionadoEn: fecha }
        } as Brain,
        origenes: [origen],
        archivos: [
          crearArchivoMemoria(
            undefined, 
            "c7755fd9", 
            "memory.md", 
            archivoPlan.contenido // El contenido ya fusionado
          )
        ],
        prefs: {},
        fecha
      });
      
      // En la segunda fusión, debería omitir el archivo porque ya está igual
      expect(resultado2.archivos[0].accion).toBe("omitir");
      expect(resultado2.archivos[0].bytesQueEntran).toBe(0);
    });
  });

  describe("includes", () => {
    it("unión sin duplicados de arrays simples", () => {
      const destino = crearBrain("destino", {
        includes: {
          vaults: ["vault1", "vault2"],
          backends: ["backend1"],
          personalities: ["person1"],
          runtimes: ["runtime1"],
          tokens: ["token1"],
          memories: ["mem1"],
          connections: ["conn1"],
          bindScope: false,
          permissions: [{ who: "user1", level: "lectura" }],
          aiProvider: "provider1"
        }
      });
      
      const origen = crearBrain("origen", {
        includes: {
          vaults: ["vault2", "vault3"], // vault2 duplicado
          backends: ["backend2"],
          personalities: ["person2"],
          runtimes: ["runtime2"],
          tokens: ["token2"],
          memories: ["mem2"],
          connections: ["conn2"],
          bindScope: true, // Esto debería activar bindScope
          permissions: [{ who: "user2", level: "escritura" }],
          aiProvider: undefined // El destino debería ganar
        }
      });
      
      const archivos: ArchivoMemoria[] = [];
      const prefs: Record<string, unknown> = {};
      
      const resultado = planFusion({ destino, origenes: [origen], archivos, prefs, fecha });
      
      // vaults: ["vault1", "vault2", "vault3"] (sin duplicados)
      expect(resultado.includes.vaults).toEqual(expect.arrayContaining(["vault1", "vault2", "vault3"]));
      expect(resultado.includes.vaults.length).toBe(3);
      
      // backends: ["backend1", "backend2"]
      expect(resultado.includes.backends).toEqual(expect.arrayContaining(["backend1", "backend2"]));
      expect(resultado.includes.backends.length).toBe(2);
      
      // personalities: ["person1", "person2"]
      expect(resultado.includes.personalities).toEqual(expect.arrayContaining(["person1", "person2"]));
      expect(resultado.includes.personalities.length).toBe(2);
      
      // runtimes: ["runtime1", "runtime2"]
      expect(resultado.includes.runtimes).toEqual(expect.arrayContaining(["runtime1", "runtime2"]));
      expect(resultado.includes.runtimes.length).toBe(2);
      
      // tokens: ["token1", "token2"]
      expect(resultado.includes.tokens).toEqual(expect.arrayContaining(["token1", "token2"]));
      expect(resultado.includes.tokens.length).toBe(2);
      
      // memories: ["mem1", "mem2"]
      expect(resultado.includes.memories).toEqual(expect.arrayContaining(["mem1", "mem2"]));
      expect(resultado.includes.memories.length).toBe(2);
      
      // connections: ["conn1", "conn2"]
      expect(resultado.includes.connections).toEqual(expect.arrayContaining(["conn1", "conn2"]));
      expect(resultado.includes.connections.length).toBe(2);
      
      // bindScope: true (porque el origen lo tenía)
      expect(resultado.includes.bindScope).toBe(true);
      
      // permissions: union por who
      expect(resultado.includes.permissions.length).toBe(2);
      expect(resultado.includes.permissions.some(p => p.who === "user1" && p.level === "lectura")).toBe(true);
      expect(resultado.includes.permissions.some(p => p.who === "user2" && p.level === "escritura")).toBe(true);
      
      // aiProvider: del destino (provider1)
      expect(resultado.includes.aiProvider).toBe("provider1");
    });
  });

  describe("servers", () => {
    it("unión por id y mismo endpoint cuenta como uno", () => {
      const destino = crearBrain("destino", {
        servers: [
          { id: "srv1", name: "Server 1", endpoint: "http://example1.com", kind: "online" },
          { id: "srv2", name: "Server 2", endpoint: "http://example2.com", kind: "online" }
        ]
      });
      
      const origen = crearBrain("origen", {
        servers: [
          { id: "srv2", name: "Server 2 Updated", endpoint: "http://example2.com", kind: "online" }, // Mismo id y endpoint
          { id: "srv3", name: "Server 3", endpoint: "http://example3.com", kind: "online" }
        ]
      });
      
      const archivos: ArchivoMemoria[] = [];
      const prefs: Record<string, unknown> = {};
      
      const resultado = planFusion({ destino, origenes: [origen], archivos, prefs, fecha });
      
      // Debemos tener 3 servidores únicos:
      // srv1 (solo en destino)
      // srv2 (mismo id y endpoint, solo uno)
      // srv3 (solo en origen)
      expect(resultado.servers.length).toBe(3);
      
      // Verificar que srv2 mantiene la información del destino (el destino gana en caso de conflicto de id)
      const srv2 = resultado.servers.find(s => s.id === "srv2");
      expect(srv2).toBeDefined();
      expect(srv2?.name).toBe("Server 2"); // Nombre del destino, no del origen
    });
  });

  describe("config", () => {
    it("gana el destino, del origen solo entran claves ausentes", () => {
      const destino = crearBrain("destino", {
        config: {
          existingDestino: "valorDestino",
          shared: "valorDestinoShared"
        }
      });
      
      const origen = crearBrain("origen", {
        config: {
          shared: "valorOrigenShared", // Debe ser ignorada porque ya existe en destino
          soloOrigen: "valorOrigen"
        }
      });
      
      const archivos: ArchivoMemoria[] = [];
      const prefs: Record<string, unknown> = {};
      
      const resultado = planFusion({ destino, origenes: [origen], archivos, prefs, fecha });
      
      // El destino gana
      expect(resultado.config.existingDestino).toBe("valorDestino");
      expect(resultado.config.shared).toBe("valorDestinoShared"); // Valor del destino
      
      // Del origen solo entran claves ausentes
      expect(resultado.config.soloOrigen).toBe("valorOrigen");
      
      // Se añaden fusionados y fusionadoEn
      expect(resultado.config.fusionados).toEqual(["destino", "origen"]);
      expect(resultado.config.fusionadoEn).toBe(fecha);
    });
  });

  describe("prefs", () => {
    it("clave ausente en el destino → se copia", () => {
      const destino = crearBrain("destino", {
        config: { prefs: { existingPref: "valor" } }
      });
      
      const origen = crearBrain("origen");
      
      const archivos: ArchivoMemoria[] = [];
      const prefsEntrada = {
        existingPref: "valorDestino", // Ya existe en destino
        newPref: "valorNuevo" // No existe en destino
      };
      
      const resultado = planFusion({ destino, origenes: [origen], archivos, prefs: prefsEntrada, fecha });
      
      // existingPref debería mantener el valor del destino
      expect(resultado.prefs.existingPref).toBe("valor");
      // newPref debería ser copiado desde la entrada
      expect(resultado.prefs.newPref).toBe("valorNuevo");
    });

    it("dos listas → unión por id", () => {
      const destino = crearBrain("destino", {
        config: { prefs: { 
          listaTest: [ { id: "item1", name: "Item 1" }, { id: "item2", name: "Item 2" } ] 
        } }
      });
      
      const origen = crearBrain("origen");
      
      const prefsEntrada = {
        listaTest: [
          { id: "item2", name: "Item 2 Updated" }, // Duplicado por id
          { id: "item3", name: "Item 3" } // Nuevo
        ]
      };
      
      const resultado = planFusion({ destino, origenes: [origen], archivos: [], prefs: prefsEntrada, fecha });
      
      const listaResultante = resultado.prefs.listaTest as Array<{ id: string; name: string }>;
      expect(listaResultante.length).toBe(3);
      
      // Debe tener item1 (destino), item2 (destino gana, mantiene nombre original), item3 (origen)
      expect(listaResultante.find(i => i.id === "item1")?.name).toBe("Item 1");
      expect(listaResultante.find(i => i.id === "item2")?.name).toBe("Item 2"); // Destino gana
      expect(listaResultante.find(i => i.id === "item3")?.name).toBe("Item 3");
    });

    it("dos listas → unión por valor JSON si no tienen id", () => {
      const destino = crearBrain("destino", {
        config: { prefs: { 
          listaTest: [ { name: "Item 1" }, { name: "Item 2" } ] 
        } }
      });
      
      const origen = crearBrain("origen");
      
      const prefsEntrada = {
        listaTest: [
          { name: "Item 2" }, // Duplicado por valor
          { name: "Item 3" } // Nuevo
        ]
      };
      
      const resultado = planFusion({ destino, origenes: [origen], archivos: [], prefs: prefsEntrada, fecha });
      
      const listaResultante = resultado.prefs.listaTest as Array<{ name: string }>;
      expect(listaResultante.length).toBe(3);
      
      // Debe tener dos instancias de { name: "Item 1" }? No, espera...
      // En realidad, para items sin id, comparamos por JSON.stringify
      // Entonces { name: "Item 1" } del destino y { name: "Item 1" } del origen serían iguales
      // Pero como el origen no tiene el item con name: "Item 1", solo tiene Item 2 y Item 3
      // Esperado: Item 1 (destino), Item 2 (duplicado, uno solo), Item 3 (origen)
      expect(listaResultante.filter(i => i.name === "Item 1").length).toBe(1);
      expect(listaResultante.filter(i => i.name === "Item 2").length).toBe(1);
      expect(listaResultante.find(i => i.name === "Item 3")?.name).toBe("Item 3");
    });

    it("dos objetos → gana el destino y se rellenan claves que falten", () => {
      const destino = crearBrain("destino", {
        config: { prefs: { 
          objTest: { 
            a: "valorA",
            b: "valorB" 
          } 
        } }
      });
      
      const origen = crearBrain("origen");
      
      const prefsEntrada = {
        objTest: {
          b: "valorBOrigen", // Debe ser ignorada porque ya existe en destino
          c: "valorC" // Nueva clave que se debe añadir
        }
      };
      
      const resultado = planFusion({ destino, origenes: [origen], archivos: [], prefs: prefsEntrada, fecha });
      
      const objResultante = resultado.prefs.objTest as Record<string, unknown>;
      expect(objResultante.a).toBe("valorA"); // Del destino
      expect(objResultante.b).toBe("valorB"); // Del destino (gana)
      expect(objResultante.c).toBe("valorC"); // Del origen (completado)
    });

    it("otro tipo → gana el destino", () => {
      const destino = crearBrain("destino", {
        config: { prefs: { 
          valorTest: 42 
        } }
      });
      
      const origen = crearBrain("origen");
      
      const prefsEntrada = {
        valorTest: "otroValor" // Debe ser ignorado
      };
      
      const resultado = planFusion({ destino, origenes: [origen], archivos: [], prefs: prefsEntrada, fecha });
      
      expect(resultado.prefs.valorTest).toBe(42); // Valor del destino
    });
  });
});