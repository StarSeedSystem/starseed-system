// @vitest-environment jsdom
/**
 * VZF1024F — la ficha propia del panel «Dispositivos y red» también lleva su
 * voz MEDIDA. Sin red: `fetch` rechazado, Supabase simulado y las medidas
 * (medidas-voz.ts) anotadas en el almacenamiento local de jsdom.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DeviceNetworkPanel from "../device-network-panel";
import { anotarMedida } from "@/lib/aurora/medidas-voz";
import { AppearanceProvider } from "@/context/appearance-context";

vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));

/** Id fijo de ESTA neurona: el espejo local lo siembra y el panel lo usa tal cual. */
const ID = "neurona-sgo1024f";
/** Epoch de luz pero no vital; las medidas anotadas llevan Date.now(), siempre vigentes. */
const AHORA = Date.now() - 60_000;

function sembrarDispositivo(): void {
  localStorage.clear();
  localStorage.setItem("starseed.device.id", ID);
  localStorage.setItem(
    "starseed.device.self",
    JSON.stringify({ id: ID, label: "Mac · Chrome", platform: "MacIntel", userAgent: "Chrome", publicIp: null, lastSeen: AHORA }),
  );
}

describe("ficha propia con voz medida (VZF1024F)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("sin red en las pruebas"))));
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("con medidas simuladas de esta neurona, la ficha propia anuncia oído y habla", async () => {
    sembrarDispositivo();
    anotarMedida({ neurona: ID, motor: "supertonic", tipo: "primer-sonido", valor: 350 });
    anotarMedida({ neurona: ID, motor: "parakeet-v3", tipo: "tiempo-real-oido", valor: 11.5, idioma: "es-ES" });
    const { container } = render(
      <AppearanceProvider>
        <DeviceNetworkPanel />
      </AppearanceProvider>,
    );
    await waitFor(() => expect(container.textContent).toMatch(/voz medida: 1 oído\(s\), 1 habla\(s\)/));
  });

  it("sin medidas (o solo de otra neurona) la voz no se anuncia, pero la ficha sí", async () => {
    sembrarDispositivo();
    anotarMedida({ neurona: "otra-neurona", motor: "kokoro", tipo: "primer-sonido", valor: 900 });
    const { container } = render(
      <AppearanceProvider>
        <DeviceNetworkPanel />
      </AppearanceProvider>,
    );
    await waitFor(() => expect(container.textContent).toMatch(/Este nodo:/));
    expect(container.textContent).not.toMatch(/voz medida/);
  });
});
