/*
 * permisos-inicio — el asistente de permisos del primer arranque de las apps nativas (PER1108A, 2026-11-08).
 * Contrato: architecture/red-sin-dependencias.md §4 «Permisos y antenas desde la instalación».
 *
 * MÓDULO PURO: el catálogo de permisos por sistema, su versión (un permiso nuevo en una actualización se
 * pregunta solo a quien no lo vio), la máquina de estados del asistente y lo que se guarda. Quien PIDE cada
 * permiso al sistema está en `permisos-inicio-ejecutor.ts` (reutiliza lo que ya había: Bluetooth,
 * Wi-Fi directo, `permisos_medios.rs`). Reglas que la máquina garantiza (y las pruebas vigilan):
 *  · de UNO en UNO: no se pide el siguiente hasta tener el resultado del anterior (macOS deja los avisos de
 *    privacidad pendientes y, mientras, la página no recibe clics: dos a la vez se pisan);
 *  · se puede omitir cada permiso o todo el asistente; lo omitido no se vuelve a preguntar solo (queda en
 *    Ajustes › Permisos y antenas);
 *  · solo se vuelve a abrir si hay permisos NUEVOS (versión) o si la persona lo pide.
 */

export type SistemaAsistente = "macos" | "android";
export type IdPermiso = "bluetooth" | "red-local" | "notificaciones" | "microfono" | "camara" | "ubicacion-wifi" | "cercanos" | "llamadas" | "instalar" | "bateria";
export type ResultadoPermiso = "concedido" | "denegado" | "omitido" | "no-disponible";

export interface DefPermiso {
  id: IdPermiso;
  titulo: string;
  /** Una línea: para qué sirve (en claro, sin jerga). */
  porQue: string;
  /** Versión del asistente en la que entró. */
  desde: number;
  /** Opcional: no hace falta para que todo funcione (se explica y se puede dejar). */
  opcional?: boolean;
}

/** Sube cuando se AÑADE un permiso al catálogo (no cuando cambia un texto). */
export const VERSION_ASISTENTE = 2;
export const CLAVE_PERMISOS_INICIO = "starseed.permisos-inicio.v1";
export const EVENTO_ABRIR_ASISTENTE = "starseed:permisos-inicio-abrir";

const CATALOGO: Record<IdPermiso, Omit<DefPermiso, "id">> = {
  bluetooth: {
    titulo: "Bluetooth",
    porQue: "Para hablar directamente con tus otras neuronas cercanas, sin Wi-Fi ni internet.",
    desde: 1,
  },
  "red-local": {
    titulo: "Red local",
    porQue: "Para encontrar a tus otras neuronas en esta red, también sin internet.",
    desde: 1,
  },
  notificaciones: {
    titulo: "Notificaciones",
    porQue: "Para avisarte de mensajes y llamadas aunque la ventana esté cerrada.",
    desde: 1,
  },
  microfono: {
    titulo: "Micrófono",
    porQue: "Solo cuando tú lo pides: llamadas, transmisiones y grabaciones.",
    desde: 1,
  },
  camara: {
    titulo: "Cámara",
    porQue: "Solo cuando tú lo pides: videollamadas, transmisiones y grabaciones.",
    desde: 1,
  },
  "ubicacion-wifi": {
    titulo: "Ubicación (nombres de Wi-Fi)",
    porQue: "macOS la pide para dejar ver el nombre de las redes Wi-Fi y unir este Mac a la red directa de tu Android. StarSeed no usa ni guarda tu ubicación.",
    desde: 1,
    opcional: true,
  },
  cercanos: {
    titulo: "Dispositivos cercanos",
    porQue: "Para buscar, anunciarse y conectar por Bluetooth y abrir la red Wi-Fi directa entre tus aparatos. StarSeed no usa tu ubicación.",
    desde: 1,
  },
  // (LLA1108D) v2: las llamadas como llamadas del teléfono. Solo Android 14+ lo pide de verdad; antes se da por hecho.
  llamadas: {
    titulo: "Llamadas sobre la pantalla de bloqueo",
    porQue: "Para que una llamada de StarSeed aparezca a pantalla completa con el teléfono bloqueado. Sin esto llega como aviso emergente.",
    desde: 2,
    opcional: true,
  },
  instalar: {
    titulo: "Instalar apps desconocidas",
    porQue: "Para que la app se actualice sola desde el canal de StarSeed (la firma se comprueba antes).",
    desde: 1,
    opcional: true,
  },
  bateria: {
    titulo: "Sin límite de batería",
    porQue: "Para que las antenas sigan vivas con la pantalla apagada. Puedes dejarlo: se usarán solo con la app abierta.",
    desde: 1,
    opcional: true,
  },
};

