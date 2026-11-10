/**
 * LLA1110C · descartes con motivo, hueco de la voz, lienzo reciente y elección de cámara.
 * Lo que vio prueba.33: la Mac capturó 33 fotogramas y tiró 274 en 80 s porque su cola de voz (contada hasta el acuse
 * de cada escritura Bluetooth) casi nunca bajaba de 700 B; y eligió la Desk View del iPhone «por el sistema».
 */
import { describe, expect, it } from "vitest";
import { hayHueco, motivoSinHueco, UMBRAL_COLA_VIDEO_BYTES, UMBRAL_VOZ_HUECO_BYTES } from "../adaptacion";
import { SesionVideoDatos, textoMotivos } from "../sesion-video";
import { lienzoLigeroReciente, olvidarLienzosVivos, quitarLienzoVivo, registrarLienzoVivo } from "../lienzos";
import type { CodecVideo, CodificadorVideo, DecodificadorVideo, FabricaVideo, FrameCodificado, FuenteVideo, TransporteVideo } from "../tipos";
import { camaraParaEncender, clasificarCamara, correccionTrasAbrir, describirCamaras, elegirCamaraPorDefecto, esEtiquetaProvisional } from "@/lib/llamadas/camaras";

/* ── Reloj y enlace mínimos ── */

function relojManual() {
  let t = 1_000;
  const timers: Array<{ fn: () => void; ms: number; prox: number; vivo: boolean }> = [];
  return {
    ahora: () => t,
    cada(fn: () => void, ms: number) {
      const x = { fn, ms, prox: t + ms, vivo: true };
      timers.push(x);
      return () => void (x.vivo = false);
    },
    avanzar(ms: number) {
      const fin = t + ms;
      while (t < fin) {
        t += 5;
        for (const x of timers) if (x.vivo && t >= x.prox) {
          x.prox += x.ms;
          x.fn();
        }
      }
    },
  };
}

class Lado implements TransporteVideo {
  otro!: Lado;
  oyentes = new Set<(t: string) => void>();
  enviadosVideo: string[] = [];
  vozBytes = 0;
  ocupadoYa = false;
  enviar(t: string) {
    queueMicrotask(() => this.otro.oyentes.forEach((cb) => cb(t)));
    return "ok" as const;
  }
  enviarVideo(t: string) {
    this.enviadosVideo.push(t);
    queueMicrotask(() => this.otro.oyentes.forEach((cb) => cb(t)));
    return "ok" as const;
  }
  colaVozBytes = () => this.vozBytes;
  colaVideoBytes = () => 0;
  ocupado = () => this.ocupadoYa;
  alRecibir(cb: (t: string) => void) {
    this.oyentes.add(cb);
    return () => void this.oyentes.delete(cb);
  }
  abierto = () => true;
}

function fabrica(ocupado: () => boolean = () => false): FabricaVideo {
  return {
    codificables: () => ["vp8"] as CodecVideo[],
    decodificables: () => ["vp8"] as CodecVideo[],
    codificador(): CodificadorVideo {
      let cb: (f: FrameCodificado) => void = () => undefined;
      return {
        configurar: () => undefined,
        ocupado,
        codificar: (_f, clave) => cb({ clave, bytes: new Uint8Array(clave ? 900 : 200), ts: 1, w: 160, h: 120 }),
        alSalir: (f) => void (cb = f),
        cerrar: () => undefined,
      };
    },
    decodificador(): DecodificadorVideo {
      let cb: (i: { imagen: unknown; w: number; h: number }) => void = () => undefined;
      return { decodificar: () => cb({ imagen: {}, w: 160, h: 120 }), alImagen: (f) => void (cb = f), alError: () => undefined, cerrar: () => undefined };
    },
  };
}

async function vaciar() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

