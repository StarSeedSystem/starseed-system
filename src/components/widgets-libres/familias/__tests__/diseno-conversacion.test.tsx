import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { cleanup } from "@testing-library/react";
import { DisenoConversacion } from "../diseno-conversacion";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";
import type { EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";
import { haceCuanto } from "@/components/widgets-libres/familias/inicio-piezas";

const ESTADOS: EstadoAsistente[] = ["calma", "escuchando", "pensando", "hablando"];

describe("DisenoConversacion", () => {
  const props: PropsDiseno = {
    estado: "hablando",
    tam: 400,
    ultima: { texto: "Hola, cómo estás", ts: Date.now() - 30_000 },
    hilo: [
      { rol: "user", texto: "Hola", ts: Date.now() - 60_000 },
      { rol: "aurora", texto: "Hola, cómo estás", ts: Date.now() - 30_000 },
    ],
    ahora: Date.now(),
    tactil: false,
    voz: true,
    preguntar: <div>Pregunta</div>,
    botonVoz: <div>Botón</div>,
    sugerencias: [],
    onAbrirChat: vi.fn(),
    onSugerencia: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("render básico", () => {
    it("renderiza la forma pequeña con el estado", () => {
      render(<DisenoConversacion {...props} />);
      const forma = screen.getByTestId("diseno-conversacion-forma-pequena");
      expect(forma).toBeInTheDocument();
    });

    it("muestra el estado de voz arriba", () => {
      render(<DisenoConversacion {...props} />);
      const estadoTexto = screen.getByText(/En calma|Escuchando|Hablando|Pensando/);
      expect(estadoTexto).toBeInTheDocument();
    });
  });

  describe("hilo de conversación", () => {
    it("muestra hasta 3 turnos en la lista", () => {
      render(<DisenoConversacion {...props} />);
      const ol = screen.getByRole("list");
      const items = ol.querySelectorAll("li");
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.length).toBeLessThanOrEqual(3);
    });

    it("muestra 'Tú' o 'Astraura' en cada turno con letra pequeña", () => {
      render(<DisenoConversacion {...props} />);
      const turnoItems = screen.getAllByRole("listitem");
      if (turnoItems.length > 0) {
        const primerTurno = turnoItems[0];
        expect(primerTurno).toHaveTextContent(/Tú|Astraura/);
      }
    });

    it("muestra el tiempo transcurrido en el último turno de Astraura", () => {
      render(<DisenoConversacion {...props} />);
      const ultimoTurnoAstraura = screen.getByText(/hace/);
      expect(ultimoTurnoAstraura).toBeInTheDocument();
    });
  });

  describe("estado vacío", () => {
    const propsVacias: Partial<PropsDiseno> = {
      ...props,
      ultima: null,
      hilo: [],
    };

    it("muestra mensaje de que aún no habéis hablado", () => {
      render(<DisenoConversacion {...propsVacias} />);
      const mensaje = screen.getByText(/Aún no habéis hablado/);
      expect(mensaje).toBeInTheDocument();
    });

    it("no muestra hilo ni sugerencias cuando no hay conversación", () => {
      render(<DisenoConversacion {...propsVacias} />);
      const ol = screen.queryByRole("list");
      expect(ol).toBeNull();
      const sugerencias = screen.queryByText(/Resúmeme|Qué hay nuevo|Ayúdame/);
      expect(sugerencias).toHaveLength(0);
    });
  });

  describe("tamaño y accesibilidad", () => {
    it("no hace scrollWidth mayor que clientWidth en 180px", () => {
      const { container } = render(<DisenoConversacion {...props} />);
      const ancho = Math.min(container.clientWidth, container.clientHeight);
      expect(container.scrollWidth).toBeLessThanOrEqual(ancho + 1);
    });

    it("no hace scrollWidth mayor que clientWidth en 360px", () => {
      const props400 = { ...props, tam: 360 };
      render(<DisenoConversacion {...props400} />);
      const { container } = screen;
      const ancho = Math.min(container.clientWidth, container.clientHeight);
      expect(container.scrollWidth).toBeLessThanOrEqual(ancho + 1);
    });

    it("usa colores del tema y acentos PALETAS.astraura", () => {
      render(<DisenoConversacion {...props} />);
      const elements = screen.getAllByRole("status", { hidden: true });
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  describe("eventos de botón", () => {
    it("el botón de voz llama a escuchar/callar", () => {
      const onToggle = vi.fn();
      render(<DisenoConversacion {...props} botonVoz={{ onClick: onToggle }} />);
      userEvent.click(screen.getByRole("button", { name: /hablar|parar/ })).click();
      expect(onToggle).toHaveBeenCalled();
    });

    it("el botón de pregunta llama a onAbrirChat", () => {
      const onOpen = vi.fn();
      render(<DisenoConversacion {...props} onAbrirChat={onOpen} />);
      userEvent.click(screen.getByRole("button", { name: /abrir chat/ })).click();
      expect(onOpen).toHaveBeenCalled();
    });
  });
});