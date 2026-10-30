"use client";

// Adaptadores para las familias de variaciones públicas. El registro se evalúa en
// el cliente porque el clic derecho y el almacén viven ahí; el layout raíz lo importa.
import { registrarFamilia } from './familias';
import type { AdaptadorFamilia } from './familias';
import { validarVariacion } from './validar';
import { registrarAdaptadoresProtomolecula } from './adaptadores/protomolecula';
import { registrarAdaptadorWidgets, tipoDeClave, type DepsWidget } from './adaptadores/widgets';
import type { DashboardWidget } from '@/components/dashboard/dashboard-types';
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

// Widgets (contrato §5): sustituye el adaptador de relleno de `widget` por el
// módulo puro, que captura solo configuración visual, valida con
// `getSizeConstraints` y devuelve deshacer. La instancia elegida es la primera
// del tipo en los tableros guardados; el almacén se resuelve en cada uso para
// que el arranque SSR y las pruebas sin DOM no lo toquen.
const LS_WIDGETS = 'starseed_widgets';
type MapaWidgets = Record<string, DashboardWidget[]>;

function mapaDeWidgets(): MapaWidgets {
  if (typeof window === 'undefined') return {};
  try {
    const bruto = window.localStorage.getItem(LS_WIDGETS);
    return bruto ? (JSON.parse(bruto) as MapaWidgets) : {};
  } catch { return {}; }
}

function guardarMapaDeWidgets(mapa: MapaWidgets): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LS_WIDGETS, JSON.stringify(mapa)); } catch { return; }
  // Avisa al Dashboard (misma pestaña y otras) para que relea de localStorage,
  // que es su fuente de verdad; así el cambio de ajustes y de anclaje se ve.
  try {
    if (typeof BroadcastChannel === 'undefined') return;
    const canal = new BroadcastChannel('starseed-dashboard');
    canal.postMessage({ type: 'data:changed', scope: 'widgets', at: Date.now() });
    canal.close();
  } catch { /* sin difusión */ }
}

function encontrarWidget(tipo: string): { widget: DashboardWidget; mapa: MapaWidgets } | null {
  const mapa = mapaDeWidgets();
  for (const grupo of Object.keys(mapa)) {
    const widget = (mapa[grupo] ?? []).find((w) => w?.widget_type === tipo);
    if (widget) return { widget, mapa };
  }
  return null;
}

const depsWidget: DepsWidget = {
  leer: (clave) => {
    const tipo = tipoDeClave(clave);
    const encontrado = tipo ? encontrarWidget(tipo) : null;
    if (!tipo || !encontrado) return null;
    const { widget } = encontrado;
    return {
      tipo,
      ajustes: { ...(widget.settings ?? {}) },
      anclaje: { w: widget.layout.w, h: widget.layout.h },
      ...(widget.size ? { tamano: widget.size } : {}),
    };
  },
  escribir: (clave, payload) => {
    const tipo = tipoDeClave(clave);
    const encontrado = tipo ? encontrarWidget(tipo) : null;
    if (!tipo || !encontrado) return;
    const { widget, mapa } = encontrado;
    const actualizado: DashboardWidget = {
      ...widget,
      settings: { ...payload.ajustes },
      layout: {
        ...widget.layout,
        w: payload.anclaje?.w ?? widget.layout.w,
        h: payload.anclaje?.h ?? widget.layout.h,
      },
      ...(payload.tamano ? { size: payload.tamano } : {}),
    };
    for (const grupo of Object.keys(mapa)) {
      mapa[grupo] = (mapa[grupo] ?? []).map((w) => (w.id === widget.id ? actualizado : w));
    }
    guardarMapaDeWidgets(mapa);
  },
};

registrarAdaptadorWidgets(depsWidget);