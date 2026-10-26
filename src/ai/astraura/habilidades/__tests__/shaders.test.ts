import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  ATRIBUCION_SHADERS,
  HABILIDAD_SHADERS,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  TIPOS_SHADER_CATEGORIAS,
  todosLosTiposShader,
  comoCapacidad,
  contarPalabras,
  preguntaTipoShader,
  validarPresetShaders,
} from "../shaders";
import type { ShaderCatalog, ShaderCatalogEntry } from "@/lib/appearance/catalogo-shaders";

// Las rutas del encargo son relativas a la raíz del repositorio (donde corre vitest).
const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

describe("contarPalabras", () => {
  it("cuenta trozos separados por cualquier espacio, también símbolos", () => {
    expect(contarPalabras("")).toBe(0);
    expect(contarPalabras("  uno  dos\ntres ")).toBe(3);
    expect(contarPalabras("9 nodos, 12 flechas")).toBe(4);
  });
});

describe("HABILIDAD_SHADERS", () => {
  const h = HABILIDAD_SHADERS;

  it("respeta los límites de palabras del encargo (60 y 120)", () => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    const tarjeta = contarPalabras(h.tarjeta);
    const resumen = contarPalabras(h.resumen);
    expect(tarjeta).toBeGreaterThan(30);
    expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
    expect(resumen).toBeGreaterThan(tarjeta);
  });

  it("dice cuándo aplica en una sola frase", () => {
    expect(h.cuando.startsWith("Cuando ")).toBe(true);
    expect(h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });

  it("apunta al SKILL.md de la copia vendor y es el suyo", () => {
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(h.rutaCompleta).toBe("vendor/habilidades/shaders/SKILL.md");
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    const nombre = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta));
    expect(nombre?.[1]).toBe(h.id);
  });

  it("cita la licencia MIT del original y está junto a la copia", () => {
    expect(h.licencia).toBe("MIT");
    expect(h.autor).toBe("Shader Effects Inc.");
    const licencia = leer("vendor/habilidades/shaders/LICENSE");
    expect(licencia).toContain("MIT License");
    expect(ATRIBUCION_SHADERS).toContain("MIT");
    expect(ATRIBUCION_SHADERS).toContain("shader-effects-inc");
  });

  it("ningún texto lleva rutas absolutas ni direcciones", () => {
    const textos = [h.cuando, h.tarjeta, h.resumen, ...todosLosTiposShader().map((t) => t.frase)];
    for (const t of textos) expect(t).not.toMatch(/\/Users\/|\/home\/|https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b/);
  });
});

describe("TIPOS_SHADER_CATEGORIAS", () => {
  it("trae categorías con tipos, cada uno con id, nombre, frase y categoría", () => {
    const todos = todosLosTiposShader();
    expect(todos.length).toBeGreaterThan(30);
    const ids = todos.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of todos) {
      expect(t.nombre.trim().length).toBeGreaterThan(0);
      expect(contarPalabras(t.frase)).toBeGreaterThan(6);
      expect(t.categoria.trim().length).toBeGreaterThan(0);
    }
  });

  it("incluye las categorías principales del catálogo shaders", () => {
    const categorias = Object.keys(TIPOS_SHADER_CATEGORIAS);
    expect(categorias).toContain("texturas");
    expect(categorias).toContain("formas");
    expect(categorias).toContain("efectosForma");
    expect(categorias).toContain("desenfoques");
    expect(categorias).toContain("distorsiones");
    expect(categorias).toContain("ajustes");
    expect(categorias).toContain("estilizar");
    expect(categorias).toContain("interactivas");
    expect(categorias).toContain("transiciones");
  });

  it("componentes clave de shaders están presentes", () => {
    const todos = todosLosTiposShader();
    const ids = todos.map((t) => t.id);
    expect(ids).toContain("MeshGradient");
    expect(ids).toContain("SimplexNoise");
    expect(ids).toContain("CursorTrail");
    expect(ids).toContain("Glass");
    expect(ids).toContain("Blur");
    expect(ids).toContain("Glow");
    expect(ids).toContain("FilmGrain");
    expect(ids).toContain("Vignette");
  });
});

