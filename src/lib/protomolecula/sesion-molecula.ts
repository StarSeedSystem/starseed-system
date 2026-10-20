/**
 * Protomolécula · SESIÓN DE MOLÉCULA. El DUEÑO del controlador: abre (o crea) una molécula, crea su
 * controlador, lo registra en `controlador-activo` para que el widget, la página, la acción de Aurora y
 * los bots lo encuentren, y lo guarda en el almacén local con un retardo de 400 ms. Varias vistas
 * (panel, widget, lienzo) comparten UNA sola sesión por molécula, con recuento de referencias.
 *
 * Módulo sin React, sin `window` y sin Supabase: el almacén, el reloj y los generadores llegan por
 * parámetro. Contrato: `architecture/protomolecula.md` §11.1.
 */
import { esMoleculaGuardable, guardarMolecula, type AlmacenLocal } from "./almacen-moleculas";
import { registrarAtomosPropios } from "./atomos";
import { crearControlador, type Controlador } from "./controlador";
import { registrarControlador } from "./controlador-activo";
import { resolverMolecula } from "./resolver-molecula";
import type { Molecula, Rol } from "./tipos";

export const ESPERA_GUARDADO_MS = 400;

/** `guardando` = hay un cambio esperando su turno de escritura; `error` lleva siempre el motivo real. */
export type EstadoGuardado = { estado: "sin-cambios" | "guardando" | "guardado" } | { estado: "error"; motivo: string };

export interface DependenciasSesion {
  /** `null`: este navegador no deja guardar (modo privado, datos bloqueados…). */
  almacen: AlmacenLocal | null;
  ahora: () => number;
  nuevoId: () => string;
  /** La molécula sale del almacén de ESTE aparato, así que por defecto quien la abre es su dueño. */
  rol?: Rol;
  /** Programa `f` dentro de `ms` y devuelve cómo cancelarlo. Por defecto, `setTimeout`. */
  programar?: (f: () => void, ms: number) => () => void;
}

export interface SesionMolecula {
  readonly id: string;
  readonly controlador: Controlador;
  /** Misma referencia mientras no cambie: apta para `useSyncExternalStore`. */
  guardado(): EstadoGuardado;
  suscribirGuardado(f: () => void): () => void;
  /** Escribe ya lo que esté esperando (al cerrar la pestaña o la última vista). */
  volcar(): void;
}
export type ResultadoApertura = { ok: true; sesion: SesionMolecula } | { ok: false; motivo: string };

const porDefecto = (f: () => void, ms: number): (() => void) => { const t = setTimeout(f, ms); return () => clearTimeout(t); };
const error = (motivo: string): EstadoGuardado => ({ estado: "error", motivo });

/** Crea el controlador y el guardado con retardo. Devuelve la sesión y cómo cerrarla. */
function montar(m: Molecula, d: DependenciasSesion): { sesion: SesionMolecula; cerrar: () => void } {
  const controlador = crearControlador({ molecula: m, rol: d.rol ?? "dueno", ahora: d.ahora, nuevoId: d.nuevoId });
  const programar = d.programar ?? porDefecto;
  const oyentes = new Set<() => void>();
  let guardado: EstadoGuardado = { estado: "sin-cambios" };
  let ultima: Molecula = m; // la última molécula escrita (o cargada): solo cambia su IDENTIDAD si cambia algo
  let cancelar: (() => void) | null = null;
  const fijar = (g: EstadoGuardado) => { guardado = g; oyentes.forEach((f) => f()); };

  const escribir = () => {
    cancelar = null;
    const actual = controlador.obtener().molecula;
    if (actual === ultima) return;
    if (!d.almacen) return fijar(error("Este navegador no deja guardar en el aparato."));
    if (!esMoleculaGuardable(actual)) return fijar(error("La molécula no es válida o supera los 256 KB que caben en el aparato."));
    if (!guardarMolecula(d.almacen, actual)) return fijar(error("El navegador no dejó escribir (¿almacenamiento lleno o bloqueado?)."));
    ultima = actual;
    fijar({ estado: "guardado" });
  };
  const volcar = () => { if (cancelar) { cancelar(); escribir(); } };
  const dejarDeEscuchar = controlador.suscribir((e) => {
    if (e.molecula === ultima) return; // cambió otra cosa (los pendientes): nada que guardar
    cancelar?.();
    cancelar = programar(escribir, ESPERA_GUARDADO_MS);
    if (guardado.estado !== "guardando") fijar({ estado: "guardando" });
  });
  const desregistrar = registrarControlador(m.id, controlador);
  const sesion: SesionMolecula = {
    id: m.id,
    controlador,
    guardado: () => guardado,
    suscribirGuardado: (f) => { oyentes.add(f); return () => { oyentes.delete(f); }; },
    volcar,
  };
  return { sesion, cerrar: () => { volcar(); dejarDeEscuchar(); desregistrar(); } };
}

interface Abierta { sesion: SesionMolecula; cuentas: number; cerrar: () => void }
const ABIERTAS = new Map<string, Abierta>();
let orden: string[] = [];

/**
 * Abre la sesión de `id`; sin `id`, une a la última abierta (como `controladorActivo()`), y si no hay
 * ninguna, a la más reciente del almacén o a una nueva. Cada `abrirSesion` ok pide un `cerrarSesion`.
 */
export function abrirSesion(id: string | undefined, d: DependenciasSesion): ResultadoApertura {
  const clave = id ?? orden[orden.length - 1];
  const previa = clave === undefined ? undefined : ABIERTAS.get(clave);
  if (previa) { previa.cuentas++; return { ok: true, sesion: previa.sesion }; }
  const r = resolverMolecula(id, d);
  if (!r.ok) return r;
  registrarAtomosPropios();
  const { sesion, cerrar } = montar(r.molecula, d);
  ABIERTAS.set(sesion.id, { sesion, cuentas: 1, cerrar });
  orden = [...orden, sesion.id];
  return { ok: true, sesion };
}

/** Suelta una referencia; con la última, vuelca lo pendiente y desregistra el controlador. */
export function cerrarSesion(id: string): void {
  const a = ABIERTAS.get(id);
  if (!a || --a.cuentas > 0) return;
  a.cerrar();
  ABIERTAS.delete(id);
  orden = orden.filter((x) => x !== id);
}

/** Solo pruebas: cierra todas las sesiones (volcando lo que esperase turno). */
export function reiniciarSesiones(): void {
  for (const a of ABIERTAS.values()) a.cerrar();
  ABIERTAS.clear();
  orden = [];
}
