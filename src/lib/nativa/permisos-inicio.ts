/*
 * permisos-inicio — la lista de permisos de cada neurona: qué hay, cómo está y qué pedir (PER1108A → PER1111S).
 * Contratos: architecture/permisos-y-control-del-dispositivo.md §5 (fase 1) y red-sin-dependencias.md §4.
 *
 * MÓDULO PURO: la máquina de estados de la lista y lo que se guarda. QUÉ permisos hay en cada sistema, cómo se
 * piden y para qué sirven NO vive aquí: lo dice el registro único `permisos-registro.ts`. Quien PIDE cada
 * permiso al sistema está en `permisos-inicio-ejecutor.ts`. Reglas que la máquina garantiza (y las pruebas vigilan):
 *  · de UNO en UNO: no se pide el siguiente hasta tener el resultado del anterior (macOS deja los avisos de
 *    privacidad pendientes y, mientras, la página no recibe clics: dos a la vez se pisan);
 *  · lo ya concedido (leído del sistema) no se pide nunca, ni la primera vez;
 *  · se puede omitir cada permiso o todo; lo omitido o negado no se vuelve a preguntar solo (queda en
 *    Ajustes › Permisos y antenas, donde se repasa cuando la persona quiera);
 *  · solo se abre sola si hay permisos NUEVOS que esa persona no vio (instalación o actualización);
 *  · lo que una fase posterior del contrato usará se ENSEÑA («llega con la fase N») pero no se pide.
 */

import {
  VERSION_REGISTRO,
  accionDe,
  esAccionable,
  registroDe,
  sistemaDePermisos,
  IDS_PERMISO,
  type DefPermiso as DefRegistro,
  type EstadoSistema,
  type IdPermiso as IdRegistro,
  type SistemaPermisos,
} from "./permisos-registro";
import {
  VERSION_MATRIZ,
  leerGuardado,
  serializarGuardado,
  yaPedidoAviso,
  colaPendientes,
  debeAbrirseSolo as debeAbrirseSoloMatriz,
  marcarVisto,
  marcarAviso,
  type GuardadoPermisos as GuardadoMatriz,
  type DefPermiso as DefMatriz,
  type IdPermiso as IdMatriz,
  type EstadoSistema as EstadoMatriz,
  type Medio,
  GUARDADO_VACIO as GUARDADO_VACIO_MATRIZ,
} from "@/lib/permisos/matriz";

export type SistemaAsistente = SistemaPermisos;
export type IdPermiso = IdRegistro;
export type DefPermiso = DefRegistro;
export type ResultadoPermiso = "concedido" | "denegado" | "omitido" | "no-disponible";
export type EstadosSistema = Partial<Record<IdPermiso, EstadoSistema>>;

/** Sube cuando se AÑADE un permiso que se pide (lo marca el registro). */
export const VERSION_ASISTENTE = VERSION_REGISTRO;
export const CLAVE_PERMISOS_INICIO = "starseed.permisos-inicio.v1";
export const EVENTO_ABRIR_ASISTENTE = "starseed:permisos-inicio-abrir";

/** macOS, Android, Windows y Linux (X11 o Wayland). Otro sistema: sin lista. */
export function sistemaDeAsistente(plataforma: string, sesion?: string | null): SistemaAsistente | null {
  return sistemaDePermisos(plataforma, sesion);
}

/** Todo lo que la lista enseña en este sistema (agrupado y en orden). */
export function catalogoDe(sistema: SistemaAsistente): DefPermiso[] {
  return registroDe(sistema);
}

/* ══════════════════════════ Lo guardado ══════════════════════════ */

/** Mapea el sistema nativo al medio de la matriz unificada. */
function medioDeSistema(s: SistemaAsistente): Medio {
  return s as Medio;
}

/** Convierte el guardado nativo al formato de la matriz (compatibles). */
function aGuardadoMatriz(g: GuardadoPermisos | Pick<GuardadoPermisos, "avisos">): GuardadoMatriz {
  return g as GuardadoMatriz;
}

/** Convierte el guardado de la matriz al formato nativo (compatibles). */
function aGuardadoNativo(g: GuardadoMatriz): GuardadoPermisos {
  return g as GuardadoPermisos;
}

export interface GuardadoPermisos {
  version: number;
  /** Permisos que la persona ya vio (concedió, negó u omitió): no se vuelven a preguntar solos. */
  vistos: IdPermiso[];
  resultados: Partial<Record<IdPermiso, ResultadoPermiso>>;
  /** Permisos cuyo aviso del sistema ya salió (macOS no lo repite: desde entonces se abre Ajustes). */
  avisos?: IdPermiso[];
}

