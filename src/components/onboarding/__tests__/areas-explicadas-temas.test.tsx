/**
 * RTIMN1021I · Rescate de las pruebas de «Áreas explicadas» y los temas.
 *
 * La rama nube/40145158800 probaba helpers (`areaDeRuta`, `temaDeRuta`,
 * `abrirExplicacion`) y un AREAS exportado que main no tiene: hoy las tarjetas
 * se pintan con `AreasExplicadas` y los textos viven en `guia-temas-red`.
 * Se conservan los casos que main no cubría, adaptados a la API actual.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { AppearanceProvider } from "@/context/appearance-context";
import { AreasExplicadas, type AreaTip } from "@/components/onboarding/areas-explicadas";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";

const area = (o: Partial<AreaTip> = {}): AreaTip => ({
  path: "/agent",
  label: "Agente · Aurora",
  icon: Sparkles,
  tip: "Usar: configura tu IA y habla con Aurora.",
  accent: "text-fuchsia-300",
  ...o,
});

afterEach(() => cleanup());

describe("AreasExplicadas · rescate de las tarjetas y sus temas (RTIMN1021I)", () => {
  it("la tarjeta abre la explicación de su ruta y «Ir» avisa del destino", async () => {
    const onIr = vi.fn();
    render(
      <AppearanceProvider>
        <AreasExplicadas areas={[area()]} onIr={onIr} />
      </AppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Agente · Aurora/ }));

    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/El centro de mando de tu inteligencia/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/Abre el chat y pregúntale a Astraura/)).toBeInTheDocument();

    fireEvent.click(within(dialogo).getByRole("button", { name: /Ir a Agente · Aurora/ }));
    expect(onIr).toHaveBeenCalledWith("/agent");
  });

  it("ningún tema de la guía habla de «varios cerebros»", () => {
    const textos = TODOS_LOS_TEMAS.map((t) => [t.titulo, t.cuerpo, t.voz, t.preguntaAurora, ...t.puntos].join(" ")).join(" ");
    expect(textos.toLowerCase()).not.toContain("varios cerebros");
  });
});
