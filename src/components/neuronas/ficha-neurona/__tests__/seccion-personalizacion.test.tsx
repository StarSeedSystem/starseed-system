import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render as renderBase, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { AppearanceProvider } from "@/context/appearance-context";
import type { Neuron } from "@/lib/neurons/neurons";
import { settingsFor } from "@/lib/neurons/neurons";
import { SeccionPersonalizacion, textoValor } from "../seccion-personalizacion";

const render = (ui: ReactElement) => renderBase(<AppearanceProvider>{ui}</AppearanceProvider>);

function telefono(id: string): Neuron {
  return {
    id, name: "Móvil", kind: "mobile",
    capabilities: { platform: "Android", battery: { level: 0.6, charging: false }, aparato: { v: 1, medio: "android", so: "android" } },
    permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
  } as unknown as Neuron;
}

describe("NEU1126C · SeccionPersonalizacion", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("textoValor dice sí/no y el relé en palabras", () => {
    expect(textoValor("offerStorage", false)).toBe("No");
    expect(textoValor("releCuando", "cargando-wifi")).toContain("Wi‑Fi");
  });

  it("propone y no aplica nada solo", () => {
    render(<SeccionPersonalizacion neurona={telefono("tel-1")} />);
    expect(screen.getByText(/Ahorro de batería/)).toBeTruthy();
    expect(settingsFor("tel-1").offerStorage).toBeUndefined();
  });

  it("Aplicar guarda el perfil y Deshacer lo quita", () => {
    render(<SeccionPersonalizacion neurona={telefono("tel-2")} />);
    fireEvent.click(screen.getByText("Aplicar"));
    expect(settingsFor("tel-2")).toMatchObject({ releCuando: "cargando-wifi", offerCompute: false });
    fireEvent.click(screen.getByText("Deshacer"));
    expect(settingsFor("tel-2").releCuando).toBeUndefined();
    expect(screen.getByText("Aplicar")).toBeTruthy();
  });

  it("Ahora no no cambia ningún ajuste", () => {
    render(<SeccionPersonalizacion neurona={telefono("tel-3")} />);
    fireEvent.click(screen.getByText("Ahora no"));
    expect(settingsFor("tel-3").releCuando).toBeUndefined();
    expect(screen.getByText("Ver la propuesta")).toBeTruthy();
  });

  it("no ofrece interruptores de control, terminal ni administración", () => {
    render(<SeccionPersonalizacion neurona={telefono("tel-4")} />);
    fireEvent.click(screen.getByText("Ajustar"));
    const texto = document.body.textContent ?? "";
    expect(texto).not.toMatch(/terminal|control remoto|administraci/i);
  });
});
