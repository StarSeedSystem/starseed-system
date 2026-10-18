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

  it("convierte un átomo registrado en una ficha de biblioteca con las propiedades correctas", () => {
    const atomoDef = atomo("test-tool", "audio", { nombre: "Herramienta de Prueba" });
    registrarAtomo(atomoDef);
    
    const resultado = fichasProtomolecula();
    
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("test-tool");
    expect(resultado[0].nombre).toBe("Herramienta de Prueba");
    expect(resultado[0].categoria).toBe("audio"); // Grupo para categoria "audio" es "audio"
    expect(resultado[0].categoriaEtiqueta).toBe("Audio y síntesis");
    expect(resultado[0].descripcion).toBe("Átomo integrado de Herramienta de Prueba.");
    expect(resultado[0].licencia).toBe("desconocida");
    expect(resultado[0].enlaces.web).toBeUndefined();
    expect(resultado[0].enlaces.repo).toBeUndefined();
    expect(resultado[0].integracion).toBe("libreria-js");
    expect(resultado[0].controlReal).toBe("total");
    expect(resultado[0].estado).toBe("integrada");
    expect(resultado[0].proximamente).toBeUndefined();
  });

  it("usa la información de versiones cuando se proporciona para licencia y versión", () => {
    const catalogo = [herramienta({ id: "versioned-tool", categoria: "ia-generativa", licencia: "MIT" })];
    const versiones = {
      "versioned-tool": {
        version: "1.2.3",
        licencia: "Apache-2.0"
      }
    };
    
    const resultado = fichasProtomolecula(versiones, catalogo);
    
    expect(resultado[0].licencia).toBe("Apache-2.0");
    expect(resultado[0].versionDisponible).toBe("1.2.3");
    expect(resultado[0].versionInstalada).toBeUndefined();
  });

  it("usa la información del catálogo cuando se proporciona para nombre, descripción, licencia y enlaces", () => {
    const catalogo = [herramienta({
      id: "catalog-tool",
      categoria: "ia-generativa", // required field
      nombre: "Nombre desde Catálogo",
      descripcion: "Esta es una descripción detallada desde el catálogo",
      licencia: "GPL-3.0",
      web: "https://ejemplo.com",
      codigo: "https://github.com/ejemplo/catalog-tool"
    })];
    
    const resultado = fichasProtomolecula({}, catalogo);
    
    expect(resultado[0].nombre).toBe("Nombre desde Catálogo");
    expect(resultado[0].descripcion).toContain("Esta es una descripción detallada desde el catálogo");
    expect(resultado[0].licencia).toBe("GPL-3.0");
    expect(resultado[0].enlaces.web).toBe("https://ejemplo.com");
    expect(resultado[0].enlaces.repo).toBe("https://github.com/ejemplo/catalog-tool");
  });

  it("ordena las fichas según el orden especificado en el contrato por grupo", () => {
    // Crear átomos de diferentes categorías
    registrarAtomo(atomo("img-tool", "imagen", { nombre: "Herramienta de Imagen" }));
    registrarAtomo(atomo("juego-tool", "juegos", { nombre: "Herramienta de Juegos" }));
    registrarAtomo(atomo("ia-tool", "ia", { nombre: "Herramienta de IA" }));
    
    const resultado = fichasProtomolecula();
    
    // Verificar que tenemos 3 fichas
    expect(resultado).toHaveLength(3);
    
    // Verificar el orden por grupo: imagen (índice 0), juegos (índice 6), ia (índice 9)
    expect(resultado[0].categoria).toBe("imagen");
    expect(resultado[1].categoria).toBe("juegos");
    expect(resultado[2].categoria).toBe("ia");
    
    // Verificar que cada ficha tiene el nombre correcto
    expect(resultado[0].nombre).toBe("Herramienta de Imagen");
    expect(resultado[1].nombre).toBe("Herramienta de Juegos");
    expect(resultado[2].nombre).toBe("Herramienta de IA");
  });

  it("maneja correctamente cuando se proporcionan tanto versiones como catalogo", () => {
    // Crear un átomo que será ignorado porque hay una entrada en el catálogo para el mismo id
    const atomoDef = atomo("full-tool", "ia", { nombre: "Nombre desde Átomo" });
    registrarAtomo(atomoDef);
    
    const catalogo = [herramienta({
      id: "full-tool",
      categoria: "ia-generativa", // required field
      nombre: "Nombre desde Católico",
      descripcion: "Descripción desde el catálogo",
      licencia: "MIT",
      web: "https://ejemplo.com"
    })];
    
    const versiones = {
      "full-tool": {
        licencia: "Apache-2.0"
      }
    };
    
    const resultado = fichasProtomolecula(versiones, catalogo);
    
    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe("Nombre desde Católico");
    expect(resultado[0].descripcion).toBe("Descripción desde el catálogo");
    expect(resultado[0].licencia).toBe("Apache-2.0");
    expect(resultado[0].enlaces.web).toBe("https://ejemplo.com");
  });
});
