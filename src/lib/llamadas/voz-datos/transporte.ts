"use client";

/**
 * voz-datos/transporte — el enlace real por el que va la voz hacia UNA neurona (LLA1108E).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Preferencia: Bluetooth directo (cola de voz propia, sin acuse por trama, con tope; el cifrado de la
 * sesión del enlace, CIF1108A, ya lo cubre) y, si no, el canal de datos de un enlace WebRTC local. El canal
 * TCP de la app nativa no se usa para voz: es un enlace con IP y ahí va WebRTC normal.
 * Nunca lanza.
 */
import type { TransporteVoz } from "./sesion";
import { alVozEntrante } from "./hub";
import { esTextoVoz } from "./paquete";
import { enlaceTieneIp } from "./decision";
import { enlaceVivoMasNuevoCon } from "@/lib/malla/registro-enlaces-locales";
import { enlaceWifiDe } from "@/lib/malla/enlace-wifi-orquestacion";

type ModBle = typeof import("@/lib/malla/bluetooth-directo-motor");
let modBle: ModBle | null = null;
let cargando: Promise<unknown> | null = null;

/** Carga el motor Bluetooth si hay app nativa (en la web normal, no hace nada). Idempotente. */
export function precargarTransporteVoz(): Promise<void> {
  if (modBle) return Promise.resolve();
  if (!cargando) {
    cargando = import("@/lib/malla/bluetooth-directo-motor")
      .then((m) => {
        modBle = m;
      })
      .catch(() => undefined);
  }
  return cargando.then(() => undefined);
}

/** Para pruebas. */
export function __fijarModuloBle(m: ModBle | null): void {
  modBle = m;
  cargando = m ? Promise.resolve() : null;
}

export type TipoEnlaceDatos = "ble" | "local";

export interface EnlaceDatosHacia {
  tipo: TipoEnlaceDatos;
  /** Id del enlace («b3» o «local:…»). */
  id: string;
  /** ¿Lleva IP (WebRTC puede usarlo)? */
  ip: boolean;
}

/** Enlaces de datos vivos hacia esa neurona, el mejor primero (síncrono: usa lo ya cargado). */
export function enlacesDatosHacia(neurona: string): EnlaceDatosHacia[] {
  const out: EnlaceDatosHacia[] = [];
  try {
    const l = enlaceVivoMasNuevoCon(neurona);
    if (l) out.push({ tipo: "local", id: l.id, ip: enlaceTieneIp("local") });
  } catch {
    /* sin registro */
  }
  try {
    const e = modBle?.bluetoothDirectoActivo()?.enlaceHacia(neurona);
    if (e) out.push({ tipo: "ble", id: e, ip: enlaceTieneIp("ble") });
  } catch {
    /* sin Bluetooth */
  }
  return out;
}

/**
 * (LLA1110D) La red local nativa (canal TCP 47071, «nativo») también es una ruta IP: en la prueba 33, con el Wi-Fi de la
 * tableta encendido, la señalización iba por ella pero `hayRutaIpHacia` decía «sin IP» y la voz arrancaba por Bluetooth
 * mientras WebRTC conectaba por la LAN. La lista de enlaces nativos es asíncrona: se cachea y se refresca cada 3 s.
 */
const rutaNativa = new Map<string, { ip: boolean | null; t: number; enVuelo: boolean }>();
const REFRESCO_NATIVA_MS = 3_000;

function refrescarRutaNativa(neurona: string): void {
  const ahora = Date.now();
  const c = rutaNativa.get(neurona) ?? { ip: null, t: 0, enVuelo: false };
  if (c.enVuelo || ahora - c.t < REFRESCO_NATIVA_MS) return;
  c.enVuelo = true;
  rutaNativa.set(neurona, c);
  void import("@/lib/malla/transporte-universal")
    .then((tu) => tu.enlacesDisponibles())
    .then((l) => {
      rutaNativa.set(neurona, { ip: l.some((e) => e.tipo === "nativo" && e.abierto && e.alcanza?.neuronDeviceId === neurona), t: Date.now(), enVuelo: false });
    })
    .catch(() => rutaNativa.set(neurona, { ip: c.ip, t: Date.now(), enVuelo: false }));
}

/** Para pruebas. */
export function __fijarRutaNativa(neurona: string, ip: boolean | null): void {
  if (ip === null) rutaNativa.delete(neurona);
  else rutaNativa.set(neurona, { ip, t: Date.now() + 1e12, enVuelo: false });
}

/**
 * ¿Hay alguna ruta con IP hacia esa neurona (enlace WebRTC local, Wi-Fi directo o la red local nativa)?
 * null: aún no se sabe (la primera consulta de la red nativa está en vuelo): el motor no decide «sin IP» con eso.
 */
