/**
 * planificador-vias — el planificador único de vías (MED1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Capa 2 de `architecture/red-sin-dependencias.md` §5. Función PURA (sin red, sin DOM, sin reloj):
 * dado un dato (tipo, tamaño, urgencia, privacidad, destino), los medios vivos con su ficha y el
 * contexto (batería, coste, ajustes), devuelve un plan ordenado con el motivo en español de cada
 * medio aceptado o rechazado, el reparto multitrayecto de los archivos grandes, la escalera de
 * degradación del §9 (vídeo → audio → paramétrico; miniatura primero por Bluetooth; LoRa ≤ 200 B)
 * y una propuesta cuando se podría abrir un medio mejor (p. ej. Wi‑Fi directo para un archivo grande).
 *
 * El corazón del orden es `evaluarEnlaces`: la regla de `elegirEnlaces` movida aquí SIN cambios
 * (rangos, vetos, LocalSend, tope de bytes, desempates). `elegirEnlaces` delega en ella y devuelve lo
 * mismo que antes (pruebas de caracterización en `__tests__/caracterizacion-eleccion.test.ts`).
 */

import {
  ARCHIVO_BLE_PREFERENTE_BYTES,
  LORA_MAX_BYTES,
  alcanzaDestino,
  enlacesParaReparto,
  motivoLocalSend,
  motivoNoLocalSend,
  motivoRango,
  ordenEnRango,
  planReparto,
  rangoEnlace,
  rangoParaEnvio,
  type ClaseEnvio,
  type Descartado,
  type DestinoTransporte,
  type Eleccion,
  type EnlaceDisponible,
  type EnlaceElegido,
  type OpcionesEleccion,
} from "@/lib/malla/eleccion-enlace";
import { vetoPorPolitica } from "@/lib/malla/cristal/adaptador-elegidores";
import type { Medio } from "@/lib/malla/cristal/tipos";
import type { FichaCapacidades, PrivacidadDato, TipoDato, Urgencia, ViaViva } from "./tipos";

// ───────────────────────────── Núcleo: la regla de `elegirEnlaces` ─────────────────────────────

function compararNumero(a: number | null | undefined, b: number | null | undefined, asc: boolean): number {
  const va = typeof a === "number" && Number.isFinite(a) ? a : null;
  const vb = typeof b === "number" && Number.isFinite(b) ? b : null;
  if (va === null && vb === null) return 0;
  if (va === null) return 1; // sin medida, detrás
  if (vb === null) return -1;
  return asc ? va - vb : vb - va;
}

function medioDe(e: EnlaceDisponible): Medio {
  switch (e.tipo) {
    case "nativo":
      return "wifi-lan";
    case "ble":
      return "ble";
    case "rele":
      return "servidor";
    case "lora":
      return "lora";
    default:
      return "webrtc";
  }
}

function motivoFlujo(e: EnlaceDisponible): string {
  return e.tipo === "nativo"
    ? "el canal TCP de la app nativa no lleva audio, vídeo ni flujos: van por el enlace directo que abren solas las dos apps"
    : e.tipo === "ble"
      ? "el Bluetooth directo no lleva audio, vídeo ni transmisiones en vivo (no le da el ancho: decenas de KB/s)"
      : "no lleva audio ni vídeo (las llamadas directas van por el enlace local)";
}

function motivoNoAdmite(e: EnlaceDisponible, clase: ClaseEnvio): string {
  if (clase === "flujo") return motivoFlujo(e);
  if (clase === "archivo") {
    return e.tipo === "lora"
      ? "LoRa no lleva archivos"
      : e.tipo === "rele"
        ? "el relé del servidor no lleva archivos"
        : "este enlace no tiene permiso para archivos";
  }
  return "no lleva mensajes";
}

/**
 * evaluarEnlaces — candidatos ORDENADOS para un envío de `clase` y `bytes` a `destino`, con el motivo
 * de cada descarte. Es la regla que antes vivía en `elegirEnlaces` (idéntica). Pura y determinista.
 */
