import type { ShaderMetadata } from './shaders.d.ts';

// Mapeo de nombres de categoría a español
const categoryTranslation: Record<string, string> = {
  Adjustments: 'Ajustes',
  Blurs: 'Desenfoques',
  Distortions: 'Distorsiones',
  Interactive: 'Interactivo',
  'Shape Effects': 'Efectos de Forma',
  Shapes: 'Formas',
  Stylize: 'Estilizar',
  Textures: 'Texturas',
  Transitions: 'Transiciones',
  Utilities: 'Utilidades',
};

/**
 * Determina si un shader requiere cámara basado en su nombre.
 */
function requiereCamara(name: string): boolean {
  return name.includes('WebcamTexture') || name.includes('ObjectTracker');
}

/**
 * Determina si un shader es interactivo basado en su nombre.
 */
function interactivo(name: string): boolean {
  return /Cursor/.test(name);
}

/**
 * Determina si un shader es pesado basado en su nombre.
 */
function pesado(name: string): boolean {
  const heavyPatterns = [
    /Fog/,
    /Smoke/,
    /ReactionDiffusion/,
    /Boids/,
    /Particles/,
    /Water/,
    /Godrays/,
  ];
  return heavyPatterns.some((regex) => regex.test(name));
}

/**
 * Construye el catálogo de shaders agrupado por categoría con nombres en español.
 * @param registro - Array de metadatos de shaders
 * @returns Objeto donde las keys son categorías en español y los values son arrays de shaders con sus propiedades
 */
export function construirCatalogo(registro: ShaderMetadata[]): Record<string, Array<{
  name: string;
  requiereCamara: boolean;
  interactivo: boolean;
  necesitaHijo: boolean;
  pesado: boolean;
  props: string[];
}>> {
  const catalogo: Record<string, Array<{
    name: string;
    requiereCamara: boolean;
    interactivo: boolean;
    necesitaHijo: boolean;
    pesado: boolean;
    props: string[];
  }>> = {};

  for (const shader of registro) {
    const category = shader.category;
    const translatedCategory = categoryTranslation[category] || category;

    if (!catalogo[translatedCategory]) {
      catalogo[translatedCategory] = [];
    }

    const shaderEntry = {
      name: shader.name,
      requiereCamara: requiereCamara(shader.name),
      interactivo: interactivo(shader.name),
      necesitaHijo: !!shader.requiresChild,
      pesado: pesado(shader.name),
      props: shader.propsMetadata ? Object.keys(shader.propsMetadata) : [],
    };

    catalogo[translatedCategory].push(shaderEntry);
  }

  return catalogo;
}

/**
 * Carga el catálogo de shaders de forma dinámica (solo en cliente).
 * @returns Promesa que resuelve con el registro de shaders
 */
export async function cargarCatalogo(): Promise<ShaderMetadata[]> {
  const { shaderRegistry } = await import('shaders/registry');
  return shaderRegistry;
}