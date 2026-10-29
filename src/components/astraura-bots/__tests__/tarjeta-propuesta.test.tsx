/**
 * Pruebas jsdom de la tarjeta de propuesta y del registro con deshacer (BOT1011H2).
 * Sin red, sin Supabase y sin aparato: los estados se construyen con el núcleo puro (`bucle.ts`),
 * que no se modifica.
 */
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  bucleInicial, type EntradaRegistro,
  type EstadoBucle, type TipoRegistro,
} from "@/lib/astraura-bots/bucle";
import type { AccionBot } from "@/lib/astraura-bots/acciones";
import type { Decision } from "@/lib/astraura-bots/permisos";
import type { Bot } from "@/lib/astraura-bots/tipos";
import { TarjetaPropuesta, accionEnPalabras } from "../tarjeta-propuesta";
import { RegistroBot, deshacible, indiceUltimaDeshacible } from "../registro-bot";

const bot: Bot = {
  id: "bot:luna", nombre: "Luna", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" },
  origen: "astraura", gobierno: "jerarquico",
  personalidad: { calidez: 0.6, energia: 0.5, formalidad: 0.4, curiosidad: 0.7, humor: 0.3, concision: 0.6 },
  cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: [], activo: true,
};

const decision = (requiere: Decision["requiere"]): Decision =>
  ({ permitido: false, requiere, motivo: "Lo confirmas tú.", indicador: false });
const accion = (tipo: AccionBot["tipo"], args: AccionBot["args"]): AccionBot => ({ tipo, args });

function esperando(tipo: AccionBot["tipo"], args: AccionBot["args"], requiere: Decision["requiere"],
  sentidos: readonly string[] = []): EstadoBucle {
  return {
    ...bucleInicial(bot.id), fase: "esperando",
    sentidosActivos: sentidos as EstadoBucle["sentidosActivos"],
    pendiente: { accion: accion(tipo, args), decision: decision(requiere) },
  };
}

const entrada = (tipo: TipoRegistro, extra: Partial<EntradaRegistro> = {}): EntradaRegistro =>
  ({ at: 1760000000000, botId: bot.id, quien: "bot", tipo, motivo: "Motivo de prueba.", ...extra });

describe("TarjetaPropuesta", () => {
  afterEach(() => cleanup());

  it("no pinta nada sin propuesta pendiente (ni en reposo ni mientras actúa)", () => {
    const reposo = render(
      <TarjetaPropuesta estado={bucleInicial(bot.id)} bot={bot} onConfirmar={vi.fn()} onRechazar={vi.fn()} />,
    );
    expect(reposo.container).toBeEmptyDOMElement();
    reposo.unmount();
    const actuando: EstadoBucle = { ...esperando("abrir-app", { app: "biblioteca" }, "confirmacion"), fase: "actuando" };
    const enMarcha = render(
      <TarjetaPropuesta estado={actuando} bot={bot} onConfirmar={vi.fn()} onRechazar={vi.fn()} />,
    );
    expect(enMarcha.container).toBeEmptyDOMElement();
  });

  it("la propuesta solo en ESPERANDO: qué quiere hacer, el motivo y la pastilla de riesgo", () => {
    render(<TarjetaPropuesta estado={esperando("abrir-app", { app: "biblioteca" }, "confirmacion")}
      bot={bot} onConfirmar={vi.fn()} onRechazar={vi.fn()} />);
    expect(screen.getByTestId("tarjeta-propuesta")).toBeInTheDocument();
    expect(screen.getByText("Abrir Biblioteca")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Propuesta de Luna" })).toHaveTextContent("Lo confirmas tú.");
    expect(screen.getByText("riesgo bajo")).toBeInTheDocument();
  });

  it("Confirmar y Rechazar llaman a sus funciones y nada más", async () => {
    const user = userEvent.setup();
    const onConfirmar = vi.fn(), onRechazar = vi.fn();
    render(<TarjetaPropuesta estado={esperando("abrir-app", { app: "biblioteca" }, "confirmacion")}
      bot={bot} onConfirmar={onConfirmar} onRechazar={onRechazar} />);
    await user.click(screen.getByLabelText("Confirmar la propuesta del bot"));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onRechazar).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText("Rechazar la propuesta del bot"));
    expect(onRechazar).toHaveBeenCalledTimes(1);
  });

  it("en votación muestra el botón «Llevar a votación» que avisa a la entidad", async () => {
    const user = userEvent.setup();
    const onVotacion = vi.fn();
    render(<TarjetaPropuesta estado={esperando("pagina.editar", { pagina: "mias", cambios: {} }, "votacion")}
      bot={bot} onConfirmar={vi.fn()} onRechazar={vi.fn()} onVotacion={onVotacion} />);
    const boton = screen.getByRole("button", { name: "Llevar la propuesta a votación" });
    expect(boton).toBeInTheDocument();
    expect(screen.queryByLabelText("Confirmar la propuesta del bot")).toBeNull();
    await user.click(boton);
    expect(onVotacion).toHaveBeenCalledTimes(1);
  });

  it("sin la operación de votación (BOT1011J1) no hay botón: se lo dice", () => {
    render(<TarjetaPropuesta estado={esperando("pagina.editar", { pagina: "mias", cambios: {} }, "votacion")}
      bot={bot} onConfirmar={vi.fn()} onRechazar={vi.fn()} />);
    expect(screen.getByText("próximamente: votación de bots")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /votación/ })).toBeNull();
  });

  it("en consentimiento abre el diálogo de permisos (BOT1011E2) y «No» lo cierra sin conceder", async () => {
    const user = userEvent.setup();
    const onConceder = vi.fn(), onRechazar = vi.fn();
    render(<TarjetaPropuesta estado={esperando("capa-pantalla", { forma: "nota", texto: "apunta" }, "consentimiento")}
      bot={bot} onConfirmar={vi.fn()} onRechazar={onRechazar} onConceder={onConceder} />);
    await user.click(screen.getByLabelText("Dar permiso al bot"));
    expect(screen.getByRole("dialog", { name: "Permiso de Luna" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "No" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onConceder).not.toHaveBeenCalled();
  });

  it("monta el indicador de sentidos (ningún sentido encendido sin anillo visible)", async () => {
    const user = userEvent.setup();
    const onApagarSentido = vi.fn();
    render(<TarjetaPropuesta estado={esperando("abrir-app", { app: "biblioteca" }, "confirmacion", ["red"])}
      bot={bot} onConfirmar={vi.fn()} onRechazar={vi.fn()} onApagarSentido={onApagarSentido} onPausarBot={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Apagar este sentido: red" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pausar el bot" }));
    expect(screen.getByRole("status", { name: "Propuesta de Luna" })).toBeInTheDocument();
  });

  it("qué quiere hacer se dice en palabras, no en el vocabulario crudo", () => {
    expect(accionEnPalabras(accion("abrir-app", { app: "widget-clima" }))).toBe("Abrir Widget Clima");
    expect(accionEnPalabras(accion("widget.mover", { id: "widget-clima", x: 1, y: 2 }))).toBe("Mover el widget Widget Clima");
  });
});

