/**
 * Guía de introducción · la puerta común para abrirla y las reglas del modo invitado
 * (§5 de `architecture/guias-introduccion.md`).
 * ═══════════════════════════════════════════════════════════════════════════
 * «Una sola puerta»: quien quiera abrir la guía (la pantalla de acceso, la bienvenida, Ajustes,
 * cada aviso «Inicia sesión para…», un botón suelto) llama a `abrirGuia({desde, temaInicial?})`,
 * que lanza el evento de siempre (`starseed:open-guide`, el que escucha `aurora-guide.tsx`) con de
 * dónde se abre y, si se quiere, el tema por el que empezar.
 *
 * (Ola 1025U · GUIA1025U) La guía que abre este evento recorre el catálogo único de pasos
 * (`guia-completa.ts`, el mismo que la introducción de la ventana de acceso): `temaInicial` es el id de
 * cualquiera de esos pasos y `desde` decide qué hace el final de la guía sin cuenta (en `/login` y
 * `/bienvenida` el formulario ya está detrás; desde cualquier otro sitio se abre la ventana de acceso).
 * Sin `temaInicial`, la guía retoma por donde se quedó (`guia-progreso.ts`) o empieza desde el principio.
 *
 * Las reglas del modo invitado (§5) también viven aquí, y en un solo sitio para que ninguna
 * pantalla las decida por su cuenta: cómo se recorre sin cuenta (`modoGuia`, `accionesDelPaso`),
 * por encima de qué ventanas de acceso se pinta (`zGuia`, `VENTANAS_ACCESO`, `Z_GUIA_SOBRE_ACCESO`)
 * y cómo se une lo visto en el aparato a la cuenta cuando esa llegue (`unirVistas`).
 *
 * Módulo PURO: sin React ni importaciones de ningún tipo (lo comprueba la prueba leyendo este
 * archivo); el destino del evento es inyectable para probarlo. Sin `window` (servidor, Node,
 * script fuera del navegador), `abrirGuia` no hace nada y no lanza: la guía nunca queda en bucle.
 */

/** El evento que escucha la guía (mismo nombre que `OPEN_GUIDE_EVENT` de `aurora-guide.tsx`). */
export const EVENTO_ABRIR_GUIA = "starseed:open-guide";

/** Desde dónde se puede abrir la guía. */
export const ORIGENES_GUIA = ["login", "bienvenida", "ajustes", "aviso", "boton"] as const;
export type OrigenGuia = (typeof ORIGENES_GUIA)[number];

/** Las ventanas de acceso que cubren la pantalla (§5: AuthGate de entrada, la bienvenida y el aviso de retomar sesión). */
export const VENTANAS_ACCESO: readonly OrigenGuia[] = ["login", "bienvenida", "aviso"];

/** Lo que viaja en el evento: de dónde se abre y, opcionalmente, el id del paso por el que empezar. */
export interface PeticionGuia {
  desde: OrigenGuia;
  temaInicial?: string;
}

/**
 * Abre la guía. Devuelve `true` si el evento salió y `false` si no había dónde lanzarlo (servidor)
 * o el navegador lo impidió. Nunca lanza.
 */
export function abrirGuia(peticion: PeticionGuia, destino?: EventTarget | null): boolean {
  const objetivo = destino ?? (typeof window === "undefined" ? null : window);
  if (!objetivo || typeof CustomEvent === "undefined") return false;
  const detalle: PeticionGuia = { desde: peticion.desde };
  if (peticion.temaInicial) detalle.temaInicial = peticion.temaInicial;
  try {
    objetivo.dispatchEvent(new CustomEvent<PeticionGuia>(EVENTO_ABRIR_GUIA, { detail: detalle }));
    return true;
  } catch {
    return false;
  }
}

/* ─────────── Lo que pide la guía al terminar sin cuenta (solo en /login y /bienvenida) ─────────── */

/** El evento con el que la guía le dice a la ventana de acceso de la PÁGINA que vaya al formulario. */
export const EVENTO_ACCION_GUIA = "starseed:guia-accion";

/** Qué pidió quien terminó la guía sin cuenta. */
export type AccionGuia = "crear-cuenta" | "entrar";