async function par(o: { ocupadoCodec?: () => boolean; fuente?: FuenteVideo } = {}) {
  const reloj = relojManual();
  const x = new Lado();
  const y = new Lado();
  x.otro = y;
  y.otro = x;
  const lineas: string[] = [];
  const a = new SesionVideoDatos({ idLlamada: "s", transporte: x, codecs: fabrica(o.ocupadoCodec), salida: null, reloj, anotar: (l) => lineas.push(l) });
  const b = new SesionVideoDatos({ idLlamada: "s", transporte: y, codecs: fabrica(), salida: { stream: null, pintar: () => undefined, cerrar: () => undefined }, reloj });
  a.iniciar();
  b.iniciar();
  await vaciar();
  const fuente: FuenteVideo = o.fuente ?? { capturar: (w, h) => ({ imagen: {}, w, h, ts: reloj.ahora() }), cerrar: () => undefined };
  a.ponerFuente(fuente);
  return { reloj, x, a, b, lineas };
}

describe("hueco para el vídeo (LLA1110C)", () => {
  it("la voz en cola por debajo de «ocupado» ya NO tira el vídeo (prueba.33: 700 B lo cerraba casi siempre)", () => {
    expect(hayHueco({ vozBytes: 1500, videoBytes: 0, ocupado: false })).toBe(true);
    expect(motivoSinHueco({ vozBytes: UMBRAL_VOZ_HUECO_BYTES, videoBytes: 0, ocupado: false })).toBe("enlace-ocupado");
    expect(motivoSinHueco({ vozBytes: 0, videoBytes: 0, ocupado: true })).toBe("enlace-ocupado");
    expect(motivoSinHueco({ vozBytes: 0, videoBytes: UMBRAL_COLA_VIDEO_BYTES, ocupado: false })).toBe("cola-video");
    expect(motivoSinHueco({ vozBytes: 0, videoBytes: 0, ocupado: false })).toBeNull();
  });

  it("con 1,5 KB de voz siempre en cola (la Mac) el vídeo sale igual", async () => {
    const { reloj, x, a } = await par();
    x.vozBytes = 1500;
    reloj.avanzar(5000);
    await vaciar();
    const tx = a.contadores().tx;
    expect(tx.enviados).toBeGreaterThanOrEqual(15);
    expect(tx.motivos["enlace-ocupado"] ?? 0).toBe(0);
    a.detener();
  });
});

describe("cada descarte tiene su motivo (LLA1110C)", () => {
  it("enlace ocupado, códec lleno y cámara sin imagen se cuentan por separado y suman los descartados", async () => {
    let codecLleno = false;
    let sinImagen = false;
    const fuente: FuenteVideo = {
      capturar: (w, h) => (sinImagen ? null : { imagen: {}, w, h, ts: 1 }),
      motivoSinImagen: () => (sinImagen ? "pausada" : null),
      diagnostico: () => ({ vistos: 1, negros: 0, vivo: true, pausada: sinImagen, listo: 4 }),
      cerrar: () => undefined,
    };
    const { reloj, x, a, lineas } = await par({ ocupadoCodec: () => codecLleno, fuente });
    x.ocupadoYa = true;
    reloj.avanzar(1000);
    x.ocupadoYa = false;
    codecLleno = true;
    reloj.avanzar(1000);
    codecLleno = false;
    sinImagen = true;
    reloj.avanzar(1000);
    sinImagen = false;
    reloj.avanzar(3000);
    await vaciar();
    const tx = a.contadores().tx;
    expect(tx.motivos["enlace-ocupado"]).toBeGreaterThan(0);
    expect(tx.motivos.codec).toBeGreaterThan(0);
    expect(tx.motivos["sin-imagen"]).toBeGreaterThan(0);
    const suma = Object.values(tx.motivos).reduce((s, n) => s + (n ?? 0), 0);
    expect(suma).toBe(tx.descartados);
    const linea = lineas.find((l) => l.startsWith("video-datos tx capturados"))!;
    expect(linea).toMatch(/motivos=.*enlace-ocupado:\d+/);
    expect(linea.length).toBeLessThanOrEqual(200);
    expect(lineas.some((l) => /^video-datos fuente sin-imagen=pausada:\d+ pausada=/.test(l))).toBe(true);
    a.detener();
  });

  it("textoMotivos: los más frecuentes primero y sin ceros", () => {
    expect(textoMotivos({ saliendo: 2, "enlace-ocupado": 9, codec: 0 })).toBe("enlace-ocupado:9,saliendo:2");
  });
});

