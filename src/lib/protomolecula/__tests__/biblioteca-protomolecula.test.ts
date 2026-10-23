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

function crearAtomoValido(id: string, nombre: string, categoria: CategoriaAtomo = "imagen"): DefinicionAtomo {
  const parametro: Parametro = { id: "p", nombre: "P", tipo: "numero" };
  return {
    herramientaId: id,
    nombre,
    categoria,
    integracion: "libreria-js",
    control: "total",
    parametros: [parametro],
    entradas: [],
    salidas: [],
  };
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
    const grupos = Array.from(new Set(fichas.map((f) => f.categoria)));
    expect(grupos).toEqual(["imagen", "video"]);
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
    if (r.ok) throw new Error("no debería registrarse");
    expect(r.motivo).toBe("falta el puente nativo");
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
      herramienta({ id: "recurso", nombre: "recurso", categoria: "recursos-abiertos", licencia: "MIT" }),
      herramienta({ id: "imagen", nombre: "imagen", categoria: "vector-diseno", licencia: "MIT" }),
    ];
    const fichas = fichasProtomolecula({}, catalogo);
    expect(fichas.map((f) => f.id)).toEqual(["imagen", "recurso"]);
    const grupos = Array.from(new Set(fichas.map((f) => f.categoria)));
    expect(grupos).toEqual(["imagen", "recursos"]);
    const info = CATEGORIAS_PROTOMOLECULA.find((c) => c.id === "recursos-abiertos");
    expect(info?.grupo).toBe("recursos");
  });

  it("convierte un átomo registrado en una ficha de biblioteca", () => {
    const atomo = crearAtomoValido("test-tool", "Herramienta de Prueba");
    registrarAtomo(atomo);
    
    const resultado = fichasProtomolecula();
    
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("test-tool");
    expect(resultado[0].nombre).toBe("Herramienta de Prueba");
    expect(resultado[0].categoria).toBe("imagen");
    expect(resultado[0].categoriaEtiqueta).toBe("Imagen");
  });

  it("usa la información de versiones cuando se proporciona", () => {
    const catalogo = [herramienta({ id: "versioned-tool", nombre: "Herramienta con Versión", licencia: "GPL-3.0", categoria: "conversion-formatos" })];
    const versiones = {
      "versioned-tool": {
        licencia: "MIT"
      }
    };
    
    const resultado = fichasProtomolecula(versiones, catalogo);
    
    expect(resultado[0].licencia).toBe("MIT");
  });

  it("usa la información del catálogo cuando se proporciona", () => {
    const catalogo = [herramienta({ 
      id: "catalog-tool", 
      nombre: "Nombre desde Catálogo", 
      descripcion: "Esta es una descripción detallada desde el catálogo",
      licencia: "GPL-3.0",
      codigo: "https://github.com/usuario/repo",
      web: "https://ejemplo.com",
      motivo: "",
      categoria: "conversion-formatos"
    })];
    
    const resultado = fichasProtomolecula({}, catalogo);
    
    expect(resultado[0].nombre).toBe("Nombre desde Catálogo");
    expect(resultado[0].descripcion).toContain("Esta es una descripción detallada desde el catálogo");
    expect(resultado[0].licencia).toBe("GPL-3.0");
    // Verificar que los enlaces se crearon correctamente
    expect(resultado[0].enlaces).toBeDefined();
    expect(resultado[0].enlaces?.web).toBe("https://ejemplo.com");
    expect(resultado[0].enlaces?.repo).toBe("https://github.com/usuario/repo");
  });

  it("muestra 'Próximamente' cuando el átomo tiene el campo proximamente", () => {
    const atomo: DefinicionAtomo = {
      ...crearAtomoValido("proximate-tool", "Herramienta Próxima"),
      proximamente: "Falta implementar el envoltorio nativo"
    };
    // Nota: Los átomos con campo proximamente no se registran (regla del núcleo)
    const registroResult = registrarAtomo(atomo);
    expect(registroResult.ok).toBe(false);
    
    const resultado = fichasProtomolecula();
    expect(resultado).toHaveLength(0);
  });

  it("agrupa correctamente las fichas por categoría", () => {
    // Crear átomos de diferentes categorías
    registrarAtomo(crearAtomoValido("img-tool", "Herramienta de Imagen", "imagen"));
    registrarAtomo(crearAtomoValido("aud-tool", "Herramienta de Audio", "audio"));
    registrarAtomo(crearAtomoValido("vid-tool", "Herramienta de Video", "video"));
    
    const resultado = fichasProtomolecula();
    
    // Verificar que tenemos 3 fichas
    expect(resultado).toHaveLength(3);
    
    // Verificar que cada ficha tiene el categoria correspondiente
    const imgFicha = resultado.find(f => f.nombre === "Herramienta de Imagen");
    const audFicha = resultado.find(f => f.nombre === "Herramienta de Audio");
    const vidFicha = resultado.find(f => f.nombre === "Herramienta de Video");
    
    expect(imgFicha).toBeDefined();
    expect(audFicha).toBeDefined();
    expect(vidFicha).toBeDefined();
    
    expect(imgFicha?.categoria).toBe("imagen");
    expect(audFicha?.categoria).toBe("audio");
    expect(vidFicha?.categoria).toBe("video");
  });

  it("ordena las fichas según el orden especificado en el contrato", () => {
    // Crear átomos en orden aleatorio
    registrarAtomo(crearAtomoValido("juego-tool", "Herramienta de Juegos", "juegos"));
    registrarAtomo(crearAtomoValido("img-tool", "Herramienta de Imagen", "imagen"));
    registrarAtomo(crearAtomoValido("ia-tool", "Herramienta de IA", "ia"));
    
    const resultado = fichasProtomolecula();
    
    // Verificar que tenemos 3 fichas
    expect(resultado).toHaveLength(3);
    
    // Encontrar las posiciones de cada átomo
    const imgIndex = resultado.findIndex(f => f.nombre === "Herramienta de Imagen");
    const juegoIndex = resultado.findIndex(f => f.nombre === "Herramienta de Juegos");
    const iaIndex = resultado.findIndex(f => f.nombre === "Herramienta de IA");
    
    // Verificar que el orden es: imagen < juegos < ia
    expect(imgIndex).toBeGreaterThanOrEqual(0);
    expect(juegoIndex).toBeGreaterThanOrEqual(0);
    expect(iaIndex).toBeGreaterThanOrEqual(0);
    expect(imgIndex).toBeLessThan(juegoIndex);
    expect(juegoIndex).toBeLessThan(iaIndex);
  });

  it("maneja correctamente cuando se proporcionan tanto versiones como catalogo", () => {
    const atomo = crearAtomoValido("full-tool", "Herramienta Completa");
    registrarAtomo(atomo);
    
    const versiones = {
      "full-tool": {
        version: "2.0.0",
        licencia: "Apache-2.0"
      }
    };
    
    const catalogo = [herramienta({ 
      id: "full-tool", 
      nombre: "Nombre desde Catálogo", 
      descripcion: "Descripción desde el catálogo",
      web: "https://ejemplo.com",
      motivo: "Estado de prueba",
      categoria: "conversion-formatos"
    })];
    
    const resultado = fichasProtomolecula(versiones, catalogo);
    
    expect(resultado[0].nombre).toBe("Nombre desde Catálogo");
    expect(resultado[0].descripcion).toBe("Descripción desde el catálogo");
    expect(resultado[0].licencia).toBe("Apache-2.0"); // La de versiones tiene precedencia
    expect(resultado[0].enlaces).toBeDefined();
    expect(resultado[0].enlaces?.web).toBe("https://ejemplo.com");
  });
});