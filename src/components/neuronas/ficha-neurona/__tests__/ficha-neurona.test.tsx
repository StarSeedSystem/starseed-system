/**
 * Tests para la ficha de neurona (RAIZ NEU1126B-d1).
 * Valida que la ficha se renderiza y muestra las secciones plegables.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import { FichaNeurona } from "../ficha-neurona";

const NUTRONA_DEFAULT: Neuron = {
  id: "neurona-1",
  name: "Mi neurona",
  kind: "tablet",
  capabilities: {
    platform: "Android",
    browser: "Chrome",
    cores: 8,
    memoryGb: 4,
    touch: true,
    installedApp: true,
    astraura158: { online: false, endpoint: "http://127.0.0.1:8000" },
  },
  permissions: {
    compute: true,
    storage: true,
    sync: true,
    agent: true,
    senses: true,
    wake: true,
  },
  last_seen_at: new Date().toISOString(),
  online: true,
  isThisDevice: true,
};

describe("FichaNeurona", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renderiza la ficha y muestra la estructura básica", () => {
    const { container } = render(
      <AppearanceProvider>
        <FichaNeurona neurona={NUTRONA_DEFAULT} onCambio={vi.fn()} />
      </AppearanceProvider>
    );
    // Verificar que el card existe
    expect(container.querySelector(".rounded-2xl")).toBeInTheDocument();
    // Verificar que hay contenido
    expect(container.textContent?.length).toBeGreaterThan(0);
  });

  it("muestra el nombre de la neurona", () => {
    const { container } = render(
      <AppearanceProvider>
        <FichaNeurona neurona={NUTRONA_DEFAULT} onCambio={vi.fn()} />
      </AppearanceProvider>
    );
    // El nombre debe aparecer en el h3 de la tarjeta
    const h3 = container.querySelector("h3");
    expect(h3?.textContent).toContain("Mi neurona");
  });

  it("muestra la sección de identidad", () => {
    const { container } = render(
      <AppearanceProvider>
        <FichaNeurona neurona={NUTRONA_DEFAULT} onCambio={vi.fn()} />
      </AppearanceProvider>
    );
    // La sección debe tener el título "Identidad"
    expect(container.textContent?.includes("Identidad")).toBe(true);
  });

  it("muestra la sección de aparatos", () => {
    const { container } = render(
      <AppearanceProvider>
        <FichaNeurona neurona={NUTRONA_DEFAULT} onCambio={vi.fn()} />
      </AppearanceProvider>
    );
    // La sección debe tener el título "Aparatos"
    expect(container.textContent?.includes("Aparatos")).toBe(true);
  });
});