export const GUARDADO_VACIO: GuardadoPermisos = GUARDADO_VACIO_MATRIZ;

/** Normaliza lo guardado; lo ilegible cuenta como «nunca visto». Nunca lanza. */
export function leerGuardadoPermisos(raw: string | null | undefined): GuardadoPermisos {
  return aGuardadoNativo(leerGuardado(raw));
}

export function serializarGuardadoPermisos(g: GuardadoPermisos): string {
  return serializarGuardado(aGuardadoMatriz(g));
}

/** ¿Ya salió el aviso del sistema de `id`? */
export function yaPedido(g: Pick<GuardadoPermisos, "avisos">, id: IdPermiso): boolean {
  return yaPedidoAviso(aGuardadoMatriz(g), id);
}

/** Los permisos que se pueden pedir ahora y no están concedidos (todos, o solo los que esa persona no vio). */
export function colaDe(sistema: SistemaAsistente, g: GuardadoPermisos, estados: EstadosSistema = {}, forzar = false): DefPermiso[] {
  return colaPendientes(medioDeSistema(sistema), aGuardadoMatriz(g), estados, forzar);
}

/** Los permisos que aún no se le han preguntado en este sistema y que hace falta pedir (en orden). */
export function permisosPendientes(sistema: SistemaAsistente, g: GuardadoPermisos, estados: EstadosSistema = {}): DefPermiso[] {
  return colaDe(sistema, g, estados, false);
}

/** ¿Se abre sola? Solo si hay permisos que esa persona no ha visto y que no están ya concedidos. */
export function debeAbrirseSolo(plataforma: string, g: GuardadoPermisos, estados: EstadosSistema = {}, sesion?: string | null): boolean {
  const s = sistemaDeAsistente(plataforma, sesion);
  if (!s) return false;
  return debeAbrirseSoloMatriz(medioDeSistema(s), aGuardadoMatriz(g), estados);
}

/* ══════════════════════════ Máquina de estados ══════════════════════════ */

export type FaseAsistente = "oculto" | "presentacion" | "pidiendo" | "resumen";

export interface EstadoAsistente {
  fase: FaseAsistente;
  sistema: SistemaAsistente | null;
  /** Todo lo que se enseña (el registro del sistema). */
  lista: DefPermiso[];
  /** Lo que se pide en este recorrido, en orden. */
  cola: DefPermiso[];
  /** Posición del permiso actual en `cola` (== cola.length cuando ya no quedan). */
  indice: number;
  /** El permiso que se ha pedido al sistema y aún no contestó (solo UNO a la vez). */
  esperando: IdPermiso | null;
  resultados: Partial<Record<IdPermiso, ResultadoPermiso>>;
  /** Estado real leído del sistema (se relee al volver a la app). */
  estados: EstadosSistema;
  /** Avisos del sistema ya enseñados (lo guardado + los de este recorrido). */
  avisos: IdPermiso[];
}

export type EventoAsistente =
  | { t: "empezar" }
  /** Pide el actual de la cola o, con `id`, uno concreto de la lista. */
  | { t: "pedir"; id?: IdPermiso }
  | { t: "resultado"; id: IdPermiso; r: ResultadoPermiso }
  | { t: "estados"; estados: EstadosSistema }
  | { t: "omitir" }
  | { t: "omitir-todo" }
  | { t: "cerrar" };

export const ASISTENTE_OCULTO: EstadoAsistente = {
  fase: "oculto",
  sistema: null,
  lista: [],
  cola: [],
  indice: 0,
  esperando: null,
  resultados: {},
  estados: {},
  avisos: [],
};

/**
 * La lista lista para enseñarse. `forzar`: la abrió la persona (Ajustes de la neurona): se enseña siempre, con
 * todo lo pedible aún sin conceder (también lo omitido antes). Sin forzar, solo si hay algo nuevo que pedir.
 */
export function abrirAsistente(
  plataforma: string,
  g: GuardadoPermisos,
  forzar = false,
  estados: EstadosSistema = {},
  sesion?: string | null,
): EstadoAsistente {
  const sistema = sistemaDeAsistente(plataforma, sesion);
  if (!sistema) return ASISTENTE_OCULTO;
  const cola = colaDe(sistema, g, estados, forzar);
  const base = { ...ASISTENTE_OCULTO, sistema, lista: catalogoDe(sistema), cola, estados, avisos: [...(g.avisos ?? [])] };
  if (!cola.length) return forzar ? { ...base, fase: "resumen" } : ASISTENTE_OCULTO;
  return { ...base, fase: "presentacion" };
}

