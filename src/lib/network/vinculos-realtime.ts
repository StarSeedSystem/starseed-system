"use client";

/*
 * vinculos-realtime — Realtime de `os_mesh_vinculos` para los vínculos entre
 * cuentas (SOP `architecture/vinculos-entre-cuentas.md` §1.4 y §7). El motor
 * (`vinculos-entre-cuentas.ts`) sondea como red de seguridad (`POLL_MS` 10
 * min, 30 sin vínculos) y una solicitud/aceptación de OTRA cuenta tardaba
 * hasta media hora: abre UN canal (`vinculos:<uid>`) con dos escuchas
 * `postgres_changes` (evento `*`, esquema `public`, tabla `os_mesh_vinculos`,
 * filtros `de_owner=eq.<uid>` y `a_owner=eq.<uid>`) y JUNTA los eventos
 * seguidos en UNA llamada a `alCambiar` (ventana 1,5 s). Nunca lanza ni
 * importa `node:*`; el singleton real entra con `as unknown as` (patrón
 * de `vivo/tabla/presencia.ts`).
 */
import { createClient } from "@/utils/supabase/client";

export type FiltroCambios = { event: string; schema: string; table: string; filter?: string };
export interface CanalVinculoRealtime {
  on(tipo: "postgres_changes", filtro: FiltroCambios, cb: (payload: unknown) => void): CanalVinculoRealtime;
  subscribe(cb?: (estado: string) => void): CanalVinculoRealtime;
}

export interface ClienteVinculosRealtime {
  channel(nombre: string): CanalVinculoRealtime;
  removeChannel(canal: CanalVinculoRealtime): unknown;
}

export interface OpcionesVinculosRealtime {
  /** ventanaReunionMs (defecto 1.500 ms) y temporizadores inyectables con sus defectos. */
  ventanaReunionMs?: number;
  programar?: (fn: () => void, ms: number) => unknown;
  cancelar?: (id: unknown) => void;
}

const VENTANA_REUNION_MS = 1_500;
const VACIA = () => {};
/** Abre el canal (o función vacía si no se puede: sin `uid`, sin `client.channel` o si lanza). Nunca lanza. */
export function suscribirCambiosVinculos(
  cliente: ClienteVinculosRealtime | null | undefined,
  uid: string | null | undefined,
  alCambiar: () => void,
  opts?: OpcionesVinculosRealtime,
): () => void {
  const ventana = Math.max(0, opts?.ventanaReunionMs ?? VENTANA_REUNION_MS);
  const programar = opts?.programar ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancelar = opts?.cancelar ?? ((id: unknown) => clearTimeout(id as Parameters<typeof clearTimeout>[0]));

  if (!uid || !cliente || typeof cliente.channel !== "function") return VACIA;
  try {
    const canal = cliente.channel(`vinculos:${uid}`);
    if (!canal || typeof canal.on !== "function" || typeof canal.subscribe !== "function") return VACIA;
    return abrirYObservar(canal, cliente, uid, alCambiar, { ventana, programar, cancelar });
  } catch {
    return VACIA; // sin canal no hay Realtime: el sondeo del motor sigue cubriendo
  }
}

interface Ritmo {
  ventana: number;
  programar: (fn: () => void, ms: number) => unknown;
  cancelar: (id: unknown) => void;
}
/** Apunta los dos escuchas, suscribe y devuelve la función de soltar. Nunca lanza. */
function abrirYObservar(
  canal: CanalVinculoRealtime,
  cliente: ClienteVinculosRealtime,
  uid: string,
  alCambiar: () => void,
  ritmo: Ritmo,
): () => void {
  let cerrado = false;
  let enRuta = false;
  let idTarea: unknown = null;

  const disparar = () => {
    enRuta = false;
    idTarea = null;
    try {
      alCambiar();
    } catch {
      /* el callback no puede tumbar a la pestaña */
    }
  };

  const enCola = () => {
    if (cerrado || enRuta) return;
    enRuta = true;
    try {
      idTarea = ritmo.programar(disparar, ritmo.ventana);
    } catch {
      enRuta = false; // sin temporizador no hay reunión; el sondeo sigue cubriendo
    }
  };

  const filtroBase = { event: "*", schema: "public", table: "os_mesh_vinculos" };
  canal.on("postgres_changes", { ...filtroBase, filter: `de_owner=eq.${uid}` }, enCola);
  canal.on("postgres_changes", { ...filtroBase, filter: `a_owner=eq.${uid}` }, enCola);
  try {
    canal.subscribe();
  } catch {
    /* sin SUBSCRIBED los escuchas no reciben: el sondeo sigue cubriendo */
  }
  return () => {
    if (cerrado) return;
    cerrado = true;
    if (enRuta) {
      enRuta = false;
      try {
        ritmo.cancelar(idTarea);
      } catch {
        /* noop */
      }
    }
    try {
      cliente.removeChannel(canal);
    } catch {
      /* noop — quitar el canal es solo recoger */
    }
  };
}
