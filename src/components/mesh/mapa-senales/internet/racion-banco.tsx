'use client';

import { useState } from 'react';
import type { AjustesBanco, VentanaBanco } from '@/lib/malla/internet/tipos';

interface RacionBancoProps {
  banco: AjustesBanco;
  onCambiar: (b: AjustesBanco) => void;
  textos: Pick<
    import('@/lib/malla/internet/tipos').TextosInternet,
    'racionDiaria' | 'programacion' | 'mb' | 'gb' | 'bancoTitulo'
  >;
  extra: { desde: string; hasta: string; limite: string };
}

const VENTANA_DEFECTO: VentanaBanco = {
  desde: '',
  hasta: '',
  horaDesde: '00:00',
  horaHasta: '23:59',
  limiteMb: 0,
};

function parsearNumero(valor: string): number {
  const normalizado = valor.replace(',', '.');
  const num = Number.parseFloat(normalizado);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function aMb(valor: number, unidad: 'MB' | 'GB'): number {
  return unidad === 'GB' ? Math.round(valor * 1000) : Math.round(valor);
}

function deMb(valor: number, unidad: 'MB' | 'GB'): string {
  if (unidad === 'GB') {
    return (valor / 1000).toString();
  }
  return valor.toString();
}

export function RacionBanco({
  banco,
  onCambiar,
  textos,
  extra,
}: RacionBancoProps) {
  const [pestanaActiva, setPestanaActiva] = useState<'diario' | 'programado'>('diario');
  const [unidadDiaria, setUnidadDiaria] = useState<'MB' | 'GB'>('MB');
  const [unidadesVentanas, setUnidadesVentanas] = useState<('MB' | 'GB')[]>(
    banco.ventanas.map(() => 'MB')
  );

  const valorDiario = deMb(banco.diarioMb, unidadDiaria);

  const manejarCambioDiario = (valor: string) => {
    const num = parsearNumero(valor);
    const mb = aMb(num, unidadDiaria);
    onCambiar({ ...banco, diarioMb: mb });
  };

  const manejarCambioUnidadDiaria = (unidad: 'MB' | 'GB') => {
    setUnidadDiaria(unidad);
    const mb = aMb(parsearNumero(valorDiario), unidad);
    onCambiar({ ...banco, diarioMb: mb });
  };

  const manejarCambioVentana = (indice: number, campo: keyof VentanaBanco, valor: string) => {
    const nuevasVentanas = [...banco.ventanas];
    const ventana = { ...nuevasVentanas[indice] };

    if (campo === 'limiteMb') {
      const unidad = unidadesVentanas[indice];
      const num = parsearNumero(valor);
      ventana.limiteMb = aMb(num, unidad);
    } else {
      (ventana as Record<string, string>)[campo] = valor;
    }

    nuevasVentanas[indice] = ventana;
    onCambiar({ ...banco, ventanas: nuevasVentanas });
  };

  const manejarCambioUnidadVentana = (indice: number, unidad: 'MB' | 'GB') => {
    const nuevasUnidades = [...unidadesVentanas];
    nuevasUnidades[indice] = unidad;
    setUnidadesVentanas(nuevasUnidades);

    const nuevasVentanas = [...banco.ventanas];
    const valorActual = deMb(nuevasVentanas[indice].limiteMb, unidad);
    const mb = aMb(parsearNumero(valorActual), unidad);
    nuevasVentanas[indice] = { ...nuevasVentanas[indice], limiteMb: mb };
    onCambiar({ ...banco, ventanas: nuevasVentanas });
  };

  const anadirVentana = () => {
    if (banco.ventanas.length >= 12) return;
    const nuevasVentanas = [...banco.ventanas, VENTANA_DEFECTO];
    setUnidadesVentanas([...unidadesVentanas, 'MB']);
    onCambiar({ ...banco, ventanas: nuevasVentanas, modo: 'programado' });
  };

  const quitarVentana = (indice: number) => {
    const nuevasVentanas = banco.ventanas.filter((_, i) => i !== indice);
    const nuevasUnidades = unidadesVentanas.filter((_, i) => i !== indice);
    setUnidadesVentanas(nuevasUnidades);
    onCambiar({ ...banco, ventanas: nuevasVentanas });
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div role="tablist" aria-label={textos.bancoTitulo} className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        <button
          role="tab"
          aria-selected={pestanaActiva === 'diario'}
          aria-controls="panel-diario"
          id="tab-diario"
          tabIndex={pestanaActiva === 'diario' ? 0 : -1}
          onClick={() => setPestanaActiva('diario')}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            pestanaActiva === 'diario'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {textos.racionDiaria}
        </button>
        <button
          role="tab"
          aria-selected={pestanaActiva === 'programado'}
          aria-controls="panel-programado"
          id="tab-programado"
          tabIndex={pestanaActiva === 'programado' ? 0 : -1}
          onClick={() => setPestanaActiva('programado')}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            pestanaActiva === 'programado'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {textos.programacion}
        </button>
      </div>

      <div role="tabpanel" id="panel-diario" aria-labelledby="tab-diario" hidden={pestanaActiva !== 'diario'}>
        <div className="space-y-4">
          <div>
            <label htmlFor="racion-diaria" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {textos.racionDiaria}
            </label>
            <div className="flex gap-2">
              <input
                id="racion-diaria"
                type="text"
                inputMode="decimal"
                value={valorDiario}
                onChange={(e) => manejarCambioDiario(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px]"
                aria-label={textos.racionDiaria}
              />
              <select
                value={unidadDiaria}
                onChange={(e) => manejarCambioUnidadDiaria(e.target.value as 'MB' | 'GB')}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] min-w-[80px]"
                aria-label="Unidad de ración diaria"
              >
                <option value="MB">{textos.mb}</option>
                <option value="GB">{textos.gb}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div role="tabpanel" id="panel-programado" aria-labelledby="tab-programado" hidden={pestanaActiva !== 'programado'}>
        <div className="space-y-4">
          {banco.ventanas.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">Sin ventanas programadas</p>
          ) : (
            banco.ventanas.map((ventana, indice) => (
              <div key={indice} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-gray-700 dark:text-gray-300">Ventana {indice + 1}</span>
                  <button
                    type="button"
                    onClick={() => quitarVentana(indice)}
                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={`Quitar ventana ${indice + 1}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`desde-${indice}`} className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      {extra.desde}
                    </label>
                    <input
                      id={`desde-${indice}`}
                      type="date"
                      value={ventana.desde}
                      onChange={(e) => manejarCambioVentana(indice, 'desde', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] text-sm"
                      aria-label={`${extra.desde} ${indice + 1}`}
                    />
                  </div>
                  <div>
                    <label htmlFor={`hasta-${indice}`} className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      {extra.hasta}
                    </label>
                    <input
                      id={`hasta-${indice}`}
                      type="date"
                      value={ventana.hasta}
                      onChange={(e) => manejarCambioVentana(indice, 'hasta', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] text-sm"
                      aria-label={`${extra.hasta} ${indice + 1}`}
                    />
                  </div>
                  <div>
                    <label htmlFor={`horaDesde-${indice}`} className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Hora desde
                    </label>
                    <input
                      id={`horaDesde-${indice}`}
                      type="time"
                      value={ventana.horaDesde}
                      onChange={(e) => manejarCambioVentana(indice, 'horaDesde', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] text-sm"
                      aria-label={`Hora desde ${indice + 1}`}
                    />
                  </div>
                  <div>
                    <label htmlFor={`horaHasta-${indice}`} className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Hora hasta
                    </label>
                    <input
                      id={`horaHasta-${indice}`}
                      type="time"
                      value={ventana.horaHasta}
                      onChange={(e) => manejarCambioVentana(indice, 'horaHasta', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] text-sm"
                      aria-label={`Hora hasta ${indice + 1}`}
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor={`limite-${indice}`} className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      {extra.limite}
                    </label>
                    <div className="flex gap-2">
                      <input
                        id={`limite-${indice}`}
                        type="text"
                        inputMode="decimal"
                        value={deMb(ventana.limiteMb, unidadesVentanas[indice])}
                        onChange={(e) => manejarCambioVentana(indice, 'limiteMb', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] text-sm"
                        aria-label={`${extra.limite} ${indice + 1}`}
                      />
                      <select
                        value={unidadesVentanas[indice]}
                        onChange={(e) => manejarCambioUnidadVentana(indice, e.target.value as 'MB' | 'GB')}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] min-w-[80px] text-sm"
                        aria-label={`Unidad límite ${indice + 1}`}
                      >
                        <option value="MB">{textos.mb}</option>
                        <option value="GB">{textos.gb}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          {banco.ventanas.length < 12 && (
            <button
              type="button"
              onClick={anadirVentana}
              className="w-full px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors min-h-[44px] font-medium"
              aria-label="Añadir ventana"
            >
              + Añadir ventana
            </button>
          )}
        </div>
      </div>
    </div>
  );
}