export function permisoActual(e: EstadoAsistente): DefPermiso | null {
  return e.fase === "pidiendo" && e.indice < e.cola.length ? e.cola[e.indice] : null;
}

/** La acción que toca a `d` en este estado. */
export function accionEn(e: EstadoAsistente, d: DefPermiso) {
  return accionDe(d, e.estados[d.id], e.avisos.includes(d.id));
}

/** Avanza saltando lo que entretanto quedó concedido (la persona lo dio en Ajustes por su cuenta). */
function avanzar(e: EstadoAsistente, desde: number, resultados: EstadoAsistente["resultados"]): EstadoAsistente {
  let indice = desde;
  const r = { ...resultados };
  while (indice < e.cola.length && e.estados[e.cola[indice].id] === "concedido") {
    r[e.cola[indice].id] = r[e.cola[indice].id] ?? "concedido";
    indice++;
  }
  return indice >= e.cola.length ? { ...e, indice, esperando: null, resultados: r, fase: "resumen" } : { ...e, indice, esperando: null, resultados: r, fase: "pidiendo" };
}

export function reducirAsistente(e: EstadoAsistente, ev: EventoAsistente): EstadoAsistente {
  switch (ev.t) {
    case "empezar":
      return e.fase === "presentacion" ? avanzar({ ...e, fase: "pidiendo" }, e.indice, e.resultados) : e;
    case "pedir": {
      // Un solo aviso del sistema a la vez: mientras haya uno sin contestar, no se pide otro.
      if (e.esperando || e.fase === "oculto" || e.fase === "presentacion") return e;
      const d = ev.id ? e.lista.find((x) => x.id === ev.id) ?? null : permisoActual(e);
      if (!d || !esAccionable(accionEn(e, d))) return e;
      const aviso = d.como === "aviso-y-panel" && accionEn(e, d) === "pedir";
      return { ...e, esperando: d.id, avisos: aviso && !e.avisos.includes(d.id) ? [...e.avisos, d.id] : e.avisos };
    }
    case "resultado": {
      // Solo vale el resultado del permiso que se pidió.
      if (e.esperando !== ev.id) return e;
      const resultados = { ...e.resultados, [ev.id]: ev.r };
      const actual = permisoActual(e);
      if (actual && actual.id === ev.id) return avanzar(e, e.indice + 1, resultados);
      return { ...e, esperando: null, resultados };
    }
    case "estados": {
      const n = { ...e, estados: { ...e.estados, ...ev.estados } };
      // Lo que el sistema ya da por concedido no se pide: se salta (sin tocar lo que espera respuesta).
      return n.fase === "pidiendo" && !n.esperando ? avanzar(n, n.indice, n.resultados) : n;
    }
    case "omitir": {
      // No se omite mientras el sistema espera respuesta (la respuesta llegará y se registra).
      if (e.esperando) return e;
      const d = permisoActual(e);
      return d ? avanzar(e, e.indice + 1, { ...e.resultados, [d.id]: "omitido" }) : e;
    }
    case "omitir-todo": {
      if (e.fase === "oculto" || e.fase === "resumen" || e.esperando) return e;
      const resultados = { ...e.resultados };
      for (const d of e.cola.slice(e.indice)) if (!resultados[d.id]) resultados[d.id] = "omitido";
      return { ...e, indice: e.cola.length, resultados, fase: "resumen" };
    }
    case "cerrar":
      return e.esperando ? e : { ...e, fase: "oculto" };
  }
}

/** Lo que se guarda al cerrar: todo lo preguntado (aunque se omitiera) cuenta como visto. */
export function guardadoTras(g: GuardadoPermisos, e: EstadoAsistente): GuardadoPermisos {
  let gm = aGuardadoMatriz(g);
  for (const d of e.lista) {
    const r = e.resultados[d.id];
    if (r) {
      gm = marcarVisto(gm, d.id, r);
    }
  }
  for (const id of e.avisos) {
    if (!gm.avisos?.includes(id)) {
      gm = marcarAviso(gm, id);
    }
  }
  const gn = aGuardadoNativo(gm);
  return { ...gn, version: VERSION_ASISTENTE };
}

/** Frase corta del resultado de este recorrido. */
export function textoResultado(r: ResultadoPermiso | undefined): string {
  switch (r) {
    case "concedido":
      return "Listo";
    case "denegado":
      return "Denegado: se cambia en Ajustes del sistema";
    case "omitido":
      return "Omitido por ahora";
    case "no-disponible":
      return "No disponible en este aparato";
    default:
      return "Pendiente";
  }
}
