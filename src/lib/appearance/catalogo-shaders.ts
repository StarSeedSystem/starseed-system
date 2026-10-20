export interface ShaderRegistryEntry {
  name: string;
  category: string;
  description?: string;
  requiresChild?: boolean;
  propsMetadata?: Record<string, unknown>;
}

export interface ShaderCatalogEntry {
  name: string;
  category: string;
  description: string;
  requiereCamara: boolean;
  interactivo: boolean;
  necesitaHijo: boolean;
  pesado: boolean;
  props: Record<string, unknown>;
}

export type ShaderCatalog = Record<string, ShaderCatalogEntry[]>;

export function construirCatalogo(registro: ShaderRegistryEntry[]): ShaderCatalog {
  const catalogo: ShaderCatalog = {};

  for (const shader of registro) {
    const categoria = shader.category || 'Sin categoría';
    if (!catalogo[categoria]) {
      catalogo[categoria] = [];
    }

    const entry: ShaderCatalogEntry = {
      name: shader.name,
      category: shader.category,
      description: shader.description ?? '',
      requiereCamara: shader.name === 'WebcamTexture' || shader.name === 'ObjectTracker',
      interactivo: shader.name.includes('Cursor'),
      necesitaHijo: shader.requiresChild ?? false,
      pesado: [
        'Fog',
        'Smoke',
        'ReactionDiffusion',
        'Boids',
        'Particles',
        'Water',
        'Godrays'
      ].some(base => shader.name.startsWith(base)),
      props: shader.propsMetadata ?? {} // si es undefined, usamos un objeto vacío
    };

    catalogo[categoria].push(entry);
  }

  return catalogo;
}

export async function cargarCatalogo(): Promise<ShaderCatalog> {
  const { shaderRegistry } = await import('shaders/registry');
  return construirCatalogo(shaderRegistry);
}