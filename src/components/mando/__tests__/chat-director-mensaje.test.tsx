import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MensajeDelDirector } from "../chat-director-mensaje";
import type { MensajeDirector } from "@/lib/mando/chat-director-tipos";

const MODELOS = [
  { id: "claude-cowork/claude-opus-5-5", nombre: "Claude Opus 5.5 · dirección" },
  { id: "hermes/predeterminado", nombre: "Hermes" },
  { id: "nim/minimax", nombre: "MiniMax" },
];

function mensaje(parcial: Partial<MensajeDirector> = {}): MensajeDirector {
  return {
    id: "md-1-aaaa",
    t: "2026-10-04T10:30:00-06:00",
    de: "claude-cowork",
    rol: "director",
    tipo: "informe",
    texto: "Todo en verde.\nQuince tareas integradas.",
    canal: "mando",
    modelo: "claude-cowork/claude-opus-5-5",
    ...parcial,
  };
}

describe("MensajeDelDirector", () => {
  afterEach(() => { cleanup(); });

  it("pinta autor, modelo y texto con saltos de línea", () => {
    render(
      <MensajeDelDirector mensaje={mensaje()} modelos={MODELOS} onResponder={() => {}} onReenviar={() => {}} />,
    );
    expect(screen.getByText("claude-cowork")).toBeInTheDocument();
    expect(screen.getByText("claude-cowork/claude-opus-5-5")).toBeInTheDocument();
    expect(screen.getByText(/Todo en verde/)).toBeInTheDocument();
    expect(screen.getByText(/Quince tareas integradas/)).toBeInTheDocument();
    expect(screen.getByText("supervisor")).toBeInTheDocument();
  });

  it("«Responder» llama onResponder con el modelo elegido", () => {
    let llamada: { id: string; modelo: string } | null = null;
    render(
      <MensajeDelDirector
        mensaje={mensaje()}
        modelos={MODELOS}
        onResponder={(id, modelo) => { llamada = { id, modelo }; }}
        onReenviar={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Responder con"), { target: { value: "hermes/predeterminado" } });
    fireEvent.click(screen.getByRole("button", { name: /Responder/ }));
    expect(llamada).toEqual({ id: "md-1-aaaa", modelo: "hermes/predeterminado" });
  });

  it("«Enviar» llama onReenviar con los canales marcados", () => {
    let enviado: { id: string; canales: string[] } | null = null;
    render(
      <MensajeDelDirector
        mensaje={mensaje()}
        modelos={MODELOS}
        onResponder={() => {}}
        onReenviar={(id, canales) => { enviado = { id, canales }; }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Canales \(0\)/ }));
    fireEvent.click(screen.getByLabelText("Telegram (tu móvil)"));
    fireEvent.click(screen.getByLabelText("Terminal"));
    fireEvent.click(screen.getByRole("button", { name: /Enviar/ }));
    expect(enviado).toEqual({ id: "md-1-aaaa", canales: ["telegram", "terminal"] });
  });

  it("pendiente en claude-cowork avisa de la próxima revisión", () => {
    render(
      <MensajeDelDirector
        mensaje={mensaje()}
        entregas={{ "claude-cowork": "pendiente", telegram: "entregado", hermes: "fallo" }}
        modelos={MODELOS}
        onResponder={() => {}}
        onReenviar={() => {}}
      />,
    );
    expect(screen.getByText(/en la próxima revisión de Claude/)).toBeInTheDocument();
    expect(screen.getByText(/Telegram \(tu móvil\): entregado/)).toBeInTheDocument();
    const fallo = screen.getByText(/Hermes: fallo en la entrega/);
    expect(fallo).toHaveClass("text-rose-400");
  });

  it("preselecciona modeloPorDefecto aunque no esté en el catálogo y «Responder» lo manda", () => {
    let llamada: { id: string; modelo: string } | null = null;
    const sinPreferido = MODELOS.filter((m) => m.id !== "claude-cowork/claude-opus-5-5");
    render(
      <MensajeDelDirector
        mensaje={mensaje()}
        modelos={sinPreferido}
        modeloPorDefecto="claude-cowork/claude-opus-5-5"
        onResponder={(id, modelo) => { llamada = { id, modelo }; }}
        onReenviar={() => {}}
      />,
    );
    expect(screen.getByLabelText("Responder con")).toHaveValue("claude-cowork/claude-opus-5-5");
    fireEvent.click(screen.getByRole("button", { name: /Responder/ }));
    expect(llamada).toEqual({ id: "md-1-aaaa", modelo: "claude-cowork/claude-opus-5-5" });
  });

  it("sigue al modeloPorDefecto mientras no se toque el selector", () => {
    const { rerender } = render(
      <MensajeDelDirector
        mensaje={mensaje()}
        modelos={MODELOS}
        modeloPorDefecto="hermes/predeterminado"
        onResponder={() => {}}
        onReenviar={() => {}}
      />,
    );
    expect(screen.getByLabelText("Responder con")).toHaveValue("hermes/predeterminado");
    rerender(
      <MensajeDelDirector
        mensaje={mensaje()}
        modelos={MODELOS}
        modeloPorDefecto="nim/minimax"
        onResponder={() => {}}
        onReenviar={() => {}}
      />,
    );
    expect(screen.getByLabelText("Responder con")).toHaveValue("nim/minimax");
  });

  it("tras elegir a mano, ya no pisa la elección aunque cambie modeloPorDefecto", () => {
    const { rerender } = render(
      <MensajeDelDirector
        mensaje={mensaje()}
        modelos={MODELOS}
        modeloPorDefecto="claude-cowork/claude-opus-5-5"
        onResponder={() => {}}
        onReenviar={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Responder con"), { target: { value: "hermes/predeterminado" } });
    rerender(
      <MensajeDelDirector
        mensaje={mensaje()}
        modelos={MODELOS}
        modeloPorDefecto="nim/minimax"
        onResponder={() => {}}
        onReenviar={() => {}}
      />,
    );
    expect(screen.getByLabelText("Responder con")).toHaveValue("hermes/predeterminado");
  });
});