export function evaluarEnlaces(
  enlaces: EnlaceDisponible[],
  destino: DestinoTransporte,
  clase: ClaseEnvio,
  bytes = 0,
  opciones?: OpcionesEleccion,
): Eleccion {
  const elegidos: EnlaceElegido[] = [];
  const descartados: Descartado[] = [];
  const vistos = new Set<string>();
  for (const e of enlaces) {
    if (vistos.has(e.id)) continue;
    vistos.add(e.id);

    if (opciones?.clase) {
      const medio = medioDe(e);
      if (vetoPorPolitica(opciones.clase, medio)) {
        descartados.push({
          id: e.id,
          tipo: e.tipo,
          motivo: `veto por política de transporte: clase ${opciones.clase} no permitido en medio ${medio}`,
        });
        continue;
      }
    }

    const descartar = (motivo: string) => descartados.push({ id: e.id, tipo: e.tipo, motivo });
    if (!alcanzaDestino(e, destino)) {
      descartar("no llega a ese destino");
      continue;
    }
    if (!e.abierto) {
      descartar("no está abierto ahora");
      continue;
    }
    const noLocalSend = motivoNoLocalSend(e, clase, opciones);
    if (noLocalSend) {
      descartar(noLocalSend);
      continue;
    }
    if (!e.admite[clase]) {
      descartar(motivoNoAdmite(e, clase));
      continue;
    }
    if (typeof e.maxBytes === "number" && bytes > e.maxBytes) {
      descartar(
        e.tipo === "ble"
          ? `el archivo (${bytes} B) supera lo que lleva el Bluetooth directo (${e.maxBytes} B): a decenas de KB/s tardaría demasiado`
          : `el envío (${bytes} B) supera lo que lleva este enlace (${e.maxBytes} B)`,
      );
      continue;
    }
    // (BLE1108A) Un archivo grande por Bluetooth baja de rango (detrás de cualquier P2P más rápido).
    const rango = rangoParaEnvio(e, clase, bytes);
    elegidos.push({
      enlace: e,
      rango,
      motivo:
        e.protocolo === "localsend"
          ? motivoLocalSend(e)
          : rango !== rangoEnlace(e)
            ? "Bluetooth directo (archivo grande: solo si no hay un P2P más rápido)"
            : motivoRango(e),
    });
  }
  const puntuar = opciones?.puntuar;
  elegidos.sort(
    (a, b) =>
      a.rango - b.rango ||
      ordenEnRango(a.enlace) - ordenEnRango(b.enlace) ||
      (puntuar ? puntuar(a.enlace) - puntuar(b.enlace) : 0) ||
      compararNumero(a.enlace.rttMs, b.enlace.rttMs, true) ||
      compararNumero(a.enlace.capacidadKbps, b.enlace.capacidadKbps, false) ||
      (a.enlace.id < b.enlace.id ? -1 : a.enlace.id > b.enlace.id ? 1 : 0),
  );
  return { elegidos, descartados };
}

// ───────────────────────────── Planificador por dato ─────────────────────────────

export interface DatoVia {
  tipo: TipoDato;
  bytes: number;
  urgencia: Urgencia;
  privacidad: PrivacidadDato;
  destino: DestinoTransporte;
}

export interface AjustesVias {
  /** Dónde corre este extremo (LocalSend solo desde la app nativa o un servidor). */
  medioEmisor?: OpcionesEleccion["medioEmisor"];
  miUid?: string;
  /** Rechaza los medios que no cifran de punta a punta («Exigir cifrado en la red local»). */
  exigirCifrado?: boolean;
  /** Ids de enlace o tipos de medio que la persona prohibió para este dato. */
  prohibidos?: string[];
}

export interface ContextoVias {
  /** Batería del aparato 0..1 (null = enchufado o desconocida). */
  bateria: number | null;
  /** «libre»: sin restricción; «evitar-datos»: no gastar plan de datos ni servidores si hay otra vía. */
  coste: "libre" | "evitar-datos";
  ajustes?: AjustesVias;
}

