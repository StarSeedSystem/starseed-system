import { ProveedorInfo } from '../../mando/proveedores-catalogo';
import { CatalogSource } from '../../../ai/astraura/free-catalog';

export type Papel = string;

export interface OpcionCatalogo {
  id: string;
  nombre: string;
  tipo: 'modelo' | 'proveedor' | 'contenedor' | 'herramienta' | 'habilidad' | 'conector';
  papeles: Papel[];
  gratis: {
    rpm: number | null;
    porDia: number | null;
    horasMes: number | null;
    almacenamientoGb: number | null;
    nota: string | null;
  } | null;
  requiereCuenta: boolean;
  enlaceAlta: string | null;
  enlaceClave: string | null;
  variables: string[];
  privacidad: 'local' | 'nube-sin-retencion' | 'nube-con-retencion' | 'desconocida';
  licencia: string | null;
  verificado: string | null;
  fuente: string;
}

/**
 * Fusiona los catalogos de proveedores y fuentes gratuitas.
 * @param proveedores - Array de ProveedorInfo desde src/lib/mando/proveedores-catalog.ts
 * @param fuentesGratis - Array de CatalogSource desde src/ai/astraura/free-catalog.ts
 * @returns Array fusionado de OpcionCatalogo
 */
export function fusionarCatalogos(
  proveedores: ProveedorInfo[],
  fuentesGratis: CatalogSource[]
): OpcionCatalogo[] {
  const mapaProveedores = new Map<string, ProveedorInfo>();
  for (const prov of proveedores) {
    mapaProveedores.set(prov.id, prov);
  }

  const resultado: OpcionCatalogo[] = [];

  // Procesar proveedores primero
  for (const prov of proveedores) {
    const free = fuentesGratis.find(f => f.id === prov.id);
    const opcion: OpcionCatalogo = {
      id: prov.id,
      nombre: prov.nombre,
      tipo: 'proveedor',
      papeles: [],
      gratis: {
        rpm: null,
        porDia: null,
        horasMes: null,
        almacenamientoGb: null,
        nota: prov.gratis ?? null
      },
      requiereCuenta: prov.requiereCuenta,
      enlaceAlta: prov.panelClaves === '' ? null : prov.panelClaves,
       enlaceClave: free ? free.getKeyUrl ?? null : null,
      variables: prov.variables,
      privacidad: 'desconocida',
      licencia: null,
      verificado: null,
      fuente: 'proveedores-catalogo'
    };
    resultado.push(opcion);
  }

  // Procesar fuentes gratuitas que no estén en los proveedores
  for (const free of fuentesGratis) {
    if (mapaProveedores.has(free.id)) {
      continue; // ya procesado
    }
    const opcion: OpcionCatalogo = {
      id: free.id,
      nombre: free.label,
      tipo: 'proveedor',
      papeles: [],
      gratis: {
        rpm: null,
        porDia: null,
        horasMes: null,
        almacenamientoGb: null,
        nota: free.limits ?? null
      },
      requiereCuenta: free.requiresKey,
      enlaceAlta: null,
       enlaceClave: free.getKeyUrl ?? null,
      variables: [],
      privacidad: free.privacy === 'local'
        ? 'local'
        : free.privacy === 'browser'
          ? 'nube-sin-retencion'
          : free.privacy === 'cloud'
            ? 'nube-con-retencion'
            : 'desconocida',
      licencia: null,
      verificado: null,
      fuente: 'free-catalog'
    };
    resultado.push(opcion);
  }

  return resultado;
}