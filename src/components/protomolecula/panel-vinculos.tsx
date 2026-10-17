'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Vinculo, FuenteControl, EstadoAprender, EventoAprender } from '@/lib/protomolecula/vinculos-control';
import type { ParametroRef, Parametro } from '@/lib/protomolecula/tipos';
import type { ResultadoMover } from '@/lib/protomolecula/controlador';
import { decidir } from '@/lib/protomolecula/permisos';
import { vinculoAprendido, siguienteAprender } from '@/lib/protomolecula/vinculos-control';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface PanelVinculosProps {
  moleculeId: string;
  vinculos: Vinculo[];
  parametroDe: (ref: ParametroRef) => Parametro | undefined;
  controlador: Pick<any, 'mover'>;
  autor: { id: string; tipo: 'humano' | 'ia' | 'agente'; nombre?: string };
  ahora: () => number;
  nuevoId: () => string;
  alCambiarVinculos?: (vs: Vinculo[]) => void;
}

/**
 * Panel de vínculos y mando de videojuegos (Gamepad).
 * Lista los vínculos de la molécula, permite aprender nuevos vínculos y quitarlos.
 */
export default function PanelVinculos({
  moleculeId,
  vinculos,
  parametroDe,
  controlador,
  autor,
  ahora,
  nuevoId,
  alCambiarVinculos,
}: PanelVinculosProps) {
  // Estado para el modo aprender
  const [aprendiendo, setAprendiendo] = useState<EstadoAprender>({ fase: 'inactivo' });
  // Estado para los vínculos locales (se sincronizan con el prop)
  const [vinculosLocales, setVinculosLocales] = useState<Vinculo[]>(vinculos);
  // Referencia para el temporizador de tic del modo aprender
  const ticTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Inicializar el estado de vínculos cuando cambia el prop
  useEffect(() => {
    setVinculosLocales(vinculos);
  }, [vinculos]);

  // Limpiar el temporizador al desmontar
  useEffect(() => {
    return () => {
      if (ticTimerRef.current) clearTimeout(ticTimerRef.current);
    };
  }, []);

  // Función para iniciar el aprendizaje de un parámetro
  const iniciarAprendizaje = useCallback((objetivo: ParametroRef) => {
    setAprendiendo(siguienteAprender(aprendiendo, { tipo: 'empezar', objetivo, ahora: ahora() }));
  }, [aprendiendo, ahora]);

  // Función para cancelar el aprendizaje
  const cancelarAprendizaje = useCallback(() => {
    setAprendiendo(siguienteAprender(aprendiendo, { tipo: 'cancelar' }));
    if (ticTimerRef.current) clearTimeout(ticTimerRef.current);
  }, [aprendiendo]);

  // Función para confirmar el aprendizaje
  const confirmarAprendizaje = useCallback(async () => {
    const resultado = siguienteAprender(aprendiendo, { tipo: 'confirmar' });
    setAprendiendo(resultado);
    if (resultado.fase === 'inactivo' && aprendiendo.fase === 'detectado') {
      // Crear el vínculo y añadirlo a la lista
      const parametro = parametroDe(aprendiendo.objetivo);
      if (!parametro) {
        // El parámetro ya no existe
        setAprendiendo({ fase: 'inactivo' });
        return;
      }
      const vinculo = vinculoAprendido(aprendiendo as Extract<EstadoAprender, { fase: 'detectado' }>, parametro, nuevoId(), autor.id);
      // Añadir el vínculo a la lista (evitando duplicados)
      const claveFuente = (f: FuenteControl) => {
        switch (f.tipo) {
          case 'midi': return `midi:${f.dispositivo ?? '*'}:${f.mensaje}:${f.canal}:${f.numero ?? 0}`;
          case 'gamepad': return `gamepad:${f.indice ?? 0}:${f.control}:${f.numero}`;
          case 'hid': return `hid:${f.dispositivo}:${f.byte}`;
          case 'osc': return `osc:${f.direccion}`;
          case 'sensor': return `sensor:${f.sensorId}:${f.eje ?? ''}`;
        }
      };
      const nuevaLista = [...vinculosLocales.filter(v => claveFuente(v.fuente) !== claveFuente(vinculo.fuente) || v.objetivo.atomoId !== vinculo.objetivo.atomoId || v.objetivo.parametroId !== vinculo.objetivo.parametroId), vinculo];
      setVinculosLocales(nuevaLista);
      alCambiarVinculos?.(nuevaLista);
      // Notificar al controlador que se ha añadido un vínculo? No es necesario porque el enrutador se encarga.
    }
    if (ticTimerRef.current) clearTimeout(ticTimerRef.current);
  }, [aprendiendo, parametroDe, nuevoId, autor, vinculosLocales, alCambiarVinculos]);

  // Función para enviar un tic periódico al estado de aprendizaje (para actualizar la cuenta de tiempo)
  const enviarTic = useCallback(() => {
    if (aprendiendo.fase === 'escuchando') {
      setAprendiendo(siguienteAprender(aprendiendo, { tipo: 'tic', ahora: ahora() }));
      // Volver a programar el próximo tic en 1 segundo
      ticTimerRef.current = setTimeout(enviarTic, 1000);
    }
  }, [aprendiendo, ahora]);

  // Iniciar el tic cuando entramos en modo escuchando
  useEffect(() => {
    if (aprendiendo.fase === 'escuchando') {
      enviarTic();
    } else {
      if (ticTimerRef.current) clearTimeout(ticTimerRef.current);
    }
  }, [aprendiendo, enviarTic]);

  // Función para quitar un vínculo
  const quitarVinculo = useCallback((id: string) => {
    const nuevaLista = vinculosLocales.filter(v => v.id !== id);
    setVinculosLocales(nuevaLista);
    alCambiarVinculos?.(nuevaLista);
  }, [vinculosLocales, alCambiarVinculos]);

  // Función para cambiar el estado activo/inactivo de un vínculo
  const toggleActivo = useCallback((id: string) => {
    const nuevaLista = vinculosLocales.map(v =>
      v.id === id ? { ...v, activo: !v.activo } : v
    );
    setVinculosLocales(nuevaLista);
    alCambiarVinculos?.(nuevaLista);
  }, [vinculosLocales, alCambiarVinculos]);

  // Renderizar la lista de vínculos
  const renderVinculos = () => {
    if (vinculosLocales.length === 0) {
      return <p className="text-sm text-muted-foreground">No hay vínculos configurados.</p>;
    }
    return (
      <ul className="space-y-2">
        {vinculosLocales.map(vinculo => {
          const parametro = parametroDe(vinculo.objetivo);
          return (
            <li key={vinculo.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 border rounded-lg bg-muted/50">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 w-full sm:w-auto">
<div className="text-sm font-medium">
                   Fuente: {vinculo.fuente.tipo} {vinculo.fuente.tipo === 'gamepad' && vinculo.fuente.control === 'eje' ? 'Eje' : vinculo.fuente.tipo === 'gamepad' && vinculo.fuente.control === 'boton' ? 'Botón' : vinculo.fuente.tipo === 'midi' && vinculo.fuente.mensaje === 'cc' ? 'CC' : vinculo.fuente.tipo === 'midi' && vinculo.fuente.mensaje === 'nota' ? 'Nota' : vinculo.fuente.tipo === 'midi' && vinculo.fuente.mensaje === 'pitch' ? 'Pitch' : ''}{' '}
                   {vinculo.fuente.tipo === 'midi' ? vinculo.fuente.numero ?? '' : vinculo.fuente.tipo === 'gamepad' ? vinculo.fuente.numero : ''}
                 </div>
                <div className="text-xs text-muted-foreground">
                  Objeto: {parametro ? `${parametro.nombre}` : 'Parámetro desconocido'}
                </div>
                <div className="text-xs text-muted-foreground sm:mt-0">
                  Modo: {vinculo.modo} {vinculo.curva.invertir ? '(invertido)' : ''}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                <span className={cn(
                  'px-2 py-1 text-xs rounded',
                  vinculo.activo ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                )}>
                  {vinculo.activo ? 'Activo' : 'Inactivo'}
                </span>
                <Button variant="outline" size="sm" onClick={() => toggleActivo(vinculo.id)}>
                  {vinculo.activo ? 'Pausar' : 'Activar'}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => quitarVinculo(vinculo.id)}>
                  Quitar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  // Renderizar el botón de aprender por parámetro
  const renderBotonesAprender = () => {
    // Necesitamos obtener la lista de parámetros de la molécula.
    // Pero no tenemos la molécula completa. Asumimos que podemos obtenerla desde algún contexto.
    // Por ahora, dejamos este espacio vacío y asumimos que será implementado en una tarea futura.
    return <p className="text-sm text-muted-italic">Próximamente: botón Aprender por parámetro</p>;
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Vínculos de control</h2>
      <div className="border rounded-lg p-4">
        {renderVinculos()}
      </div>
      <div className="border rounded-lg p-4">
        <h3 className="text-md font-semibold mb-2">Aprender nuevo vínculo</h3>
        {renderBotonesAprender()}
        {aprendiendo.fase === 'escuchando' && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="mb-2">Mueve el mando que quieres vincular...</p>
            <div className="mt-2 flex flex-col sm:flex-row gap-2">
              <Button variant="outline" size="sm" onClick={confirmarAprendizaje}>
                Confirmar
              </Button>
              <Button variant="destructive" size="sm" onClick={cancelarAprendizaje}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {aprendiendo.fase === 'detectado' && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="mb-2">Mueve el mando que quieres vincular...</p>
            <p className="text-sm">Detectado: 
              <span className="font-mono">
                {aprendiendo.fuente.tipo === 'gamepad' && aprendiendo.fuente.control === 'eje' ? 'Eje' : aprendiendo.fuente.tipo === 'gamepad' && aprendiendo.fuente.control === 'boton' ? 'Botón' : aprendiendo.fuente.tipo === 'midi' && aprendiendo.fuente.mensaje === 'cc' ? 'CC' : aprendiendo.fuente.tipo === 'midi' && aprendiendo.fuente.mensaje === 'nota' ? 'Nota' : aprendiendo.fuente.tipo === 'midi' && aprendiendo.fuente.mensaje === 'pitch' ? 'Pitch' : ''}
                {aprendiendo.fuente.tipo === 'midi' ? aprendiendo.fuente.numero ?? '' : aprendiendo.fuente.tipo === 'gamepad' ? aprendiendo.fuente.numero : ''}
              </span>
            </p>
            <div className="mt-2 flex flex-col sm:flex-row gap-2">
              <Button variant="outline" size="sm" onClick={confirmarAprendizaje}>
                Confirmar
              </Button>
              <Button variant="destructive" size="sm" onClick={cancelarAprendizaje}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {aprendiendo.fase === 'cancelado' && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-red-500">
              Aprendizaje cancelado: {aprendiendo.motivo === 'usuario' ? 'Cancelado por el usuario' : 'Tiempo de espera agotado'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}