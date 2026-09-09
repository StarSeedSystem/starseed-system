/**
 * StarSeed OS — Salas sincronizables · FUSIÓN DE CAMBIOS CONCURRENTES (Ola 307).
 * ============================================================================
 * Dos personas moviendo el mismo widget a la vez es el caso NORMAL, no el raro.
 * Sin una regla de fusión gana quien guarde el último y la otra ve desaparecer
 * su trabajo. Aquí vive esa regla, y es DETERMINISTA: todas las neuronas llegan
 * al mismo resultado fusionen en el orden que fusionen, o la sala se parte en
 * dos realidades.
 *
 *   1. gana el `actualizadoEn` mayor;
 *   2. si empatan, gana el `porDispositivo` menor alfabéticamente;
 *   3. si aun así empatan, gana la LÁPIDA (`borrado`), para que un mismo
 *      dispositivo que emite edición y borrado a la vez no divida la sala.
 *
 * El borrado es LÁPIDA, nunca borrado físico: si el elemento desapareciera del
 * mapa, la siguiente fusión con un vecino que aún lo tuviera lo resucitaría.
 * Los ecos del propio dispositivo (lo que emitimos y nos vuelve) se ignoran,
 * igual que hace el anti-eco por `deviceId` de `src/lib/sync/realtime-sync.ts`.
 *
 * Módulo PURO: sin red, sin disco, sin reloj. La prioridad que calcula alimenta
 * la cola P0-P3 de la malla (`src/ai/astraura/mesh/sync.ts`) para degradar con
 * honestidad cuando solo queda LoRa.
 */

/** Un elemento de la sala: widget, trazo de pizarra, cursor, nota… */
export interface ElementoSala {
  id: string;
  tipo: string;
  datos: Record<string, unknown>;
  /** Marca de tiempo (ms) de la última edición conocida. */
  actualizadoEn: number;
  /** Dispositivo que hizo esa edición (desempate determinista y anti-eco). */
  porDispositivo: string;
  /** Lápida: el elemento sigue en el mapa, pero está borrado. */
  borrado?: boolean;
}

/** Estado completo de una sala (2D, 3D, AR o VR: aquí solo son elementos). */
export interface EstadoSala {
  salaId: string;
  elementos: Record<string, ElementoSala>;
  /** Reloj lógico de la sala: crece, nunca retrocede. */
  reloj: number;
}

/** Techo de elementos vivos: una sala no puede tumbar el móvil más modesto. */
export const LIMITE_ELEMENTOS = 5000;

/** Cuenta los elementos vivos (una lápida ya no ocupa sitio en la escena). */
function contarVivos(e: EstadoSala): number {
  let n = 0;
  for (const el of Object.values(e.elementos ?? {})) if (!el.borrado) n += 1;
  return n;
}

/** ¿La sala pasó del techo de elementos vivos (las lápidas no cuentan)? */
export function excedeLimite(e: EstadoSala): boolean {
  return contarVivos(e) > LIMITE_ELEMENTOS;
}

/**
 * Normaliza el tipo: minúsculas, sin acentos y sin el sufijo tras «:» o «/»
 * («cursor:ana» y «Cursor» son el mismo tipo para la cola de la malla).
 */
