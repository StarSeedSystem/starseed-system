import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as renderCrudo, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppearanceProvider } from "@/context/appearance-context";
import { SeccionCapas } from "../seccion-capas";
import type { EstadoCapas } from "@/lib/senales/geo/capas";

const ESTADO: EstadoCapas = { activas: [], opacidad: {} };

const BASE = {
  onAlternar: vi.fn(),
  onOpacidad: vi.fn(),
  permiso: "desconocido" as const,
  compartir: false,
  canal: { union: "sin-intentar" as const, motivo: "todavía no se intentó unir el canal privado de posición" },
  onCompartir: vi.fn(),
  onUbicarme: vi.fn(),
};

const render = (overrides: { publicacion?: { publica: boolean; comunidad: boolean; privada: boolean }; onPublicacion?: ReturnType<typeof vi.fn> } = {}) =>
  renderCrudo(
    <AppearanceProvider>
      <SeccionCapas
        estado={ESTADO}
        {...BASE}
        publicacion={overrides.publicacion ?? { publica: false, comunidad: false, privada: false }}
        onPublicacion={overrides.onPublicacion ?? vi.fn()}
      />
    </AppearanceProvider>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SeccionCapas: sección «Publicar mis señales» (AUD1117)", () => {
  it("muestra el título y la nota de apagado de fábrica", () => {
    render();
    expect(screen.getByText("Publicar mis señales")).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("Apagado de fábrica") && content.includes("no sale nada"))).toBeInTheDocument();
  });

  it("muestra tres interruptores (pública, comunidad, privada) con estado según props", () => {
    render({ publicacion: { publica: false, comunidad: false, privada: false } });
    const switchPublica = screen.getByLabelText("Publicar mis señales en la capa pública del espectrómetro");
    const switchComunidad = screen.getByLabelText("Publicar mis señales en la capa de comunidad del espectrómetro");
    const switchPrivada = screen.getByLabelText("Publicar mis señales en la capa privada de mi cuenta");

    expect(switchPublica).not.toBeChecked();
    expect(switchComunidad).not.toBeChecked();
    expect(switchPrivada).not.toBeChecked();
  });

  it("muestra interruptores encendidos cuando props lo indican", () => {
    render({ publicacion: { publica: true, comunidad: true, privada: true } });
    const switchPublica = screen.getByLabelText("Publicar mis señales en la capa pública del espectrómetro");
    const switchComunidad = screen.getByLabelText("Publicar mis señales en la capa de comunidad del espectrómetro");
    const switchPrivada = screen.getByLabelText("Publicar mis señales en la capa privada de mi cuenta");

    expect(switchPublica).toBeChecked();
    expect(switchComunidad).toBeChecked();
    expect(switchPrivada).toBeChecked();
  });

  it("al hacer click en capa pública, llama a onPublicacion con true", async () => {
    const onPublicacion = vi.fn();
    render({ onPublicacion });
    const switchPublica = screen.getByLabelText("Publicar mis señales en la capa pública del espectrómetro");

    await userEvent.click(switchPublica);

    expect(onPublicacion).toHaveBeenCalledWith("publica", true);
  });

  it("al hacer click en capa comunidad, llama a onPublicacion con true", async () => {
    const onPublicacion = vi.fn();
    render({ onPublicacion });
    const switchComunidad = screen.getByLabelText("Publicar mis señales en la capa de comunidad del espectrómetro");

    await userEvent.click(switchComunidad);

    expect(onPublicacion).toHaveBeenCalledWith("comunidad", true);
  });

  it("al hacer click en capa privada, llama a onPublicacion con true", async () => {
    const onPublicacion = vi.fn();
    render({ onPublicacion });
    const switchPrivada = screen.getByLabelText("Publicar mis señales en la capa privada de mi cuenta");

    await userEvent.click(switchPrivada);

    expect(onPublicacion).toHaveBeenCalledWith("privada", true);
  });

  it("al hacer click en capa ya encendida, llama a onPublicacion con false", async () => {
    const onPublicacion = vi.fn();
    render({ publicacion: { publica: true, comunidad: false, privada: false }, onPublicacion });
    const switchPublica = screen.getByLabelText("Publicar mis señales en la capa pública del espectrómetro");

    await userEvent.click(switchPublica);

    expect(onPublicacion).toHaveBeenCalledWith("publica", false);
  });

  it("cada capa es independiente: clicks en una no afectan llamadas de las otras", async () => {
    const onPublicacion = vi.fn();
    render({ onPublicacion });
    const switchPublica = screen.getByLabelText("Publicar mis señales en la capa pública del espectrómetro");
    const switchComunidad = screen.getByLabelText("Publicar mis señales en la capa de comunidad del espectrómetro");

    await userEvent.click(switchPublica);
    await userEvent.click(switchComunidad);

    expect(onPublicacion).toHaveBeenCalledTimes(2);
    expect(onPublicacion).toHaveBeenNthCalledWith(1, "publica", true);
    expect(onPublicacion).toHaveBeenNthCalledWith(2, "comunidad", true);
  });

  it("texto descriptivo de capa pública visible solo cuando prop publica es true", () => {
    render({ publicacion: { publica: false, comunidad: false, privada: false } });
    expect(screen.queryByText(/Sin nombres, coordenadas exactas ni ficha personal/)).not.toBeInTheDocument();

    render({ publicacion: { publica: true, comunidad: false, privada: false } });
    expect(screen.getByText(/Sin nombres, coordenadas exactas ni ficha personal/)).toBeInTheDocument();
  });

  it("texto descriptivo de capa comunidad visible solo cuando prop comunidad es true", () => {
    render({ publicacion: { publica: false, comunidad: false, privada: false } });
    expect(screen.queryByText(/Visible solo para miembros de la misma comunidad/)).not.toBeInTheDocument();

    render({ publicacion: { publica: false, comunidad: true, privada: false } });
    expect(screen.getByText(/Visible solo para miembros de la misma comunidad/)).toBeInTheDocument();
  });

  it("texto descriptivo de capa privada visible solo cuando prop privada es true", () => {
    render({ publicacion: { publica: false, comunidad: false, privada: false } });
    expect(screen.queryByText(/canal privado de posición entre las neuronas de tu cuenta/)).not.toBeInTheDocument();

    render({ publicacion: { publica: false, comunidad: false, privada: true } });
    expect(screen.getByText(/canal privado de posición entre las neuronas de tu cuenta/)).toBeInTheDocument();
  });

  it("si no se pasa publicacion ni onPublicacion, la sección no se renderiza", () => {
    renderCrudo(
      <AppearanceProvider>
        <SeccionCapas estado={ESTADO} {...BASE} />
      </AppearanceProvider>,
    );
    expect(screen.queryByText("Publicar mis señales")).not.toBeInTheDocument();
  });

  it("si solo se pasa publicacion sin onPublicacion, la sección no se renderiza", () => {
    renderCrudo(
      <AppearanceProvider>
        <SeccionCapas estado={ESTADO} {...BASE} publicacion={{ publica: false, comunidad: false, privada: false }} />
      </AppearanceProvider>,
    );
    expect(screen.queryByText("Publicar mis señales")).not.toBeInTheDocument();
  });
});