const ORDEN: Record<SistemaAsistente, IdPermiso[]> = {
  // Orden de macOS: lo que más importa (la malla) primero y lo que abre un aviso del sistema, de uno en uno.
  macos: ["bluetooth", "red-local", "notificaciones", "microfono", "camara", "ubicacion-wifi"],
  android: ["cercanos", "notificaciones", "microfono", "camara", "llamadas", "instalar", "bateria"],
};

/** Windows y Linux: el sistema pregunta al usarlo (no hay nada que pedir de antemano). */
export function sistemaDeAsistente(plataforma: string): SistemaAsistente | null {
  const p = (plataforma || "").toLowerCase();
  if (p === "macos" || p === "darwin") return "macos";
  if (p === "android") return "android";
  return null;
}

export function catalogoDe(sistema: SistemaAsistente): DefPermiso[] {
  return ORDEN[sistema].map((id) => ({ id, ...CATALOGO[id] }));
}

/* ══════════════════════════ Lo guardado ══════════════════════════ */

export interface GuardadoPermisos {
  version: number;
  /** Permisos que la persona ya vio (concedió, negó u omitió): no se vuelven a preguntar solos. */
  vistos: IdPermiso[];
  resultados: Partial<Record<IdPermiso, ResultadoPermiso>>;
}

export const GUARDADO_VACIO: GuardadoPermisos = { version: 0, vistos: [], resultados: {} };

const IDS: readonly string[] = Object.keys(CATALOGO);
const RESULTADOS: readonly string[] = ["concedido", "denegado", "omitido", "no-disponible"];

/** Normaliza lo guardado; lo ilegible cuenta como «nunca visto». Nunca lanza. */
export function leerGuardadoPermisos(raw: string | null | undefined): GuardadoPermisos {
  if (!raw) return GUARDADO_VACIO;
  try {
    const o: unknown = JSON.parse(raw);
    if (!o || typeof o !== "object") return GUARDADO_VACIO;
    const g = o as { version?: unknown; vistos?: unknown; resultados?: unknown };
    const vistos = Array.isArray(g.vistos) ? (Array.from(new Set(g.vistos.filter((x): x is IdPermiso => typeof x === "string" && IDS.includes(x)))) as IdPermiso[]) : [];
    const resultados: GuardadoPermisos["resultados"] = {};
    if (g.resultados && typeof g.resultados === "object") {
      for (const [k, v] of Object.entries(g.resultados as Record<string, unknown>)) {
        if (IDS.includes(k) && typeof v === "string" && RESULTADOS.includes(v)) resultados[k as IdPermiso] = v as ResultadoPermiso;
      }
    }
    const version = typeof g.version === "number" && Number.isFinite(g.version) && g.version >= 0 ? Math.floor(g.version) : 0;
    return { version, vistos, resultados };
  } catch {
    return GUARDADO_VACIO;
  }
}

export function serializarGuardadoPermisos(g: GuardadoPermisos): string {
  return JSON.stringify(g);
}

/** Los permisos que aún no se le han preguntado en este sistema (en orden). */
export function permisosPendientes(sistema: SistemaAsistente, g: GuardadoPermisos): DefPermiso[] {
  return catalogoDe(sistema).filter((d) => d.desde <= VERSION_ASISTENTE && !g.vistos.includes(d.id));
}

/** ¿Se abre solo? Solo si hay permisos que esa persona no ha visto (instalación nueva o permisos nuevos). */
export function debeAbrirseSolo(plataforma: string, g: GuardadoPermisos): boolean {
  const s = sistemaDeAsistente(plataforma);
  return !!s && permisosPendientes(s, g).length > 0;
}

/* ══════════════════════════ Máquina de estados ══════════════════════════ */