describe("preguntaTipoShader", () => {
  it("arma la pregunta choice con todos los tipos por defecto", () => {
    const p = preguntaTipoShader();
    expect(p.type).toBe("choice");
    expect(p.instructions).toContain("componente shader");
    const todos = todosLosTiposShader();
    expect(Object.keys(p.criteria)).toEqual(todos.map((t) => t.id));
  });

  it("cada opción es «nombre: frase»", () => {
    const p = preguntaTipoShader();
    const todos = todosLosTiposShader();
    for (const t of [todos[0], todos[todos.length - 1]]) {
      expect(p.criteria[t.id]).toBe(`${t.nombre}: ${t.frase}`);
    }
  });

  it("limita las opciones al subconjunto pedido y descarta ids ajenos", () => {
    const p = preguntaTipoShader(["MeshGradient", "Blur", "no-existe"]);
    expect(Object.keys(p.criteria)).toEqual(["MeshGradient", "Blur"]);
    expect(Object.keys(preguntaTipoShader([]).criteria).length).toBe(todosLosTiposShader().length);
  });
});

describe("comoCapacidad", () => {
  it("adapta a la forma del registro con el tamaño pedido y la atribución", () => {
    const tarjeta = comoCapacidad(HABILIDAD_SHADERS, "tarjeta");
    expect(tarjeta).toEqual({
      id: "shaders",
      label: HABILIDAD_SHADERS.nombre,
      systemPrompt: `${HABILIDAD_SHADERS.tarjeta} (Shader Effects Inc., MIT)`,
    });
    const resumen = comoCapacidad(HABILIDAD_SHADERS, "resumen");
    expect(resumen.systemPrompt.endsWith("(Shader Effects Inc., MIT)")).toBe(true);
  });
});

