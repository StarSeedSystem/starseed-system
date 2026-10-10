// @vitest-environment jsdom
/**
 * VincularSinInternet — la interfaz dice la verdad: sin WebRTC lo dice; con WebRTC ofrece los dos
 * gestos (enseñar / leer código); y un enlace local abierto aparece con sus acciones y su medida.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { VincularSinInternet } from "@/components/network/vincular-sin-internet";
import { __vaciarRegistroEnlacesLocales, registrarEnlaceLocal, type EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";

function enlaceFalso(): EnlaceLocalVivo {
  return {
    id: "local:prueba",
    par: { nombre: "Móvil de Ana", plataforma: "Android", syncDeviceId: "S-ana" },
    desde: Date.now() - 5000,
    abierto: () => true,
    rttMs: () => 7,
    ruta: () => "misma-red-local",
    capacidadKbps: () => 24_000,
    enviar: () => true,
    enviarBinario: () => true,
    bufferedAmount: () => 0,
    alMensaje: () => () => undefined,
    ponerPistas: async () => true,
    alFlujoRemoto: () => () => undefined,
    cerrar: () => undefined,
  };
}

afterEach(() => {
  cleanup();
  __vaciarRegistroEnlacesLocales();
  delete (window as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection;
});

describe("VincularSinInternet", () => {
  test("sin WebRTC lo dice en vez de enseñar botones que no funcionarían", () => {
    render(<VincularSinInternet />);
    expect(screen.getByText("Vincular sin internet")).toBeTruthy();
    expect(screen.getByText(/no puede descubrir solo a otro aparato sin internet/)).toBeTruthy();
    expect(screen.getByText(/no tiene WebRTC/)).toBeTruthy();
    expect(screen.queryByText("Enseñar mi código")).toBeNull();
  });

  test("con WebRTC ofrece los dos gestos, y un enlace abierto sale con sus acciones y lo medido", () => {
    (window as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection = function RTCPeerConnection() {};
    registrarEnlaceLocal(enlaceFalso());
    render(<VincularSinInternet compact />);
    expect(screen.getByText("Enseñar mi código")).toBeTruthy();
    expect(screen.getByText("Leer el código de otro aparato")).toBeTruthy();
    expect(screen.getByText("Móvil de Ana")).toBeTruthy();
    expect(screen.getByText("1 enlace directo")).toBeTruthy();
    expect(screen.getByText(/sin internet · misma red local · 7 ms · 24\.0 Mb\/s estimados/)).toBeTruthy();
    for (const accion of ["Llamar", "Videollamada", "Enviar archivo"]) expect(screen.getByText(accion)).toBeTruthy();
  });
});
