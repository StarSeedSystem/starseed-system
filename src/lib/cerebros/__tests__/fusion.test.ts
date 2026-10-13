import { describe, it, expect } from "vitest";
import {
  quitarFrontmatter,
  normalizar,
  seccionesDe,
  planFusion,
  type ArchivoMemoria,
  type Brain,
  type BrainIncludes,
  type BrainServer,
  type PrefsCerebro,
  type PlanFusion
} from "@/lib/cerebros/fusion";

// Mock de Brain para pruebas
const crearMockBrain = (overrides: Partial<Brain> = {}): Brain => ({
  id: "brain-id",
  owner: "owner-id",
  name: "Test Brain",
  scope: "account",
  scope_ref: null,
  description: "A test brain",
  config: {},
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
  created_at: undefined,
  updated_at: undefined,
  ...overrides
});

describe("quitarFrontmatter", () => {
    it("should remove YAML frontmatter block", () => {
      const texto = "---\ntipo: memory\n---\n\n# Contenido\n\nEsto es una prueba.";
      expect(quitarFrontmatter(texto)).toBe("# Contenido\n\nEsto es una prueba.");
    });

  it("should return unchanged text if no frontmatter", () => {
    const texto = "# Contenido\n\nEsto es una prueba.";
    expect(quitarFrontmatter(texto)).toBe(texto);
  });

  it("should return unchanged text if incomplete frontmatter", () => {
    const texto = "---\ntipo: memory\n\n# Contenido"; // No closing ---
    expect(quitarFrontmatter(texto)).toBe(texto);
  });
});

describe("normalizar", () => {
  it("should normalize text by removing frontmatter, collapsing whitespace and trimming", () => {
    const texto = "---\ntipo: memory\n---\n\n  #   Contenido   \n\n  Esto   es   una   prueba.  ";
    expect(normalizar(texto)).toBe("# Contenido Esto es una prueba.");
  });

  it("should handle multiple spaces and newlines", () => {
    const texto = "  Línea 1\n\n\n  Línea 2  \n\t\t  Línea 3  ";
    expect(normalizar(texto)).toBe("Línea 1 Línea 2 Línea 3");
  });
});

describe("seccionesDe", () => {
  it("should split text into sections and cabecera", () => {
    const texto = "Esto es la cabecera\n\n## Primera sección\nContenido de la primera\n\n## Segunda sección\nContenido de la segunda";
    const resultado = seccionesDe(texto);
    expect(resultado.cabecera).toBe("Esto es la cabecera");
    expect(resultado.secciones).toEqual([
      "## Primera sección\nContenido de la primera",
      "## Segunda sección\nContenido de la segunda"
    ]);
  });

  it("should handle text without sections", () => {
    const texto = "Solo hay cabecera, sin secciones ##";
    const resultado = seccionesDe(texto);
    expect(resultado.cabecera).toBe("Solo hay cabecera, sin secciones ##");
    expect(resultado.secciones).toEqual([]);
  });

  it("should handle text that starts with a section", () => {
    const texto = "## Primera sección\nContenido\n\n## Segunda sección\nMás contenido";
    const resultado = seccionesDe(texto);
    expect(resultado.cabecera).toBe("");
    expect(resultado.secciones).toEqual([
      "## Primera sección\nContenido",
      "## Segunda sección\nMás contenido"
    ]);
  });
});

