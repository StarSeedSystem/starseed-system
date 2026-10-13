import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula, ORDEN_GRUPOS_PROTO } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro, listarAtomos } from "../registro-atomos";
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

function atomo(herramientaId: string, categoria: CategoriaAtomo = "raster-pintura", extra: Partial<DefinicionAtomo> = {}): DefinicionAtomo {
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

  it("usa la información del catálogo cuando se proporciona y hay átomo coincidente", () => {
    const atomoDef = atomo("catalog-tool", "codigo", { nombre: "Herramienta del Catálogo" });
    registrarAtomo(atomoDef);
    
    const catalogo = [{
      id: "catalog-tool",
      nombre: "Nombre desde Católico",
      descripcion: "Esta es una descripción detallada desde el catálogo",
      licencia: "GPL-3.0",
      codigo: "https://github.com/usuario/repo",
      web: "https://ejemplo.com",
      documento: "https://docs.ejemplo.com",
      integracion: "iframe-aislado",
      control: "total",
      estado: "integrable",
      motivo: ""
    }];
    
    const resultado = fichasProtomolecula({}, catalogo);
    
    expect(resultado.length).toBe(1);
    expect(resultado[0].nombre).toBe("Nombre desde Católico");
    expect(resultado[0].descripcion).toContain("Esta es una descripción detallada desde el catálogo");
    expect(resultado[0].licencia).toBe("GPL-3.0");
    expect(resultado[0].enlaces).toBeDefined();
    expect(resultado[0].enlaces!.web).toBe("https://ejemplo.com");
    expect(resultado[0].enlaces!.repo).toBe("https://github.com/usuario/repo");
    expect(resultado[0].estado).toBe("integrada"); // debido al átomo coincidente
    expect(resultado[0].controlReal).toBe("total"); // del átomo (control por defecto)
  });

  it("ordena las fichas según el orden especificado en el contrato (posiciones 0, 6, 9)", () => {
    const gruposYNombres = [
      { categoria: "imagen", nombre: "Herramienta de Imagen" },
      { categoria: "audio", nombre: "Herramienta de Audio" },
      { categoria: "video", nombre: "Herramienta de Video" },
      { categoria: "3d", nombre: "Herramienta de 3D" },
      { categoria: "arquitectura", nombre: "Herramienta de Arquitectura" },
      { categoria: "fisicas", nombre: "Herramienta de Fisicas" },
      { categoria: "juegos", nombre: "Herramienta de Juegos" },
      { categoria: "vr-ar", nombre: "Herramienta de VRAR" },
      { categoria: "codigo", nombre: "Herramienta de Codigo" },
      { categoria: "ia", nombre: "Herramienta de IA" },
    ];

    // Registrar todos los átomos
    for (const { categoria, nombre } of gruposYNombres) {
      registrarAtomo(atomo(nombre.toLowerCase().replace(/\s/g, '-'), categoria, { nombre }));
    }

    const resultado = fichasProtomolecula();
    
    // Debemos tener exactamente 10 fichas
    expect(resultado.length).toBe(10);
    
    // Verificar que la ficha en posición 0 pertenece al grupo "imagen" (índice 0 en ORDEN_GRUPOS_PROTO)
    expect(resultado[0].categoria).toBe("imagen");
    // Verificar que la ficha en posición 6 pertenece al grupo "juegos" (índice 6 en ORDEN_GRUPOS_PROTO)
    expect(resultado[6].categoria).toBe("juegos");
    // Verificar que la ficha en posición 9 pertenece al grupo "ia" (índice 9 in ORDEN_GRUPOS_PROTO)
    expect(resultado[9].categoria).toBe("ia");
  });

  it("convierte un átomo registrado en una ficha de biblioteca", () => {
    const atom = atomo("test-tool", "raster-pintura", { nombre: "Herramienta de Prueba" });
    registrarAtomo(atom);
    
    const resultado = fichasProtomolecula({}, []);
    
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("test-tool");
    expect(resultado[0].nombre).toBe("Herramienta de Prueba");
    expect(resultado[0].categoria).toBe("raster-pintura");
    expect(resultado[0].categoriaEtiqueta).toBe("Imagen");
    expect(resultado[0].controlReal).toBe("total");
    expect(resultado[0].estado).toBe("integrada");
  });

  it("usa la información de versiones cuando se proporciona", () => {
    const atom = atomo("versioned-tool", "imagen", { nombre: "Herramienta con Versión" });
    registrarAtomo(atom);
    
    const versiones = {
      "versioned-tool": {
        version: "1.2.3",
        fecha: "2026-10-10",
        licencia: "MIT",
        sha: "abc123",
        estado: "disponible"
      }
    };
    
    const herramientaObj = {
      id: "versioned-tool",
      nombre: "Placeholder",
      categoria: "raster-pintura",
      estado: "integrable",
      motivo: "Licencia y vía comprobadas."
    };
    // Check if the categoria is valid
    const categoriaValida = CATEGORIAS_PROTOMOLECULA.some(c => c.id === herramientaObj.categoria);
    console.log('HerramientaObj categoria válida?:', categoriaValida);
    const catalogo = [herramienta(herramientaObj)];
    console.log('Herramienta from helper:', JSON.stringify(catalogo[0]));
    console.log('Versiones:', versiones);
    console.log('Versión for id:', versiones["versioned-tool"]);
    
    const resultado = fichasProtomolecula(versiones, catalogo);
    console.log('Resultado ficha:', JSON.stringify(resultado[0]));

    
     expect(resultado[0].licencia).toBe("MIT");
     expect(resultado[0].versionInstalada).toBe("1.2.3");
     expect(resultado[0].versionDisponible).toBeUndefined();
     expect(resultado[0].descripcion).toContain("Herramienta con Versión");
     expect(resultado[0].categoria).toBe("imagen");
     expect(resultado[0].categoriaEtiqueta).toBe("Imagen");
     expect(resultado[0].estado).toBe("integrada");
  });

  it("marca las fichas como no verificadas cuando el estado es 'proximamente'", () => {
    const catalogo = [{
      ...herramienta({ id: "future-tool", categoria: "ia-generativa", nombre: "Herramienta Futura", estado: "proximamente", motivo: "falta el build WASM" })
    }];
    
    const resultado = fichasProtomolecula({}, catalogo);
    
    expect(resultado).toHaveLength(1);
    expect(resultado[0].estado).toBe("proximamente");
    expect(resultado[0].proximamente).toBe("próximamente: falta el build WASM");
    expect(resultado[0].categoria).toBe("ia");
    expect(resultado[0].categoriaEtiqueta).toBe("IA generativa");
  });

  it("muestra 'Próximamente' cuando el átomo tiene el campo proximamente", () => {
    const atomWithProximamente: any = {
      ...atomo("proximate-tool", "raster-pintura", { nombre: "Herramienta Próxima" }),
      proximamente: "Falta implementar el envoltorio nativo"
    };
    registrarAtomo(atomWithProximamente);
    
    const resultado = fichasProtomolecula();
    
    expect(resultado[0].description).toContain("Próximamente: Falta implementar el envoltorio nativo");
    expect(resultado[0].categoria).toBe("raster-pintura");
    expect(resultado[0].categoriaEtiqueta).toBe("Imagen");
     expect(resultado[0].estado).toBe("integrada");
   });

  it("agrupa correctamente las fichas por categoría", () => {
    // Crear átomos de diferentes categorías
    registrarAtomo(atomo("img-tool", "raster-pintura", { nombre: "Herramienta de Imagen" }));
    registrarAtomo(atomo("aud-tool", "audio-edicion", { nombre: "Herramienta de Audio" }));
    registrarAtomo(atomo("vid-tool", "video-composicion", { nombre: "Herramienta de Video" }));
    
    const resultado = fichasProtomolecula();
    
    // Verificar que tenemos 3 fichas
    expect(resultado).toHaveLength(3);
    
    // Verificar que cada ficha tiene la categoría correspondiente
    const imgFicha = resultado.find(f => f.nombre === "Herramienta de Imagen");
    const audFicha = resultado.find(f => f.nombre === "Herramienta de Audio");
    const vidFicha = resultado.find(f => f.nombre === "Herramienta de Video");
    
    expect(imgFicha).toBeDefined();
    expect(audFicha).toBeDefined();
    expect(vidFicha).toBeDefined();
    
    expect(imgFicha?.categoria).toBe("raster-pintura");
    expect(audFicha?.categoria).toBe("audio-edicion");
     expect(vidFicha?.categoria).toBe("video-composicion");
   });

  it("ordena las fichas según el orden especificado en el contrato", () => {
    // Crear átomos en orden aleatorio
    registrarAtomo(atomo("juego-tool", "motores-juego", { nombre: "Herramienta de Juegos" }));
    registrarAtomo(atomo("img-tool", "raster-pintura", { nombre: "Herramienta de Imagen" }));
    registrarAtomo(atomo("ia-tool", "ia-generativa", { nombre: "Herramienta de IA" }));
    
    const resultado = fichasProtomolecula();
    
    // El orden debería ser: imagen, audio, video, 3d, arquitectura, fisicas, juegos, vr-ar, codigo, ia
    // Entonces: img-tool (posición 0), juego-tool (posición 6), ia-tool (posición 9)
    expect(resultado[0].nombre).toBe("Herramienta de Imagen");
    expect(resultado[6].nombre).toBe("Herramienta de Juegos");
    expect(resultado[9].nombre).toBe("Herramienta de IA");
  });

  it("maneja correctamente cuando se proporcionan tanto versiones como catalogo", () => {
    const atom = atomo("full-tool", "raster-pintura", { nombre: "Herramienta Completa" });
    registrarAtomo(atom);
    
    const versiones = {
      "full-tool": {
        version: "2.0.0",
        licencia: "Apache-2.0"
      }
    };
    
    const catalogo = [{
      id: "full-tool",
      nombre: "Nombre desde Catálogo",
      descripcion: "Descripción desde el catálogo",
      web: "https://ejemplo.com",
      motivo: "Estado de prueba",
      categoria: "raster-pintura"
    }];
     
    const resultado = fichasProtomolecula(versiones, catalogo);
    console.log('Resultado ficha:', JSON.stringify(resultado[0]));
    console.log('Resultado ficha:', JSON.stringify(resultado[0]));
    
    expect(resultado[0].nombre).toBe("Nombre desde Catálogo");
    expect(resultado[0].description).toContain("Descripción desde el catálogo");
    expect(resultado[0].description).toContain("Próximamente: Estado de prueba");
    expect(resultado[0].license).toBe("Apache-2.0"); // La de versiones tiene precedencia
    expect(resultado[0].links).toBeDefined();
    expect(resultado[0].links?.find(l => l.label === "Web oficial")?.url).toBe("https://ejemplo.com");
  });

  it("devuelve un array vacío cuando no hay átomos registrados", () => {
    const resultado = fichasProtomolecula();
    expect(resultado).toEqual([]);
  });
});