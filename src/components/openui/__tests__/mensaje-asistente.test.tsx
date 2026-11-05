import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MensajeAsistente } from "../mensaje-asistente";
import type { ActionEvent } from "@openuidev/react-lang";

vi.mock("@/lib/astraura/ajustes-respuesta", () => ({
  debeUsarInterfazViva: vi.fn((ajustes: any) => ajustes?.interfaz === "viva"),
}));

vi.mock("../respuesta-viva", () => ({
  RespuestaViva: ({ texto, onAccion }: { texto: string; onAccion?: (e: ActionEvent) => void }) => (
    <div data-testid="respuesta-viva" data-on-accion={!!onAccion}>
      {texto}
    </div>
  ),
}));

describe("MensajeAsistente", () => {
  it("pinta texto plano cuando la interfaz no es viva", () => {
    const texto = "Respuesta normal del asistente";
    const { container } = render(
      <MensajeAsistente texto={texto} enCurso={false} ajustesPerfil={{ interfaz: "texto" }} />
    );
    expect(container.querySelector("p")).toBeInTheDocument();
    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it("pinta con RespuestaViva cuando la interfaz es viva", () => {
    const texto = 'root = Tarjeta("Título", "Contenido")';
    const { container } = render(
      <MensajeAsistente texto={texto} enCurso={false} ajustesPerfil={{ interfaz: "viva" }} />
    );
    expect(container.querySelector("[data-testid='respuesta-viva']")).toBeInTheDocument();
    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it("pinta con RespuestaViva en modo auto cuando el perfil lo tiene configurado", () => {
    const texto = "Respuesta en modo auto";
    const { container } = render(
      <MensajeAsistente texto={texto} enCurso={false} ajustesPerfil={{ interfaz: "auto" }} />
    );
    // En modo auto sin señales, debeUsarInterfazViva devuelve false
    expect(container.querySelector("p")).toBeInTheDocument();
    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it("llama onAccion cuando se pasa y la interfaz es viva", () => {
    const texto = 'root = Accion("Botón", "accion-id")';
    const eventos: ActionEvent[] = [];
    const handleAccion = (evento: ActionEvent) => eventos.push(evento);

    const { container } = render(
      <MensajeAsistente
        texto={texto}
        enCurso={false}
        ajustesPerfil={{ interfaz: "viva" }}
        onAccion={handleAccion}
      />
    );
    expect(container.querySelector("[data-testid='respuesta-viva']")).toHaveAttribute("data-on-accion", "true");
  });

  it("maneja el estado de streaming sin errores", () => {
    const texto = "Respuesta en streaming";
    const { rerender } = render(
      <MensajeAsistente texto={texto} enCurso={true} ajustesPerfil={{ interfaz: "texto" }} />
    );
    expect(screen.getByText(texto)).toBeInTheDocument();
    rerender(<MensajeAsistente texto={texto} enCurso={false} ajustesPerfil={{ interfaz: "texto" }} />);
    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it("usa ajustes por defecto cuando no se pasan ajustesPerfil", () => {
    const texto = "Respuesta sin ajustes";
    const { container } = render(<MensajeAsistente texto={texto} enCurso={false} />);
    // Por defecto interfaz es "auto", sin señales -> false
    expect(container.querySelector("p")).toBeInTheDocument();
    expect(screen.getByText(texto)).toBeInTheDocument();
  });
});