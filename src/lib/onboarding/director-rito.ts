/**
 * Director del rito de bienvenida (Ola 247 · 2026-09-05).
 *
 * POR QUÉ: hasta ahora el rito encadenaba VENTANAS con marcas sueltas de
 * sessionStorage (`starseed.recien.registrado`, `starseed.sistemas.launch`,
 * `starseed.guia.tras.perfil`, `starseed.guide.launch`…) y NAVEGACIONES DURAS
 * (`window.location.assign`) entre ellas. Varios porteros globales reaccionaban
 * al mismo cambio de sesión y el resultado era: doble petición de inicio de
 * sesión, recargas entre ventanas, ventanas fuera de orden y guías duplicadas.
 *
 * Este módulo es UNA SOLA máquina de estados, sin React y sin Next.js, que
 * puede probarse en Node: registro → bienvenida → sistemas → perfil → guía →
 * hecho. Cada ventana del rito solo pregunta «¿es mi turno?» («esMiTurno») y
 * avisa al terminar («terminarEtapa»). Una ventana que se cierra tarde ya no
 * puede romper el orden: «terminarEtapa» solo avanza si la etapa que cierra
 * ES la actual.
 *
 * REGLA DEL ÁREA: el rito nunca deja al usuario en bucle — el estado duradero
 * de «completado / pospuesto» vive en la tabla onboarding_state (capa
 * `onboarding.ts`); aquí solo se coordina la SECUENCIA de ventanas de ESTA
 * sesión (sessionStorage se borra solo al cerrar la pestaña).
 *
 * Todas las lecturas/escrituras de storage van en try/catch: en modo privado
 * estricto o con `window` ausente (SSR, tests) el módulo devuelve valores
 * neutros en lugar de lanzar.
 */

/** Etapas del rito, en orden. «registro» es conceptual (lo hace /login). */
export const ETAPAS = ["registro", "bienvenida", "sistemas", "perfil", "guia", "hecho"] as const;
export type EtapaRito = (typeof ETAPAS)[number];

/** Clave de sessionStorage donde vive el estado del rito de ESTA pestaña. */
export const CLAVE_RITO = "starseed.rito.v2";

/**
 * (Ola 250 · 2026-09-06) Edad máxima de un rito en curso. Un rito abandonado
 * (el alta se quedó a medias y la sesión siguió) no debe secuestrar la sesión
 * al día siguiente: pasadas estas 6 horas, `etapaActual()` devuelve null y
 * borra el estado.
 */
export const CADUCIDAD_MS = 6 * 60 * 60 * 1000;

/**
 * Evento de ventana que anuncia cada avance de etapa. Detalle: la etapa nueva
 * y la anterior. Así las ventanas del rito reaccionan sin sondear el storage.
 */
export const EVENTO_RITO = "starseed:rito";

/** Marcas legadas que las ventanas antiguas dejaban sueltas (pre-Ola 247). */
const MARCAS_LEGADAS = {
  recienRegistrado: "starseed.recien.registrado",
  sistemasLaunch: "starseed.sistemas.launch",
  guiaPendiente: "starseed.guia.pendiente",
  guiaTrasPerfil: "starseed.guia.tras.perfil",
  guideLaunch: "starseed.guide.launch",
} as const;

interface EstadoRito {
  etapa: EtapaRito;
  /** Marca temporal (ms epoch) del último avance — diagnóstico, no lógica. */
  t: number;
}

// ── acceso seguro a storage (window ausente → valores neutros) ─────────────

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function leerEstado(): EstadoRito | null {
  try {
    const ss = storage();
    if (!ss) return null;
    const crudo = ss.getItem(CLAVE_RITO);
    if (!crudo) return null;
    const parseado = JSON.parse(crudo) as Partial<EstadoRito>;
    if (!parseado || typeof parseado.etapa !== "string") return null;
    if (!(ETAPAS as readonly string[]).includes(parseado.etapa)) return null;
    return { etapa: parseado.etapa as EtapaRito, t: typeof parseado.t === "number" ? parseado.t : 0 };
  } catch {
    return null;
  }
}

