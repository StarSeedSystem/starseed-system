import { ElementoSala, EstadoSala } from '@/lib/salas/sincronia-sala';

// Define the patch type based on JSON Patch (only add, remove, replace)
export interface Parche {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: unknown;
}

/**
 * Convierte parches JSON del evento `patch` del SDK (op add/remove/replace, nunca move/copy/test)
 * en `ElementoSala` de src/lib/salas/sincronia-sala.ts (id `elemento::propiedad`, remove → lápida)
 * @param parches Array of patches from the HyperFrames SDK
 * @param autor The device id of the author
 * @param t Timestamp (ms) of the change
 * @returns Array of ElementoSala ready to be fused into a sala
 */
export function elementosDeParches(parches: Parche[], autor: string, t: number): ElementoSala[] {
  const elementos: ElementoSala[] = [];
  for (const p of parches) {
    // Parse path: expected format "/elemento/propiedad"
    const segments = p.path.split('/').filter((s) => s.length > 0);
    // We require exactly two segments: [elemento, propiedad]
    if (segments.length !== 2) {
      // Skip malformed paths
      continue;
    }
    const [elemento, propiedad] = segments;
    const id = `${elemento}::${propiedad}`;

    let elementoSala: ElementoSala;
    if (p.op === 'remove') {
      elementoSala = {
        id,
        tipo: elemento, // tipo is the elemento name
        datos: {}, // empty datos for removal
        actualizadoEn: t,
        porDispositivo: autor,
        borrado: true,
      };
    } else {
      // For add or replace, we set the value in datos under the propiedad key
      elementoSala = {
        id,
        tipo: elemento,
        datos: { [propiedad]: p.value ?? null }, // store the value
        actualizadoEn: t,
        porDispositivo: autor,
        borrado: false,
      };
    }
    elementos.push(elementoSala);
  }
  return elementos;
}

/**
 * Hace lo contrario para `comp.applyPatches` con el origen `@hyperframes/sdk:applyPatches`,
 * para que un cambio remoto no vuelva a emitirse.
 * @param estadoFusionado The fused state of the sala
 * @param origen The origin to use when applying patches (to avoid echo)
 * @returns Array of patches in the format expected by the HyperFrames SDK
 */
export function parchesDeEstado(estadoFusionado: EstadoSala, origen: string): Parche[] {
  const parches: Parche[] = [];
  const elementos = estadoFusionado.elementos ?? {};
  for (const [id, elemento] of Object.entries(elementos)) {
    // Parse id: "elemento::propiedad"
    const [elementoNombre, propiedad] = id.split('::');
    if (!elementoNombre || !propiedad) {
      continue;
    }
    const path = `/${elementoNombre}/${propiedad}`;
    if (elemento.borrado) {
      // If borrado, we generate a remove operation
      parches.push({ op: 'remove', path });
    } else {
      // For non-borrado, we generate a replace operation (or add if we assume it might not exist)
      // We'll use replace; if the path doesn't exist, the SDK might treat it as add? We'll use replace.
      // The value is stored in elemento.datos under the propiedad key.
      const value = elemento.datos[propiedad];
      parches.push({ op: 'replace', path, value });
    }
  }
  return parches;
}