export function hayRutaIpHacia(neurona: string): boolean | null {
  // (LLA1108H) El enlace Wi-Fi directo (red propia de las dos neuronas, sin router) es una ruta IP aunque aún no haya WebRTC local.
  try {
    if (enlaceWifiDe(neurona)) return true;
  } catch {
    /* sin orquestación */
  }
  if (enlacesDatosHacia(neurona).some((e) => e.ip)) return true;
  refrescarRutaNativa(neurona);
  const n = rutaNativa.get(neurona)?.ip ?? null;
  return n === null ? null : n;
}

/**
 * (LLA1110D) ¿Hay un enlace DIRECTO con esa neurona (Bluetooth, enlace local o ruta IP sin servidor)? Basta para empezar
 * una llamada sin internet: la señal y la voz van por él. Carga antes el motor Bluetooth si hace falta. Nunca lanza.
 */
export async function hayEnlaceDirectoCon(neurona: string): Promise<boolean> {
  try {
    await precargarTransporteVoz();
    if (enlacesDatosHacia(neurona).length > 0) return true;
    return hayRutaIpHacia(neurona) === true;
  } catch {
    return false;
  }
}

/**
 * (LLA1111B) Bytes que entraron en el carril de voz del Bluetooth hacia cada neurona (voz, vídeo y controles de la
 * llamada), acumulados y sin bajar nunca: con `colaVozBytes` dan lo que el enlace acusa de verdad (ver
 * `video-datos/reparto.ts`). Por neurona y no por enlace: si el enlace cambia de id («b2» → «b3») la cuenta sigue.
 */
const entradosVozBle = new Map<string, number>();
/** (LLA1111B) Última vez que entró vídeo en el carril de voz hacia cada neurona (ms). */
const videoEnCarrilVoz = new Map<string, number>();
/**
 * (LLA1111B) Lo que el vídeo puede tener en el carril delante de la voz. LLA1111Q: dos ventanas de `reparto.ts`
 * (2 × `VENTANA_MAX_BYTES`): la escritura en vuelo y la siguiente. La voz no se retiene por esos bytes.
 */
export const VENTANA_VIDEO_EN_CARRIL_VOZ = 2 * 2304;

/**
 * (LLA1111B) «Ocupado» para la sesión de voz: más de `umbral` bytes en el carril, sin contar la ventana que puede ocupar
 * el vídeo si ha entrado vídeo en los últimos 2 s (si no, la voz se retendría por bytes de vídeo y llegaría tarde).
 */
export function vozOcupada(cola: number, umbral: number, ultimoVideo: number | undefined, ahora: number): boolean {
  const conVideo = typeof ultimoVideo === "number" && ahora - ultimoVideo < 2000;
  return cola > umbral + (conVideo ? VENTANA_VIDEO_EN_CARRIL_VOZ : 0);
}

/**
 * LLA1111Q: quien quiere salir JUNTO a la voz hacia cada neurona (el vídeo ligero): se le avisa justo después de que la
 * voz encola un texto, en el mismo turno, para que lo suyo vaya en la MISMA escritura del Bluetooth y no gaste otra ficha
 * de la cubeta del emisor (7,2 escrituras/s).
 */
const oyentesSalidaVoz = new Map<string, Set<(audio: boolean) => void>>();

/** LLA1111Q: ¿es un paquete de audio (no un control de la voz)? */
export function esPaqueteAudio(texto: string): boolean {
  return texto.startsWith('{"t":"voz.b"') || texto.startsWith('{"t":"voz.p"');
}

export function bytesEntradosVozBle(neurona: string): number {
  return entradosVozBle.get(neurona) ?? 0;
}

/**
 * El transporte de voz hacia esa neurona, o null si no hay ningún enlace de datos ahora.
 * Elige en cada envío (si el enlace cambia de id —«b3» → «b4»— la voz sigue).
 */