function escribirEstado(estado: EstadoRito): void {
  try {
    storage()?.setItem(CLAVE_RITO, JSON.stringify(estado));
  } catch {
    /* sin storage: el rito no persiste, pero nunca rompe la página */
  }
}

function borrarEtiqueta(clave: string): void {
  try {
    storage()?.removeItem(clave);
  } catch {
    /* ignore */
  }
}

function emitirEvento(etapa: EtapaRito | null, anterior: EtapaRito | null): void {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(EVENTO_RITO, { detail: { etapa, anterior } }));
  } catch {
    /* sin window no hay oyentes que avisar */
  }
}

// ── migración de marcas legadas ─────────────────────────────────────────────

/**
 * Si no existe `CLAVE_RITO` pero quedan marcas sueltas de la cadena antigua de
 * ventanas, deduce la etapa en la que se quedó el rito, las borra para que no
 * vuelvan a actuar y devuelve la etapa deducida (ya persistida).
 *
 * POR QUÉ: sin esta migración, una sesión a medio rito cuando se despliega el
 * director seguiría disparando dos flujos a la vez (el viejo por las marcas y
 * el nuevo por la máquina de estados).
 */
export function migrarMarcasLegadas(): EtapaRito | null {
  const ss = storage();
  if (!ss) return null;
  if (leerEstado()) return null; // ya hay rito: las marcas viejas no mandan
  try {
    const hay = (clave: string) => {
      try {
        return ss.getItem(clave) !== null;
      } catch {
        return false;
      }
    };
    let deducida: EtapaRito | null = null;
    if (hay(MARCAS_LEGADAS.guideLaunch) || hay(MARCAS_LEGADAS.guiaTrasPerfil)) {
      deducida = "guia";
    } else if (hay(MARCAS_LEGADAS.sistemasLaunch) || hay(MARCAS_LEGADAS.guiaPendiente)) {
      deducida = "sistemas";
    } else if (hay(MARCAS_LEGADAS.recienRegistrado)) {
      deducida = "bienvenida";
    }
    if (!deducida) return null;
    // Se borran TODAS las marcas, no solo la que decidió: dejar cualquiera
    // permitiría al flujo viejo abrir una ventana encima de la nueva.
    for (const clave of Object.values(MARCAS_LEGADAS)) borrarEtiqueta(clave);
    escribirEstado({ etapa: deducida, t: Date.now() });
    return deducida;
  } catch {
    return null;
  }
}

// ── máquina de estados ──────────────────────────────────────────────────────

/**
 * Etapa actual del rito, o null si no hay rito en curso.
 * Antes de leer intenta migrar marcas legadas: así cualquier punto de entrada
 * (portero, ventana, guía) ve el mismo estado sin importar el orden de carga.
 */
export function etapaActual(): EtapaRito | null {
  migrarMarcasLegadas();
  const estado = leerEstado();
  if (!estado) return null;
  // (Ola 250 · 2026-09-06) Rito viejo caduca: si el último avance tiene más de
  // CADUCIDAD_MS (6 h), el rito se da por abandonado y se borra — así un alta
  // a medias de ayer no reabre la cadena de ventanas ni secuestra el escritorio
  // en la visita de hoy. REGLA DEL ÁREA: el rito nunca deja al usuario en bucle.
  if (Date.now() - estado.t > CADUCIDAD_MS) {
    abandonarRito();
    return null;
  }
  return estado.etapa ?? null;
}

/**
 * Arranca el rito en la etapa «bienvenida». También escribe la marca legada
 * `starseed.recien.registrado`: mientras las ventanas viejas convivan con el
 * director, ambas deben saber que acaba de producirse un alta (el portero la
 * limpia al terminar el onboarding, ver «saveOnboarding»).
 */
export function iniciarRito(): void {
  escribirEstado({ etapa: "bienvenida", t: Date.now() });
  try {
    storage()?.setItem(MARCAS_LEGADAS.recienRegistrado, "1");
  } catch {
    /* sin storage */
  }
  emitirEvento("bienvenida", null);
}

