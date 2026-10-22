// Adaptadores para las familias de variaciones públicas
import { registrarFamilia } from './familias';
import type { AdaptadorFamilia } from './familias';
import { validarVariacion } from './validar';
import type { DashboardWidget } from '@/components/dashboard/dashboard-types';
import {
  capturarWidget,
  aplicarWidget,
  validarVariacionWidget,
  vistaPreviaWidget,
  tipoDeClaveWidget,
  type EstadoWidgetInstancia,
  type ResultadoValidarWidget,
  type VariacionWidget,
} from './adaptadores/widgets';

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

// ── Familia widget: adaptador real (contrato: architecture/variaciones-publicas.md §5) ──
// El registro genérico de arriba queda como respaldo para familias que aún no tienen
// adaptador propio; la familia `widget` se reconecta aquí con el módulo puro de
// `./adaptadores/widgets.ts`: capturar toma solo la configuración visual (listado blanco),
// validar exige los tamaños de `getSizeConstraints` y aplicar fusiona la variación con la
// instancia elegida y devuelve deshacer. La fuente de instancias es INYECTABLE: sin DOM
// en la carga, y sustituible en pruebas sin red.

/** Vista de la instancia elegida: buscar la del tipo y persistir su fusión. */
export interface FuenteWidget {
  instanciaDe: (tipo: string) => DashboardWidget | null;
  persistir: (instancia: DashboardWidget) => void;
}

/** Fuente por defecto: los widgets instalados en `starseed_widgets` (mapa por dashboard). */
function fuenteAlmacen(): FuenteWidget {
  const todos = (): DashboardWidget[] => {
    if (typeof window === 'undefined') return [];
    const bruto = window.localStorage.getItem('starseed_widgets');
    if (!bruto) return [];
    try {
      const mapa = JSON.parse(bruto) as Record<string, DashboardWidget[]>;
      return Object.values(mapa).flat().filter((w) => w !== null);
    } catch {
      return [];
    }
  };
  return {
    instanciaDe: (tipo) => todos().find((w) => w.widget_type === tipo) ?? null,
    persistir: (instancia) => {
      if (typeof window === 'undefined') return;
      const bruto = window.localStorage.getItem('starseed_widgets');
      if (!bruto) return;
      try {
        const mapa = JSON.parse(bruto) as Record<string, DashboardWidget[]>;
        for (const clave of Object.keys(mapa)) {
          mapa[clave] = mapa[clave].map((w) => (w.id === instancia.id ? instancia : w));
        }
        window.localStorage.setItem('starseed_widgets', JSON.stringify(mapa));
      } catch {
        // Almacén corrupto: no persistimos nada (nada se ejecuta sin validar).
      }
    },
  };
}

/** Crea el adaptador de la familia widget con su fuente de instancias inyectada. */
export function conectarFamiliaWidget(fuente: FuenteWidget = fuenteAlmacen()): AdaptadorFamilia<VariacionWidget> {
  const estadoDe = (w: DashboardWidget): EstadoWidgetInstancia => ({
    widget_type: w.widget_type,
    settings: (w.settings ?? {}) as Record<string, unknown>,
    layout: { w: w.layout.w, h: w.layout.h },
  });
  const adaptador: AdaptadorFamilia<VariacionWidget> = {
    familia: 'widget',
    nombre: 'Adaptador de widgets (variaciones públicas)',
    capturar: (clave) => {
      const tipo = tipoDeClaveWidget(clave);
      const instancia = tipo ? fuente.instanciaDe(tipo) : null;
      return instancia ? capturarWidget(clave, estadoDe(instancia)) : null;
    },
    validar: (payload) => {
      const r: ResultadoValidarWidget = validarVariacionWidget(payload);
      return r.ok
        ? { ok: true, payload: payload as VariacionWidget }
        : { ok: false, motivos: r.motivos };
    },
    aplicar: (clave, payload) => {
      const tipo = tipoDeClaveWidget(clave);
      const original = tipo ? fuente.instanciaDe(tipo) : null;
      if (!original) return { deshacer: () => undefined };
      const r = aplicarWidget(clave, payload, original);
      if (!r) return { deshacer: () => undefined };
      fuente.persistir(r.widget);
      return { deshacer: () => fuente.persistir(original) };
    },
    vistaPrevia: (payload) => vistaPreviaWidget(payload),
  };
  registrarFamilia(adaptador);
  return adaptador;
}

// Carga de app/layout.tsx: la familia widget queda conectada al arrancar el OS.
conectarFamiliaWidget();