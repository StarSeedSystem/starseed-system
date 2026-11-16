import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProtomoleculaLigera } from "../protomolecula-ligera";

vi.mock("@/lib/widgets/forma/nivel-dispositivo", () => ({
  useNivelRender: vi.fn(),
}));

vi.mock("@/lib/widgets/astraura/estado-forma", () => ({
  formaDeEstado: vi.fn((e: string) => {
    const mapa: Record<string, string> = {
      calma: "icosaedro",
      escuchando: "merkaba",
      pensando: "teseracto",
      hablando: "jitterbug",
      error: "semilla",
    };
    return mapa[e] as any;
  }),
  paletaDeEstado: vi.fn(() => "astraura"),
  ritmoDeEstado: vi.fn((e: string) => {
    const mapa: Record<string, { giroS: number; respiraS: number }> = {
      calma: { giroS: 55, respiraS: 13 },
      escuchando: { giroS: 21, respiraS: 8 },
      pensando: { giroS: 13, respiraS: 5 },
      hablando: { giroS: 21, respiraS: 3 },
      error: { giroS: 0, respiraS: 21 },
    };
    return mapa[e] ?? { giroS: 55, respiraS: 13 };
  }),
}));

vi.mock("@/lib/protomolecula/orbe4d/coreografia", () => ({
  PALETAS: {
    protomolecula: {
      colores: ["#10B981", "#A855F7", "#00F0FF", "#D4AF37"],
      brillo: "#F8F9FA",
      halo: "#10B981",
    },
    astraura: {
      colores: ["#00F0FF", "#007FFF", "#A78BFA"],
      brillo: "#F8F9FA",
      halo: "#00F0FF",
    },
    trinity: {
      colores: ["#007FFF", "#10B981", "#FFBF00", "#DC143C"],
      brillo: "#F8F9FA",
      halo: "#007FFF",
    },
    error: {
      colores: ["#EF4444", "#F87171", "#FCA5A5"],
      brillo: "#F8F9FA",
      halo: "#EF4444",
    },
  },
}));

vi.mock("@/lib/protomolecula/orbe4d/proyeccion-ligera", () => ({
  proyectarForma: vi.fn((_id: string, _giro: number, _lado: number) => ({
    lineas: Array(12).fill([0, 0, 10, 0]),
    puntos: Array(55).fill([0, 0]),
  })),
  type IdForma: "semilla" | "merkaba" | "jitterbug" | "teseracto" | "dodecaedro" | "matriz" | "icosaedro" | "modelo",
}));

import { useNivelRender } from "@/lib/widgets/forma/nivel-dispositivo";
import { formaDeEstado, paletaDeEstado, ritmoDeEstado } from "@/lib/widgets/astraura/estado-forma";
import { proyectarForma } from "@/lib/protomolecula/orbe4d/proyeccion-ligera";

const useNivelRenderMock = useNivelRender as any;
const formaDeEstadoMock = formaDeEstado as any;
const paletaDeEstadoMock = paletaDeEstado as any;
const ritmoDeEstadoMock = ritmoDeEstado as any;
const proyectarFormaMock = proyectarForma as any;

describe("ProtomoleculaLigera", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders with quiet state by default (calma, sin animación)", () => {
    useNivelRenderMock.mockReturnValue("ligero");
    render(<ProtomoleculaLigera estado="calma" tam={100} />);

    const svg = screen.getByTestId("protomolecula-svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("data-viva", "false");
    expect(svg).toHaveAttribute("data-estado", "calma");
    expect(svg).toHaveAttribute("data-forma", "icosaedro");
  });

  it("renders each estado with a distinct forma", () => {
    useNivelRenderMock.mockReturnValue("pleno");
    const estados = ["calma", "escuchando", "pensando", "hablando", "error"] as const;

    estados.forEach((estado) => {
      render(<ProtomoleculaLigera estado={estado} tam={100} animada={false} key={estado} />);

      const svg = screen.getByTestId("protomolecula-svg");
      expect(svg).toHaveAttribute("data-forma", formaDeEstadoMock(estado));
    });
  });

  it("does not animate when animada=false", () => {
    useNivelRenderMock.mockReturnValue("pleno");
    render(<ProtomoleculaLigera estado="pensando" tam={100} animada={false} />);

    const svg = screen.getByTestId("protomolecula-svg");
    expect(svg).toHaveAttribute("data-viva", "false");
  });

  it("does not animate in ligero mode (device nivel)", () => {
    useNivelRenderMock.mockReturnValue("ligero");
    render(<ProtomoleculaLigera estado="hablando" tam={100} animada={true} />);

    const svg = screen.getByTestId("protomolecula-svg");
    expect(svg).toHaveAttribute("data-viva", "false");
  });

  it("renders with animation when viva: pleno nivel, animada=true, prefers-reduced-motion=false", () => {
    useNivelRenderMock.mockReturnValue("pleno");
    render(<ProtomoleculaLigera estado="pensando" tam={100} animada={true} />);

    const svg = screen.getByTestId("protomolecula-svg");
    expect(svg).toHaveAttribute("data-viva", "true");
  });

  it("changes state without full re-render (single svg)", () => {
    const { rerender } = render(<ProtomoleculaLigera estado="calma" tam={100} animada={false} />);

    const svg = screen.getByTestId("protomolecula-svg");
    expect(svg).toHaveAttribute("data-forma", "icosaedro");

    rerender(<ProtomoleculaLigera estado="pensando" tam={100} animada={false} />);
    expect(screen.getByTestId("protomolecula-svg")).toHaveAttribute("data-forma", "teseracto");
  });

  it("cross-fade on estado cambio when viva", () => {
    useNivelRenderMock.mockReturnValue("pleno");

    const { rerender } = render(<ProtomoleculaLigera estado="calma" tam={100} animada={true} />);
    const svg = screen.getByTestId("protomolecula-svg");

    rerender(<ProtomoleculaLigera estado="pensando" tam={100} animada={true} />);

    expect(screen.getByTestId("protomolecula-svg")).toHaveAttribute("data-estado", "pensando");
  });

  it("aria-hidden present on svg", () => {
    useNivelRenderMock.mockReturnValue("pleno");
    render(<ProtomoleculaLigera estado="calma" tam={100} />);

    const svg = screen.getByTestId("protomolecula-svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("first render is quieto (primer estado)", () => {
    useNivelRenderMock.mockReturnValue("normal");
    render(<ProtomoleculaLigera estado="calma" tam={100} animada={true} />);

    const svg = screen.getByTestId("protomolecula-svg");
    expect(svg).toHaveAttribute("data-viva", "false");
  });

  it("uses formaForzada when provided", () => {
    useNivelRenderMock.mockReturnValue("ligero");
    render(<ProtomoleculaLigera estado="calma" tam={100} formaForzada="merkaba" />);

    const svg = screen.getByTestId("protomolecula-svg");
    expect(svg).toHaveAttribute("data-forma", "merkaba");
  });

  it("displays etiqueta in title", () => {
    useNivelRenderMock.mockReturnValue("ligero");
    render(<ProtomoleculaLigera estado="hablando" tam={100} etiqueta="Astraura pensando" />);

    const container = screen.getByTestId("protomolecula-svg").parentElement;
    expect(container).toHaveAttribute("title", "Astraura pensando");
  });
});