export type Escalon = "completo" | "video" | "audio" | "parametrico" | "miniatura" | "aviso" | "ninguno";

export interface PasoVia {
  conectorId: string;
  enlaceId: string;
  tipo: EnlaceDisponible["tipo"];
  rango: number;
  motivo: string;
}

export interface RechazoVia {
  enlaceId: string;
  tipo: EnlaceDisponible["tipo"];
  motivo: string;
}

export interface PropuestaVia {
  medio: "wifi-directo" | "lan" | "bluetooth" | "internet";
  motivo: string;
}

export interface PlanVias {
  clase: ClaseEnvio;
  /** Escalón con el que se envía (ver §9 del contrato). «ninguno»: ahora no hay vía; el dato espera. */
  escalon: Escalon;
  /** Frase para la persona sobre el escalón elegido. */
  resumen: string;
  pasos: PasoVia[];
  rechazadas: RechazoVia[];
  /** Solo archivos grandes con 2+ enlaces del mismo aparato. */
  reparto?: { trozos: number; porEnlace: Record<string, number> };
  /** Escalones de calidad que se probaron, de mejor a peor, con por qué no valieron. */
  escalera: Array<{ escalon: Escalon; valido: boolean; motivo: string }>;
  /** Bluetooth: manda primero la miniatura (≤ 200 KB) y el original cuando haya otro medio. */
  miniaturaPrimero: boolean;
  /** true si se podría abrir un medio mejor. */
  proponer: boolean;
  propuestas: PropuestaVia[];
}

export const REPARTO_MIN_BYTES = 1024 * 1024;
export const TROZO_REPARTO_BYTES = 32 * 1024;
/** Opus de voz necesita ~16 kbps. */
export const AUDIO_MIN_KBPS = 16;
/** Vídeo útil por el canal de datos. */
export const VIDEO_MIN_KBPS = 1500;
export const BATERIA_BAJA = 0.2;

function claseDeDato(t: TipoDato): ClaseEnvio {
  if (t === "archivo") return "archivo";
  if (t === "flujo-audio" || t === "flujo-video" || t === "pantalla") return "flujo";
  return "mensaje";
}

function rechazoPorContexto(v: ViaViva, dato: DatoVia, ctx: ContextoVias): string | null {
  const f = v.ficha;
  const a = ctx.ajustes;
  if (a?.prohibidos?.some((p) => p === v.enlace.id || p === v.enlace.tipo || p === v.conectorId)) {
    return "la persona lo prohibió para este dato";
  }
  if (a?.exigirCifrado && v.enlace.cifrado === "sin-cifrar") {
    return "«Exigir cifrado» está activo y el otro lado todavía no cifra (app anterior)";
  }
  if (ctx.coste === "evitar-datos" && (f.coste === "datos" || f.coste === "servidor")) {
    return f.coste === "servidor" ? "se evita el servidor por coste (hay que gastar datos)" : "se evita gastar el plan de datos";
  }
  if (ctx.bateria !== null && ctx.bateria < BATERIA_BAJA && f.energia === "alta" && dato.urgencia !== "alta") {
    return "batería baja: este medio gasta mucha energía";
  }
  return null;
}

function aPasos(el: Eleccion, vias: ViaViva[]): PasoVia[] {
  const conector = new Map(vias.map((v) => [v.enlace.id, v.conectorId]));
  return el.elegidos.map((x) => ({
    conectorId: conector.get(x.enlace.id) ?? x.enlace.tipo,
    enlaceId: x.enlace.id,
    tipo: x.enlace.tipo,
    rango: x.rango,
    motivo: x.motivo,
  }));
}

function anchoSuficiente(f: FichaCapacidades, minKbps: number, tipo: string): boolean {
  if (f.anchoKbps === null) return tipo === "ble" || tipo === "local" || tipo === "nativo";
  return f.anchoKbps >= minKbps;
}

/**
 * planificarVias — el plan de vías de un dato. Pura. Ver la cabecera para la escalera y las propuestas.
 */