describe("RegistroBot", () => {
  afterEach(() => cleanup());

  const reversible = entrada("aplicada", {
    at: 1760000000000, accion: "navegar", motivo: "Aplicada.",
    deshacer: { accion: accion("navegar", { ruta: "/" }) },
  });
  const irreversible = entrada("aplicada", {
    at: 1760002000000, accion: "computadora.ejecutar", motivo: "Aplicada.",
    deshacer: { irreversible: "Lo hecho en su computadora no se deshace: se restaura su copia." },
  });

  it("pinta las entradas: hora, quién, qué y motivo de cada una", () => {
    render(<RegistroBot registro={[
      entrada("sentido-on", { at: 1759999000000, sentido: "red", motivo: "Permitido." }),
      reversible,
    ]} />);
    expect(screen.getByText(/encendió el sentido «red»/)).toBeInTheDocument();
    expect(screen.getByText(/aplicó «navegar»/)).toBeInTheDocument();
    expect(screen.getAllByText("el bot").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Permitido\./)).toBeInTheDocument();
    expect(document.querySelector("[data-testid='registro-bot']")).toBeInTheDocument();
  });

  it("sin sucesos lo dice en vez de enseñar una lista vacía", () => {
    render(<RegistroBot registro={[]} />);
    expect(screen.getByText("Sin sucesos todavía.")).toBeInTheDocument();
    expect(screen.queryByTestId("registro-bot")).toBeNull();
  });

  it("Deshacer solo en la ÚLTIMA aplicada reversible (una sola, nunca en las antiguas)", async () => {
    const user = userEvent.setup();
    const onDeshacer = vi.fn();
    const viejas: EntradaRegistro[] = [reversible, { ...reversible, at: 1760001000000 }];
    render(<RegistroBot registro={viejas} onDeshacer={onDeshacer} />);
    const botones = screen.getAllByLabelText("Deshacer la última acción aplicada");
    expect(botones).toHaveLength(1);
    expect(deshacible(reversible)).toBe(true);
    expect(indiceUltimaDeshacible(viejas)).toBe(1);
    await user.click(botones[0]);
    expect(onDeshacer).toHaveBeenCalledTimes(1);
  });

  it("la última aplicada irreversible NO ofrece Deshacer y lo dice", () => {
    render(<RegistroBot registro={[reversible, irreversible]} />);
    expect(screen.queryByLabelText("Deshacer la última acción aplicada")).toBeNull();
    expect(screen.getByText("irreversible")).toBeInTheDocument();
    expect(indiceUltimaDeshacible([reversible, irreversible])).toBe(-1);
  });

  it("sin handler onDeshacer no se pinta ningún botón (un botón sin efecto no se pinta)", () => {
    render(<RegistroBot registro={[reversible]} />);
    expect(screen.queryByLabelText("Deshacer la última acción aplicada")).toBeNull();
  });
});
