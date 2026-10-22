/**
 * Pruebas del indicador de sentidos del bot (BOT1011E2) en jsdom, sin red ni aparato.
 * El estado del bucle se construye con el núcleo puro (`bucleInicial`), que no se modifica.
 */
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { bucleInicial, type EstadoBucle } from "@/lib/astraura-bots/bucle";
import { SENTIDOS, type Sentido } from "@/lib/astraura-bots/tipos";
import { NOMBRE_SENTIDO } from "../sentidos-ui";
import { IndicadorSentidos } from "../indicador-sentidos";

const BOT = "bot:luna";

function estado(sentidos: Sentido[]): EstadoBucle {
  return { ...bucleInicial(BOT), fase: sentidos.length ? "observando" : "reposo", sentidosActivos: sentidos };
}

function montar(sentidos: Sentido[], nombreBot?: string) {
  const onApagarSentido = vi.fn();
  const onPausarBot = vi.fn();
  render(
    <IndicadorSentidos
      estado={estado(sentidos)}
      nombreBot={nombreBot}
      onApagarSentido={onApagarSentido}
      onPausarBot={onPausarBot}
    />,
  );
  return { onApagarSentido, onPausarBot };
}

describe("IndicadorSentidos", () => {
  afterEach(() => cleanup());

  it("el anillo aparece con un sentido y desaparece sin ninguno", () => {
    const conSentido = render(
      <IndicadorSentidos estado={estado(["microfono"])} onApagarSentido={vi.fn()} onPausarBot={vi.fn()} />,
    );
    expect(screen.getByTestId("anillo-sentidos")).toBeInTheDocument();
    expect(screen.getByLabelText("Apagar este sentido: micrófono")).toBeInTheDocument();
    conSentido.unmount();
    render(<IndicadorSentidos estado={estado([])} onApagarSentido={vi.fn()} onPausarBot={vi.fn()} />);
    expect(screen.queryByTestId("anillo-sentidos")).toBeNull();
    expect(screen.queryByLabelText(/Apagar este sentido/)).toBeNull();
  });

  it("el aria-live nombra los sentidos que están encendidos", () => {
    montar(["microfono", "pantalla"]);
    const vivo = screen.getByRole("status");
    expect(vivo).toHaveAttribute("aria-live", "polite");
    expect(vivo).toHaveTextContent("Astraura está usando: micrófono, pantalla");
  });

  it("el texto del indicador usa el nombre del bot", () => {
    montar(["red"], "Luna");
    expect(screen.getByRole("status")).toHaveTextContent("Luna está usando: red");
  });

  it("tocar un icono apaga ese sentido", async () => {
    const user = userEvent.setup();
    const { onApagarSentido } = montar(["microfono", "pantalla"]);
    await user.click(screen.getByLabelText("Apagar este sentido: micrófono"));
    expect(onApagarSentido).toHaveBeenCalledTimes(1);
    expect(onApagarSentido).toHaveBeenCalledWith("microfono");
  });

  it("pausar el bot llama al callback (salida siempre)", async () => {
    const user = userEvent.setup();
    const { onPausarBot } = montar([]);
    await user.click(screen.getByRole("button", { name: "Pausar el bot" }));
    expect(onPausarBot).toHaveBeenCalled();
  });

  it("cada sentido tiene su icono de Lucide y su nombre en español", () => {
    montar([...SENTIDOS]);
    for (const sentido of SENTIDOS) {
      const boton = screen.getByLabelText(`Apagar este sentido: ${NOMBRE_SENTIDO[sentido]}`);
      expect(boton.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getAllByRole("button")).toHaveLength(SENTIDOS.length + 1);
  });
});
