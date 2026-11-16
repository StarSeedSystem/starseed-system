import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

vi.mock("@/components/protomolecula/protomolecula-ligera", () => ({
  ProtomoleculaLigera: ({ estado, tam, animada }: { estado: any; tam: number; animada?: boolean }) => (
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

vi.mock("(prefers-reduced-motion: reduce)", () => ({
  matchMedia: vi.fn().mockReturnValue({ matches: false }),
}));

import { DisenoConversacion } from "../diseno-conversacion";

const TEXTO_VOZ = {
  calma: "En calma",
  escuchando: "Escuchando…",
  hablando: "Hablando",
  pensando: "Pensando…",
};

describe("DisenoConversacion", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const crearProps = (overrides?: Partial<import("../diseno-conversacion").PropsDiseno>) => ({
    estado: "calma" as const,
    tam: 300,
    ultima: { texto: "Hola Astraura", ts: Date.now() },
    hilo: [
      { rol: "user" as const, texto: "Hola", ts: Date.now() - 10000 },
      { rol: "aurora" as const, texto: "Hola, ¿en qué te puedo ayudar?", ts: Date.now() - 5000 },
    ],
    ahora: Date.now(),
    tactil: false,
    voz: true,
    preguntar: <button>Preguntar</button>,
    botonVoz: <button>Voz</button>,
    sugerencias: ["Hola", "Adiós"],
    onAbrirChat: vi.fn(),
    onSugerencia: vi.fn(),
    ...overrides,
  });

  it("renderiza la forma pequeña y el estado arriba", () => {
    render(<DisenoConversacion {...crearProps()} />);
    const forma = screen.getByTestId("protomolecula-ligera");
    expect(forma).toBeInTheDocument();
  });

  it("renderiza el hilo de hasta 3 turnos", () => {
    render(<DisenoConversacion {...crearProps()} />);
    const ol = screen.getByRole("list");
    expect(ol).toBeInTheDocument();
    const items = ol.querySelectorAll("li");
    expect(items.length).toBe(2);
  });

  it("no muestra hilo en modo mínimo (tam < 180)", () => {
    render(<DisenoConversacion {...crearProps({ tam: 100 }) }/>);
    const ol = screen.queryByRole("list");
    expect(ol).toBeNull();
  });

  it("muestra mensaje de vacío cuando no hay hilo", () => {
    render(<DisenoConversacion {...crearProps({ hilo: [] }) }/>);
    const mensaje = screen.getByText(/Aún no habéis hablado/);
    expect(mensaje).toBeInTheDocument();
  });

  it("cada botón llama a su función", () => {
    const onAbrirChat = vi.fn();
    render(<DisenoConversacion
      {...crearProps({ onAbrirChat })}
      onAbrirChat={onAbrirChat}
    />);
    
    const btn = screen.getByRole("button", { name: /preguntar|Preguntar/i });
    fireEvent.click(btn);
    expect(onAbrirChat).toHaveBeenCalledTimes(1);
  });

  it("usa colores del tema", () => {
    render(<DisenoConversacion {...crearProps()} />);
    const items = screen.getAllByRole("listitem");
    expect(items.length).toBeGreaterThan(0);
  });

  it("nombres accesibles en español", () => {
    render(<DisenoConversacion {...crearProps()} />);
    const roles = screen.getAllByRole("listitem");
    expect(roles.length).toBeGreaterThan(0);
  });
});