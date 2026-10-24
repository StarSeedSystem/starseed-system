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
  it("la licencia de versiones manda sobre la del catálogo", () => {
    const catalogo = [herramienta({ id: "lic", categoria: "audio-edicion", licencia: "GPL-3.0" })];
    const [conVersion] = fichasProtomolecula({ lic: { licencia: "Apache-2.0" } }, catalogo);
    const [sinVersion] = fichasProtomolecula({}, catalogo);
    expect(conVersion.licencia).toBe("Apache-2.0");
    expect(sinVersion.licencia).toBe("GPL-3.0");
  });

  it("combina catálogo y versiones: conserva el estado del catálogo y prioriza su licencia versionada", () => {
    const catalogo = [herramienta({
      id: "combinada",
      categoria: "ia-generativa",
      nombre: "Nombre del catálogo",
      descripcion: "Descripción del catálogo.",
      licencia: "GPL-3.0",
      estado: "proximamente",
      motivo: "falta el puente nativo",
      web: "https://ejemplo.com",
    })];

    const [ficha] = fichasProtomolecula({ combinada: { version: "2.0.0", licencia: "Apache-2.0" } }, catalogo);

    expect(ficha.nombre).toBe("Nombre del catálogo");
    expect(ficha.descripcion).toBe("Descripción del catálogo.");
    expect(ficha.licencia).toBe("Apache-2.0");
    expect(ficha.enlaces.web).toBe("https://ejemplo.com");
    expect(ficha.estado).toBe("proximamente");
    expect(ficha.proximamente).toBe("próximamente: falta el puente nativo");
    expect(ficha.versionDisponible).toBe("2.0.0");
  });

  it("nombre, descripción y enlaces salen del catálogo", () => {
    const catalogo = [herramienta({
      id: "enlaces", categoria: "raster-pintura", nombre: "Pintor", descripcion: "Pinta cosas.",
      web: "https://ejemplo.com", codigo: "https://github.com/ejemplo/enlaces",
    })];
    const [f] = fichasProtomolecula({}, catalogo);
    expect(f.nombre).toBe("Pintor");
    expect(f.descripcion).toBe("Pinta cosas.");
    expect(f.enlaces).toEqual({ web: "https://ejemplo.com", repo: "https://github.com/ejemplo/enlaces" });
  });

  it("sin dato en catálogo, licencia y enlaces caen a la ficha del átomo", () => {
    const catalogo = [herramienta({ id: "atomo-ficha", categoria: "motores-juego", licencia: null as never, codigo: null })];
    registrarAtomo(atomo("atomo-ficha", "juegos", { ficha: { web: "https://atomo.dev", repo: "https://github.com/a/b", licencia: "MPL-2.0" } }));
    const [f] = fichasProtomolecula({}, catalogo);
    expect(f.licencia).toBe("MPL-2.0");
    expect(f.enlaces).toEqual({ web: "https://atomo.dev", repo: "https://github.com/a/b" });
  });

  it("sin licencia en ninguna parte se dice 'desconocida'", () => {
    const catalogo = [herramienta({ id: "sin-lic", categoria: "audio-edicion", licencia: null as never })];
    expect(fichasProtomolecula({}, catalogo)[0].licencia).toBe("desconocida");
  });

  it("el orden del contrato se respeta: imagen, juegos, ia", () => {
    const catalogo = [
      herramienta({ id: "ia", categoria: "ia-generativa" }),
      herramienta({ id: "juego", categoria: "motores-juego" }),
      herramienta({ id: "img", categoria: "raster-pintura" }),
    ];
    expect(fichasProtomolecula({}, catalogo).map((f) => f.categoria)).toEqual(["imagen", "juegos", "ia"]);
  });
});