/**
 * La guía (que va por encima de la página de acceso) pide ir al formulario en la pestaña que toque.
 * Devuelve `true` si el evento salió. Nunca lanza.
 */
export function pedirAccesoDesdeGuia(accion: AccionGuia, destino?: EventTarget | null): boolean {
  const objetivo = destino ?? (typeof window === "undefined" ? null : window);
  if (!objetivo || typeof CustomEvent === "undefined") return false;
  try {
    objetivo.dispatchEvent(new CustomEvent<{ accion: AccionGuia }>(EVENTO_ACCION_GUIA, { detail: { accion } }));
    return true;
  } catch {
    return false;
  }
}

/* ─────────── Modo de la guía: con cuenta o invitado (§5) ─────────── */

/** Cómo se recorre la guía: con una cuenta propia o como invitado (sin cuenta, en el aparato). */
export type ModoGuia = "invitado" | "cuenta";

/** Lo que se ofrece en cada paso según el modo (§5: en invitado, nada de acciones reales). */
export interface AccionesPaso {
  /** «Ir/mostrar»: acompañar a la ruta real del paso (anda sin cuenta). */
  puedeIr: boolean;
  /** «Hazlo por mí»: disparar la acción real de la interfaz (toca al sistema). */
  puedeHazloPorMi: boolean;
  /** Etiqueta que sustituye a esas acciones; con cuenta no se enseña (queda `null`). */
  etiqueta: string | null;
}

/** La etiqueta honesta donde con cuenta habría «Ir»: detrás está la pantalla de acceso (§5). */
export const ETIQUETA_SOLO_CUENTA = "Disponible al entrar";

/** Elevación de la guía de Aurora HOY (`aurora-guide.tsx` la pinta en `z-[95]`). */
export const Z_GUIA_HOY = 95;

/** La capa que le hace sitio por encima de AuthGate (z 200) y la bienvenida (z 210), con margen. */
export const Z_GUIA_SOBRE_ACCESO = 240;

/**
 * El modo que toca según si hay sesión (§6.3: `useHaySesion` también devuelve `null` cuando aún
 * no se sabe; mientras no se sepa, no se le quita nada a la guía): solo un «no» claro es invitado.
 */
export function modoGuia(haySesion: boolean | null | undefined): ModoGuia {
  return haySesion === false ? "invitado" : "cuenta";
}

/** Con cuenta, la guía de siempre («Ir» y «Hazlo por mí»); en invitado, ninguna de las dos: solo la etiqueta. */
export function accionesDelPaso(modo: ModoGuia): AccionesPaso {
  if (modo === "cuenta") {
    return { puedeIr: true, puedeHazloPorMi: true, etiqueta: null };
  }
  return { puedeIr: false, puedeHazloPorMi: false, etiqueta: ETIQUETA_SOLO_CUENTA };
}

/**
 * A qué altura se pinta la guía (§5): por encima de cualquier ventana de acceso si se abre desde
 * una de ellas, o sin sesión conocida (el invitado está más tapado que nadie); en el resto de los
 * casos, la de hoy (95), para no tapar de más a quien tiene cuenta y la abrió a mano o desde Ajustes.
 */
export function zGuia(desde: OrigenGuia, haySesion: boolean | null | undefined): number {
  const esVentanaAcceso = VENTANAS_ACCESO.includes(desde);
  return esVentanaAcceso || !haySesion ? Z_GUIA_SOBRE_ACCESO : Z_GUIA_HOY;
}

/**
 * Une lo visto como invitado (lo recorrido en el aparato) a la marca de la cuenta, sin perder nada
 * y sin repetir (§5): primero lo que la cuenta ya sabía (sincronizado entre medios) y detrás, nuevo,
 * lo local que no estuviera. Una vista vacía o con espacios se descarta, no rompe. Idempotente:
 * unir dos veces lo mismo no repite claves ni reordena lo que ya estaba.
 */
export function unirVistas(
  local: readonly string[] | null | undefined,
  cuenta: readonly string[] | null | undefined,
): string[] {
  const unidas: string[] = [];
  for (const vista of [...(cuenta ?? []), ...(local ?? [])]) {
    const clave = typeof vista === "string" ? vista.trim() : "";
    if (clave && !unidas.includes(clave)) unidas.push(clave);
  }
  return unidas;
}
