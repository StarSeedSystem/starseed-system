"use client";

/**
 * Los escenarios del mundo en la interfaz (Ola 1025U · U1): el almacén de `escenarios.ts` con su guardado en
 * este aparato. Cada operación devuelve el `ResultadoEscenarios` para que la interfaz diga el motivo si no
 * se pudo, y deja `aviso` con la última frase honesta (también «no se pudo guardar», que antes se callaba).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  agregarZona,
  borrarEscenario,
  cambiarVisibilidad,
  crearEscenario,
  duplicarEscenario,
  elegirEscenario,
  escenarioActivo,
  guardarEscenarios,
  leerEscenarios,
  quitarZona,
  renombrarEscenario,
  renombrarZona,
  type AlmacenEscenarios,
  type DatosEscenario,
  type Escenario,
  type ResultadoEscenarios,
  type VisibilidadEscenario,
} from "@/lib/avatares/mundo/escenarios";
import { olvidarMundo, type OcupacionMundo } from "@/lib/avatares/mundo/simulacion";

export interface UsoEscenarios {
  almacen: AlmacenEscenarios;
  activo: Escenario;
  /** Última frase de error u honestidad (no se pudo, no cabe…). `null` = nada que decir. */
  aviso: string | null;
  /** `false` si el último guardado en este aparato falló. */
  guardado: boolean;
  limpiarAviso: () => void;
  crear: (datos: DatosEscenario) => ResultadoEscenarios;
  renombrar: (id: string, nombre: string) => ResultadoEscenarios;
  duplicar: (id: string) => ResultadoEscenarios;
  /** Sin `confirmado === true` no borra nada. Al borrar también se olvida el mundo guardado de ese escenario. */
  borrar: (id: string, confirmado: boolean) => ResultadoEscenarios;
  elegir: (id: string) => ResultadoEscenarios;
  cambiarVisibilidad: (id: string, visibilidad: VisibilidadEscenario, grupoId?: string) => ResultadoEscenarios;
  agregarZona: (id: string, nombre: string, afinidad: OcupacionMundo | null) => ResultadoEscenarios;
  quitarZona: (id: string, zonaId: string) => ResultadoEscenarios;
  renombrarZona: (id: string, zonaId: string, nombre: string) => ResultadoEscenarios;
}

export function useEscenarios(inicial?: AlmacenEscenarios): UsoEscenarios {
  const [almacen, setAlmacen] = useState<AlmacenEscenarios>(() => inicial ?? leerEscenarios());
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(true);
  const ultimo = useRef(almacen);
  const primero = useRef(true);

  // Se guarda cada cambio (no el primer render: lo leído del disco no hace falta reescribirlo).
  useEffect(() => {
    ultimo.current = almacen;
    if (primero.current) {
      primero.current = false;
      return;
    }
    setGuardado(guardarEscenarios(almacen));
  }, [almacen]);

  const aplicar = useCallback((f: (a: AlmacenEscenarios, ahora: number) => ResultadoEscenarios): ResultadoEscenarios => {
    const r = f(ultimo.current, Date.now());
    if (r.ok) {
      ultimo.current = r.almacen;
      setAlmacen(r.almacen);
      setAviso(null);
    } else {
      setAviso(r.motivo);
    }
    return r;
  }, []);

  return useMemo<UsoEscenarios>(
    () => ({
      almacen,
      activo: escenarioActivo(almacen),
      aviso,
      guardado,
      limpiarAviso: () => setAviso(null),
      crear: (datos) => aplicar((a, t) => crearEscenario(a, datos, t)),
      renombrar: (id, nombre) => aplicar((a, t) => renombrarEscenario(a, id, nombre, t)),
      duplicar: (id) => aplicar((a, t) => duplicarEscenario(a, id, t)),
      borrar: (id, confirmado) => {
        const r = aplicar((a) => borrarEscenario(a, id, confirmado));
        if (r.ok) olvidarMundo(id);
        return r;
      },
      elegir: (id) => aplicar((a) => elegirEscenario(a, id)),
      cambiarVisibilidad: (id, visibilidad, grupoId) => aplicar((a, t) => cambiarVisibilidad(a, id, visibilidad, t, grupoId)),
      agregarZona: (id, nombre, afinidad) => aplicar((a, t) => agregarZona(a, id, nombre, afinidad, t)),
      quitarZona: (id, zonaId) => aplicar((a, t) => quitarZona(a, id, zonaId, t)),
      renombrarZona: (id, zonaId, nombre) => aplicar((a, t) => renombrarZona(a, id, zonaId, nombre, t)),
    }),
    [almacen, aviso, guardado, aplicar],
  );
}