export function planificarVias(dato: DatoVia, vias: ViaViva[], ctx: ContextoVias): PlanVias {
  const clase = claseDeDato(dato.tipo);
  const rechazadas: RechazoVia[] = [];
  const validas: ViaViva[] = [];
  for (const v of vias) {
    const m = rechazoPorContexto(v, dato, ctx);
    if (m) rechazadas.push({ enlaceId: v.enlace.id, tipo: v.enlace.tipo, motivo: m });
    else validas.push(v);
  }
  const opciones: OpcionesEleccion = {
    clase: dato.privacidad,
    medioEmisor: ctx.ajustes?.medioEmisor,
    miUid: ctx.ajustes?.miUid,
  };
  const evaluar = (c: ClaseEnvio, bytes: number, filtro?: (v: ViaViva) => boolean): Eleccion => {
    const lista = filtro ? validas.filter(filtro) : validas;
    return evaluarEnlaces(lista.map((v) => v.enlace), dato.destino, c, bytes, opciones);
  };
  const acumular = (el: Eleccion) => {
    for (const d of el.descartados) {
      if (!rechazadas.some((r) => r.enlaceId === d.id)) rechazadas.push({ enlaceId: d.id, tipo: d.tipo, motivo: d.motivo });
    }
  };

  const escalera: PlanVias["escalera"] = [];
  let escalon: Escalon = "completo";
  let eleccion = evaluar(clase, dato.bytes);
  acumular(eleccion);
  let resumen = "";

  if (dato.tipo === "flujo-video" || dato.tipo === "flujo-audio" || dato.tipo === "pantalla") {
    const pideVideo = dato.tipo !== "flujo-audio";
    const hayVideo = eleccion.elegidos.filter((x) => anchoSuficiente(vias.find((v) => v.enlace.id === x.enlace.id)!.ficha, VIDEO_MIN_KBPS, x.enlace.tipo));
    if (pideVideo) {
      escalera.push({ escalon: "video", valido: hayVideo.length > 0, motivo: hayVideo.length ? "hay un medio con ancho para vídeo" : "ningún medio vivo lleva vídeo con ese ancho" });
      if (hayVideo.length) {
        eleccion = { ...eleccion, elegidos: hayVideo };
        escalon = "video";
        resumen = "Vídeo completo";
      }
    }
    if (!pideVideo || !hayVideo.length) {
      // Audio: voz Opus de 16–24 kbps; cabe también por Bluetooth (va como datos, no como flujo).
      const audio = evaluar("mensaje", 0, (v) => anchoSuficiente(v.ficha, AUDIO_MIN_KBPS, v.enlace.tipo) && v.enlace.tipo !== "lora" && v.enlace.tipo !== "rele");
      escalera.push({ escalon: "audio", valido: audio.elegidos.length > 0, motivo: audio.elegidos.length ? "voz Opus de 16–24 kbps" : "ningún medio vivo da 16 kbps de voz" });
      if (audio.elegidos.length) {
        eleccion = audio;
        escalon = "audio";
        resumen = pideVideo ? "Baja a solo voz (el medio no da para vídeo)" : "Voz";
      } else {
        const param = evaluar("mensaje", Math.min(dato.bytes, LORA_MAX_BYTES), (v) => v.enlace.tipo === "lora");
        escalera.push({ escalon: "parametrico", valido: param.elegidos.length > 0, motivo: param.elegidos.length ? "solo parámetros (`t0` y ajustes), sin audio, por radio" : "sin radio disponible" });
        if (param.elegidos.length) {
          eleccion = param;
          escalon = "parametrico";
          resumen = "Paramétrico: se manda `t0` y los parámetros, no el audio";
        } else {
          eleccion = { elegidos: [], descartados: eleccion.descartados };
          escalon = "ninguno";
          resumen = "Ahora no hay vía para la transmisión";
        }
      }
    }
  } else if (dato.tipo === "archivo") {
    escalon = eleccion.elegidos.length ? "completo" : "ninguno";
    resumen = eleccion.elegidos.length ? "Archivo completo" : "Ahora no hay vía para archivos: espera a otro medio";
    escalera.push({ escalon: "completo", valido: eleccion.elegidos.length > 0, motivo: eleccion.elegidos.length ? "hay medio para el original" : "ningún medio vivo lleva el original" });
  } else {
    // Mensajes, avisos, votos, control y publicaciones: ≤ 200 B pasan por LoRa; si no caben, solo aviso.
    escalera.push({ escalon: "completo", valido: eleccion.elegidos.length > 0, motivo: eleccion.elegidos.length ? "hay medio" : "ningún medio vivo lo lleva entero" });
    if (eleccion.elegidos.length) {
      escalon = "completo";
      resumen = "Texto completo";
    } else if (dato.bytes > LORA_MAX_BYTES) {
      const aviso = evaluar("mensaje", Math.min(dato.bytes, LORA_MAX_BYTES), (v) => v.enlace.tipo === "lora");
      escalera.push({ escalon: "aviso", valido: aviso.elegidos.length > 0, motivo: aviso.elegidos.length ? "por radio solo cabe el titular y el aviso (≤ 200 B)" : "sin radio" });
      if (aviso.elegidos.length) {
        eleccion = aviso;
        escalon = "aviso";
        resumen = "Solo el titular y el aviso por radio (≤ 200 B)";
      }
    }
    if (escalon === "completo" && !eleccion.elegidos.length) {
      escalon = "ninguno";
      resumen = "Ahora no hay vía: el dato espera firmado hasta que haya una";
    }
  }

  const pasos = aPasos(eleccion, vias);
  const mejor = eleccion.elegidos[0]?.enlace;
  const miniaturaPrimero = dato.tipo === "archivo" && mejor?.tipo === "ble";
  if (miniaturaPrimero) {
    escalon = "miniatura";
    resumen = "Por Bluetooth va primero la miniatura (≤ 200 KB); el original, cuando haya otro medio";
    escalera.push({ escalon: "miniatura", valido: true, motivo: "Bluetooth lleva decenas de KB/s: miniatura primero" });
  }

  // Multitrayecto: solo archivos grandes con 2+ enlaces P2P del mismo aparato.
  let reparto: PlanVias["reparto"];
  if (dato.tipo === "archivo" && dato.bytes >= REPARTO_MIN_BYTES && eleccion.elegidos.length > 1 && !miniaturaPrimero) {
    const enlacesReparto = enlacesParaReparto(eleccion);
    if (enlacesReparto.length > 1) reparto = planReparto(dato.bytes, TROZO_REPARTO_BYTES, enlacesReparto);
  }

  // Propuestas: abrir un medio mejor cuando el actual se queda corto.
  const propuestas: PropuestaVia[] = [];
  const rapidos = eleccion.elegidos.some((x) => x.enlace.tipo === "local" || x.enlace.tipo === "nativo" || x.enlace.tipo === "cuenta" || x.enlace.tipo === "par");
  if (dato.tipo === "archivo" && dato.bytes > ARCHIVO_BLE_PREFERENTE_BYTES && !rapidos) {
    propuestas.push({
      medio: "wifi-directo",
      motivo: mejor?.tipo === "ble"
        ? "este archivo es grande para Bluetooth (decenas de KB/s): abrir Wi‑Fi directo lo enviaría mucho antes"
        : "no hay un medio rápido: abrir Wi‑Fi directo o conectar a la misma red permitiría enviarlo",
    });
  }
  if ((dato.tipo === "flujo-video" || dato.tipo === "pantalla") && escalon !== "video") {
    propuestas.push({ medio: "wifi-directo", motivo: "para vídeo o pantalla hace falta Wi‑Fi directo o la misma red local" });
  }
  if (escalon === "ninguno" && !propuestas.length) {
    propuestas.push({ medio: "bluetooth", motivo: "no hay ningún medio abierto con ese destino: acerca los aparatos para abrir Bluetooth o la red local" });
  }

  return { clase, escalon, resumen, pasos, rechazadas, reparto, escalera, miniaturaPrimero, proponer: propuestas.length > 0, propuestas };
}