describe("planFusion", () => {
    it("should handle basic copy case when destination lacks file", () => {
      const destino = crearMockBrain({ id: "destino", name: "destino" });
      const origen1 = crearMockBrain({ id: "origen1", name: "origen1" });
      const origen2 = crearMockBrain({ id: "origen2", name: "origen2" });
    
      const archivos: ArchivoMemoria[] = [
        { 
          brain_id: "origen1", 
          name: "memory.md", 
          content: "# Origen 1\n\n## Sección 1\nContenido origen 1" 
        },
        { 
          brain_id: "origen2", 
          name: "memory.md", 
          content: "# Origen 2\n\n## Sección 2\nContenido origen 2" 
        }
      ];
    
      const prefs: Record<string, PrefsCerebro> = {
        destino: {},
        origen1: {},
        origen2: {}
      };
    
      const resultado = planFusion({
        destino,
        origenes: [origen1, origen2],
        archivos,
        prefs,
        fecha: "2026-10-13"
      });
    
      expect(resultado.archivos.length).toBe(1);
      const archivoPlan = resultado.archivos[0];
      expect(archivoPlan.name).toBe("memory.md");
      expect(archivoPlan.accion).toBe("copiar");
      expect(archivoPlan.desde).toEqual(["origen1", "origen2"]);
      // El contenido debería comenzar con el origen 1 y luego añadir las secciones nuevas del origen 2
      expect(archivoPlan.contenido).toContain("# Origen 1");
      expect(archivoPlan.contenido).toContain("## Fusionado de «origen2»");
      expect(archivoPlan.bytesQueEntran).toBeGreaterThan(0);
    });

    it("should omit file when content is equal after normalization", () => {
      const destino = crearMockBrain({ id: "destino", name: "destino" });
      const origen = crearMockBrain({ id: "origen", name: "origen" });
    
      const archivos: ArchivoMemoria[] = [
        { 
          brain_id: "destino", 
          name: "memory.md", 
          content: "---\ntipo: memory\n---\n\n# Contenido\n\n  Esto es una prueba.  " 
        },
        { 
          brain_id: "origen", 
          name: "memory.md", 
          content: "# Contenido\n\nEsto es una prueba." 
        }
      ];
    
      const prefs: Record<string, PrefsCerebro> = {
        destino: {},
        origen: {}
      };
    
      const resultado = planFusion({
        destino,
        origenes: [origen],
        archivos,
        prefs,
        fecha: "2026-10-13"
      });
    
      expect(resultado.archivos.length).toBe(1);
      const archivoPlan = resultado.archivos[0];
      expect(archivoPlan.accion).toBe("omitir");
      expect(archivoPlan.desde).toEqual([]);
      expect(archivoPlan.bytesQueEntran).toBe(0);
    });

    it("should append new sections when content differs", () => {
      const destino = crearMockBrain({ id: "destino", name: "destino" });
      const origen = crearMockBrain({ id: "origen", name: "origen" });
    
      const archivos: ArchivoMemoria[] = [
        { 
          brain_id: "destino", 
          name: "memory.md", 
          content: "# Destino\n\n## Sección existente\nContenido existente" 
        },
        { 
          brain_id: "origen", 
          name: "memory.md", 
          content: "# Origen\n\n## Sección existente\nContenido existente\n\n## Nueva sección\nContenido nuevo" 
        }
      ];
    
      const prefs: Record<string, PrefsCerebro> = {
        destino: {},
        origen: {}
      };
    
      const resultado = planFusion({
        destino,
        origenes: [origen],
        archivos,
        prefs,
        fecha: "2026-10-13"
      });
    
      expect(resultado.archivos.length).toBe(1);
      const archivoPlan = resultado.archivos[0];
      expect(archivoPlan.accion).toBe("anexar");
      expect(archivoPlan.desde).toEqual(["origen"]);
      expect(archivoPlan.contenido).toContain("# Destino");
      expect(archivoPlan.contenido).toContain("## Sección existente");
      expect(archivoPlan.contenido).toContain("## Fusionado de «origen»");
      expect(archivoPlan.contenido).toContain("Contenido nuevo");
      expect(archivoPlan.bytesQueEntran).toBeGreaterThan(0);
    });

    it("should not append duplicate sections", () => {
      const destino = crearMockBrain({ id: "destino", name: "destino" });
      const origen = crearMockBrain({ id: "origen", name: "origen" });
    
      const archivos: ArchivoMemoria[] = [
        { 
          brain_id: "destino", 
          name: "memory.md", 
          content: "# Destino\n\n## Sección A\nContenido A\n\n## Sección B\nContenido B" 
        },
        { 
          brain_id: "origen", 
          name: "memory.md", 
          content: "# Origen\n\n## Sección A\nContenido A\n\n## Sección B\nContenido B\n\n## Sección A otra vez\nContenido A" 
        }
      ];
    
      const prefs: Record<string, PrefsCerebro> = {
        destino: {},
        origen: {}
      };
    
      const resultado = planFusion({
        destino,
        origenes: [origen],
        archivos,
        prefs,
        fecha: "2026-10-13"
      });
    
      expect(resultado.archivos.length).toBe(1);
      const archivoPlan = resultado.archivos[0];
      expect(archivoPlan.accion).toBe("anexar");
      // No debería añadir nada porque las secciones ya existen (a pesar de que el origen tiene una duplicada)
      // Pero wait, el origen tiene "Sección A otra vez" con el mismo contenido normalizado
      // Normalizar haría que tanto "Sección A" como "Sección A otra vez" tengan el mismo contenido normalizado si el contenido es el mismo
      // En este caso, ambos tienen "Contenido A", entonces la segunda debería omitirse
      expect(archivoPlan.contenido).not.toContain("Sección A otra vez");
      expect(archivoPlan.bytesQueEntran).toBe(0); // Porque no se añadió nada nuevo
    });

    it("should handle the real case from 2026-10-13", () => {
      const destino = crearMockBrain({ id: "c7755fd9", name: "c7755fd9" });
      const origen = crearMockBrain({ id: "3ab250b8", name: "3ab250b8" });
    
    // Simular el caso descrito: destino con varias secciones y origen con actualizaciones
    const archivos: ArchivoMemoria[] = [
      { 
        brain_id: "c7755fd9", 
        name: "memory.md", 
        content: `# memory.md — Memoria

Hechos, contexto y conocimiento persistente que el cerebro recuerda entre sesiones.

## Hechos clave

## Contexto actual` 
      },
      { 
        brain_id: "3ab250b8", 
        name: "memory.md", 
        content: `---\ntype: memory\n---\n\n# Memoria\n\nHechos/estado genéricos (fallback).\n\n## Actualización automática de Astraura · 10/1\n\n## Actualización automática de Astraura · 10/2\n\n## Actualización automática de Astraura · 10/3` 
      }
    ];
    
    const prefs: Record<string, PrefsCerebro> = {
      "c7755fd9": {},
      "3ab250b8": {}
    };
    
    const resultado = planFusion({
      destino,
      origenes: [origen],
      archivos,
      prefs,
      fecha: "2026-10-13"
    });
    
    expect(resultado.archivos.length).toBe(1);
    const archivoPlan = resultado.archivos[0];
    expect(archivoPlan.accion).toBe("anexar"); // El destino tenía el archivo, el origen también, pero contenido distinto
    expect(archivoPlan.desde).toEqual(["3ab250b8"]);
    
      // Debería mantener el contenido del destino y añadir las 3 secciones nuevas del origen
      expect(archivoPlan.contenido).toContain("Hechos, contexto y conocimiento persistente");
      expect(archivoPlan.contenido).toContain("## Hechos clave");
      expect(archivoPlan.contenido).toContain("## Contexto actual");
    
      // Debería añadir exactamente 3 secciones de fusión
      const coincidencias = (archivoPlan.contenido.match(/## Fusionado de «3ab250b8»/g) || []).length;
      expect(coincidencias).toBe(3);
    
      // Cada sección de fusión debería contener una de las actualizaciones
      expect(archivoPlan.contenido).toContain("Actualización automática de Astraura · 10/1");
      expect(archivoPlan.contenido).toContain("Actualización automática de Astraura · 10/2");
      expect(archivoPlan.contenido).toContain("Actualización automática de Astraura · 10/3");
    
      // Los bytes que entran deberían ser positivos
      expect(archivoPlan.bytesQueEntran).toBeGreaterThan(0);
    
      // Al aplicar la fusión nuevamente con el mismo resultado, no debería añadir nada
      // Para probar esto, necesitaríamos crear un nuevo destino con el contenido fusionado
      // pero eso es más complejo y lo dejamos para otra prueba si es necesario
  });

  it("should merge includes correctly", () => {
    const destino = crearMockBrain({
      id: "destino",
      includes: {
        vaults: ["vault1", "vault2"],
        backends: ["backend1"],
        personalities: ["persona1"],
        runtimes: ["runtime1"],
        tokens: ["token1"],
        memories: ["memory1"],
        connections: ["conn1"],
        bindScope: true,
        permissions: [{ who: "user1", level: "lectura" }],
        aiProvider: "provider-destino"
      }
    });
    const origen1 = crearMockBrain({
      id: "origen1",
      includes: {
        vaults: ["vault2", "vault3"], // vault2 es duplicado
        backends: ["backend2"],
        personalities: ["persona2"],
        runtimes: ["runtime2"],
        tokens: ["token2"],
        memories: ["memory2"],
        connections: ["conn2"],
        bindScope: false,
        permissions: [{ who: "user2", level: "escritura" }],
        aiProvider: undefined // El destino debería ganar
      }
    });
    const origen2 = crearMockBrain({
      id: "origen2",
      includes: {
        vaults: ["vault4"],
        backends: [], // Vacío
        personalities: ["persona1"], // Duplicado con destino
        runtimes: [], // Vacío
        tokens: ["token3"],
        memories: ["memory3"],
        connections: ["conn3"],
        bindScope: true,
        permissions: [{ who: "user3", level: "admin" }],
        aiProvider: "provider-origen2" // No debería afectar porque el destino ya tiene uno
      }
    });
    
    const archivos: ArchivoMemoria[] = []; // No necesario para esta prueba
    const prefs: Record<string, PrefsCerebro> = {
      destino: {},
      origen1: {},
      origen2: {}
    };
    
    const resultado = planFusion({
      destino,
      origenes: [origen1, origen2],
      archivos,
      prefs,
      fecha: "2026-10-13"
    });
    
    // vaults: union sin duplicados → [vault1, vault2, vault3, vault4]
    expect(resultado.includes.vaults).toEqual(expect.arrayContaining(["vault1", "vault2", "vault3", "vault4"]));
    expect(resultado.includes.vaults.length).toBe(4);
    
    // backends: union sin duplicados → [backend1, backend2]
    expect(resultado.includes.backends).toEqual(expect.arrayContaining(["backend1", "backend2"]));
    expect(resultado.includes.backends.length).toBe(2);
    
    // personalities: union sin duplicados → [persona1, persona2]
    expect(resultado.includes.personalities).toEqual(expect.arrayContaining(["persona1", "persona2"]));
    expect(resultado.includes.personalities.length).toBe(2);
    
    // runtimes: union sin duplicados → [runtime1, runtime2]
    expect(resultado.includes.runtimes).toEqual(expect.arrayContaining(["runtime1", "runtime2"]));
    expect(resultado.includes.runtimes.length).toBe(2);
    
    // tokens: union sin duplicados → [token1, token2, token3]
    expect(resultado.includes.tokens).toEqual(expect.arrayContaining(["token1", "token2", "token3"]));
    expect(resultado.includes.tokens.length).toBe(3);
    
    // memories: union sin duplicados → [memory1, memory2, memory3]
    expect(resultado.includes.memories).toEqual(expect.arrayContaining(["memory1", "memory2", "memory3"]));
    expect(resultado.includes.memories.length).toBe(3);
    
    // connections: union sin duplicados → [conn1, conn2, conn3]
    expect(resultado.includes.connections).toEqual(expect.arrayContaining(["conn1", "conn2", "conn3"]));
    expect(resultado.includes.connections.length).toBe(3);
    
    // bindScope: true si cualquiera lo tiene → true (destino y origen2 lo tienen)
    expect(resultado.includes.bindScope).toBe(true);
    
    // permissions: unión por who → [user1, user2, user3]
    expect(resultado.includes.permissions.length).toBe(3);
    const whoValues = resultado.includes.permissions.map(p => p.who);
    expect(whoValues).toEqual(expect.arrayContaining(["user1", "user2", "user3"]));
    
    // aiProvider: del destino o del primer origen que lo tenga → debería ser "provider-destino"
    expect(resultado.includes.aiProvider).toBe("provider-destino");
  });

  it("should merge servers correctly", () => {
    const destino = crearMockBrain({
      id: "destino",
      servers: [
        { id: "srv1", kind: "local", name: "Local 1", endpoint: "http://local1:8800" },
        { id: "srv2", kind: "starseed", name: "StarSeed 1", endpoint: "http://starseed:8800" }
      ]
    });
    const origen1 = crearMockBrain({
      id: "origen1",
      servers: [
        { id: "srv3", kind: "local", name: "Local 2", endpoint: "http://local2:8800" },
        { id: "srv4", kind: "online", name: "Online 1", endpoint: "http://online1:8800" },
        { id: "srv5", kind: "starseed", name: "StarSeed 2", endpoint: "http://starseed:8800" } // Mismo endpoint que srv2 del destino
      ]
    });
    const origen2 = crearMockBrain({
      id: "origen2",
      servers: [
        { id: "srv6", kind: "vps", name: "VPS 1", endpoint: "" }, // Endpoint vacío
        { id: "srv7", kind: "vps", name: "VPS 2", endpoint: "" } // Otro endpoint vacío (debería añadirse porque los ids son diferentes)
      ]
    });
    
    const archivos: ArchivoMemoria[] = [];
    const prefs: Record<string, PrefsCerebro> = {
      destino: {},
      origen1: {},
      origen2: {}
    };
    
    const resultado = planFusion({
      destino,
      origenes: [origen1, origen2],
      archivos,
      prefs,
      fecha: "2026-10-13"
    });
    
     // Consider the total number of unique servers
     // srv1, srv2 from destino
     // srv3 (different endpoint), srv4 (new endpoint), srv5 (duplicate endpoint with srv2, so not added)
     // srv6, srv7 (both have empty endpoints, but different IDs, so both added)
     
     // Expected: srv1, srv2, srv3, srv4, srv6, srv7 = 6 servers
     
     // Let's check the actual implementation
     
     // The implementation adds:
     // - All destino servers (srv1, srv2)
     // - From origen1: 
     //   * srv3 (new ID, endpoint http://local2:8800 - added)
     //   * srv4 (new ID, endpoint http://online1:8800 - added)
     //   * srv5 (new ID, but endpoint http://starseed:8800 already exists from srv2 - NOT added)
     // - From origen2:
     //   * srv6 (new ID, endpoint "" - added because endpoint is empty)
     //   * srv7 (new ID, endpoint "" - added because endpoint is empty and we don't deduplicate empty endpoints)
     
     // Total: srv1, srv2, srv3, srv4, srv6, srv7 = 6
     
     expect(resultado.servers.length).toBe(6);
     
     // Check that we have the expected IDs
     const ids = resultado.servers.map(s => s.id);
     expect(ids).toEqual(expect.arrayContaining(["srv1", "srv2", "srv3", "srv4", "srv6", "srv7"]));
    
     // Check that we don't have the duplicate endpoint server (srv5)
     expect(ids).not.toContain("srv5");
  });

  it("should merge config correctly", () => {
    const destino = crearMockBrain({
      id: "destino",
      config: {
        claveDestino: "valorDestino",
        claveCompartida: "valorDestinoCompartida"
      }
    });
    const origen1 = crearMockBrain({
      id: "origen1",
      config: {
        claveOrigen1: "valorOrigen1",
        claveCompartida: "valorOrigen1Compartida" // Diferente, pero destino gana
      }
    });
    const origen2 = crearMockBrain({
      id: "origen2",
      config: {
        claveOrigen2: "valorOrigen2",
        claveCompartida: "valorDestinoCompartida" // Igual que destino
      }
    });
    
    const archivos: ArchivoMemoria[] = [];
    const prefs: Record<string, PrefsCerebro> = {
      destino: {},
      origen1: {},
      origen2: {}
    };
    
    const resultado = planFusion({
      destino,
      origenes: [origen1, origen2],
      archivos,
      prefs,
      fecha: "2026-10-13"
    });
    
     // Config should keep destino's values and add missing keys from origenes
     
     expect(resultado.config.claveDestino).toBe("valorDestino");
     expect(resultado.config.claveCompartida).toBe("valorDestinoCompartida"); // Destino gana
     expect(resultado.config.claveOrigen1).toBe("valorOrigen1");
     expect(resultado.config.claveOrigen2).toBe("valorOrigen2");
     
     // Should have fusionados and fusionadoEn
     expect(Array.isArray(resultado.config.fusionados)).toBe(true);
     expect(resultado.config.fusionados).toEqual(expect.arrayContaining(["origen1", "origen2"]));
     expect(resultado.config.fusionadoEn).toBe("2026-10-13");
  });
});