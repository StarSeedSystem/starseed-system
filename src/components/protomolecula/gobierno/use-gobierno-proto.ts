"use client";

/**
 * Gobierno de la Protomolécula visto desde un componente (Ola 1026P · P2): carga las reglas y tu papel en la entidad
 * que gobierna el contexto, y decide cualquier cambio con ellas. Lo usan la sección de ajustes de la entidad, el
 * resumen compacto de la ventana de la orbe y quien necesite `decidir(tipo, origen)` con todo ya cargado.
 *
 * Ligero a propósito: la orbe puede colgar del layout raíz, así que aquí no se importa el motor de gobernanza ni
 * Supabase de forma estática (`entorno.ts` los carga a demanda).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GovernanceMode } from "@/lib/governance/types";
import type { ActorProto, ContextoProto, TipoCambioProto } from "@/lib/protomolecula/peticion/contrato";
import { decidirCambioConReglas, entidadGobernante, type EntornoGobierno, type VeredictoDetallado } from "@/lib/protomolecula/gobierno/decision";
import { EVENTO_GOBIERNO_PROTO, claveEntidad, leerEstado, type OrigenReglas } from "@/lib/protomolecula/gobierno/almacen";
import { SERVICIOS_POR_DEFECTO, type EntornoCargado, type PersonaEnEntidad, type ServiciosGobierno } from "@/lib/protomolecula/gobierno/entorno";
import type { ReglasProtomolecula, TipoEntidadGobernada } from "@/lib/protomolecula/gobierno/reglas";

export type EntidadGobernadaProto = { tipo: TipoEntidadGobernada; id: string; nombre?: string };

export interface UsoGobiernoProto {
  /** La entidad cuyo gobierno aplica; `null` si la pantalla no cuelga de un grupo, una comunidad ni una página. */
  entidad: EntidadGobernadaProto | null;
  cargando: boolean;
  persona: PersonaEnEntidad | null;
  entorno: EntornoGobierno;
  /** `null` = la entidad aún no ha guardado reglas propias. */
  reglasGuardadas: ReglasProtomolecula | null;
  origen: OrigenReglas;
  modoGobierno: GovernanceMode;
  /** Sube con cada aviso de cambio (reglas guardadas, permiso usado): para refrescar listas. */
  version: number;
  actor: (origen?: ActorProto["origen"]) => ActorProto;
  decidir: (tipo: TipoCambioProto, origen?: ActorProto["origen"], cambio?: EntornoGobierno["cambio"]) => VeredictoDetallado;
  recargar: () => Promise<void>;
}

const CONTEXTO_VACIO: ContextoProto = { ruta: "", ambito: "grupo" };

export function useGobiernoProto(contexto: ContextoProto | null, servicios?: Partial<ServiciosGobierno>): UsoGobiernoProto {
  const svc = useRef<ServiciosGobierno>({ ...SERVICIOS_POR_DEFECTO, ...servicios });
  svc.current = { ...SERVICIOS_POR_DEFECTO, ...servicios };

  const encontrada = contexto ? entidadGobernante(contexto) : null;
  const clave = encontrada ? `${claveEntidad(encontrada)}|${encontrada.nombre ?? ""}` : "";
  // Estable mientras la entidad sea la misma: así el efecto de carga no se repite en cada pintado.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entidad = useMemo<EntidadGobernadaProto | null>(() => (encontrada ? { tipo: encontrada.tipo, id: encontrada.id, ...(encontrada.nombre ? { nombre: encontrada.nombre } : {}) } : null), [clave]);

  const [carga, setCarga] = useState<EntornoCargado | null>(null);
  const [cargando, setCargando] = useState<boolean>(entidad !== null);
  const [version, setVersion] = useState(0);

  const cargar = useCallback(async () => {
    if (!entidad) {
      setCarga(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      setCarga(await svc.current.cargar(entidad));
    } catch {
      setCarga(null);
    }
    setCargando(false);
  }, [entidad]);

  useEffect(() => {
    let vivo = true;
    void cargar();
    if (!entidad || typeof window === "undefined") return () => { vivo = false; };
    const alAvisar = (ev: Event) => {
      const d = (ev as CustomEvent<{ entidad?: { tipo?: string; id?: string } }>).detail?.entidad;
      if (!vivo || !d || d.id !== entidad.id || d.tipo !== entidad.tipo) return;
      const s = leerEstado(entidad);
      if (s) {
        setCarga((c) => (c ? { ...c, reglasGuardadas: s.reglas, origen: s.origen, modoGobierno: s.modoGobierno, entorno: { ...c.entorno, reglas: s.reglas, modoGobierno: s.modoGobierno } } : c));
      }
      setVersion((v) => v + 1);
    };
    window.addEventListener(EVENTO_GOBIERNO_PROTO, alAvisar);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_GOBIERNO_PROTO, alAvisar);
    };
  }, [cargar, entidad]);

  const persona = carga?.persona ?? null;
  const entorno = useMemo<EntornoGobierno>(() => carga?.entorno ?? {}, [carga]);

  const actor = useCallback(
    (origen: ActorProto["origen"] = "humano"): ActorProto => ({ usuarioId: persona?.usuarioId ?? null, rol: persona?.rol ?? null, esDueno: persona?.esDueno ?? false, origen }),
    [persona],
  );

  const decidir = useCallback(
    (tipo: TipoCambioProto, origen: ActorProto["origen"] = "humano", cambio?: EntornoGobierno["cambio"]) =>
      decidirCambioConReglas(contexto ?? CONTEXTO_VACIO, actor(origen), tipo, { ...entorno, ...(cambio ? { cambio } : {}) }),
    [contexto, actor, entorno],
  );

  return {
    entidad, cargando, persona, entorno,
    reglasGuardadas: carga?.reglasGuardadas ?? null,
    origen: carga?.origen ?? "ninguno",
    modoGobierno: carga?.modoGobierno ?? "democratic",
    version, actor, decidir, recargar: cargar,
  };
}
