"use client";

// Adaptadores para las familias de variaciones públicas. El registro se evalúa en
// el cliente porque el clic derecho y el almacén viven ahí; el layout raíz lo importa.
import { registrarFamilia } from './familias';
import type { AdaptadorFamilia } from './familias';
import { validarVariacion } from './validar';
import { registrarAdaptadorWidget } from './adaptadores/widgets';
import { registrarAdaptadoresProtomolecula } from './adaptadores/protomolecula';
import { almacenNavegador, type AlmacenLocal } from '@/lib/protomolecula/almacen-moleculas';
import type { WidgetType } from '@/components/dashboard/dashboard-types';
import type { ParcheWidget } from './adaptadores/widgets';

// Deps inyectables que leen/escriben el estado del widget desde el registry del dashboard.
// El lector toma el widget activo por su tipo; el escritor lo fusiona y devuelve el
// parche anterior para deshacer.
const depsWidget: import('./adaptadores/widgets').DepsWidget = {
  leer: (tipo) => {
    // Se intenta leer desde el manifest de widgets: si no hay registro específico,
    // cae de vuelta al manifest por defecto.
    const manifest = import('@/components/dashboard/widget-manifest').then((m) => m.getManifest(tipo));
    // Lectura simplificada: por ahora retornamos null y el adaptador usará valores por defecto.
    // TODO: conectar con el estado real del dashboard cuando el sistema de proveedores esté completo.
    return null;
  },
  escribir: (tipo, parche) => {
    // Escritura simplificada: en este paso no se persiste nada hasta que el sistema
    // de proveedores de widget esté totalmente integrado. El adaptador retornará el
    // parche actual como anterior para que el deshacer no rompa el arranque.
    return parche;
  },
};

// Registro de la familia widget con su adaptador puro que sanitiza ajustes,
// valida restricciones de tamaño y devuelve deshacer.
registrarAdaptadorWidget(depsWidget);

// Familias adicionales que usan el adaptador genérico (mantener compatibilidad)
const familias = [
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

// Crear y registrar los adaptadores genéricos
familias.forEach(familia => {
  const adaptador = {
    familia,
    nombre: `${familia.charAt(0).toUpperCase() + familia.slice(1)} Adapter`,
    capturar: (clave: string) => {
      if (clave.startsWith(`${familia}:`)) {
        return clave.split(':')[1] as string | number;
      }
      return null;
    },
    validar: (payload: unknown): { ok: true; payload: string | number } | { ok: false; motivos: string[] } => {
      const resultado = validarVariacion(payload);
      if (!resultado.ok) {
        return { ok: false, motivos: resultado.motivos };
      }
      if (typeof payload === 'string' || typeof payload === 'number') {
        return { ok: true, payload };
      }
      return { ok: false, motivos: ['El payload debe ser una cadena o un número'] };
    },
    aplicar: (clave: string, payload: string | number) => ({
      deshacer: () => {},
    }),
  };
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