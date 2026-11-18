/**
 * malla-registro — UNA línea de registro por evento que viaja por la malla (AUD1117 · F7).
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * La auditoría del 17-11 pidió dejar rastro en el Registro del enlace (`enlaces.log`) de:
 *   archivo · enviado|recibido|hash-ok id=<8> via=<medio> bytes=<n>
 *   mensaje-malla · enviado|entregado via=<medio>
 * Sale por el mismo emisor que los módulos vecinos (`archivos-diagnostico.ts`): el evento llega al
 * `RegistroEnlaces` de `registro-enlace-ble.ts` y la app nativa lo copia a `enlaces.log`.
 * Regla de Alex: una línea NUNCA lleva contenido, nombres de personas, coordenadas ni claves: solo
 * el id recortado a 8, el medio como token y el número de bytes. El núcleo es PURO; el volcado, cliente.
 */

export type EventoArchivoMalla = "enviado" | "recibido" | "hash-ok";
export type EventoMensajeMalla = "enviado" | "entregado";
export type TipoMallaRegistro = "archivo" | "mensaje-malla";

export interface NotaMalla {
  tipo: TipoMallaRegistro;
  evento: string;
  detalle: string;
}

export type SumideroMalla = (nota: NotaMalla) => void;

let sumidero: SumideroMalla | null = null;

/** Pruebas (o un panel): recibe cada nota además del registro. */
export function fijarSumideroMalla(f: SumideroMalla | null): void {
  sumidero = f;
}

/** El id de la transferencia o del mensaje, saneado y recortado a 8. Vacío si no queda nada. Puro. */
export function idCortoMalla(id: string): string {
  return String(id ?? "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 8);
}

/** El medio como un token corto (letras, cifras, «_», «-»); vacío si no se sabe. Puro. */
export function medioSeguroMalla(via: string | null | undefined): string {
  return String(via ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

/** «enviado id=arch_1a2 via=local bytes=1024». Sin «via=» si el medio no se midió. Puro. */
export function lineaEventoArchivoMalla(evento: EventoArchivoMalla, id: string, via: string | null | undefined, bytes: number): string {
  const id8 = idCortoMalla(id);
  const medio = medioSeguroMalla(via);
  const n = typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0 ? Math.floor(bytes) : -1;
  const partes = [evento, `id=${id8}`];
  if (medio) partes.push(`via=${medio}`);
  partes.push(`bytes=${n}`);
  return partes.join(" ");
}

/** «enviado via=local». Sin «via=» si el medio no se sabe (y entonces la línea no sale). Puro. */
export function lineaEventoMensajeMalla(evento: EventoMensajeMalla, via: string | null | undefined): string {
  return `${evento} via=${medioSeguroMalla(via)}`;
}

export interface EmisorMalla {
  /** Un evento de archivo (UNA vez por evento y transferencia). */
  archivo(evento: EventoArchivoMalla, id: string, via: string | null | undefined, bytes: number): void;
  /** Un evento de mensaje de la malla (UNA vez por evento y mensaje). */
  mensaje(evento: EventoMensajeMalla, id: string, via: string | null | undefined): void;
}

/** Tope de la memoria del emisor (claves ya emitidas): más que suficientes transferencias en vuelo. */
const TOPE_CLAVES = 512;

/**
 * crearEmisorMalla — emite cada nota UNA vez por (tipo, evento, id): la misma llamada repetida
 * («fin» reenviado, un latido, un reintento) no produce una segunda línea. Puro.
 */
export function crearEmisorMalla(escribir: (nota: NotaMalla) => void, tope = TOPE_CLAVES): EmisorMalla {
  const vistas = new Set<string>();
  const primera = (clave: string): boolean => {
    if (vistas.has(clave)) return false;
    if (vistas.size >= Math.max(1, tope)) vistas.delete(vistas.keys().next().value as string);
    vistas.add(clave);
    return true;
  };
  return {
    archivo(evento, id, via, bytes) {
      const id8 = idCortoMalla(id);
      if (!id8 || !(typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0)) return;
      if (!primera(`archivo:${evento}:${id8}`)) return;
      escribir({ tipo: "archivo", evento, detalle: lineaEventoArchivoMalla(evento, id8, via, bytes) });
    },
    mensaje(evento, id, via) {
      const medio = medioSeguroMalla(via);
      if (!medio) return;
      if (!primera(`mensaje-malla:${evento}:${idCortoMalla(id)}`)) return;
      escribir({ tipo: "mensaje-malla", evento, detalle: lineaEventoMensajeMalla(evento, medio) });
    },
  };
}

function volcar(nota: NotaMalla): void {
  try {
    sumidero?.(nota);
  } catch {
    /* el sumidero de prueba no tumba la malla */
  }
  if (typeof window === "undefined") return;
  void import("@/lib/malla/bluetooth-directo-motor")
    .then((m) => {
      const red = m.bluetoothDirectoActivo();
      if (!red) return;
      red.registro().anotar(nota.tipo, null, nota.detalle, null);
    })
    .catch(() => undefined);
}

let emisor: EmisorMalla | null = null;

/** El emisor del proceso (uno solo, con memoria compartida entre archivos y mensajes). */
export function emisorMalla(): EmisorMalla {
  return (emisor ??= crearEmisorMalla(volcar));
}
