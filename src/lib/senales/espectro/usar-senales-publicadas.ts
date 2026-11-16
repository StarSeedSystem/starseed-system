"use client";

/**
 * usar-senales-publicadas — hook para leer señales publicadas cada 45 s solo con pestaña visible (MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Patrón de `useAhora` en `src/components/mesh/mapa-senales/use-mapa-vivo.ts:33-48`.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { uidActual } from "@/lib/consumo/usuario";
import { leerSenalesPublicadas, type ResultadoLectura, type SenalEspectro } from "./leer-senales";

const REFRESCO_MS = 45_000;

function useAhora(cadaMs = REFRESCO_MS): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    const parar = () => { if (t) { clearInterval(t); t = null; } };
    const arrancar = () => {
      parar();
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      t = setInterval(() => setAhora(Date.now()), cadaMs);
    };
    const alCambiar = () => { if (document.visibilityState === "visible") { setAhora(Date.now()); arrancar(); } };
    arrancar();
    document.addEventListener("visibilitychange", alCambiar);
    return () => { parar(); document.removeEventListener("visibilitychange", alCambiar); };
  }, [cadaMs]);
  return ahora;
}

export interface EstadoSenalesPublicadas {
  senales: SenalEspectro[];
  estado: ResultadoLectura["estado"];
  motivo?: string;
  cargando: boolean;
  actualizar: () => Promise<void>;
}

export function useSenalesPublicadas(): EstadoSenalesPublicadas {
  const [senales, setSenales] = useState<SenalEspectro[]>([]);
  const [estado, setEstado] = useState<ResultadoLectura["estado"]>("ok");
  const [motivo, setMotivo] = useState<string | undefined>();
  const [cargando, setCargando] = useState(true);
  const [miUid, setMiUid] = useState<string | null>(null);
  const ahora = useAhora();

  const leer = useCallback(async () => {
    const cliente = createClient();
    if (!cliente) {
      setSenales([]);
      setEstado("sin-sesion");
      setMotivo("no hay cliente de Supabase (sesión no iniciada)");
      setCargando(false);
      return;
    }
    const uid = await uidActual().catch(() => null);
    if (!uid) {
      setSenales([]);
      setEstado("sin-sesion");
      setMotivo("no se pudo obtener el UID de la sesión");
      setCargando(false);
      return;
    }
    setMiUid(uid);
    try {
      const res = await leerSenalesPublicadas({ cliente, uid });
      setSenales(res.senales);
      setEstado(res.estado);
      setMotivo(res.motivo);
    } catch (e) {
      setSenales([]);
      setEstado("error");
      setMotivo(e instanceof Error ? e.message : "error desconocido");
    } finally {
      setCargando(false);
    }
  }, [ahora]);

  useEffect(() => {
    leer();
  }, [leer]);

  return { senales, estado, motivo, cargando, actualizar: leer };
}