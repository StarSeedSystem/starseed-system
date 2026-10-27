/**
 * Pruebas jsdom (BOT1011H2) de la tarjeta de propuesta y del registro, sin red ni archivo.
 * Los estados del bucle se construyen con el núcleo puro (`avanzar`/`bucleInicial`), que no se modifica.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { avanzar, bucleInicial, type EstadoBucle, type EntradaRegistro } from "@/lib/astraura-bots/bucle";
import type { AccionBot, ResultadoDeshacer } from "@/lib/astraura-bots/acciones";
import type { Decision, Requisito } from "@/lib/astraura-bots/permisos";
import type { Bot } from "@/lib/astraura-bots/tipos";
import { TarjetaPropuesta } from "../tarjeta-propuesta";
import { RegistroBot } from "../registro-bot";

const AHORA = Date.parse("2026-10-11T12:20:00Z");
const BOT: Bot = {
  id: "bot:luna", nombre: "Luna",
  dueno: { tipo: "perfil", id: "perfil:x", cuentaId: "cuenta:x" },
  origen: "astraura", gobierno: "jerarquico",
  personalidad: { calidez: 0.6, energia: 0.4, formalidad: 0.3, curiosidad: 0.7, humor: 0.3, concision: 0.5 },
  cuerpo: { forma: "orbe", tono: 200, escala: 1 },
  sentidosHabilitados: ["pantalla"], activo: true,
};

function esperando(tipo: AccionBot["tipo"], args: AccionBot["args"], requiere: Requisito): EstadoBucle {
  const decision: Decision = { permitido: false, requiere, motivo: "El bot lo propone; tú lo confirmas.", indicador: false };
  return avanzar(bucleInicial(BOT.id), { tipo: "proponer", accion: { tipo, args }, decision, at: AHORA });
}

function esperandoConSentido(): EstadoBucle {
  const viendo = avanzar(bucleInicial(BOT.id), {
    tipo: "observar", sentido: "pantalla",
    decision: { permitido: true, requiere: "nada", motivo: "Permitido.", indicador: true }, at: AHORA,
  });
  return avanzar(viendo, { tipo: "proponer", accion: { tipo: "abrir-app", args: { app: "biblioteca" } },
    decision: { permitido: false, requiere: "confirmacion", motivo: "El bot lo propone.", indicador: false }, at: AHORA + 1 });
}

function montarTarjeta(estado: EstadoBucle, extra: Partial<Parameters<typeof TarjetaPropuesta>[0]> = {}) {
  const props = { estado, nombreBot: "Luna", onConfirmar: vi.fn(), onRechazar: vi.fn(), onApagarSentido: vi.fn(), onPausarBot: vi.fn(), ...extra };
  render(<TarjetaPropuesta {...props} />);
  return props;
}

function entrada(tipo: EntradaRegistro["tipo"], sobre: Partial<EntradaRegistro> = {}): EntradaRegistro {
  return { at: AHORA, botId: BOT.id, quien: "bot", tipo, motivo: "de prueba", ...sobre };
}

function montarRegistro(registro: readonly EntradaRegistro[]) {
  const onDeshacer = vi.fn();
  render(<RegistroBot registro={registro} onDeshacer={onDeshacer} />);
  return onDeshacer;
}

describe("TarjetaPropuesta", () => {
  afterEach(() => cleanup());

  it("sin propuesta pendiente no se pinta nada", () => {
    montarTarjeta(bucleInicial(BOT.id));
    expect(screen.queryByTestId("tarjeta-propuesta")).toBeNull();
  });

  it("en `esperando` pinta qué hará (en palabras), por qué, el riesgo y sus botones", () => {
    montarTarjeta(esperando("abrir-app", { app: "biblioteca" }, "confirmacion"));
    expect(screen.getByText(/Abrir la aplicación «biblioteca»/)).toBeInTheDocument();
    expect(screen.getByText(/El bot lo propone; tú lo confirmas\./)).toBeInTheDocument();
    expect(screen.getByText("Riesgo: bajo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeInTheDocument();
  });

  it("Confirmar y Rechazar llaman a sus funciones", async () => {
    const user = userEvent.setup();
    const props = montarTarjeta(esperando("abrir-app", { app: "biblioteca" }, "confirmacion"));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(props.onConfirmar).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(props.onRechazar).toHaveBeenCalledTimes(1);
  });

  it("votación: botón con despacho, «próximamente» sin él", async () => {
    const user = userEvent.setup();
    const estado = esperando("widget.mover", { id: "clima", x: 1, y: 2 }, "votacion");
    const { onVotacion } = montarTarjeta(estado, { onVotacion: vi.fn() });
    await user.click(screen.getByRole("button", { name: "Llevar a votación" }));
    expect(onVotacion).toHaveBeenCalledTimes(1);
    cleanup();
    montarTarjeta(estado);
    expect(screen.getByText("próximamente: votación de bots")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Llevar a votación" })).toBeNull();
  });

  it("consentimiento abre el diálogo de permiso de BOT1011E2", async () => {
    const user = userEvent.setup();
    montarTarjeta(esperando("abrir-app", { app: "biblioteca" }, "consentimiento"), {
      permiso: { bot: BOT, sentido: "microfono", sesion: "privada", onConceder: vi.fn() },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Dar permiso" }));
    expect(screen.getByRole("dialog", { name: "Permiso de Luna" })).toBeInTheDocument();
    expect(screen.getByText(/Luna quiere usar micrófono/)).toBeInTheDocument();
  });

  it("el indicador de sentidos va montado junto a la tarjeta", () => {
    montarTarjeta(esperandoConSentido());
    expect(screen.getByTestId("indicador-en-tarjeta")).toBeInTheDocument();
    expect(screen.getByTestId("anillo-sentidos")).toBeInTheDocument();
  });
});

describe("RegistroBot", () => {
  afterEach(() => cleanup());

  const reversible: ResultadoDeshacer = { accion: { tipo: "abrir-app", args: { app: "biblioteca" } } };

  it("pinta las últimas entradas con hora, quién, qué y motivo", () => {
    const registro = [
      entrada("propuesta", { accion: "abrir-app", motivo: "Quiero abrir la biblioteca." }),
      entrada("confirmada", { at: AHORA + 60_000, quien: "cuenta:alex", accion: "abrir-app" }),
      entrada("aplicada", { at: AHORA + 120_000, accion: "abrir-app", deshacer: reversible }),
    ];
    montarRegistro(registro);
    expect(screen.getAllByText(/^\d{2}:\d{2}$/)).toHaveLength(3);
    expect(screen.getByText(/El bot · Propuesta/)).toBeInTheDocument();
    expect(screen.getByText(/La persona · Confirmada/)).toBeInTheDocument();
    expect(screen.getByText(/El bot · Aplicada/)).toBeInTheDocument();
    expect(screen.getByText("Quiero abrir la biblioteca.")).toBeInTheDocument();
  });

  it("«Deshacer» solo en la última aplicada reversible, y llama al callback", async () => {
    const user = userEvent.setup();
    const registro = [
      entrada("propuesta", { accion: "abrir-app" }),
      entrada("aplicada", { accion: "abrir-app", deshacer: reversible }),
      entrada("propuesta", { at: AHORA + 60_000, accion: "notificar" }),
    ];
    const onDeshacer = montarRegistro(registro);
    const botones = screen.getAllByRole("button", { name: "Deshacer" });
    expect(botones).toHaveLength(1);
    await user.click(botones[0]);
    expect(onDeshacer).toHaveBeenCalledTimes(1);
  });

  it("lo irreversible lo dice y no oferta Deshacer", () => {
    const registro = [entrada("aplicada", { accion: "computadora.ejecutar",
      deshacer: { irreversible: "Lo hecho en la computadora del bot no se deshace: se restaura su copia." } })];
    montarRegistro(registro);
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
    expect(screen.getByText(/no se deshace: se restaura su copia/)).toBeInTheDocument();
  });

  it("tras una deshecha no vuelve a ofrecer Deshacer", () => {
    const registro = [
      entrada("aplicada", { accion: "abrir-app", deshacer: reversible }),
      entrada("deshecha", { at: AHORA + 60_000, accion: "abrir-app" }),
    ];
    montarRegistro(registro);
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });
});

