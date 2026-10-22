"use client";

// Adaptadores para las familias de variaciones públicas. El registro se evalúa en
// el cliente porque el clic derecho y el almacén viven ahí; el layout raíz lo importa.
import { registrarFamilia } from './familias';
import type { AdaptadorFamilia } from './familias';
import { validarVariacion } from './validar';
import { registrarAdaptadoresProtomolecula } from './adaptadores/protomolecula';
import { almacenNavegador, type AlmacenLocal } from '@/lib/protomolecula/almacen-moleculas';

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