function normalizarTipo(tipo: string): string {
  const base = (tipo ?? "").split(/[:/]/)[0]?.trim().toLowerCase() ?? "";
  return base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** P0 · lo más urgente y lo más desechable: si se pierde, no pasa nada. */
const TIPOS_EFIMEROS: readonly string[] = [
  "presencia", "cursor", "puntero", "seleccion", "foco", "mano", "voz", "mirada", "avatar",
];

/** P2 · estado de la escena: se puede recalcular o volver a colocar. */
const TIPOS_ESTADO: readonly string[] = [
  "posicion", "tamano", "camara", "vista", "zoom", "capa", "escena", "apariencia", "tema", "layout",
];

/** P3 · masivo: solo viaja por la malla bajo orden explícita. */
const TIPOS_MASIVOS: readonly string[] = [
  "historial", "adjunto", "miniatura", "catalogo", "manifiesto", "grabacion", "modelo3d", "textura",
];

/**
 * Prioridad P0-P3 para la cola de la malla (`mesh/sync.ts`).
 *
 *   P0 presencia y cursores → urgentísimos y desechables;
 *   P1 CONTENIDO CREADO     → lo que NUNCA se puede perder (y sus lápidas);
 *   P2 estado de la escena  → posiciones, cámara, apariencia;
 *   P3 masivo               → historial, adjuntos, texturas.
 *
 * Ante la duda (tipo desconocido) se asume contenido: nunca se pierde.
 */
export function prioridadDeElemento(e: ElementoSala): 0 | 1 | 2 | 3 {
  const tipo = normalizarTipo(e.tipo);
  if (TIPOS_EFIMEROS.includes(tipo)) return 0;
  // Una lápida de algo que no es efímero ES contenido: si se pierde por el
  // camino, el elemento borrado resucita en la siguiente fusión.
  if (e.borrado) return 1;
  if (TIPOS_MASIVOS.includes(tipo)) return 3;
  if (TIPOS_ESTADO.includes(tipo)) return 2;
  return 1;
}

/**
 * ¿Gana `a` sobre `b`? Orden total y determinista (misma respuesta en todas
 * las neuronas): tiempo, luego dispositivo alfabético, luego la lápida.
 */
function ganaSobre(a: ElementoSala, b: ElementoSala): boolean {
  if (a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn > b.actualizadoEn;
  if (a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
  return Boolean(a.borrado) && !b.borrado;
}

/** Dos versiones del mismo elemento que hay que fusionar de verdad. */
function sonDistintas(a: ElementoSala, b: ElementoSala): boolean {
  return (
    a.actualizadoEn !== b.actualizadoEn ||
    a.porDispositivo !== b.porDispositivo ||
    Boolean(a.borrado) !== Boolean(b.borrado)
  );
}

/**
 * Fusiona dos estados de la misma sala sin que nadie pierda su trabajo.
 *
 * Es SIMÉTRICA para todo lo que no venga de `miDispositivo`: fusionar A con B
 * y B con A da exactamente el mismo mapa de elementos. Devuelve además los ids
 * en conflicto (dos dispositivos distintos tocaron lo mismo) para poder avisar
 * con honestidad en la UI en vez de tragarse el trabajo de alguien.
 */
export function fusionarEstados(
  local: EstadoSala,
  remoto: EstadoSala,
  miDispositivo: string,
): { resultado: EstadoSala; conflictos: string[] } {
  // Dos salas distintas no se fusionan JAMÁS: sería mezclar dos realidades.
  if (local.salaId !== remoto.salaId) {
    return { resultado: local, conflictos: ["sala-distinta"] };
  }

  const elementos: Record<string, ElementoSala> = { ...(local.elementos ?? {}) };
  const conflictos: string[] = [];

  for (const [id, entrante] of Object.entries(remoto.elementos ?? {})) {
    // Anti-eco: lo que emitimos nosotros y nos vuelve de rebote no se aplica
    // (nuestra copia local siempre es igual de nueva o más nueva).
    if (entrante.porDispositivo === miDispositivo) continue;

    const actual = elementos[id];
    if (!actual) {
      elementos[id] = entrante; // incluidas las lápidas: nunca se tiran.
      continue;
    }
    if (!sonDistintas(actual, entrante)) continue;

    // Dos dispositivos distintos tocaron el mismo elemento: hay que avisar.
    if (actual.porDispositivo !== entrante.porDispositivo) conflictos.push(id);
    if (ganaSobre(entrante, actual)) elementos[id] = entrante;
  }

  const resultado: EstadoSala = {
    salaId: local.salaId,
    elementos,
    reloj: Math.max(local.reloj ?? 0, remoto.reloj ?? 0),
  };
  // Degradación honesta: si la sala pasó del techo, se dice, no se trunca a
  // escondidas (truncar sería borrar trabajo de alguien sin avisar).
  if (excedeLimite(resultado)) conflictos.push("limite-excedido");
  return { resultado, conflictos: conflictos.sort() };
}

/** «1 cambio» / «12 cambios». */
function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/** Antigüedad en palabras, sin tocar el reloj del sistema. */
function describirAntiguedad(ms: number): string {
  if (ms < 45_000) return "hace unos segundos";
  const minutos = Math.round(ms / 60_000);
  if (minutos < 60) return `hace ${plural(Math.max(1, minutos), "minuto", "minutos")}`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${plural(horas, "hora", "horas")}`;
  return `hace ${plural(Math.round(horas / 24), "día", "días")}`;
}

/**
 * Frase honesta en español sobre la divergencia entre lo tuyo y lo del vecino
 * («llevas 12 cambios sin sincronizar desde hace 4 minutos»).
 *
 * No consulta el reloj: la referencia temporal es la marca más nueva que
 * conocen los dos estados, así que la frase es la misma en cualquier máquina.
 * Los elementos efímeros (presencia, cursores) no cuentan: son desechables y
 * hincharían el aviso con ruido.
 */
export function resumirDivergencia(local: EstadoSala, remoto: EstadoSala): string {
  if (local.salaId !== remoto.salaId) {
    return `Estas dos salas no son la misma («${local.salaId}» y «${remoto.salaId}»): no hay nada que comparar.`;
  }
  const mios = local.elementos ?? {};
  const suyos = remoto.elementos ?? {};
  let ahora = 0;
  for (const el of [...Object.values(mios), ...Object.values(suyos)]) {
    if (el.actualizadoEn > ahora) ahora = el.actualizadoEn;
  }

  let pendientes = 0;
  let masAntiguo = Number.POSITIVE_INFINITY;
  for (const [id, mio] of Object.entries(mios)) {
    if (prioridadDeElemento(mio) === 0) continue;
    const suyo = suyos[id];
    if (suyo && !ganaSobre(mio, suyo)) continue;
    pendientes += 1;
    if (mio.actualizadoEn < masAntiguo) masAntiguo = mio.actualizadoEn;
  }

  let entrantes = 0;
  for (const [id, suyo] of Object.entries(suyos)) {
    if (prioridadDeElemento(suyo) === 0) continue;
    const mio = mios[id];
    if (mio && !ganaSobre(suyo, mio)) continue;
    entrantes += 1;
  }

  const aviso = entrantes > 0
    ? ` Además hay ${plural(entrantes, "cambio", "cambios")} de otras personas por recibir.`
    : "";
  if (pendientes === 0) {
    return entrantes === 0
      ? "Todo sincronizado: no tienes cambios pendientes en esta sala."
      : `Lo tuyo está sincronizado.${aviso}`;
  }
  const edad = describirAntiguedad(Math.max(0, ahora - masAntiguo));
  return `Llevas ${plural(pendientes, "cambio", "cambios")} sin sincronizar desde ${edad}.${aviso}`;
}
