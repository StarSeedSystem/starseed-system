import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProtomoleculaLigera } from "../protomolecula-ligera";
import type { EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";
import type { NivelRender } from "@/lib/widgets/forma/nivel-dispositivo";

const { useNivelRenderMock } = vi.hoisted(() => ({
  useNivelRenderMock: vi.fn(() => "pleno" as NivelRender),
}));

vi.mock("@/lib/widgets/forma/nivel-dispositivo", () => ({
  useNivelRender: useNivelRenderMock,
}));

const mockMatchMedia = (matches: boolean) => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
};

const renderProtomolecula = (props: {
  estado: EstadoAsistente;
  tam: number;
  animada?: boolean;
  etiqueta?: string;
  className?: string;
}) => render(<ProtomoleculaLigera {...props} />);

describe("ProtomoleculaLigera", () => {
  const estados: EstadoAsistente[] = ["calma", "escuchando", "pensando", "hablando", "error"];

  beforeEach(() => {
    useNivelRenderMock.mockReturnValue("pleno");
    mockMatchMedia(false);
  });

  it("cada estado pinta una forma distinta (data-forma)", () => {
    for (const estado of estados) {
      const { unmount } = renderProtomolecula({ estado, tam: 80 });
      const svg = screen.getByTestId("protomolecula-ligera");
      expect(svg).toHaveAttribute("data-forma", estado);
      unmount();
    }
  });

  it("con useNivelRender en 'ligero' data-viva='false' y sin animaciones CSS", () => {
    useNivelRenderMock.mockReturnValue("ligero");
    const { unmount } = renderProtomolecula({ estado: "calma", tam: 80 });
    const svg = screen.getByTestId("protomolecula-ligera");
    expect(svg).toHaveAttribute("data-viva", "false");
    const animatedElements = svg.querySelectorAll("[style*='animation']");
    expect(animatedElements.length).toBe(0);
    unmount();
  });

  it("con prefers-reduced-motion data-viva='false' y sin animaciones CSS", () => {
    mockMatchMedia(true);
    const { unmount } = renderProtomolecula({ estado: "calma", tam: 80 });
    const svg = screen.getByTestId("protomolecula-ligera");
    expect(svg).toHaveAttribute("data-viva", "false");
    const animatedElements = svg.querySelectorAll("[style*='animation']");
    expect(animatedElements.length).toBe(0);
    unmount();
  });

  it("en 'pleno' y sin reducción data-viva='true'", () => {
    const { unmount } = renderProtomolecula({ estado: "calma", tam: 80 });
    const svg = screen.getByTestId("protomolecula-ligera");
    expect(svg).toHaveAttribute("data-viva", "true");
    unmount();
  });

  it("cambiar de 'calma' a 'pensando' conserva un solo <svg> y cambia data-forma", () => {
    const { rerender } = renderProtomolecula({ estado: "calma", tam: 80 });
    const svg1 = screen.getByTestId("protomolecula-ligera");
    expect(svg1).toHaveAttribute("data-forma", "calma");

    rerender(<ProtomoleculaLigera estado="pensando" tam={80} />);
    const svg2 = screen.getByTestId("protomolecula-ligera");
    expect(svg2).toBe(svg1);
    expect(svg2).toHaveAttribute("data-forma", "pensando");
  });

  it("aria-hidden presente", () => {
    const { unmount } = renderProtomolecula({ estado: "calma", tam: 80 });
    const svg = screen.getByTestId("protomolecula-ligera");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    unmount();
  });

  it("con animada=false no hay animaciones aunque el nivel sea pleno", () => {
    const { unmount } = renderProtomolecula({ estado: "calma", tam: 80, animada: false });
    const svg = screen.getByTestId("protomolecula-ligera");
    expect(svg).toHaveAttribute("data-viva", "false");
    const animatedElements = svg.querySelectorAll("[style*='animation']");
    expect(animatedElements.length).toBe(0);
    unmount();
  });

  it("halo con degradado radial de la paleta del estado y φ veces la forma", () => {
    const { unmount } = renderProtomolecula({ estado: "calma", tam: 80 });
    const svg = screen.getByTestId("protomolecula-ligera");
    const defs = svg.querySelector("defs");
    expect(defs).toBeInTheDocument();
    const gradient = defs?.querySelector("radialGradient");
    expect(gradient).toBeInTheDocument();
    unmount();
  });

  it("líneas y puntos de proyectarForma con trazo fino y brillo en puntos", () => {
    const { unmount } = renderProtomolecula({ estado: "calma", tam: 80 });
    const svg = screen.getByTestId("protomolecula-ligera");
    const lines = svg.querySelectorAll("line");
    const circles = svg.querySelectorAll("circle");
    expect(lines.length).toBeGreaterThan(0);
    expect(circles.length).toBeGreaterThan(0);
    unmount();
  });

  it("data-estado refleja el estado pasado", () => {
    for (const estado of estados) {
      const { unmount } = renderProtomolecula({ estado, tam: 80 });
      const svg = screen.getByTestId("protomolecula-ligera");
      expect(svg).toHaveAttribute("data-estado", estado);
      unmount();
    }
  });

  it("etiqueta opcional se renderiza como title accesible", () => {
    const { unmount } = renderProtomolecula({ estado: "calma", tam: 80, etiqueta: "Aurora" });
    const svg = screen.getByTestId("protomolecula-ligera");
    const title = svg.querySelector("title");
    expect(title).toHaveTextContent("Aurora");
    unmount();
  });
});