import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula, ORDEN_GRUPOS_PROTO } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro } from "../registro-atomos";
import type { DefinicionAtomo, Parametro, CategoriaAtomo } from "../registro-atomos";
import { CATEGORIAS_PROTOMOLECULA } from "../catalogo-herramientas";
import type { HerramientaProto } from "../catalogo-herramientas";

function getCategoriaAtomo(): CategoriaAtomo {
  return "imagen";
}

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

function atomo(herramientaId: string, categoria: CategoriaAtomo, extra: Partial<DefinicionAtomo> = {}): DefinicionAtomo {
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

  it("usa la información del catálogo cuando se proporciona", () => {
    const atomoObj = atomo("catalog-tool", "imagen" as CategoriaAtomo, { nombre: "Nombre del Átomo" });
    registrarAtomo(atomoObj);

    const catalogo = [{
      ...herramienta({ id: "catalog-tool", categoria: "imagen" }),
      nombre: "Nombre desde Católico",
      descripcion: "Esta es una descripción detallada desde el catálogo",
      licencia: "GPL-3.0",
      codigo: "https://github.com/usuario/repo",
      web: "https://ejemplo.com",
      motivo: ""
    }];

    const resultado = fichasProtomolecula({}, catalogo);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe("Nombre desde Católico");
    expect(resultado[0].descripcion).toContain("Esta es una descripción detallada desde el catálogo");
    expect(resultado[0].licencia).toBe("GPL-3.0");
    expect(resultado[0].enlaces.web).toBe("https://ejemplo.com");
    expect(resultado[0].enlaces.repo).toBe("https://github.com/usuario/repo");
  });

  it("ordena las fichas según el orden especificado en el contrato", () => {
    // Crear átomos de diferentes categorías
    registrarAtomo(atomo("juego-tool", "juegos", { nombre: "Herramienta de Juegos" }));
    registrarAtomo(atomo("img-tool", "imagen", { nombre: "Herramienta de Imagen" }));
    registrarAtomo(atomo("ia-tool", "ia", { nombre: "Herramienta de IA" }));

    const resultado = fichasProtomolecula();

    // Verificar que tenemos 3 fichas
    expect(resultado).toHaveLength(3);

    // Verificar que la ficha de imagen está antes que la de juegos, y la de juegos antes que la de ia
    const imgFicha = resultado.find(f => f.nombre === "Herramienta de Imagen");
    const juegoFicha = resultado.find(f => f.nombre === "Herramienta de Juegos");
    const iaFicha = resultado.find(f => f.nombre === "Herramienta de IA");

    expect(imgFicha).toBeDefined();
    expect(juegoFicha).toBeDefined();
    expect(iaFicha).toBeDefined();

    // We expect the order to be: imagen, juegos, ia? 
    // But note: the group order: imagen (0), juegos (6), ia (9) -> so imagen first, then juegos, then ia.
    const indices = resultado.map(f => f.nombre);
    expect(indices.indexOf("Herramienta de Imagen")).toBeLessThan(indices.indexOf("Herramienta de Juegos"));
    expect(indices.indexOf("Herramienta de Juegos")).toBeLessThan(indices.indexOf("Herramienta de IA"));
  });

  it("maneja correctamente cuando se proporcionan tanto versiones como catalogo", () => {
    const atomoObj = atomo("full-tool", "imagen", { nombre: "Nombre del Átomo" });
    registrarAtomo(atomoObj);

    const versiones = {
      "full-tool": {
        version: "2.0.0",
        licencia: "Apache-2.0"
      }
    };

    const catalogo = [{
      ...herramienta({ id: "full-tool", categoria: "imagen" }),
      nombre: "Nombre desde Católico",
      descripcion: "Descripción desde el catálogo",
      codigo: "https://github.com/usuario/repo",
      web: "https://ejemplo.com",
      motivo: "Estado de prueba"
    }];

    const resultado = fichasProtomolecula(versiones, catalogo);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe("Nombre desde Católico");
    expect(resultado[0].descripcion).toContain("Descripción desde el catálogo");
    expect(resultado[0].licencia).toBe("Apache-2.0");
    expect(resultado[0].enlaces.web).toBe("https://ejemplo.com");
  });
});
