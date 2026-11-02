// @vitest-environment jsdom
// Botones de valoración del chat de Astraura: accesibles por teclado, con
// aria-label, y guardando la experiencia en el almacén inyectado.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ValorarRespuesta } from "@/components/astraura/valorar-respuesta";
import { CLAVE_VOTOS_VOZ, leerVotos } from "@/lib/aurora/votos-voz";
import type { Almacen, LineaExperiencias } from "@/lib/astraura/experiencias";
import { leer } from "@/lib/astraura/experiencias";

function almacenMemoria(): Almacen & { datos: LineaExperiencias[] } {
  const datos: LineaExperiencias[] = [];
  return {
    datos,
    poner: async (l) => { datos.push(l); },
    lineas: async () => [...datos],
  };
}

const base = {
  entrada: "¿Qué hora es?",
  respuesta: "Las siete.",
  ambito: "comunidad",
  capa: "needle" as const,
  modelo: "needle3-20",
};

afterEach(cleanup);

describe("ValorarRespuesta", () => {
  it("renderiza 👍, 👎 y corregir accesibles por teclado con aria-label", () => {
    render(<ValorarRespuesta {...base} almacen={almacenMemoria()} />);
    expect(screen.getByRole("button", { name: "Respuesta útil" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Respuesta incorrecta" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Corregir la respuesta" })).toBeTruthy();
  });

  it("👍 guarda una valoración positiva con ámbito, capa y modelo", async () => {
    const al = almacenMemoria();
    render(<ValorarRespuesta {...base} almacen={al} />);
    fireEvent.click(screen.getByRole("button", { name: "Respuesta útil" }));
    await waitFor(async () => {
      const leidas = await leer(10, al);
      expect(leidas).toHaveLength(1);
      expect(leidas[0].valoracion).toBe("positiva");
      expect(leidas[0].resultado).toBe(true);
      expect(leidas[0].ambito).toBe("comunidad");
      expect(leidas[0].modelo).toBe("needle3-20");
    });
    expect(screen.getByRole("status").textContent).toContain("Gracias");
  });

  it("guarda el resultado de las herramientas si las hubo", async () => {
    const al = almacenMemoria();
    render(
      <ValorarRespuesta
        {...base}
        almacen={al}
        herramientas={[{ nombre: "reloj", ok: true }, { nombre: "mapa", ok: false }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Respuesta incorrecta" }));
    await waitFor(async () => {
      const leidas = await leer(10, al);
      expect(leidas[0].valoracion).toBe("negativa");
      expect(leidas[0].resultado).toBe(false);
      expect(leidas[0].herramientas).toEqual([
        { nombre: "reloj", ok: true },
        { nombre: "mapa", ok: false },
      ]);
    });
  });

  it("«corregir» pide el texto y lo guarda como corrección", async () => {
    const al = almacenMemoria();
    render(<ValorarRespuesta {...base} almacen={al} />);
    fireEvent.click(screen.getByRole("button", { name: "Corregir la respuesta" }));
    const enviar = screen.getByRole("button", { name: "Enviar corrección" });
    expect((enviar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Escribe la respuesta correcta"), {
      target: { value: "Son las ocho." },
    });
    fireEvent.click(enviar);
    await waitFor(async () => {
      const leidas = await leer(10, al);
      expect(leidas[0].tipo).toBe("correccion");
      expect(leidas[0].correccion).toBe("Son las ocho.");
      expect(leidas[0].valoracion).toBe("negativa");
    });
  });

  it("Escape o Cancelar salen del modo corrección sin guardar", () => {
    render(<ValorarRespuesta {...base} almacen={almacenMemoria()} />);
    fireEvent.click(screen.getByRole("button", { name: "Corregir la respuesta" }));
    fireEvent.keyDown(screen.getByLabelText("Escribe la respuesta correcta"), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Respuesta útil" })).toBeTruthy();
  });

  // (VST1018N) El pulgar de la respuesta hablada: si la respuesta salió por un
  // motor de voz, el 👍/👎 también llega al elector que aprende (votos-voz.ts).
  describe("con motor de voz", () => {
    it("el pulgar guarda un voto para el motor que habló la respuesta", () => {
      window.localStorage.clear();
      render(<ValorarRespuesta {...base} almacen={almacenMemoria()} motorVoz="kokoro" />);
      fireEvent.click(screen.getByRole("button", { name: "Respuesta útil" }));
      const votos = leerVotos();
      expect(votos).toEqual([{ motor: "kokoro", voto: 1, timestamp: expect.any(Number) }]);
    });

    it("el 👎 también vota, y sin motor de voz el pulgar no escribe voto alguno", () => {
      window.localStorage.clear();
      render(<ValorarRespuesta {...base} almacen={almacenMemoria()} motorVoz="omnivoice" />);
      fireEvent.click(screen.getByRole("button", { name: "Respuesta incorrecta" }));
      expect(leerVotos()).toEqual([{ motor: "omnivoice", voto: -1, timestamp: expect.any(Number) }]);

      render(<ValorarRespuesta {...base} almacen={almacenMemoria()} />);
      fireEvent.click(screen.getByRole("button", { name: "Respuesta útil" }));
      const crudo = window.localStorage.getItem(CLAVE_VOTOS_VOZ);
      expect(JSON.parse(crudo ?? "[]")).toHaveLength(1); // solo el voto anterior
    });
  });
});
