'use client';

/**
 * Editor de ramas 4D (MV1125I): elige formato y origen para añadir una rama de
 * cualquier formato, vincular dos nodos con un tipo de arista o transmutar una
 * rama a otra forma del mismo contenido. Solo deja editar lo propio o lo de un
 * grupo con permiso de edición; los colores salen de los tokens del tema.
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Grafo4D, TipoArista } from '@/lib/ramas4d/modelo';
import {
  FORMATOS_RAMA,
  agregarRamaHija,
  deshacer,
  nodosEditables,
  vincularNodos,
  type HistorialEdicion,
  type PermisoEdicion,
  type ResultadoEdicion,
} from '@/lib/ramas4d/edicion';
import {
  aplicarTransmutacion,
  planearTransmutacion,
  type FormaDisponible,
} from '@/lib/ramas4d/transmutar';
import { etiquetaFormato } from '@/lib/conversion/formatos';

type Accion = 'rama' | 'vincular' | 'transmutar';

const ARISTAS: readonly TipoArista[] = [
  'contiene', 'deriva', 'cita', 'prerrequisito', 'sincroniza',
  'senal', 'transmuta', 'variacion', 'vota', 'participa', 'usa',
];

const NOMBRE_ARISTA: Record<string, string> = {
  contiene: 'contiene', deriva: 'deriva', cita: 'cita', prerrequisito: 'prerrequisito',
  sincroniza: 'sincroniza', senal: 'señal', transmuta: 'transmuta', variacion: 'variación',
  vota: 'vota', participa: 'participa', usa: 'usa',
};

export interface EditorRamaProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  grafo: Grafo4D;
  historial: HistorialEdicion;
  permiso: PermisoEdicion;
  /** Nodo desde el que se abre: padre de la rama nueva u origen del vínculo. */
  nodoBaseId?: string | null;
  /** Formas que el conversor admite para el nodo base; quien abre el editor las consulta. */
  formas?: FormaDisponible;
  onCambio?: () => void;
}

const FORMAS_VACIAS: FormaDisponible = { disponible: false, destinos: null };

function nuevoId(base: string): string {
  const azar = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${base}-${azar}`;
}

export default function EditorRama({
  abierto,
  onAbiertoChange,
  grafo,
  historial,
  permiso,
  nodoBaseId,
  formas,
  onCambio,
}: EditorRamaProps) {
  const [accion, setAccion] = useState<Accion>('rama');
  const [origenId, setOrigenId] = useState(nodoBaseId ?? '');
  const [destinoId, setDestinoId] = useState('');
  const [formato, setFormato] = useState<string>(FORMATOS_RAMA[0] ?? 'texto');
  const [tipoArista, setTipoArista] = useState<TipoArista>('contiene');
  const [aviso, setAviso] = useState('');

  const editables = useMemo(() => nodosEditables(grafo, permiso), [grafo, permiso]);

  function ejecutar() {
    setAviso('');
    const origen = grafo.nodos.get(origenId);
    if (!origen) {
      setAviso('Elige el nodo de origen.');
      return;
    }
    let resultado: ResultadoEdicion;
    if (accion === 'rama') {
      const idNueva = nuevoId('rama');
      resultado = agregarRamaHija(grafo, historial, permiso, origen.id, {
        id: idNueva,
        titulo: `Nueva rama · ${etiquetaFormato(formato)}`,
        formato,
        ref: `${origen.ref}#${idNueva}`,
        capas: [...origen.capas],
      });
    } else if (accion === 'vincular') {
      resultado = vincularNodos(grafo, historial, permiso, {
        de: origen.id,
        a: destinoId,
        tipo: tipoArista,
      });
    } else {
      const plan = planearTransmutacion(origen, formato, formas ?? FORMAS_VACIAS);
      if (!plan.ok) {
        setAviso(plan.motivo);
        return;
      }
      resultado = aplicarTransmutacion(grafo, historial, permiso, plan.plan, nuevoId('transmuta'));
    }
    if (!resultado.ok) {
      setAviso(resultado.motivo);
      return;
    }
    setAviso('Hecho. La rama ya está en el universo.');
    onCambio?.();
  }

  function deshacerUltimo() {
    const hecho = deshacer(grafo, historial);
    setAviso(hecho ? 'Deshecho el último cambio.' : 'No hay cambios que deshacer.');
    if (hecho) onCambio?.();
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar ramas del universo</DialogTitle>
          <DialogDescription>
            Añade una rama de cualquier formato, vincula dos nodos o transmuta una rama a otra forma.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm text-foreground">
          <div className="flex flex-wrap gap-2">
            {(['rama', 'vincular', 'transmutar'] as const).map((a) => (
              <Button
                key={a}
                type="button"
                size="sm"
                variant={accion === a ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => { setAccion(a); setAviso(''); }}
              >
                {a === 'rama' ? 'Nueva rama' : a === 'vincular' ? 'Vincular' : 'Transmutar'}
              </Button>
            ))}
          </div>

          {editables.length === 0 && (
            <p className="rounded-xl border border-border bg-muted px-3 py-2 text-muted-foreground">
              No hay nodos que puedas editar: solo se ramifica lo propio o lo de un grupo con permiso.
            </p>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">
              {accion === 'vincular' ? 'Nodo de salida' : 'Nodo de origen'}
            </span>
            <select
              className="w-full cursor-pointer rounded-xl border border-border bg-background px-3 py-2 text-foreground"
              value={origenId}
              onChange={(e) => setOrigenId(e.target.value)}
            >
              <option value="">Elige un nodo…</option>
              {editables.map((n) => (
                <option key={n.id} value={n.id}>{n.titulo}</option>
              ))}
            </select>
          </label>

          {accion === 'vincular' && (
            <>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Nodo de llegada</span>
                <select
                  className="w-full cursor-pointer rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                  value={destinoId}
                  onChange={(e) => setDestinoId(e.target.value)}
                >
                  <option value="">Elige un nodo…</option>
                  {editables.map((n) => (
                    <option key={n.id} value={n.id}>{n.titulo}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Tipo de vínculo</span>
                <select
                  className="w-full cursor-pointer rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                  value={tipoArista}
                  onChange={(e) => setTipoArista(e.target.value)}
                >
                  {ARISTAS.map((t) => (
                    <option key={t} value={t}>{NOMBRE_ARISTA[t] ?? t}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          {accion !== 'vincular' && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {accion === 'rama' ? 'Formato de la rama' : 'Formato de destino'}
              </span>
              <div className="flex flex-wrap gap-2">
                {FORMATOS_RAMA.map((f) => (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant={formato === f ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setFormato(f)}
                  >
                    {etiquetaFormato(f)}
                  </Button>
                ))}
              </div>
              {accion === 'transmutar' && !formas?.disponible && (
                <p className="text-xs text-muted-foreground">
                  {formas?.motivo ?? 'Aún no sé si este medio puede convertir el contenido.'}
                </p>
              )}
            </div>
          )}

          {aviso && (
            <p className="rounded-xl border border-border bg-muted px-3 py-2 text-muted-foreground">{aviso}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" className="cursor-pointer" onClick={ejecutar}>Aplicar</Button>
            <Button type="button" variant="ghost" className="cursor-pointer" onClick={deshacerUltimo}>
              Deshacer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
