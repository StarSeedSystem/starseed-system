import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import DeviceNetworkPanel from "@/components/brains/device-network-panel";
import { anotarMedida, CLAVE_MEDIDAS_VOZ } from "@/lib/aurora/medidas-voz";

/**
 * SGO1024F · La ficha propia de la neurona también lleva su voz MEDIDA.
 *
 * medirFichaPropia (device-network-panel.tsx) pasa
 * `voz: vozMedida(leerMedidas(), { neurona: device.id, ahora })` a crearFichaNodo:
 * con medidas de ESTA neurona la ficha las anuncia en la UI («voz hablada medida»,
 * «voz oída medida»); sin medidas el campo no aparece. Las medidas simuladas van
 * por la vía real de anotarMedida (localStorage) y del espejo de dispositivo.
 */

const NEURONA = "voz-test-neurona";
const CLAVE_SELF = "starseed.device.self";
const CLAVE_DISPOSITIVOS = "starseed.network.devices";
const CLAVE_DEVICE_ID = "starseed.device.id";

/** Espejo de ESTE dispositivo: es la ficha que el panel hidrata sin red. */
const espejo = {
  id: NEURONA,
  label: "Nodo de voz",
  platform: "React Test Browser",
  userAgent: "",
  publicIp: null as string | null,
  lastSeen: Date.now(),
};

/** Prepara el almacenamiento como el OS lo dejaría tras registrar la neurona. */
function sembrarDispositivo(): void {
  localStorage.clear();
  localStorage.setItem(CLAVE_DEVICE_ID, NEURONA);
  const deviceInfo = { ...espejo, lastSeen: Date.now() };
  localStorage.setItem(CLAVE_SELF, JSON.stringify(deviceInfo));
  localStorage.setItem(CLAVE_DISPOSITIVOS, JSON.stringify([deviceInfo]));
}

/** Anota una medida REAL (recorta y valida) para la neurona del espejo. */
function medir(
  motor: string,
  tipo: "primer-sonido" | "tiempo-real-oido",
  valor: number,
  opciones: { idioma?: string; flujo?: boolean } = {},
): void {
  const ok = anotarMedida({ neurona: NEURONA, motor, tipo, valor, ...opciones });
  expect(ok).toBe(true);
}

function montarPanel(): () => void {
  const desmontar = render(
    <AppearanceProvider>
      <DeviceNetworkPanel />
    </AppearanceProvider>,
  ).unmount;
  return desmontar;
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe("medirFichaPropia: la ficha propia lleva su voz medida", () => {
  it("anuncia en la UI los motores de voz con medidas de esta neurona", async () => {
    sembrarDispositivo();
    medir("kokoro", "primer-sonido", 200);
    medir("parakeet-v3", "tiempo-real-oido", 45, { idioma: "es-ES", flujo: true });

    montarPanel();

    // La ficha propia está medida (tok/s sin medir) y LLEVA la voz:
    expect(await screen.findByText(/voz hablada medida: kokoro/)).toBeTruthy();
    expect(await screen.findByText(/voz oída medida: parakeet-v3/)).toBeTruthy();
    expect(await screen.findByText(/Este nodo:/)).toBeTruthy();
    expect(screen.getByText(/React Test Browser/)).toBeTruthy();
  });

  it("sin medidas la voz no aparece en la ficha (nunca se inventa)", async () => {
    sembrarDispositivo();
    expect(localStorage.getItem(CLAVE_MEDIDAS_VOZ)).toBeNull();

    montarPanel();

    // La ficha sí se midió sin capas: tok/s sin medir…
    expect(await screen.findByText(/tok\/s sin medir/)).toBeTruthy();
    // …y la voz, al no haber medidas, NO aparece.
    expect(screen.queryByText(/voz hablada medida/)).toBeNull();
    expect(screen.queryByText(/voz oída medida/)).toBeNull();

    cleanup();
  });
});
