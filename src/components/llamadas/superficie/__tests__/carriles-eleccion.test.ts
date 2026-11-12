/** LLA1111A · elegir a mano el carril de cada flujo: qué se ofrece y qué no. */
import { describe, expect, it } from "vitest";
import type { CarrilesParVista } from "@/lib/llamadas/tipos";
import { carrilesArriba, eleccionesCarril, parPrincipal, webrtcConectadoCon, type FuenteCarriles } from "../carriles-eleccion";

const soloBle: CarrilesParVista = { parId: "tab:1", voz: "ble-l2cap" as const, video: "ble-l2cap" as const, pantalla: "ble-l2cap" as const, senal: "ble-l2cap" as const, datos: "ble-l2cap" as const, forzados: {}, texto: "Voz: Bluetooth · Vídeo: Bluetooth", director: true };
const conIp: CarrilesParVista = { ...soloBle, video: "webrtc" as const, pantalla: "webrtc" as const };

describe("eleccionesCarril", () => {
  it("solo Bluetooth: «Automático» y el Bluetooth rápido; WebRTC y el resto en la línea de «sin enlace»", () => {
    const e = eleccionesCarril(soloBle, false);
    expect(e.map((x) => x.flujo)).toEqual(["voz", "video", "pantalla"]);
    const video = e[1];
    expect(video.valor).toBe("auto");
    expect(video.textoActual).toBe("Bluetooth rápido");
    expect(video.opciones.map((o) => o.carril)).toEqual(["ble-l2cap"]);
    expect(video.sinEnlace).toEqual(expect.arrayContaining(["WebRTC (IP)", "Wi‑Fi directo", "Red local", "Bluetooth (GATT)"]));
  });

  it("con IP: WebRTC aparece para elegir, en el orden de preferencia del flujo", () => {
    const e = eleccionesCarril(conIp, true);
    expect(e[0].opciones.map((o) => o.carril)).toEqual(["webrtc", "ble-l2cap"]);
    expect(e[1].opciones.map((o) => o.carril)).toEqual(["webrtc", "ble-l2cap"]);
    expect(e[1].textoActual).toBe("WebRTC (IP)");
  });

  it("un forzado que se cayó se enseña marcado (y es el valor del selector)", () => {
    const e = eleccionesCarril({ ...soloBle, forzados: { video: "webrtc" as const } }, false);
    expect(e[1].valor).toBe("webrtc");
    expect(e[1].opciones).toContainEqual({ carril: "webrtc", etiqueta: "WebRTC (IP) (sin enlace ahora)", arriba: false });
    expect(e[0].valor).toBe("auto");
  });

  it("carrilesArriba cuenta lo que lleva algo, el enlace de datos y WebRTC si está conectado", () => {
    expect([...carrilesArriba({ ...soloBle, datos: "ble-gatt" as const }, false)].sort()).toEqual(["ble-gatt", "ble-l2cap"]);
    expect(carrilesArriba(soloBle, true).has("webrtc")).toBe(true);
  });

  it("parPrincipal: el primero o nada", () => {
    expect(parPrincipal([])).toBeNull();
    expect(parPrincipal(undefined)).toBeNull();
    expect(parPrincipal([soloBle])?.parId).toBe("tab:1");
  });
});

describe("webrtcConectadoCon", () => {
  const fuente = (stream: unknown): FuenteCarriles => ({
    carriles: () => [soloBle],
    estado: () => ({ participantes: [{ id: "yo", yo: true }, { id: "tab:1", yo: false, stream: stream as MediaStream }] }),
    forzarCarril: () => undefined,
  });
  const pistas = (...t: Array<{ readyState: string; muted: boolean }>) => ({ getTracks: () => t });
  it("una pista negociada sin ruta llega muda: no cuenta como WebRTC arriba", () => {
    expect(webrtcConectadoCon(fuente(pistas({ readyState: "live", muted: true })), soloBle)).toBe(false);
    expect(webrtcConectadoCon(fuente(null), soloBle)).toBe(false);
  });
  it("una pista viva y no muda, o un flujo ya por WebRTC, sí", () => {
    expect(webrtcConectadoCon(fuente(pistas({ readyState: "live", muted: false })), soloBle)).toBe(true);
    expect(webrtcConectadoCon(fuente(null), conIp)).toBe(true);
  });
});
