/**
 * Pruebas de la tarjeta de propuesta y del registro del bot (BOT1011H2) en jsdom,
 * sin red ni disco: los estados del bucle se construyen con `avanzar` (puro).
 */
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { avanzar, bucleInicial, type EstadoBucle, type EntradaRegistro } from "@/lib/astraura-bots/bucle";
import type { Requisito } from "@/lib/astraura-bots/permisos";
import type { AccionBot, ResultadoDeshacer } from "@/lib/astraura-bots/acciones";
import { TarjetaPropuesta } from "../tarjeta-propuesta";
import { RegistroBot } from "../registro-bot";
import type { AccionesTarjetaPropuesta } from "../tarjeta-propuesta";

const T0 = 1_700_000_000_000;
const ACCION: AccionBot = { tipo: "abrir-app", args: { app: "biblioteca" } };

/** Fase `esperando` REAL del bucle: la propuesta pendiente espera a una persona. */
function esperando(requiere: Requisito, accion: AccionBot = ACCION): EstadoBucle {
  return avanzar(bucleInicial("bot:1"), {
    tipo: "proponer", accion,
    decision: { permitido: false, requiere, motivo: "Lo aprueba o lo rechaza una persona.", indicador: false },
    at: T0,
  });
}

function montarTarjeta(estado: EstadoBucle, opciones: Partial<AccionesTarjetaPropuesta> = {}) {
  const acciones = {
    confirmar: vi.fn(), rechazar: vi.fn(), abrirConsentimiento: vi.fn(),
    apagarSentido: vi.fn(), pausarBot: vi.fn(), ...opciones,
  };
  render(<TarjetaPropuesta estado={estado} nombreBot="Luna" acciones={acciones} />);
  return acciones;
}

describe("TarjetaPropuesta (BOT1011H2)", () => {
  afterEach(() => cleanup());

  it("solo aparece con una propuesta pendiente (fase «esperando»)", () => {
    montarTarjeta(bucleInicial("bot:1"));
    expect(screen.queryByTestId("tarjeta-propuesta")).toBeNull();
    montarTarjeta(esperando("confirmacion"));
    expect(screen.getByTestId("tarjeta-propuesta")).toBeTruthy();
  });

  it("dice la acción en palabras, el motivo y el riesgo en pastilla", () => {
    montarTarjeta(esperando("confirmacion"));
    expect(screen.getByText(/Abrir la app «biblioteca»/)).toBeTruthy();
    expect(screen.getByText(/Por qué: Lo aprueba o lo rechaza una persona\./)).toBeTruthy();
    expect(screen.getByTestId("riesgo-pastilla")).toHaveTextContent("Riesgo bajo");
  });

  it("«Confirmar» y «Rechazar» llaman a sus funciones", async () => {
    const user = userEvent.setup();
    const acciones = montarTarjeta(esperando("confirmacion"));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(acciones.confirmar).toHaveBeenCalledTimes(1);
    expect(acciones.rechazar).toHaveBeenCalledTimes(1);
    expect(acciones.abrirConsentimiento).not.toHaveBeenCalled();
  });

  it("en votación muestra su botón que llama a `proponer` de PoliGenesis", async () => {
    const user = userEvent.setup();
    const votacion = vi.fn();
    montarTarjeta(esperando("votacion"), { votacion });
    await user.click(screen.getByRole("button", { name: "Llevar a votación" }));
    expect(votacion).toHaveBeenCalledTimes(1);
  });

  it("sin operación de votación, dice «próximamente» y no pinta botón muerto", () => {
    montarTarjeta(esperando("votacion"));
    expect(screen.getByTestId("votacion-proximamente")).toHaveTextContent("próximamente: votación de bots");
    expect(screen.queryByRole("button", { name: "Llevar a votación" })).toBeNull();
  });

  it("el consentimiento abre el diálogo de BOT1011E2", async () => {
    const user = userEvent.setup();
    const acciones = montarTarjeta(esperando("consentimiento"));
    await user.click(screen.getByRole("button", { name: "Conceder permiso" }));
    expect(acciones.abrirConsentimiento).toHaveBeenCalledTimes(1);
  });

  it("monta el indicador de sentidos cuando hay sentidos activos (y se puede omitir)", () => {
    const conSentidos = { ...esperando("confirmacion"), sentidosActivos: ["pantalla" as const] };
    montarTarjeta(conSentidos);
    expect(screen.getByTestId("anillo-sentidos")).toBeTruthy();
    cleanup();
    const acciones = { confirmar: vi.fn(), rechazar: vi.fn(), abrirConsentimiento: vi.fn(), apagarSentido: vi.fn(), pausarBot: vi.fn() };
    render(<TarjetaPropuesta estado={conSentidos} nombreBot="Luna" acciones={acciones} mostrarIndicador={false} />);
    expect(screen.queryByTestId("anillo-sentidos")).toBeNull();
  });
});

