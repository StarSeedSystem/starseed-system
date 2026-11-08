/**
 * (NEU1108A) La presencia en vivo de una neurona con las mismas fuentes que el radar. Caso real del 08-11:
 * en la Mac, el chat con «Maggaboard» decía «versión desconocida · no está abierta ahora» mientras el radar
 * la daba «en línea · 57 ms · sin internet» (enlace local) y los mensajes iban por la red local.
 *   NODE_ENV=test npx vitest run src/lib/neurons/__tests__/presencia-viva.test.ts
 */
import { describe, expect, it } from "vitest";
import { presenciaViva, textoEstadoVivo } from "../presencia-viva";
import type { PresenciaMedio } from "../presencia";

const BOARD = "e0b9faf2-0000-4000-8000-000000000001";
const NUEVA = "26f5a00d-0000-4000-8000-000000000008";
const vigente = (id: string) => (id === NUEVA ? BOARD : id);

const medio = (n: string, extra: Partial<PresenciaMedio> = {}): PresenciaMedio =>
  ({ n, m: `${n}-m`, tipo: "app-nativa", etiqueta: "App", visible: true, desde: "", t: 1, s: {} as PresenciaMedio["s"], ...extra }) as PresenciaMedio;

const CAPS_BOARD = {
  platform: "Android",
  syncDeviceId: "sync-vieja",
  aparato: { v: 1, medio: "android", app: "os", so: "android", soV: "14", equipo: "Samsung SM-X205", version: "0.5.0", huella: "a1a1a1a1b2b2b2b2" },
};

describe("presenciaViva", () => {
  it("la tableta sin internet, con el enlace local abierto: «en línea · vía red local · 57 ms» y versión de su fila", () => {
    const p = presenciaViva(BOARD, {
      medios: [], // sin internet en la tableta: nada en la presencia de la cuenta
      locales: [{ neuronDeviceId: NUEVA, syncDeviceId: "sync-127", rttMs: 57.4 }], // declaró el id de antes de fusionar
      capacidades: CAPS_BOARD,
      vigente,
    });
    expect(p).toMatchObject({ enLinea: true, via: "red-local", rttMs: 57.4, version: "0.5.0", fuenteInfo: "registro" });
    expect(p.info).toEqual({ medio: "android", app: "os", so: "android", soV: "14", equipo: "Samsung SM-X205" });
    expect(textoEstadoVivo(p)).toBe("en línea · vía red local · 57 ms");
  });

  it("el enlace local también se reconoce por el id de sync que guarda su fila", () => {
    const p = presenciaViva(BOARD, { medios: [], locales: [{ syncDeviceId: "sync-vieja", rttMs: null }], capacidades: CAPS_BOARD });
    expect(textoEstadoVivo(p)).toBe("en línea · vía red local");
  });

  it("malla P2P: por la red local o por internet", () => {
    const local = presenciaViva(BOARD, {
      medios: [],
      malla: [{ neuronId: BOARD, enlace: { estado: "conectado", latenciaMs: 12, ruta: { clase: "misma-red-local" } } }],
    });
    expect(textoEstadoVivo(local)).toBe("en línea · vía red local · 12 ms");
    const lejos = presenciaViva(BOARD, { medios: [], malla: [{ neuronId: BOARD, enlace: { estado: "conectado", ruta: { clase: "internet-directo", rttMs: 80 } } }] });
    expect(textoEstadoVivo(lejos)).toBe("en línea · vía malla P2P · 80 ms");
    const caida = presenciaViva(BOARD, { medios: [], malla: [{ neuronId: BOARD, enlace: { estado: "fallido" } }] });
    expect(caida.enLinea).toBe(false);
  });

  it("el faro de la red local (app nativa) cuenta si se oyó hace menos de 60 s", () => {
    expect(presenciaViva(BOARD, { medios: [], vecinos: [{ neurona: NUEVA, ip: "192.168.1.20", visto_hace_s: 14 }], vigente }).via).toBe("red-local");
    expect(presenciaViva(BOARD, { medios: [], vecinos: [{ neurona: BOARD, ip: "192.168.1.20", visto_hace_s: 75 }] }).enLinea).toBe(false);
    // Sin id en su faro: por la última IP del vínculo.
    const porIp = presenciaViva(BOARD, { medios: [], vecinos: [{ neurona: null, ip: "192.168.1.20", visto_hace_s: 3 }], vinculos: [{ neurona: BOARD, ultimaIp: "192.168.1.20" }] });
    expect(porIp.via).toBe("red-local");
  });

  it("solo en la presencia de la cuenta: «vía internet», y la versión y el aparato que anuncia mandan sobre la fila", () => {
    const p = presenciaViva(BOARD, {
      medios: [medio(BOARD, { v: { nativa: "0.6.0" } as PresenciaMedio["v"], d: { medio: "android", app: "os", so: "android", equipo: "Samsung SM-X205", pa: 1 } })],
      capacidades: CAPS_BOARD,
    });
    expect(p).toMatchObject({ enLinea: true, via: "cuenta", version: "0.6.0", fuenteInfo: "presencia" });
    expect(textoEstadoVivo(p)).toBe("en línea · vía internet");
  });

  it("nada en vivo: «no está abierta ahora», con lo que guardó su fila si lo hay; datos raros: nunca lanza", () => {
    const p = presenciaViva(BOARD, { medios: [], capacidades: CAPS_BOARD });
    expect(p.enLinea).toBe(false);
    expect(textoEstadoVivo(p)).toBe("no está abierta ahora");
    expect(p.version).toBe("0.5.0");
    expect(presenciaViva("", { medios: [] }).enLinea).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(presenciaViva(BOARD, { medios: [null as any], locales: [null as any], capacidades: "x" as any }).enLinea).toBe(false);
  });
});