describe("validarPresetShaders", () => {
  const catalogoMock: ShaderCatalog = {
    Texturas: [
      { name: "MeshGradient", category: "Texturas", description: "", requiereCamara: false, interactivo: false, necesitaHijo: false, pesado: false, props: {} },
      { name: "SimplexNoise", category: "Texturas", description: "", requiereCamara: false, interactivo: false, necesitaHijo: false, pesado: false, props: {} },
      { name: "LinearGradient", category: "Texturas", description: "", requiereCamara: false, interactivo: false, necesitaHijo: false, pesado: false, props: {} },
      { name: "CursorTrail", category: "Texturas", description: "", requiereCamara: false, interactivo: true, necesitaHijo: false, pesado: false, props: {} },
      { name: "WebcamTexture", category: "Texturas", description: "", requiereCamara: true, interactivo: false, necesitaHijo: false, pesado: false, props: {} },
    ],
    Formas: [
      { name: "Circle", category: "Formas", description: "", requiereCamara: false, interactivo: false, necesitaHijo: false, pesado: false, props: {} },
    ],
    "Efectos de forma": [
      { name: "Glass", category: "Efectos de forma", description: "", requiereCamara: false, interactivo: false, necesitaHijo: true, pesado: false, props: {} },
    ],
    Desenfoques: [
      { name: "Blur", category: "Desenfoques", description: "", requiereCamara: false, interactivo: false, necesitaHijo: true, pesado: false, props: {} },
    ],
    Estilizar: [
      { name: "Glow", category: "Estilizar", description: "", requiereCamara: false, interactivo: false, necesitaHijo: true, pesado: false, props: {} },
      { name: "FilmGrain", category: "Estilizar", description: "", requiereCamara: false, interactivo: false, necesitaHijo: true, pesado: false, props: {} },
      { name: "Vignette", category: "Estilizar", description: "", requiereCamara: false, interactivo: false, necesitaHijo: true, pesado: false, props: {} },
    ],
  };

  it("acepta un preset válido con capas shader y difusión", () => {
    const preset = {
      formato: "starseed-fondo",
      version: 1,
      id: "test-1",
      nombre: "Fondo prueba",
      autor: "Test",
      licencias: ["MIT"],
      base: "spline",
      capas: [
        {
          id: "layer-1",
          kind: "shader",
          visible: true,
          opacity: 1,
          blend: "normal",
          preset: {
            components: [
              { type: "MeshGradient", props: { colorA: "#1a0533", colorB: "#ffdf8e", colorSpace: "oklab", speed: 0.6 } },
              { type: "SimplexNoise", props: { scale: 3, speed: 0.5, opacity: 0.12, blendMode: "softLight" } },
            ],
          },
          transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 },
          mascara: "ninguna",
        },
        {
          id: "layer-2",
          kind: "difusion",
          visible: true,
          opacity: 0.5,
          blend: "normal",
          difusion: { modo: "desenfoque", desenfoquePx: 20, opacidad: 0.5, textura: "grano" },
          transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 },
          mascara: "radial",
        },
      ],
      creado: new Date().toISOString(),
    };
    const r = validarPresetShaders(preset, catalogoMock);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.set.capas).toHaveLength(2);
      expect(r.set.capas[0].kind).toBe("shader");
      expect(r.set.capas[1].kind).toBe("difusion");
    }
  });

  it("rechaza componente desconocido en el catálogo", () => {
    const preset = {
      formato: "starseed-fondo",
      version: 1,
      id: "test-2",
      nombre: "Fondo inválido",
      autor: "Test",
      licencias: ["MIT"],
      base: "spline",
      capas: [
        {
          id: "layer-1",
          kind: "shader",
          visible: true,
          opacity: 1,
          blend: "normal",
          preset: { components: [{ type: "ComponenteInexistente", props: {} }] },
          transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 },
          mascara: "ninguna",
        },
      ],
      creado: new Date().toISOString(),
    };
    const r = validarPresetShaders(preset, catalogoMock);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos.some((m) => m.includes("desconocido"))).toBe(true);
  });

  it("rechaza WebcamTexture en set compartido", () => {
    const preset = {
      formato: "starseed-fondo",
      version: 1,
      id: "test-3",
      nombre: "Fondo con cámara",
      autor: "Test",
      licencias: ["MIT"],
      base: "spline",
      capas: [
        {
          id: "layer-1",
          kind: "shader",
          visible: true,
          opacity: 1,
          blend: "normal",
          preset: { components: [{ type: "WebcamTexture", props: {} }] },
          transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 },
          mascara: "ninguna",
        },
      ],
      creado: new Date().toISOString(),
    };
    const r = validarPresetShaders(preset, catalogoMock, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos.some((m) => m.includes("cámara") && m.includes("compartido"))).toBe(true);
  });

  it("acepta WebcamTexture en set privado", () => {
    const preset = {
      formato: "starseed-fondo",
      version: 1,
      id: "test-4",
      nombre: "Fondo privado con cámara",
      autor: "Test",
      licencias: ["MIT"],
      base: "spline",
      capas: [
        {
          id: "layer-1",
          kind: "shader",
          visible: true,
          opacity: 1,
          blend: "normal",
          preset: { components: [{ type: "WebcamTexture", props: {} }] },
          transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 },
          mascara: "ninguna",
        },
      ],
      creado: new Date().toISOString(),
    };
    const r = validarPresetShaders(preset, catalogoMock, false);
    expect(r.ok).toBe(true);
  });

  it("rechaza formato incorrecto", () => {
    const preset = { formato: "otro", version: 1, id: "x", nombre: "X", autor: "X", licencias: [], base: "spline", capas: [], creado: new Date().toISOString() };
    const r = validarPresetShaders(preset, catalogoMock);
    expect(r.ok).toBe(false);
  });

  it("rechaza id inválido", () => {
    const preset = { formato: "starseed-fondo", version: 1, id: "id con espacios", nombre: "X", autor: "X", licencias: [], base: "spline", capas: [], creado: new Date().toISOString() };
    const r = validarPresetShaders(preset, catalogoMock);
    expect(r.ok).toBe(false);
  });
});