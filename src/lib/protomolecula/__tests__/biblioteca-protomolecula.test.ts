import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula, ORDEN_GRUPOS_PROTO } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro } from "../registro-atomos";
import type { DefinicionAtomo, Parametro, CategoriaAtomo } from "../registro-atomos";
import { CATEGORIAS_PROTOMOLECULA } from "../catalogo-herramientas";
import type { HerramientaProto } from "../catalogo-herramientas";

function herramienta(parcial: Partial<HerramientaProto> & { id: string; categoria: HerramientaProto["categoria"] }): HerramientaProto {
  return {
    nombre: parcial.id,
    tipo: "app",
    origen: "otro",
    descripcion: `Descripción de ${parcial.id}.`,
    licencia: "MIT",
    codigo: `https://github.com/ejemplo/${parcial.id}`,
    web: null,
    medios: { web: "embebible", android: false, ios: false, macos: true, windows: true, linux: true, servidor: false },
    integracion: "iframe-aislado",
    formatos: { entrada: [], salida: [] },
    control: { via: ["postMessage"], notas: "" },
    actualizacion: { fuente: "github-releases", ref: `ejemplo/${parcial.id}`, ultimaVersion: null, fechaVersion: null },
    ia: [],
    estado: "integrable",
    motivo: "Licencia y vía comprobadas.",
    verificado: "2026-10-10",
    ...parcial,
  };
}

function atomo(herramientaId: string, categoria: CategoriaAtomo = "imagen", extra: Partial<DefinicionAtomo> = {}): DefinicionAtomo {
  const parametro: Parametro = { id: "p", nombre: "P", tipo: "numero" };
  return { herramientaId, nombre: herramientaId, categoria, integracion: "libreria-js", control: "total", parametros: [parametro], entradas: [], salidas: [], ...extra };
}

