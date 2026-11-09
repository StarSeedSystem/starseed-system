/**
 * Orquestación del enlace Wi-Fi directo (WFD1108A): cuándo se abre, se propone o nada; el registro de
 * enlaces activos y lo que dicen la pastilla de la vía y la ficha. Contrato: architecture/wifi-directo.md §5.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { CapacidadesWifi } from "@/lib/malla/enlace-wifi-directo";
import {
  etiquetaEnlaceP2p,
  AVISO_RADIO_UNICA,
  ESPERA_TRAS_FALLO_MS,
  UMBRAL_ARCHIVO_BYTES,
  decidirEnlaceWifi,
  enlaceWifiDe,
  esEnlaceWifiDirecto,
  fijarEnlacesWifi,
  leerAjusteWifi,
  rutaConWifi,
  suscribirEnlacesWifi,
  textoEnlaceWifi,
  type EntradaDecision,
} from "@/lib/malla/enlace-wifi-orquestacion";
import { enlaceActualDe } from "@/lib/malla/enlace-wifi-motor";
import { etiquetaVia, nombreDeVia, detalleVia } from "@/lib/mensajeria/medios/medios";

const ANDROID: CapacidadesWifi = { plataforma: "android", ap: ["hotspot-local", "wifi-direct"], cliente: ["wifi-direct"], permiso: "concedido", radioUnica: false, wifi: true, lanas: ["punto-acceso-optin"] };
const MAC: CapacidadesWifi = { plataforma: "macos", ap: [], cliente: ["corewlan", "guiado"], permiso: "concedido", radioUnica: true, wifi: true, lanas: ["punto-acceso-optin"] };

function entrada(x: Partial<EntradaDecision> = {}): EntradaDecision {
  return {
    ajuste: "automatico",
    clase: "archivo",
    bytes: 200 * 1024 * 1024,
    capPropia: ANDROID,
    enlaceActual: { tipo: "ble", kbps: 300 },
    cerca: true,
    fase: "inactivo",
    ahora: 1_000_000,
    ...x,
  };
}

afterEach(() => fijarEnlacesWifi([]));

describe("decidirEnlaceWifi", () => {
  it("archivo grande a una neurona al lado por Bluetooth: Automático abre, Preguntar propone, Nunca nada", () => {
    expect(decidirEnlaceWifi(entrada()).accion).toBe("abrir");
    expect(decidirEnlaceWifi(entrada({ ajuste: "preguntar" })).accion).toBe("proponer");
    expect(decidirEnlaceWifi(entrada({ ajuste: "nunca" }))).toMatchObject({ accion: "nada", motivo: expect.stringContaining("Nunca") });
  });

  it("en el Mac avisa de que deja su red (una sola radio) aunque se abra solo", () => {
    expect(decidirEnlaceWifi(entrada({ capPropia: MAC }))).toMatchObject({ accion: "abrir", aviso: AVISO_RADIO_UNICA });
    expect(decidirEnlaceWifi(entrada()).aviso).toBeUndefined();
  });

  it("no cambia de red por un archivo pequeño, ni si ya vais por la misma red, ni si el enlace ya basta", () => {
    expect(decidirEnlaceWifi(entrada({ bytes: UMBRAL_ARCHIVO_BYTES - 1 })).accion).toBe("nada");
    expect(decidirEnlaceWifi(entrada({ enlaceActual: { tipo: "red-local", kbps: null } })).accion).toBe("nada");
    expect(decidirEnlaceWifi(entrada({ enlaceActual: { tipo: "wifi-directo", kbps: null } })).accion).toBe("nada");
    expect(decidirEnlaceWifi(entrada({ clase: "llamada", enlaceActual: { tipo: "internet", kbps: 5000 } })).accion).toBe("nada");
    expect(decidirEnlaceWifi(entrada({ clase: "llamada", enlaceActual: { tipo: "ble", kbps: 200 } })).accion).toBe("abrir");
  });

  it("sin proximidad probada, sin capacidades o en marcha: nada, y dice por qué", () => {
    expect(decidirEnlaceWifi(entrada({ cerca: false })).motivo).toContain("Bluetooth LE");
    expect(decidirEnlaceWifi(entrada({ capPropia: null })).accion).toBe("nada");
    expect(decidirEnlaceWifi(entrada({ capPropia: { ...ANDROID, permiso: "denegado" } })).accion).toBe("nada");
    expect(decidirEnlaceWifi(entrada({ capOtro: { ...MAC, cliente: [], permiso: "no-aplica" } })).accion).toBe("nada");
    expect(decidirEnlaceWifi(entrada({ fase: "uniendo" })).accion).toBe("nada");
    expect(decidirEnlaceWifi(entrada({ fase: "fallido" })).accion).toBe("abrir");
  });

  it("tras un fallo con esa neurona espera 2 minutos antes de volver a abrir solo", () => {
    const ahora = 10_000_000;
    expect(decidirEnlaceWifi(entrada({ ahora, ultimoFallo: ahora - 1000 }))).toMatchObject({ accion: "nada", motivo: expect.stringContaining("falló hace poco") });
    expect(decidirEnlaceWifi(entrada({ ahora, ultimoFallo: ahora - ESPERA_TRAS_FALLO_MS })).accion).toBe("abrir");
  });

  it("el ajuste guardado: lo desconocido es «Preguntar»", () => {
    expect(leerAjusteWifi("automatico")).toBe("automatico");
    expect(leerAjusteWifi("nunca")).toBe("nunca");
    expect(leerAjusteWifi("x")).toBe("preguntar");
    expect(leerAjusteWifi(null)).toBe("preguntar");
  });
});

describe("registro de enlaces activos y pastilla", () => {
  const activo = { neurona: "tel-1", nombre: "Teléfono", ipOtro: "192.168.49.1", ipPropia: "192.168.49.23", ssid: "StarSeed-ab12", metodo: "hotspot-local" as const, soyAp: false, mbps: 433, desde: 1 };

  it("`nativo:<ip>` del otro en la red directa es Wi-Fi directo; la ruta de la vía lo guarda", () => {
    let avisos = 0;
    const baja = suscribirEnlacesWifi(() => avisos++);
    fijarEnlacesWifi([activo]);
    fijarEnlacesWifi([activo]); // igual: no avisa dos veces
    expect(avisos).toBe(1);
    baja();
    expect(esEnlaceWifiDirecto("nativo:192.168.49.1")).toBe(true);
    expect(esEnlaceWifiDirecto("nativo:192.168.1.20")).toBe(false);
    expect(esEnlaceWifiDirecto("local:nativo-abc")).toBe(false);
    expect(rutaConWifi("nativo:192.168.49.1", "misma-red-local")).toBe("wifi-directo");
    expect(rutaConWifi("nativo:192.168.1.20", "misma-red-local")).toBe("misma-red-local");
    expect(enlaceWifiDe("tel-1")).toMatchObject({ mbps: 433 });
    expect(enlaceWifiDe("otra")).toBeNull();
  });

  it("«Enlace Wi-Fi directo: activo · N Mb/s» o «sin medir»", () => {
    expect(textoEnlaceWifi(activo)).toBe("Enlace Wi-Fi directo: activo · 433 Mb/s");
    expect(textoEnlaceWifi({ mbps: null })).toBe("Enlace Wi-Fi directo: activo · sin medir");
    expect(textoEnlaceWifi(null)).toBe("Enlace Wi-Fi directo: no");
  });

  it("la pastilla de la vía dice «Red directa por punto de acceso» si es el hotspot, y Wi‑Fi P2P si no lo es (también con el enlace ya cerrado)", () => {
    const via = { medio: "local" as const, direccion: "sale" as const, enlaceId: "nativo:192.168.49.1", ruta: "wifi-directo", confirmado: true, confirmadoPor: "destino" as const, latenciaMs: 4 };
    expect(etiquetaVia(via)).toBe("Mesh · Wi‑Fi P2P (sin router ni hotspot) · 4 ms ✓"); // sin saber el método: P2P por defecto
    expect(nombreDeVia(via)).toBe("Wi‑Fi P2P (sin router ni hotspot)");
    expect(detalleVia(via).find((l) => l.etiqueta === "Ruta medida")?.valor).toContain("sin router");
    fijarEnlacesWifi([activo]);
    expect(etiquetaVia({ ...via, ruta: "misma-red-local" })).toContain("Red directa por punto de acceso");
    fijarEnlacesWifi([]);
    expect(etiquetaVia({ ...via, ruta: "misma-red-local" })).toContain("Red local (app nativa)");
  });

  it("(WFA1109A) la pastilla nombra el carril: AWDL, Aware o Wi‑Fi Direct, siempre «sin router»", () => {
    expect(etiquetaEnlaceP2p("nativo:awdl:0123456789abcdef", [])).toMatch(/AWDL.*sin router/);
    expect(etiquetaEnlaceP2p("nativo:fe80::1%aware_data0", [])).toMatch(/Aware.*sin router/);
    expect(etiquetaEnlaceP2p("nativo:192.168.49.1", [{ ...activo, metodo: "wifi-direct" }])).toMatch(/Wi.Fi Direct.*sin router/);
    expect(esEnlaceWifiDirecto("nativo:awdl:0123456789abcdef")).toBe(true);
    expect(esEnlaceWifiDirecto("nativo:fe80::1%aware_data0")).toBe(true);
  });

  it("el enlace por el que iría el envío, traducido para decidir", () => {
    fijarEnlacesWifi([activo]);
    expect(enlaceActualDe({ id: "nativo:192.168.49.1", tipo: "nativo" })).toEqual({ tipo: "wifi-directo", kbps: null });
    expect(enlaceActualDe({ id: "nativo:192.168.1.5", tipo: "nativo" }).tipo).toBe("red-local");
    expect(enlaceActualDe({ id: "cuenta:x", tipo: "cuenta", ruta: "internet-directo", capacidadKbps: 900 })).toEqual({ tipo: "internet", kbps: 900 });
    expect(enlaceActualDe({ id: "rele", tipo: "rele" }).tipo).toBe("rele");
    expect(enlaceActualDe(null)).toEqual({ tipo: "ninguno", kbps: 0 });
  });
});
