import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DisenoMinimo } from "../diseno-minimo";
import type { PropsDiseno, EstadoAsistente } from "@/lib/widgets/astraura/disenos";
import { textoDeEstado } from "@/lib/widgets/astraura/estado-forma";

vi.mock("@/lib/widgets/forma/nivel-dispositivo", () => ({
  useNivelRender: () => ({ nivel: "pleno" as const, movimientoReducido: false }),
}));

vi.mock("@/components/protomolecula/protomolecula-ligera", () => ({
  ProtomoleculaLigera: ({ estado, tam }: { estado: EstadoAsistente; tam: number }) => (
    <svg
      data-testid="protomolecula-ligera"
      data-estado={estado}
      viewBox="-50 -50 100 100"
      width={tam}
      height={tam}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="0" cy="0" r="10" fill="#00F0FF" />
    </svg>
  ),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a>,
}));

const estados: EstadoAsistente[] = ["calma", "escuchando", "pensando", "hablando", "error"];

function propsDeEjemplo(overrides: Partial<PropsDiseno> = {}): PropsDiseno {
  return {
    estado: "calma",
    tam: 80,
    ultima: null,
    hilo: [],
    ahora: Date.now(),
    tactil: false,
    voz: false,
    preguntar: <input data-testid="preguntar-input" placeholder="Pregúntale…" aria-label="Pregunta para Astraura" />,
    botonVoz: null,
    sugerencias: [],
    onAbrirChat: vi.fn(),
    onSugerencia: vi.fn(),
    ...overrides,
  };
}

describe("DisenoMinimo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("renderizado esencial", () => {
    it("renderiza AstrauraForma con el tamaño correcto", () => {
      render(<DisenoMinimo {...propsDeEjemplo({ tam: 80 })} />);
      const forma = screen.getByTestId("protomolecula-ligera");
      expect(forma).not.toBeNull();
      expect(forma.getAttribute("width")).toBe("80");
      expect(forma.getAttribute("height")).toBe("80");
    });

    it("renderiza el texto de estado en Rotulo", () => {
      for (const estado of estados) {
        const { unmount } = render(<DisenoMinimo {...propsDeEjemplo({ estado })} />);
        const rotulo = screen.getByText(textoDeEstado(estado));
        expect(rotulo).not.toBeNull();
        expect(rotulo.tagName).toBe("SPAN");
        expect(rotulo.className).toContain("text-[11px]");
        expect(rotulo.className).toContain("uppercase");
        unmount();
      }
    });

    it("renderiza el componente preguntar", () => {
      render(<DisenoMinimo {...propsDeEjemplo()} />);
      const input = screen.getByTestId("preguntar-input");
      expect(input).not.toBeNull();
    });

    it("NO renderiza hilo de conversación", () => {
      render(<DisenoMinimo {...propsDeEjemplo({ hilo: [{ rol: "user", texto: "hola", ts: 1 }] })} />);
      expect(screen.queryByText("hola")).toBeNull();
      expect(screen.queryByRole("list")).toBeNull();
    });

    it("NO renderiza sugerencias", () => {
      render(<DisenoMinimo {...propsDeEjemplo({ sugerencias: ["Sugerencia 1", "Sugerencia 2"] })} />);
      expect(screen.queryByText("Sugerencia 1")).toBeNull();
    });

    it("NO renderiza botón de voz", () => {
      render(<DisenoMinimo {...propsDeEjemplo({ botonVoz: <button data-testid="boton-voz">Voz</button> })} />);
      expect(screen.queryByTestId("boton-voz")).toBeNull();
    });
  });

  describe("interacción", () => {
    it("click en la forma llama a onAbrirChat", () => {
      const onAbrirChat = vi.fn();
      render(<DisenoMinimo {...propsDeEjemplo({ onAbrirChat })} />);
      fireEvent.click(screen.getByRole("button"));
      expect(onAbrirChat).toHaveBeenCalledTimes(1);
    });

    it("el botón de la forma tiene aria-label accesible en español", () => {
      for (const estado of estados) {
        const { unmount } = render(<DisenoMinimo {...propsDeEjemplo({ estado })} />);
        const btn = screen.getByRole("button");
        const ariaLabel = btn.getAttribute("aria-label");
        expect(ariaLabel).toContain("Abrir el chat de Astraura");
        expect(ariaLabel).toContain("Astraura");
        unmount();
      }
    });
  });

  describe("responsive: sin desbordes", () => {
    it("a 180px de ancho no hay scrollWidth > clientWidth", () => {
      const { container } = render(<DisenoMinimo {...propsDeEjemplo()} />);
      const wrapper = container.firstChild as HTMLElement;
      wrapper.style.width = "180px";
      expect(wrapper.scrollWidth).toBeLessThanOrEqual(wrapper.clientWidth + 1);
    });

    it("a 360px de ancho no hay scrollWidth > clientWidth", () => {
      const { container } = render(<DisenoMinimo {...propsDeEjemplo()} />);
      const wrapper = container.firstChild as HTMLElement;
      wrapper.style.width = "360px";
      expect(wrapper.scrollWidth).toBeLessThanOrEqual(wrapper.clientWidth + 1);
    });

    it("a 160px el texto de estado se trunca con truncate", () => {
      const { container } = render(<DisenoMinimo {...propsDeEjemplo({ estado: "pensando" })} />);
      const wrapper = container.firstChild as HTMLElement;
      wrapper.style.width = "160px";
      const rotulo = screen.getByText("Pensando…");
      expect(rotulo.className).toContain("truncate");
    });
  });

  describe("colores y tema", () => {
    it("usa colores del tema (text-foreground) no blanco fijo", () => {
      render(<DisenoMinimo {...propsDeEjemplo()} />);
      const rotulo = screen.getByText("En calma");
      expect(rotulo.className).toContain("text-foreground");
    });

    it("la forma usa el estado correcto para la paleta astraura", () => {
      render(<DisenoMinimo {...propsDeEjemplo()} />);
      const forma = screen.getByTestId("protomolecula-ligera");
      expect(forma.getAttribute("data-estado")).toBe("calma");
    });
  });

  describe("layout: fila si cabe, columna si no", () => {
    it("en contenedor ancho usa flex-row", () => {
      const { container } = render(<DisenoMinimo {...propsDeEjemplo()} />);
      const wrapper = container.firstChild as HTMLElement;
      wrapper.style.width = "400px";
      expect(wrapper.className).toContain("flex-row");
    });

    it("en contenedor estrecho usa flex-col centrado", () => {
      const { container } = render(<DisenoMinimo {...propsDeEjemplo()} />);
      const wrapper = container.firstChild as HTMLElement;
      wrapper.style.width = "160px";
      expect(wrapper.className).toContain("flex-col");
      expect(wrapper.className).toContain("items-center");
    });
  });
});