describe("fichasProtomolecula", () => {
  beforeEach(() => limpiarRegistro());

  it("devuelve vacío sin catálogo ni átomos", () => {
    expect(fichasProtomolecula()).toEqual([]);
  });

  it("agrupa por grupo y las categorías vacías no aparecen al agrupar", () => {
    const catalogo = [
      herramienta({ id: "b-video", categoria: "video-composicion" }),
      herramienta({ id: "a-imagen", categoria: "raster-pintura" }),
      herramienta({ id: "c-imagen", categoria: "foto-raw" }),
    ];
    const fichas = fichasProtomolecula({}, catalogo);
    expect(fichas.map((f) => f.id)).toEqual(["a-imagen", "c-imagen", "b-video"]);
    const grupos = new Set(fichas.map((f) => f.categoria));
    expect([...grupos]).toEqual(["imagen", "video"]);
    for (const ficha of fichas) {
      expect(ORDEN_GRUPOS_PROTO).toContain(ficha.categoria);
      expect(ficha.categoriaEtiqueta.length).toBeGreaterThan(0);
    }
  });

  it("una herramienta 'proximamente' muestra «próximamente: <motivo>»", () => {
    const catalogo = [herramienta({ id: "futura", categoria: "ia-generativa", estado: "proximamente", motivo: "falta el build WASM" })];
    const [f] = fichasProtomolecula({}, catalogo);
    expect(f.estado).toBe("proximamente");
    expect(f.proximamente).toBe("próximamente: falta el build WASM");
  });

  it("versión nueva sin SHA verificado se muestra disponible, nunca instalada", () => {
    const catalogo = [herramienta({ id: "sin-sha", categoria: "audio-edicion" })];
    const [f] = fichasProtomolecula({ "sin-sha": { version: "2.0.0" } }, catalogo);
    expect(f.versionDisponible).toBe("2.0.0");
    expect(f.versionInstalada).toBeUndefined();
  });

  it("versión con SHA verificado se anuncia como instalada", () => {
    const catalogo = [herramienta({ id: "con-sha", categoria: "audio-edicion" })];
    const [f] = fichasProtomolecula({ "con-sha": { version: "1.4.2", sha: "abc123" } }, catalogo);
    expect(f.versionInstalada).toBe("1.4.2");
    expect(f.versionDisponible).toBeUndefined();
  });

  it("la licencia de versiones tiene precedencia sobre la del catálogo", () => {
    const catalogo = [herramienta({ id: "completa", categoria: "ia-generativa", licencia: "GPL-3.0", web: "https://ejemplo.com" })];
    const [f] = fichasProtomolecula({ completa: { version: "2.0.0", licencia: "Apache-2.0" } }, catalogo);
    expect(f.licencia).toBe("Apache-2.0");
    expect(f.enlaces.web).toBe("https://ejemplo.com");
  });

  it("herramienta sin repositorio sale sin enlace de repo (nada que comprobar)", () => {
    const catalogo = [herramienta({ id: "estandar", categoria: "conversion-formatos", codigo: null })];
    const [f] = fichasProtomolecula({}, catalogo);
    expect(f.enlaces.repo).toBeUndefined();
  });

  it("un átomo registrado convierte la ficha en 'integrada' con control real total", () => {
    const catalogo = [herramienta({ id: "motores-juego-x", categoria: "motores-juego" })];
    registrarAtomo(atomo("motores-juego-x", "juegos"));
    const [f] = fichasProtomolecula({}, catalogo);
    expect(f.estado).toBe("integrada");
    expect(f.controlReal).toBe("total");
    expect(f.categoria).toBe("juegos");
  });

  it("un átomo sin entrada en el catálogo también recibe ficha", () => {
    registrarAtomo(atomo("propio", "vr-ar", { nombre: "Sala propia" }));
    const [f] = fichasProtomolecula({}, []);
    expect(f.nombre).toBe("Sala propia");
    expect(f.estado).toBe("integrada");
    expect(f.categoria).toBe("vr-ar");
  });

  it("un átomo 'proximamente' no se registra (regla del núcleo): sin ficha duplicada", () => {
    const r = registrarAtomo(atomo("pendiente", "audio", { proximamente: "falta el puente nativo" }));
    expect(r.ok).toBe(false);
    expect(fichasProtomolecula()).toEqual([]);
  });

  it("solo-enlace del catálogo da control 'solo enlace'", () => {
    const catalogo = [herramienta({ id: "prohibida", categoria: "codigo-creativo", estado: "solo-enlace", integracion: "solo-enlace" })];
    const [f] = fichasProtomolecula({}, catalogo);
    expect(f.estado).toBe("solo-enlace");
    expect(f.controlReal).toBe("solo enlace");
  });

  it("los grupos extra del catálogo se ordenan detrás de los diez primeros", () => {
    const catalogo = [
      herramienta({ id: "recurso", categoria: "recursos-abiertos" }),
      herramienta({ id: "imagen", categoria: "vector-diseno" }),
    ];
    const fichas = fichasProtomolecula({}, catalogo);
    expect(fichas.map((f) => f.id)).toEqual(["imagen", "recurso"]);
    const info = CATEGORIAS_PROTOMOLECULA.find((c) => c.id === "recursos-abiertos");
    expect(info?.grupo).toBe("recursos");
  });

  it("usa el nombre y descripción del catálogo cuando se proporciona", () => {
    const catalogo = [herramienta({
      id: "test-tool",
      nombre: "Nombre Personalizado",
      descripcion: "Esta es una descripción personalizada.",
      licencia: "MIT",
      codigo: "https://github.com/usuario/repo",
      web: "https://ejemplo.com",
      categoria: "raster-pintura" as const,
      tipo: "app" as const,
    })];

    const [ficha] = fichasProtomolecula({}, catalogo);

    expect(ficha.nombre).toBe("Nombre Personalizado");
    expect(ficha.descripcion).toBe("Esta es una descripción personalizada.");
    expect(ficha.licencia).toBe("MIT");
    expect(ficha.enlaces.web).toBe("https://ejemplo.com");
    expect(ficha.enlaces.repo).toBe("https://github.com/usuario/repo");
  });

  it("agrupa los átomos por categoría", () => {
    registrarAtomo(atomo("tool1", "imagen"));
    registrarAtomo(atomo("tool2", "audio"));
    registrarAtomo(atomo("tool3", "video"));

    const fichas = fichasProtomolecula();

    expect(fichas).toHaveLength(3);
    expect(fichas.find(f => f.nombre === "tool1")?.categoria).toBe("imagen");
    expect(fichas.find(f => f.nombre === "tool2")?.categoria).toBe("audio");
    expect(fichas.find(f => f.nombre === "tool3")?.categoria).toBe("video");
  });

  it("ordena los átomos por categoría según el orden especificado", () => {
    registrarAtomo(atomo("juego-tool", "juegos"));
    registrarAtomo(atomo("img-tool", "imagen"));
    registrarAtomo(atomo("ia-tool", "ia"));

    const fichas = fichasProtomolecula();

    expect(fichas).toHaveLength(3);
    expect(fichas.map(f => f.categoria)).toEqual(["imagen", "juegos", "ia"]);
  });

  it("maneja correctamente cuando se proporcionan tanto versiones como catalogo", () => {
    const atm = atomo("full-tool", "imagen");
    registrarAtomo(atm);

    const versiones = {
      "full-tool": {
        version: "2.0.0",
        licencia: "Apache-2.0",
        sha: "abc123"
      }
    };

     const catalogo = [{
       id: "full-tool",
       nombre: "Nombre desde Catálogo",
       descripcion: "Descripción desde el catálogo",
       licencia: "GPL-3.0",
       codigo: "https://github.com/usuario/repo",
       web: "https://ejemplo.com",
       tipo: "app" as const,
       origen: "otro" as const,
       medios: { web: "embebible" as const, android: false, ios: false, macos: true, windows: true, linux: true, servidor: false },
       integracion: "iframe-aislado" as const,
       formatos: { entrada: [], salida: [] },
       control: { via: ["postMessage"], notas: "" },
       actualizacion: { fuente: "github-releases", ref: `ejemplo/full-tool`, ultimaVersion: null, fechaVersion: null },
       ia: [],
       estado: "integrable",
       motivo: "",
       verificado: "2026-10-10",
       categoria: "raster-pintura" as const,
     }] as const;

    const [ficha] = fichasProtomolecula(versiones, catalogo);

    expect(ficha.nombre).toBe("Nombre desde Catálogo");
    expect(ficha.descripcion).toBe("Descripción desde el catálogo");
    expect(ficha.licencia).toBe("Apache-2.0");
    expect(ficha.versionInstalada).toBe("2.0.0");
    expect(ficha.versionDisponible).toBeUndefined();
    expect(ficha.enlaces.web).toBe("https://ejemplo.com");
    expect(ficha.enlaces.repo).toBe("https://github.com/usuario/repo");
  });
});
