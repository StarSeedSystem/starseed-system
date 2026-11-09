/**
 * registro-enlace-ble — el «Registro del enlace» del Bluetooth directo (BLE1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red ni DOM). Caso real del 08-11: el enlace se cayó a mitad de un vídeo y nadie
 * supo por qué. Aquí se apunta, por neurona, cada cosa que le pasa al enlace —ligado, cerrado y por
 * qué, caída por falta de acuse, rechazo, cifrado, reconexión, trama que no cabe— en un anillo de
 * memoria (200 eventos por neurona, 400 en total) que el panel «Bluetooth directo» enseña y se puede
 * exportar como texto. La app nativa de escritorio lo copia además a
 * `~/Library/Logs/app.starseed.os/enlaces.log` (rotado, ≤ 1 MB) con `ble_registro_anexar`.
 * Contrato: `architecture/bluetooth-directo.md` §10.
 */

export type TipoEventoEnlace =
  | "abierto"
  | "ligado"
  | "reconectado"
  | "cerrado"
  | "perdido"
  | "caida"
  | "rechazo"
  | "cifrado"
  | "envio-fallido"
  | "hola"
  | "cola-perdida"
  | "reintento"
  /** (BLE1108C) El canal de archivos no esperó más a «listo para enviar» y mandó igual. */
  | "listo-tarde"
  /** (LLA1108E) Hitos de una llamada: `senal-enviada|senal-recibida|contestada|medio=webrtc|enlace-datos|fallo`. */
  | "llamada";

export interface EventoEnlaceBle {
  seq: number;
  /** Epoch ms. */
  en: number;
  tipo: TipoEventoEnlace;
  /** Neurona a la que se refiere (null: aún sin saber de quién es el enlace). */
  neurona: string | null;
  /** «b3». */
  enlace: string | null;
  detalle: string;
}

export const MAX_EVENTOS_POR_NEURONA = 200;
export const MAX_EVENTOS_TOTAL = 400;
const SIN_NEURONA = "-";

export interface RegistroEnlaces {
  anotar(tipo: TipoEventoEnlace, neurona: string | null, detalle: string, enlace?: string | null): EventoEnlaceBle;
  /** Eventos de una neurona (o todos), del más viejo al más nuevo. */
  lista(neurona?: string | null): EventoEnlaceBle[];
  /** El mismo registro como texto, una línea por evento (para exportar). */
  exportar(neurona?: string | null): string;
  suscribir(cb: () => void): () => void;
  limpiar(): void;
}

function limpio(s: string, max: number): string {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, max);
}

/** «2026-11-08T12:30:05.123Z · ligado · b3 · neurona e0b9faf2 · detalle». Puro. */
export function lineaEvento(e: EventoEnlaceBle): string {
  const partes = [new Date(e.en).toISOString(), e.tipo];
  if (e.enlace) partes.push(e.enlace);
  if (e.neurona) partes.push(`neurona ${e.neurona}`);
  if (e.detalle) partes.push(e.detalle);
  return partes.join(" · ");
}

export function crearRegistroEnlaces(opts: { ahora?: () => number; alAnotar?: (linea: string, e: EventoEnlaceBle) => void } = {}): RegistroEnlaces {
  const ahora = opts.ahora ?? (() => Date.now());
  const porNeurona = new Map<string, EventoEnlaceBle[]>();
  const oyentes = new Set<() => void>();
  let seq = 0;
  let total = 0;

  const avisar = () => {
    for (const f of Array.from(oyentes)) {
      try {
        f();
      } catch {
        /* un oyente roto no tumba a los demás */
      }
    }
  };

  const recortarTotal = () => {
    while (total > MAX_EVENTOS_TOTAL) {
      // Cae el evento más viejo de cualquier neurona.
      let victima: string | null = null;
      let menor = Infinity;
      for (const [k, l] of porNeurona) {
        if (l.length && l[0].seq < menor) {
          menor = l[0].seq;
          victima = k;
        }
      }
      if (victima === null) break;
      porNeurona.get(victima)?.shift();
      total--;
    }
  };

  const todos = (): EventoEnlaceBle[] => Array.from(porNeurona.values()).flat().sort((a, b) => a.seq - b.seq);
  const de = (neurona?: string | null): EventoEnlaceBle[] => (neurona === undefined ? todos() : [...(porNeurona.get(neurona ?? SIN_NEURONA) ?? [])]);

  return {
    anotar(tipo, neurona, detalle, enlace) {
      const e: EventoEnlaceBle = {
        seq: ++seq,
        en: ahora(),
        tipo,
        neurona: neurona ? limpio(neurona, 80) : null,
        enlace: enlace ? limpio(enlace, 40) : null,
        detalle: limpio(detalle, 300),
      };
      const k = e.neurona ?? SIN_NEURONA;
      const l = porNeurona.get(k) ?? [];
      l.push(e);
      total++;
      if (l.length > MAX_EVENTOS_POR_NEURONA) {
        l.shift();
        total--;
      }
      porNeurona.set(k, l);
      recortarTotal();
      try {
        opts.alAnotar?.(lineaEvento(e), e);
      } catch {
        /* el volcado a archivo no tumba al enlace */
      }
      avisar();
      return e;
    },
    lista: de,
    exportar: (neurona) => de(neurona).map(lineaEvento).join("\n"),
    suscribir(cb) {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
    limpiar() {
      porNeurona.clear();
      total = 0;
      avisar();
    },
  };
}

/** Un evento de la app nativa (`RegistroBle` de `ble.rs`, comando `ble_registro`). */
export interface RegistroNativoBle {
  seq: number;
  ms: number;
  tipo: string;
  enlace: string | null;
  neurona: string | null;
  detalle: string;
}

function lineaUnificada(en: number, origen: "web" | "nativa", tipo: string, enlace: string | null, neurona: string | null, detalle: string): string {
  const partes = [new Date(en).toISOString(), origen, tipo];
  if (enlace) partes.push(enlace);
  if (neurona) partes.push(`neurona ${neurona}`);
  if (detalle) partes.push(detalle);
  return partes.join(" · ");
}

/**
 * unirRegistros — lo que apuntó la web y lo que apuntó la app nativa (radio, conexiones, motivo de cada caída),
 * en UNA lista por orden de tiempo, para leerla de arriba abajo y exportarla. Puro.
 */
export function unirRegistros(web: readonly EventoEnlaceBle[], nativos: readonly RegistroNativoBle[], neurona?: string | null): string[] {
  const filas: Array<{ en: number; orden: number; linea: string }> = [];
  for (const e of web) filas.push({ en: e.en, orden: e.seq, linea: lineaUnificada(e.en, "web", e.tipo, e.enlace, e.neurona, e.detalle) });
  for (const n of nativos) {
    if (neurona && n.neurona && n.neurona !== neurona) continue;
    filas.push({ en: n.ms, orden: n.seq, linea: lineaUnificada(n.ms, "nativa", n.tipo, n.enlace, n.neurona, n.detalle) });
  }
  return filas.sort((a, b) => a.en - b.en || a.orden - b.orden).map((f) => f.linea);
}
