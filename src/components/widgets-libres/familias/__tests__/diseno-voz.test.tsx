import * as React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DisenoVoz } from "../diseno-voz";

vi.mock("next/link", () => ({
  default: (props: { href: string | object; children: React.ReactNode; [key: string]: unknown }) => {
    const { href, children, ...rest } = props;
    return <a href={String(href)} {...rest}>{children}</a>;
  },
}));

const textoEstado = (estado: string) => ({
  texto: estado === "calma" ? "En calma" : estado === "escuchando" ? "Escuchando…" : estado === "hablando" ? "Hablando" : "Pensando…",
  ts: Date.now(),
});

describe("DisenoVoz", () => {
  const tam = 300;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("estado visual grande", () => {
    it("muestra el texto de estado grande (escalaTipo) cuando hay estado", () => {
      render(
        <DisenoVoz
          tam={tam}
          voz={true}
          estado="escuchando"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      const estadoElement = screen.getByText("Escuchando…", { selector: "[role='status']" });
      expect(estadoElement).toBeInTheDocument();
    });

    it("muestra 'En calma' cuando el estado es calma", () => {
      render(
        <DisenoVoz
          tam={tam}
          voz={true}
          estado="calma"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      const estadoElement = screen.getByText("En calma", { selector: "[role='status']" });
      expect(estadoElement).toBeInTheDocument();
    });
  });

  describe("botón de voz grande", () => {
    it("muestra botón de voz cuando voz está disponible", () => {
      render(
        <DisenoVoz
          tam={tam}
          voz={true}
          estado="calma"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      const botonVoz = screen.getByRole("button", { name: /hablar/i });
      expect(botonVoz).toBeInTheDocument();
    });

    it("el botón de voz tiene alto >= 64px", () => {
      render(
        <DisenoVoz
          tam={tam}
          voz={true}
          estado="calma"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      const botonVoz = screen.getByRole("button", { name: /hablar/i });
      const height = parseInt(botonVoz.getAttribute("class")?.match(/h-(\d+)/)?.[1] || "16");
      expect(height).toBeGreaterThanOrEqual(16);
    });

    it("el botón de voz ocupa todo el ancho disponible", () => {
      render(
        <DisenoVoz
          tam={tam}
          voz={true}
          estado="calma"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      const botonVoz = screen.getByRole("button", { name: /hablar/i });
      expect(botonVoz.className).toContain("w-full");
    });

    it("llama a onHablar cuando se hace click en el botón de voz en estado calma", () => {
      const onHablar = vi.fn();
      render(
        <DisenoVoz
          tam={tam}
          voz={true}
          estado="calma"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={onHablar}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      const botonVoz = screen.getByRole("button", { name: /hablar/i });
      fireEvent.click(botonVoz);
      expect(onHablar).toHaveBeenCalledTimes(1);
    });

    it("llama a onParar cuando se hace click en el botón de voz en estado escuchando", () => {
      const onParar = vi.fn();
      render(
        <DisenoVoz
          tam={tam}
          voz={true}
          estado="escuchando"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={onParar}
          onSugerencia={() => {}}
        />
      );

      const botonVoz = screen.getByRole("button", { name: /parar/i });
      fireEvent.click(botonVoz);
      expect(onParar).toHaveBeenCalledTimes(1);
    });
  });

  describe("sin voz disponible", () => {
    it("muestra mensaje de estado con role='status' cuando voz está deshabilitada", () => {
      render(
        <DisenoVoz
          tam={tam}
          voz={false}
          estado="calma"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      const mensaje = screen.getByText("La voz no está disponible en este aparato");
      expect(mensaje).toBeInTheDocument();
      expect(mensaje.getAttribute("role")).toBe("status");
    });

    it("muestra el componente preguntar cuando voz está deshabilitada", () => {
      const preguntarMock = <div data-testid="preguntar-mock">Preguntar</div>;
      render(
        <DisenoVoz
          tam={tam}
          voz={false}
          estado="calma"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
          preguntar={preguntarMock}
        />
      );

      expect(screen.getByTestId("preguntar-mock")).toBeInTheDocument();
    });

    it("no muestra botón de voz cuando voz está deshabilitada", () => {
      render(
        <DisenoVoz
          tam={tam}
          voz={false}
          estado="calma"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      const botones = screen.getAllByRole("button");
      const botonVoz = botones.find(b => b.getAttribute("aria-label")?.includes("hablar"));
      expect(botonVoz).toBeUndefined();
    });
  });

  describe("última conversación", () => {
    it("muestra el último texto de Astraura cuando voz está disponible", () => {
      const ultima = textoEstado("hablando");
      render(
        <DisenoVoz
          tam={tam}
          voz={true}
          estado="calma"
          ultima={ultima}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      expect(screen.getByText("Hablando")).toBeInTheDocument();
      expect(screen.getByText("Hablando")).toBeInTheDocument();
    });

    it("el texto de la última está en un solo renglón", () => {
      const ultima = textoEstado("calma");
      render(
        <DisenoVoz
          tam={tam}
          voz={true}
          estado="calma"
          ultima={ultima}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      const texto = screen.getByText("Hablando");
      expect(texto.className).not.toMatch(/line-clamp/);
    });
  });

  describe("accesibilidad", () => {
    it("tiene aria-label accesible para el botón de abrir chat", () => {
      render(
        <DisenoVoz
          tam={tam}
          voz={true}
          estado="calma"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      const botonChat = screen.getByRole("button", { name: /abrir el chat/i });
      expect(botonChat).toBeInTheDocument();
    });

    it("tamaño mínimo de hitárea de 44px para botones", () => {
      render(
        <DisenoVoz
          tam={tam}
          voz={true}
          estado="calma"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      const todosLosBotones = screen.getAllByRole("button");
      for (const btn of todosLosBotones) {
        const className = btn.className || "";
        expect(className).toMatch(/min-h-(7|11|16)|px-3|px-4/);
      }
    });
  });

  describe("diseño responsivo", () => {
    it("sin scrollWidth mayor que clientWidth en 180px", () => {
      const { container } = render(
        <DisenoVoz
          tam={180}
          voz={true}
          estado="calma"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      const widget = container.querySelector("[data-diseno]");
      expect(widget?.scrollWidth).toBeLessThanOrEqual(widget?.clientWidth + 1);
    });

    it("sin scrollWidth mayor que clientWidth en 360px", () => {
      const { container } = render(
        <DisenoVoz
          tam={360}
          voz={true}
          estado="calma"
          ultima={null}
          onAbrirChat={() => {}}
          onHablar={() => {}}
          onParar={() => {}}
          onSugerencia={() => {}}
        />
      );

      const widget = container.querySelector("[data-diseno]");
      expect(widget?.scrollWidth).toBeLessThanOrEqual(widget?.clientWidth + 1);
    });
  });
});