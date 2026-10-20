// Pruebas del módulo puro de paquetes de fondos con Shaders (VST1018F · Ola 1018F).

import { describe, it, expect } from "vitest";
import { validateRepoShape } from "../packages";

// El repositorio exterior a añadir: https://github.com/shader-effects-inc/shaders
const REPO_RAW = {
  id: "fondos-shaders",
  name: "Fondos con Shaders",
  url: "https://github.com/shader-effects-inc/shaders",
  packages: [
    {
      id: "fondos-shaders",
      kind: "repo",
      name: "Fondos con Shaders",
      description: "más de 200 efectos WebGPU para fondos por capas; editor, presets y secciones de shaders.com no incluidos",
      icon: "Layers",
      tags: ["shaders", "fondos", "webgpu", "efectos", "libre"],
      version: "1.0.0",
      author: "shader-effects-inc",
      free: true,
      payload: {
        categoria: "fondos",
        claseLicencia: "libre",
        githubRepo: "shader-effects-inc/shaders",
      },
    },
    // Sets oficiales StarSeed para el editor de fondos (tipo design)
    {
      id: "diseno-cosmos-violeta",
      kind: "design",
      name: "Cosmos violeta",
      description: "Degradado profundo de violeta estelar con gradiente de centro brillante y efecto de nebula sutil para un fondo cósmico inmersivo.",
      icon: "Sparkles",
      tags: ["diseno", "cosmos", "violeta", "estelar", "nebula"],
      version: "1.0.0",
      author: "StarSeed",
      free: true,
      payload: {
        materialClass: "ss-cosmic-deep",
        setFondo: {
          components: [
            { type: "MeshGradient", id: "bg-gradient", props: { colors: ["#4a0e6a", "#2d1b69", "#1a237e"], direction: "radial" }, children: [] },
            { type: "Aurora", id: "aurora-violeta", props: { intensity: 0.7, speed: 0.5 }, children: [] },
            { type: "Nebula", id: "nebula-fondo", props: { density: 0.3, speed: 0.2 }, children: [] },
            { type: "SolidColor", id: "color-base", props: { color: "#0a0a0a", opacity: 1.0 }, children: [] },
          ],
          structureVersion: 1,
        },
      },
    },
    {
      id: "diseno-aurora-suave",
      kind: "design",
      name: "Aurora suave",
      description: "Transición de gradiente suave de verde azulado a índigo con textura sutil de aurora boreal para un ambiente relajante y calmado.",
      icon: "Activity",
      tags: ["diseno", "aurora", "suave", "natural", "verde-azulado"],
      version: "1.0.0",
      author: "StarSeed",
      free: true,
      payload: {
        materialClass: "ss-aurora-soft",
        setFondo: {
          components: [
            { type: "MeshGradient", id: "bg-gradient", props: { colors: ["#00b4d8", "#0077b6", "#03045e"] }, children: [] },
            { type: "Aurora", id: "aurora-principal", props: { intensity: 0.5, speed: 0.3 }, children: [] },
            { type: "LinearGradient", id: "gradiente-fondo", props: { direction: "diagonal", opacity: 0.8 }, children: [] },
            { type: "FilmGrain", id: "grano-textura", props: { intensity: 0.1 }, children: [] },
          ],
          structureVersion: 1,
        },
      },
    },
    {
      id: "diseno-vidrio-cuarzo",
      kind: "design",
      name: "Vidrio de cuarzo",
      description: "Fondo translúcido de vidrio de cuarzo con efecto de refracción de luz y reflectividad especular para una estética moderna y elegante.",
      icon: "Gem",
      tags: ["diseno", "vidrio", "cuarzo", "translúcido", "moderno"],
      version: "1.0.0",
      author: "StarSeed",
      free: true,
      payload: {
        materialClass: "ss-quartz-glass",
        setFondo: {
          components: [
            { type: "MeshGradient", id: "gradiente-cuarzo", props: { colors: ["#f0f8ff", "#e0f7fa", "#b2dfdb"] }, children: [] },
            { type: "Glass", id: "vidrio-efecto", props: { reflectivity: 0.7, refraction: 0.3 }, children: [] },
            { type: "LinearGradient", id: "gradiente-fondo", props: { direction: "vertical", opacity: 0.9 }, children: [] },
            { type: "SolidColor", id: "sombra-base", props: { color: "#1a1a1a", opacity: 0.5 }, children: [] },
          ],
          structureVersion: 1,
        },
      },
    },
    {
      id: "diseno-semilla-dorada",
      kind: "design",
      name: "Semilla dorada",
      description: "Base cálida de oro brillante con gradiente dorado irisado y efecto de partículas para una vibra lujosa y prospera.",
      icon: "Gem",
      tags: ["diseno", "oro", "brillante", "irisado", "prosperidad"],
      version: "1.0.0",
      author: "StarSeed",
      free: true,
      payload: {
        materialClass: "ss-golden-seed",
        setFondo: {
          components: [
            { type: "MeshGradient", id: "gradiente-oro", props: { colors: ["#ffd700", "#ffb300", "#ff8f00"] }, children: [] },
            { type: "FilmGrain", id: "textura-particulas", props: { intensity: 0.3 }, children: [] },
            { type: "SolidColor", id: "brillo-base", props: { color: "#1a1a1a", opacity: 0.8 }, children: [] },
          ],
          structureVersion: 1,
        },
      },
    },
  ],
};

describe("El repo fondos-shaders (exterior) se valida correctamente", () => {
  it("valida la forma del repo y los ids únicos de los paquetes", () => {
    const repo = validateRepoShape(REPO_RAW, REPO_RAW.url);
    expect(repo).not.toBeNull();
    expect(repo?.id).toBe("fondos-shaders");
    expect(repo?.name).toBe("Fondos con Shaders");
    expect(repo?.url).toBe(REPO_RAW.url);

    // El primer paquete del repo es el wrapper repositorio (fondos-shaders)
    expect(repo?.packages[0].id).toBe("fondos-shaders");
    expect(repo?.packages[0].kind).toBe("repo");
    expect((repo?.packages[0].payload as any).categoria).toBe("fondos");
    expect((repo?.packages[0].payload as any).claseLicencia).toBe("libre");
    expect((repo?.packages[0].payload as any).githubRepo).toBe("shader-effects-inc/shaders");

    // Los 4 siguientes son los sets oficiales StarSeed (kind design)
    const disenoSets = repo?.packages.slice(1);
    expect(disenoSets).toHaveLength(4);

    // Todos los paquetes del repo tienen ids únicos
    const ids = repo?.packages.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids?.length);

    // Todos los sets de diseño tienen types de componentes válidos
    const validComponentTypes = new Set(["MeshGradient", "Aurora", "Nebula", "Glass", "FilmGrain", "SolidColor", "LinearGradient"]);
    for (const set of disenoSets) {
      expect(set.kind).toBe("design");
      expect(set.payload.materialClass).toBeDefined();

      const setsFondo = set.payload.setFondo as any;
      expect(setsFondo).toBeDefined();
      expect(setsFondo.structureVersion).toBe(1);
      expect(Array.isArray(setsFondo.components)).toBe(true);
      expect(setsFondo.components).toHaveLength(3);

      for (const comp of setsFondo.components) {
        expect(comp.type).toBeDefined();
        expect(validComponentTypes.has(comp.type)).toBe(true);
        expect(comp.id).toBeDefined();
        expect(comp.props).toBeDefined();
      }
    }
  });
});