function aplicada(deshacer?: ResultadoDeshacer): EntradaRegistro {
  return {
    at: T0, botId: "bot:1", quien: "bot", tipo: "aplicada", accion: "abrir-app", motivo: "Aplicada.",
    ...(deshacer ? { deshacer } : {}),
  };
}

describe("RegistroBot (BOT1011H2)", () => {
  afterEach(() => cleanup());

  it("pinta las entradas con hora, quién, qué y motivo", () => {
    const entradas: EntradaRegistro[] = [
      { at: T0, botId: "bot:1", quien: "bot", tipo: "propuesta", accion: "abrir-app", motivo: "Abrir la Biblioteca de noche." },
      aplicada({ accion: ACCION }),
      { at: T0 + 1000, botId: "bot:1", quien: "tú", tipo: "fallo", accion: "widget.mover", motivo: "No encontré el widget." },
    ];
    render(<RegistroBot entradas={entradas} />);
    expect(screen.getByTestId("registro-bot")).toBeTruthy();
    expect(screen.getAllByText(/^\d/).length).toBeGreaterThan(0);
    expect(screen.getByText("tú")).toBeTruthy();
    expect(screen.getByText(/Propuso/)).toBeTruthy();
    expect(screen.getByText(/Aplicó — Abrir una app/)).toBeTruthy();
    expect(screen.getByText(/Abrir la Biblioteca de noche\./)).toBeTruthy();
    expect(screen.getByText(/No encontré el widget\./)).toBeTruthy();
  });

  it("«Deshacer» solo en la ÚLTIMA aplicada reversible, y llama a su función", async () => {
    const user = userEvent.setup();
    const entradas = [aplicada({ accion: ACCION }), aplicada({ accion: ACCION })];
    const onDeshacer = vi.fn();
    render(<RegistroBot entradas={entradas} onDeshacer={onDeshacer} />);
    const botones = screen.getAllByRole("button", { name: "Deshacer" });
    expect(botones).toHaveLength(1);
    await user.click(botones[0]);
    expect(onDeshacer).toHaveBeenCalledWith(entradas[1]);
  });

  it("lo irreversible lo dice y no muestra «Deshacer»", () => {
    render(<RegistroBot entradas={[aplicada({ irreversible: "Lo hecho en la computadora del bot no se deshace." })]} />);
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
    expect(screen.getByText(/no se deshace\./)).toBeTruthy();
  });

  it("una aplicada sin rastro (`nada`) no muestra ni botón ni aviso", () => {
    render(<RegistroBot entradas={[aplicada({ nada: true })]} />);
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
    expect(screen.getByText(/Aplicó — Abrir una app/)).toBeTruthy();
  });

  it("vacío dice que no ha hecho nada todavía", () => {
    render(<RegistroBot entradas={[]} />);
    expect(screen.getByText(/no ha hecho nada todavía/)).toBeTruthy();
  });
});