/**
 * Cierra la etapa indicada. Solo avanza si `etapa` ES la etapa actual; si no,
 * devuelve la actual sin tocar nada. POR QUÉ: una ventana que se cierra tarde
 * (doble evento, cierre asíncrono) no debe saltarse etapas ni desordenar el
 * rito — antes esto ocurría porque cada ventana ponía su marca sin mirar el
 * estado de las demás.
 */
export function terminarEtapa(etapa: EtapaRito): EtapaRito | null {
  const actual = etapaActual();
  if (actual !== etapa) return actual;
  const indice = ETAPAS.indexOf(actual);
  const siguiente: EtapaRito | null = indice >= 0 && indice < ETAPAS.length - 1 ? ETAPAS[indice + 1] : null;
  if (!siguiente) return actual;
  escribirEstado({ etapa: siguiente, t: Date.now() });
  emitirEvento(siguiente, actual);
  return siguiente;
}

/** ¿Le toca a esta etapa mostrar su ventana ahora? */
export function esMiTurno(etapa: EtapaRito): boolean {
  return etapaActual() === etapa;
}

/**
 * Suscripción a los avances del rito. Escucha EVENTO_RITO en esta pestaña y el
 * evento `storage` (cambios en OTRAS pestañas de la misma sesión no aplican a
 * sessionStorage, pero se escucha igualmente por si el rito pasa a compartir
 * estado vía localStorage: el contrato ya queda listo).
 * Devuelve la función de desuscripción.
 */
export function suscribirRito(cb: (etapa: EtapaRito | null) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const alEvento = (ev: Event) => {
    const detalle = (ev as CustomEvent<{ etapa?: EtapaRito | null }>).detail;
    cb(detalle && "etapa" in detalle ? (detalle.etapa ?? null) : etapaActual());
  };
  const alStorage = (ev: StorageEvent) => {
    if (ev.key === CLAVE_RITO || ev.key === null) cb(etapaActual());
  };
  try {
    window.addEventListener(EVENTO_RITO, alEvento);
    window.addEventListener("storage", alStorage);
  } catch {
    /* sin addEventListener: suscripción neutra */
  }
  return () => {
    try {
      window.removeEventListener(EVENTO_RITO, alEvento);
      window.removeEventListener("storage", alStorage);
    } catch {
      /* ignore */
    }
  };
}

/**
 * Abandona el rito por completo: borra la clave de estado y TODAS las marcas
 * legadas. Se usa al completar, al posponer con «saltar por ahora» o al
 * detectarse una cuenta ya existente (REGLA DEL ÁREA: nunca dejar al usuario
 * en bucle).
 */
export function abandonarRito(): void {
  try {
    storage()?.removeItem(CLAVE_RITO);
  } catch {
    /* ignore */
  }
  for (const clave of Object.values(MARCAS_LEGADAS)) borrarEtiqueta(clave);
  emitirEvento(null, null);
}

// ── navegación suave ────────────────────────────────────────────────────────

/**
 * Navega con el router del App Router y, como ÚLTIMO RECURSO, con
 * `window.location.assign`.
 *
 * POR QUÉ la reserva dura: en este repo se verificó que un modal abierto
 * encima puede cancelar `router.push` EN SILENCIO y la navegación se perdía
 * sin error visible (por eso el rito usaba recargas por todas partes). Con la
 * espera de `esperaMs` solo se recarga cuando el push realmente no llegó a
 * cambiar la ruta — es decir, cuando no queda otro remedio.
 */
export function navegarSuave(
  router: { push: (p: string) => void },
  path: string,
  esperaMs = 1500,
): void {
  if (typeof window === "undefined") return; // SSR: no hay dónde navegar
  try {
    if (window.location.pathname === path) return; // ya estamos: no hacer ruido
    router.push(path);
    window.setTimeout(() => {
      try {
        if (window.location.pathname !== path) window.location.assign(path);
      } catch {
        /* si ni assign existe, no hay más que hacer */
      }
    }, esperaMs);
  } catch {
    /* navegación imposible en este entorno: degradar sin error */
  }
}