describe("lienzo del vídeo ligero pintado lo último (LLA1110C)", () => {
  it("devuelve el pintado más reciente dentro de la edad; nada si no se pintó o se cerró", () => {
    olvidarLienzosVivos();
    const a = registrarLienzoVivo("A");
    const b = registrarLienzoVivo("B");
    expect(lienzoLigeroReciente(3000, 10_000)).toBeNull();
    a.pintados = 1;
    a.pintadoEn = 9_000;
    b.pintados = 1;
    b.pintadoEn = 9_500;
    expect(lienzoLigeroReciente(3000, 10_000)).toBe("B");
    expect(lienzoLigeroReciente(3000, 13_000)).toBeNull();
    quitarLienzoVivo(b);
    expect(lienzoLigeroReciente(3000, 10_000)).toBe("A");
    olvidarLienzosVivos();
  });
});

describe("cámara: tipo y elección (LLA1110C)", () => {
  const mac = describirCamaras(
    [
      { id: "dv", nombre: "iPhone de MaggasSukha Desk View Camera" },
      { id: "ip", nombre: "Cámara de MaggasSukha (iPhone)" },
      { id: "ft", nombre: "FaceTime HD Camera" },
    ],
    "mac",
  );

  it("los nombres provisionales («Cámara 1») no se toman por externas: no se sabe qué son", () => {
    expect(esEtiquetaProvisional("Cámara 1")).toBe(true);
    expect(esEtiquetaProvisional("")).toBe(true);
    expect(esEtiquetaProvisional("FaceTime HD Camera")).toBe(false);
    const l = describirCamaras([{ id: "a", nombre: "Cámara 1" }, { id: "b", nombre: "Cámara 2" }]);
    expect(l.every((c) => c.sinEtiqueta)).toBe(true);
    expect(elegirCamaraPorDefecto(l)).toEqual({ camara: null, motivo: "sin-etiquetas" });
    expect(clasificarCamara("iPhone de X Desk View Camera")).toBe("continuidad");
  });

  it("al encender sin elección: la integrada por deviceId (nunca la Desk View que da el sistema)", () => {
    expect(camaraParaEncender(mac, null)).toEqual({ id: "ft", motivo: "integrada" });
    expect(camaraParaEncender(mac, "dv")).toEqual({ id: "dv", motivo: "seleccionada" }); // elegida a mano: se respeta
    expect(camaraParaEncender(mac, null, { id: "ip", etiqueta: "Cámara de MaggasSukha (iPhone)" })).toEqual({ id: "ip", motivo: "guardada" });
    expect(camaraParaEncender(describirCamaras([{ id: "a", nombre: "Cámara 1" }]), null)).toEqual({ id: null, motivo: "sin-etiquetas" });
  });

  it("si el sistema abrió la Desk View, se corrige a la integrada; si abrió la integrada, nada", () => {
    expect(correccionTrasAbrir(mac, { id: "dv", etiqueta: "iPhone de MaggasSukha Desk View Camera" })?.id).toBe("ft");
    expect(correccionTrasAbrir(mac, { id: "ft", etiqueta: "FaceTime HD Camera" })).toBeNull();
    expect(correccionTrasAbrir(mac.filter((c) => c.id !== "ft"), { id: "dv" })).toBeNull(); // sin integrada no hay a dónde ir
  });
});
