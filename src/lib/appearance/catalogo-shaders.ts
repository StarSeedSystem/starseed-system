import type { ShaderMetadata } from "shaders/registry";

/**
 * Mapeo de categorías de shaders del inglés al español.
 */
const CATEGORIAS_ES: Record<string, string> = {
  Adjustments: "Ajustes",
  Blurs: "Desenfoques",
  Distortions: "Distorsiones",
  Interactive: "Interactivos",
  "Shape Effects": "Efectos de Forma",
  Shapes: "Formas",
  Stylize: "Estilizar",
  Textures: "Texturas",
  Transitions: "Transiciones",
  Utilities: "Utilidades",
};

/**
 * Lista de shaders considerados "pesados" según especificación.
 * Los con asterisco (*) significan "comienza con".
 */
const SHADERS_PESADOS_EXACTOS = new Set(["Fog", "ReactionDiffusion", "Boids", "Water", "Godrays"]);
const SHADERS_PESADOS_PREFIJOS = ["Smoke", "Particles"];

/**
 * Agrupa shaders por categoría con nombres en español y marca propiedades especiales.
 * @param registro Array de metadatos de shaders desde shaders/registry
 * @returns Objeto con categorías y sus shaders procesados
 */
export function construirCatalogo(registro: ShaderMetadata[]) {
  const catalogo: Record<string, Array<any>> = {};

  for (const shader of registro) {
    const categoria = CATEGORIAS_ES[shader.category] || shader.category;
    if (!catalogo[categoria]) catalogo[categoria] = [];

    const requiereCamara = shader.name === "WebcamTexture" || shader.name === "ObjectTracker";
    const interactivo = shader.name.startsWith("Cursor");
    const necesitaHijo = shader.requiresChild === true;

    let pesado = false;
    if (SHADERS_PESADOS_EXACTOS.has(shader.name)) pesado = true;
    else for (const prefijo of SHADERS_PESADOS_PREFIJOS) {
      if (shader.name.startsWith(prefijo)) { pesado = true; break; }
    }

    const propsEditables: Record<string, any> = {};
    if (shader.propsMetadata) {
      for (const [propName, propConfig] of Object.entries(shader.propsMetadata)) {
        if (propConfig && typeof propConfig === "object" && "ui" in propConfig && propConfig.ui) {
          propsEditables[propName] = { ...propConfig, default: propConfig.default, description: propConfig.description, ui: propConfig.ui };
        }
      }
    }

    catalogo[categoria].push({
      nombre: shader.name,
      descripcion: shader.description || "",
      archivo: shader.fileName,
      requiereCamara,
      interactivo,
      necesitaHijo,
      pesado,
      props: propsEditables,
    });
  }

  return catalogo;
}

/**
 * Carga el catálogo de shaders de forma dinámica (solo en cliente).
 * @returns Promesa que resuelve con el catálogo de shaders
 */
export async function cargarCatalogo() {
  if (typeof window === "undefined") return {};
  try {
    const { shaderRegistry } = await import("shaders/registry");
    return construirCatalogo(shaderRegistry);
  } catch (error) {
    console.error("Error al cargar el catálogo de shaders:", error);
    return {};
  }
}