"use client";

/*
 * usar-datos — el gancho de React que carga las tablas de MetaGeminis y las recarga a demanda (2026-10-10).
 * No lanza nunca: lo que falle queda dicho en `carga.errores` / `carga.sinTabla`. Las pruebas inyectan `cargar`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cargarTodo, type Carga } from "./datos";

export interface UsoDatos {
  /** null mientras carga por primera vez. */
  carga: Carga | null;
  cargando: boolean;
  recargar: () => Promise<void>;
}

/** `activo = false` no toca la base de datos (por ejemplo, mientras se comprueba si la cuenta es miembro). */
export function usarDatosMeta(cargar: () => Promise<Carga> = () => cargarTodo(), cadaMs = 0, activo = true): UsoDatos {
  const [carga, setCarga] = useState<Carga | null>(null);
  const [cargando, setCargando] = useState(activo);
  const vivo = useRef(true);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const c = await cargarRef.current();
      if (vivo.current) setCarga(c);
    } catch (e) {
      // `cargarTodo` no lanza, pero un cargador inyectado sí podría: se dice, no se rompe la pantalla.
      if (vivo.current) {
        const motivo = e instanceof Error ? e.message : "no se pudo cargar";
        setCarga({
          datos: { borradores: [], piezas: [], campanas: [], resultados: [], donaciones: [], enlaces: [], agentes: [], hallazgos: [] },
          sinTabla: [],
          errores: { borradores: motivo },
          sesion: true,
        });
      }
    } finally {
      if (vivo.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    if (!activo) {
      setCargando(false);
      return () => {
        vivo.current = false;
      };
    }
    void recargar();
    const id = cadaMs > 0 ? setInterval(() => void recargar(), cadaMs) : null;
    return () => {
      vivo.current = false;
      if (id) clearInterval(id);
    };
  }, [recargar, cadaMs, activo]);

  return { carga, cargando, recargar };
}
