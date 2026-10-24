// @vitest-environment jsdom
/**
 * SGO1024F — la ficha propia de la neurona también lleva su voz MEDIDA
 * (medirFichaPropia → vozMedida). Prueba con testing-library y medidas
 * simuladas: sin red, sin micrófono y sin daemon. Solo funciones puras y
 * almacenamiento local inyectado por el propio módulo de medidas.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useEffect, useState } from "react";

import { medirFichaPropia } from "../device-network-panel";
import type { CapacidadesNodo } from "@/lib/network/capacidades-nodo";
import type { DeviceInfo } from "@/lib/network/device-registry";
import { anotarMedida } from "@/lib/aurora/medidas-voz";
import { neuronDeviceIdActual } from "@/lib/network/identidad-dispositivo";

describe("ficha propia con voz medida (SGO1024F)", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
  });

  it("sin medidas la ficha no lleva `voz` (nunca se declara)", async () => {
    const ficha = await medirFichaPropia(DISPOSITIVO);
    expect("voz" in ficha).toBe(false);
    render(<FichaViva dispositivo={DISPOSITIVO} />);
    expect(await screen.findByTestId("estado")).toHaveTextContent("ficha");
    expect(screen.getByTestId("nodoId")).toHaveTextContent("dev-propio-1");
    expect(screen.getByTestId("habla")).toHaveTextContent("");
    expect(screen.getByTestId("oido")).toHaveTextContent("");
  });

  it("con medidas simuladas de ESTA neurona anuncia habla y oído medidos", async () => {
    anotarMedida({ motor: "supertonic", tipo: "primer-sonido", valor: 350 });
    anotarMedida({ motor: "supertonic", tipo: "primer-sonido", valor: 410 });
    anotarMedida({ motor: "vibeasr-158", tipo: "tiempo-real-oido", valor: 7.1 });
    const ficha = await medirFichaPropia(DISPOSITIVO);
    expect(ficha.voz).toEqual({
      oido: [{ motor: "vibeasr-158", idiomas: [], tiempoReal: 7.1, flujo: false }],
      habla: [{ motor: "supertonic", primerSonidoMs: 380 }],
    });
    render(<FichaViva dispositivo={DISPOSITIVO} />);
    expect(await screen.findByTestId("habla")).toHaveTextContent("supertonic=380");
    expect(screen.getByTestId("oido")).toHaveTextContent("vibeasr-158=7.1");
  });

  it("lo que anotó OTRA neurona (o queda caducado) no cuenta", async () => {
    anotarMedida({ neurona: "otra-neurona", motor: "kokoro", tipo: "primer-sonido", valor: 900 });
    const ficha = await medirFichaPropia(DISPOSITIVO);
    expect("voz" in ficha).toBe(false);
    render(<FichaViva dispositivo={DISPOSITIVO} />);
    expect(await screen.findByTestId("estado")).toHaveTextContent("ficha");
    expect(screen.getByTestId("habla")).toHaveTextContent("");
  });
});


const DISPOSITIVO: DeviceInfo = {
  id: "dev-propio-1",
  label: "Mac de pruebas",
  platform: "Macintosh",
  userAgent: "prueba",
  publicIp: null,
  lastSeen: 0,
};

/** Espejo del efecto del panel: mide la ficha propia y la pinta en vivo. */
function FichaViva({ dispositivo }: { dispositivo: DeviceInfo }) {
  const [ficha, setFicha] = useState<CapacidadesNodo | null>(null);
  useEffect(() => {
    let vivo = true;
    void medirFichaPropia(dispositivo).then((f) => {
      if (vivo) setFicha(f);
    });
    return () => {
      vivo = false;
    };
  }, [dispositivo]);
  return (
    <div>
      <span data-testid="estado">{ficha ? "ficha" : "midiendo"}</span>
      <span data-testid="nodoId">{ficha?.nodoId ?? ""}</span>
      <span data-testid="habla">
        {(ficha?.voz?.habla ?? []).map((h) => `${h.motor}=${h.primerSonidoMs}`).join(",")}
      </span>
      <span data-testid="oido">
        {(ficha?.voz?.oido ?? []).map((o) => `${o.motor}=${o.tiempoReal}`).join(",")}
      </span>
    </div>
  );
}