export function crearTransporteVozHacia(neurona: string): TransporteVoz | null {
  const ble = () => {
    const red = modBle?.bluetoothDirectoActivo() ?? null;
    const id = red?.enlaceHacia(neurona) ?? null;
    return red && id ? { red, id } : null;
  };
  const local = () => {
    try {
      const l = enlaceVivoMasNuevoCon(neurona);
      return l && l.abierto() ? l : null;
    } catch {
      return null;
    }
  };
  // Preferencia: Bluetooth (su cola ya limita y reparte); el enlace local solo si no hay Bluetooth.
  if (!ble() && !local()) return null;
  // (LLA1111B) Con Bluetooth al abrir, el vídeo ligero comparte el carril de la voz con reparto medido (`bytesEntrados`).
  // Un canal WebRTC local no lo necesita (no es «parada y espera» y su cola no se mide igual): ahí sigue como antes.
  const conBle = !!ble();
  return {
    enviar(texto) {
      const b = ble();
      if (b) {
        const r = b.red.enviarVoz(b.id, texto);
        if (r !== "cerrado") {
          entradosVozBle.set(neurona, (entradosVozBle.get(neurona) ?? 0) + texto.length);
          if (texto.startsWith('{"t":"voz.v"')) videoEnCarrilVoz.set(neurona, Date.now());
          else
            for (const cb of Array.from(oyentesSalidaVoz.get(neurona) ?? [])) {
              try {
                cb(esPaqueteAudio(texto));
              } catch {
                /* un oyente roto no tumba la voz */
              }
            }
        }
        return r;
      }
      const l = local();
      if (!l) return "cerrado";
      try {
        return l.enviar(texto) ? "ok" : "descartado";
      } catch {
        return "cerrado";
      }
    },
    ocupado() {
      const b = ble();
      if (b) return vozOcupada(b.red.colaVozBytes(b.id), modBle?.UMBRAL_VOZ_OCUPADA_BLE ?? 2048, videoEnCarrilVoz.get(neurona), Date.now());
      const l = local();
      return l ? l.bufferedAmount() > 16 * 1024 : false;
    },
    /* (LLA1108H) Vídeo ligero: cola propia del Bluetooth, siempre por detrás de la voz. Por el enlace local va en el mismo canal. */
    enviarVideo(texto) {
      const b = ble();
      if (b) return b.red.enviarVideo(b.id, texto);
      const l = local();
      if (!l) return "cerrado";
      try {
        return l.enviar(texto) ? "ok" : "descartado";
      } catch {
        return "cerrado";
      }
    },
    colaVozBytes() {
      const b = ble();
      if (b) return b.red.colaVozBytes(b.id);
      return 0;
    },
    colaVideoBytes() {
      const b = ble();
      if (b) return b.red.colaVideoBytes(b.id);
      const l = local();
      return l ? l.bufferedAmount() : 0;
    },
    /* VID1110A: el Bluetooth tira lo más viejo al pasar de este tope; el vídeo ligero deja salir un clave entero por debajo de él. */
    topeColaVideoBytes() {
      return ble() ? (modBle?.MAX_COLA_VIDEO_BLE ?? 24 * 1024) : null;
    },
    ...(conBle ? { bytesEntrados: () => bytesEntradosVozBle(neurona) } : {}),
    // VOZ1111J: ¿hay vídeo en el carril de la voz (últimos 2 s)? La sesión de voz deja entonces sitio a su ventana.
    ...(conBle ? { videoEnCarril: () => Date.now() - (videoEnCarrilVoz.get(neurona) ?? -1e12) < 2000 } : {}),
    // LLA1111Q: lo que el emisor del Bluetooth mide de cada escritura de la llamada y su tope de escrituras por segundo.
    ...(conBle
      ? {
          alSalirVoz: (cb: (audio: boolean) => void) => {
            const l = oyentesSalidaVoz.get(neurona) ?? new Set<(audio: boolean) => void>();
            l.add(cb);
            oyentesSalidaVoz.set(neurona, l);
            return () => {
              l.delete(cb);
              if (!l.size) oyentesSalidaVoz.delete(neurona);
            };
          },
          escrituras: () => {
            const b = ble();
            return b?.red.escriturasLlamada ? b.red.escriturasLlamada(b.id) : null;
          },
          escriturasPorS: () => {
            const b = ble();
            return b?.red.escriturasPorS ? b.red.escriturasPorS(b.id) : null;
          },
        }
      : {}),
    capacidadKbps() {
      const b = ble();
      if (!b) return null;
      try {
        return b.red.enlaces().find((e) => e.id === b.id)?.capacidadKbps ?? null;
      } catch {
        return null;
      }
    },
    alRecibir(cb) {
      const bajas: Array<() => void> = [];
      bajas.push(
        alVozEntrante((t, o) => {
          if (o.neurona === neurona && esTextoVoz(t)) cb(t);
        }),
      );
      const l = local();
      if (l) {
        bajas.push(
          l.alMensaje((d) => {
            if (typeof d === "string" && esTextoVoz(d)) cb(d);
          }),
        );
      }
      return () => bajas.forEach((b) => b());
    },
    abierto() {
      return !!ble() || !!local();
    },
    info() {
      const b = ble();
      if (b) return { tipo: "ble", cifrada: b.red.cifradoDe?.(neurona) === "cifrado" };
      // El canal de datos de WebRTC va cifrado (DTLS).
      return { tipo: "local", cifrada: true };
    },
  };
}
