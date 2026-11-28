"use client";

// Adaptadores para las familias de variaciones públicas. El registro se evalúa en
// el cliente porque el clic derecho y el almacén viven ahí; el layout raíz lo importa.
import { registrarFamilia } from './familias';
import type { AdaptadorFamilia } from './familias';
import { validarVariacion } from './validar';
import { registrarAdaptadoresProtomolecula } from './adaptadores/protomolecula';
import { validarVariacionPublica } from './fuentes';
import { almacenNavegador, type AlmacenLocal } from '@/lib/protomolecula/almacen-moleculas';
import {
  ESTILOS_ETIQUETA, PERMISOS_COMPARTIR, PERSPECTIVAS, VISTA_DEFECTO,
  configuracionPublica, guardarVista, leerAlmacen, normalizarConfig,
  variacionDesdeVista, type VistaConfig,
} from '@/lib/ramas4d/vistas';

// Crea un adaptador para una familia dada
function crearAdaptador(familia: string): AdaptadorFamilia<string | number> {
  return {
    familia,
    nombre: `${familia.charAt(0).toUpperCase() + familia.slice(1)} Adapter`,
    capturar: (clave) => {
      if (clave.startsWith(`${familia}:`)) {
        return clave.split(':')[1] as string | number;
      }
      return null;
    },
    validar: (payload) => {
      // Contrato §5: nada se ejecuta sin validar. Toda validación de familias pasa
      // por el validador puro (tamaño, JSON plano, privacidad, URLs https).
      const resultado = validarVariacion(payload);
      if (!resultado.ok) {
        return { ok: false, motivos: resultado.motivos };
      }
      if (typeof payload === 'string' || typeof payload === 'number') {
        return { ok: true, payload };
      }
      return { ok: false, motivos: ['El payload debe ser una cadena o un número'] };
    },
    aplicar: (clave, payload: string | number) => ({
      deshacer: () => {
        // No-op for now
      },
    }),
  };
}

// Familias a registrar
const familias = [
  'widget',
  'tema',
  'fondo',
  'ajuste',
  'app',
  'dock',
  'escritorio',
  'herramienta',
  'atomo',
  'post',
  'mensaje',
  'menu',
  'boton'
];

// Crear y registrar los adaptadores
familias.forEach(familia => {
  const adaptador = crearAdaptador(familia);
  registrarFamilia(adaptador);
});

// Protomolécula (contrato §5): sus tres familias sustituyen a los adaptadores de
// relleno, porque el payload se valida contra el catálogo y el registro, y aplicar
// devuelve deshacer. El almacén se resuelve en cada uso: puede no haber
// `localStorage` (SSR o pruebas) y capturar/aplicar nunca debe romper el arranque.
const almacenVariaciones: AlmacenLocal = {
  getItem: (clave) => almacenNavegador()?.getItem(clave) ?? null,
  setItem: (clave, valor) => { almacenNavegador()?.setItem(clave, valor); },
  removeItem: (clave) => { almacenNavegador()?.removeItem(clave); },
};
const idDeVariacion = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `variacion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
registrarAdaptadoresProtomolecula({
  almacen: almacenVariaciones,
  ahora: () => Date.now(),
  nuevoId: idDeVariacion,
});

// Ramas 4D (MV1125J): la vista publica SOLO su configuración. La clave canónica que
// produce `variacionDesdeVista` es `vista:ramas4d` y su familia declarada es `ramas4d`;
// el registro atiende las dos formas para que la publicación encuentre el adaptador.
const CLAVE_VISTA_RAMAS4D = 'vista:ramas4d';
const VISTA_PROPIA = 'persona:yo';

function validarVistaRamas4D(payload: unknown): { ok: true; payload: VistaConfig } | { ok: false; motivos: string[] } {
  const base = validarVariacion(payload);
  if (!base.ok) return { ok: false, motivos: base.motivos };
  const config = normalizarConfig(payload);
  const motivos: string[] = [];
  if (!(PERSPECTIVAS as readonly string[]).includes(config.perspectiva)) motivos.push(`Perspectiva desconocida: ${config.perspectiva}`);
  if (!(ESTILOS_ETIQUETA as readonly string[]).includes(config.etiquetas.estilo)) motivos.push(`Diseño de etiqueta desconocido: ${config.etiquetas.estilo}`);
  if (!validarVariacionPublica(variacionDesdeVista(config, 'Vista de Ramas 4D', 'sistema'))) motivos.push('La configuración no se puede exportar como variación pública');
  return motivos.length ? { ok: false, motivos } : { ok: true, payload: configuracionPublica(config) };
}

const adaptadorVistaRamas4D: AdaptadorFamilia<VistaConfig> = {
  familia: 'ramas4d',
  nombre: 'Vista de Ramas 4D',
  capturar: (clave) => {
    if (clave !== CLAVE_VISTA_RAMAS4D && !clave.startsWith(`${CLAVE_VISTA_RAMAS4D}#`)) return null;
    const permiso = clave.split('#')[1];
    if (permiso && !(PERMISOS_COMPARTIR as readonly string[]).includes(permiso)) return null;
    const config = leerAlmacen().vistas[VISTA_PROPIA]?.config ?? VISTA_DEFECTO;
    const validada = validarVistaRamas4D(config);
    return validada.ok ? validada.payload : null;
  },
  validar: validarVistaRamas4D,
  aplicar: (_clave, payload) => {
    const anterior = leerAlmacen().vistas[VISTA_PROPIA]?.config ?? VISTA_DEFECTO;
    guardarVista({ ambito: 'persona', idAmbito: 'yo', config: configuracionPublica(payload) });
    return { deshacer: () => { guardarVista({ ambito: 'persona', idAmbito: 'yo', config: anterior }); } };
  },
};
for (const familia of ['vista', 'ramas4d']) registrarFamilia({ ...adaptadorVistaRamas4D, familia });
