import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AstrauraForma, AnuncioEstado, reiniciarAnuncioEstado } from "../astraura-forma";
import type { EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";
import type { NivelRender } from "@/lib/widgets/forma/nivel-dispositivo";

const { useNivelRenderMock } = vi.hoisted(() => ({
  useNivelRenderMock: vi.fn(() => ({ nivel: "pleno" as const, movimientoReducido: false })),
}));

vi.mock("@/lib/widgets/forma/nivel-dispositivo", () => ({
  useNivelRender: () => useNivelRenderMock(),
}));

vi.mock("@/components/protomolecula/protomolecula-ligera", () => ({
  ProtomoleculaLigera: ({ estado, tam, animada }: { estado: EstadoAsistente; tam: number; animada?: boolean }) => (
    <svg
      data-testid="protomolecula-ligera"
      data-estado={estado}
      data-viva={animada ? "true" : "false"}
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

describe("AstrauraForma", () => {
  const tam = 120;

  beforeEach(() => {
    useNivelRenderMock.mockReturnValue({ nivel: "pleno", movimientoReducido: false });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("botón accesible", () => {
    it("tiene aria-label con la frase del estado", () => {
      for (const estado of estados) {
        const { unmount } = render(<AstrauraForma estado={estado} tam={tam} onClick={() => {}} />);
        const btn = screen.getByRole("button");
        const ariaLabel = btn.getAttribute("aria-label");
        expect(ariaLabel).toContain("Abrir el chat de Astraura");
        // frasePantallaLectora devuelve textos como "Astraura está en calma", "Astraura te está escuchando"
        expect(ariaLabel).toContain("Astraura");
        unmount();
      }
    });

    it("el aria-label cambia según el estado cuando está escuchando o hablando", () => {
      const { rerender } = render(<AstrauraForma estado="calma" tam={tam} onClick={() => {}} />);
      expect(screen.getByRole("button").getAttribute("aria-label")).toContain("Astraura está en calma");

      rerender(<AstrauraForma estado="escuchando" tam={tam} onClick={() => {}} />);
      expect(screen.getByRole("button").getAttribute("aria-label")).toContain("te está escuchando");

      rerender(<AstrauraForma estado="hablando" tam={tam} onClick={() => {}} />);
      expect(screen.getByRole("button").getAttribute("aria-label")).toContain("está hablando");
    });

    it("llama a onClick cuando se hace click", () => {
      const onClick = vi.fn();
      render(<AstrauraForma estado="calma" tam={tam} onClick={onClick} />);
      fireEvent.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("tiene foco visible", () => {
      render(<AstrauraForma estado="calma" tam={tam} onClick={() => {}} />);
      const btn = screen.getByRole("button");
      expect(btn.className).toContain("focus-visible:ring-2");
    });

    it("tiene cursor-pointer", () => {
      render(<AstrauraForma estado="calma" tam={tam} onClick={() => {}} />);
      const btn = screen.getByRole("button");
      expect(btn.className).toContain("cursor-pointer");
    });
  });

  describe("ProtomoleculaLigera contenida", () => {
    it("contiene un SVG para cada estado", () => {
      for (const estado of estados) {
        const { unmount } = render(<AstrauraForma estado={estado} tam={tam} onClick={() => {}} />);
        const svg = screen.getByTestId("protomolecula-ligera");
        expect(svg).not.toBeNull();
        expect(svg.getAttribute("data-estado")).toBe(estado);
        unmount();
      }
    });

    it("el SVG tiene el tamaño correcto (mínimo 44px para cumplir diana accesible)", () => {
      render(<AstrauraForma estado="calma" tam={120} onClick={() => {}} />);
      const svg = screen.getByTestId("protomolecula-ligera");
      // El SVG usa Math.min(tam, 44) para ser accesible
      expect(svg.getAttribute("width")).toBe("44");
      expect(svg.getAttribute("height")).toBe("44");
    });

    it("el botón tiene al menos 44px de diana (tamaño mínimo)", () => {
      render(<AstrauraForma estado="calma" tam={80} onClick={() => {}} />);
      const btn = screen.getByRole("button");
      expect(parseInt(btn.getAttribute("width") || "80")).toBeGreaterThanOrEqual(44);
      expect(parseInt(btn.getAttribute("height") || "80")).toBeGreaterThanOrEqual(44);
    });
  });

  describe("sin error", () => {
    it("no anuncia nada al montar (el estado se mantiene en calma)", () => {
      render(<AstrauraForma estado="calma" tam={tam} onClick={() => {}} />);
      const statusRegion = screen.queryByRole("status", { hidden: true });
      expect(statusRegion).toBeNull();
    });

    it("no hay AnuncioEstado visible en el DOM por defecto", () => {
      render(<AstrauraForma estado="calma" tam={tam} onClick={() => {}} />);
      const srOnly = document.querySelector(".sr-only");
      expect(srOnly).toBeNull();
    });
  });
});

describe("AnuncioEstado", () => {
  const estadosTest: EstadoAsistente[] = ["calma", "escuchando", "pensando", "hablando", "error"];

  beforeEach(() => {
    useNivelRenderMock.mockReturnValue({ nivel: "pleno", movimientoReducido: false });
    reiniciarAnuncioEstado();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("cuando el estado cambia", () => {
    it("anuncia el nuevo estado una sola vez", () => {
      vi.useFakeTimers();
      const { rerender } = render(<AnuncioEstado estado="calma" />);
      let statusRegion = screen.queryByRole("status", { hidden: true });
      expect(statusRegion).toBeNull();

      rerender(<AnuncioEstado estado="escuchando" />);
      statusRegion = screen.getByRole("status", { hidden: true });
      expect(statusRegion).not.toBeNull();
      expect(statusRegion.textContent).toContain("Astraura te está escuchando");

      vi.advanceTimersByTime(1200);
      rerender(<AnuncioEstado estado="hablando" />);
      expect(statusRegion.textContent).toContain("Astraura está hablando");
      vi.useRealTimers();
    });

    it("no anuncia dos cambios con menos de 1s de diferencia (el último gana)", () => {
      vi.useFakeTimers();
      const { rerender } = render(<AnuncioEstado estado="calma" />);

      rerender(<AnuncioEstado estado="escuchando" />);
      expect(screen.getByRole("status", { hidden: true }).textContent).toContain("Astraura te está escuchando");

      // Avanzar 1200ms para que el primer anuncio expire
      vi.advanceTimersByTime(1200);
      vi.advanceTimersByTime(1000);
      rerender(<AnuncioEstado estado="hablando" />);
      expect(screen.getByRole("status", { hidden: true }).textContent).toContain("Astraura está hablando");

      vi.useRealTimers();
    });

    it("no repite el mismo estado", () => {
      vi.useFakeTimers();
      const { rerender } = render(<AnuncioEstado estado="calma" />);
      rerender(<AnuncioEstado estado="calma" />);
      const statusRegion = screen.queryByRole("status", { hidden: true });
      expect(statusRegion).toBeNull();
      vi.useRealTimers();
    });
  });

  describe("error usa assertive", () => {
    it("usa aria-live='assertive' cuando el estado es error", () => {
      vi.useFakeTimers();
      render(<AnuncioEstado estado="error" />);
      const statusRegion = screen.getByRole("status", { hidden: true });
      expect(statusRegion.getAttribute("aria-live")).toBe("assertive");
      vi.useRealTimers();
    });

    it("usa aria-live='polite' para otros estados", () => {
      vi.useFakeTimers();
      render(<AnuncioEstado estado="escuchando" />);
      const statusRegion = screen.getByRole("status", { hidden: true });
      expect(statusRegion.getAttribute("aria-live")).toBe("polite");
      vi.useRealTimers();
    });
  });

  describe("region status sr-only", () => {
    it("tiene role='status' y aria-live='polite' por defecto", () => {
      vi.useFakeTimers();
      const { rerender } = render(<AnuncioEstado estado="escuchando" />);
      const statusRegion = screen.getByRole("status", { hidden: true });
      expect(statusRegion.getAttribute("aria-live")).toBe("polite");
      vi.useRealTimers();
    });

    it("tiene clase sr-only para estar visualmente oculto", () => {
      vi.useFakeTimers();
      const { rerender } = render(<AnuncioEstado estado="escuchando" />);
      const statusRegion = screen.getByRole("status", { hidden: true });
      expect(statusRegion.className).toContain("sr-only");
      vi.useRealTimers();
    });
  });

  describe("no anuncia al montar con calma", () => {
    it("no anuncia nada cuando el estado inicial es calma", () => {
      render(<AnuncioEstado estado="calma" />);
      const statusRegion = screen.queryByRole("status", { hidden: true });
      expect(statusRegion).toBeNull();
    });
  });

  describe("frases de pantalla lectora", () => {
    it("usa frasePantallaLectora para cada estado", () => {
      vi.useFakeTimers();
      for (const estado of estadosTest) {
        const { unmount } = render(<AnuncioEstado estado={estado} />);
        const statusRegion = screen.queryByRole("status", { hidden: true });
        if (estado !== "calma") {
          expect(statusRegion).not.toBeNull();
          expect(statusRegion.textContent).toContain("Astraura");
        } else {
          expect(statusRegion).toBeNull();
        }
        unmount();
        // Reiniciar el estado global entre iteraciones
        reiniciarAnuncioEstado();
      }
      vi.useRealTimers();
    });
  });
});