export type FaseAsistente = "oculto" | "presentacion" | "pidiendo" | "resumen";

export interface EstadoAsistente {
  fase: FaseAsistente;
  sistema: SistemaAsistente | null;
  cola: DefPermiso[];
  /** Posición del permiso actual en `cola` (== cola.length cuando ya no quedan). */
  indice: number;
  /** El permiso que se ha pedido al sistema y aún no contestó (solo UNO a la vez). */
  esperando: IdPermiso | null;
  resultados: Partial<Record<IdPermiso, ResultadoPermiso>>;
}

export type EventoAsistente =
  | { t: "empezar" }
  | { t: "pedir" }
  | { t: "resultado"; id: IdPermiso; r: ResultadoPermiso }
  | { t: "omitir" }
  | { t: "omitir-todo" }
  | { t: "cerrar" };

export const ASISTENTE_OCULTO: EstadoAsistente = { fase: "oculto", sistema: null, cola: [], indice: 0, esperando: null, resultados: {} };

/** El asistente listo para enseñarse. `forzar`: lo pidió la persona desde Ajustes (se repasan todos). */
export function abrirAsistente(plataforma: string, g: GuardadoPermisos, forzar = false): EstadoAsistente {
  const sistema = sistemaDeAsistente(plataforma);
  if (!sistema) return ASISTENTE_OCULTO;
  const cola = forzar ? catalogoDe(sistema) : permisosPendientes(sistema, g);
  if (!cola.length) return ASISTENTE_OCULTO;
  return { fase: "presentacion", sistema, cola, indice: 0, esperando: null, resultados: {} };
}

export function permisoActual(e: EstadoAsistente): DefPermiso | null {
  return e.indice < e.cola.length ? e.cola[e.indice] : null;
}

function avanzar(e: EstadoAsistente, resultados: EstadoAsistente["resultados"]): EstadoAsistente {
  const indice = e.indice + 1;
  return indice >= e.cola.length ? { ...e, indice, esperando: null, resultados, fase: "resumen" } : { ...e, indice, esperando: null, resultados, fase: "pidiendo" };
}

export function reducirAsistente(e: EstadoAsistente, ev: EventoAsistente): EstadoAsistente {
  switch (ev.t) {
    case "empezar":
      return e.fase === "presentacion" ? { ...e, fase: "pidiendo" } : e;
    case "pedir": {
      // Un solo aviso del sistema a la vez: mientras haya uno sin contestar, no se pide otro.
      if (e.fase !== "pidiendo" || e.esperando) return e;
      const d = permisoActual(e);
      return d ? { ...e, esperando: d.id } : e;
    }
    case "resultado": {
      // Solo vale el resultado del permiso que se pidió.
      if (e.fase !== "pidiendo" || e.esperando !== ev.id) return e;
      return avanzar(e, { ...e.resultados, [ev.id]: ev.r });
    }
    case "omitir": {
      // No se omite mientras el sistema espera respuesta (la respuesta llegará y se registra).
      if (e.fase !== "pidiendo" || e.esperando) return e;
      const d = permisoActual(e);
      return d ? avanzar(e, { ...e.resultados, [d.id]: "omitido" }) : e;
    }
    case "omitir-todo": {
      if (e.fase === "oculto" || e.fase === "resumen" || e.esperando) return e;
      const resultados = { ...e.resultados };
      for (const d of e.cola.slice(e.indice)) resultados[d.id] = "omitido";
      return { ...e, indice: e.cola.length, resultados, fase: "resumen" };
    }
    case "cerrar":
      return e.esperando ? e : { ...e, fase: "oculto" };
  }
}

/** Lo que se guarda al cerrar: todo lo preguntado (aunque se omitiera) cuenta como visto. */
export function guardadoTras(g: GuardadoPermisos, e: EstadoAsistente): GuardadoPermisos {
  const vistos = new Set<IdPermiso>(g.vistos);
  const resultados = { ...g.resultados };
  for (const d of e.cola) {
    const r = e.resultados[d.id];
    if (r) {
      vistos.add(d.id);
      resultados[d.id] = r;
    }
  }
  return { version: VERSION_ASISTENTE, vistos: Array.from(vistos), resultados };
}

/** Frase corta del resultado para la lista del resumen. */
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
