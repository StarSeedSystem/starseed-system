/**
 * Pruebas de la tarjeta de propuesta y del registro del bot (BOT1011H2) en jsdom,
 * sin red, sin Supabase y sin aparato: el estado se construye con el núcleo puro.
 */
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { bucleInicial, type EstadoBucle, type EntradaRegistro, type TipoRegistro } from "@/lib/astraura-bots/bucle";
import type { Decision, Requisito } from "@/lib/astraura-bots/permisos";
import type { AccionBot, ResultadoDeshacer } from "@/lib/astraura-bots/acciones";
import type { Bot } from "@/lib/astraura-bots/tipos";
import { TarjetaPropuesta } from "../tarjeta-propuesta";
import { RegistroBot, entradaDeshacible } from "../registro-bot";

const BOT = "bot:luna";
const DEC = (requiere: Requisito): Decision => ({ permitido: false, requiere, motivo: "Lo quiero para ayudarte.", indicador: false });
const MOVER: AccionBot = { tipo: "widget.mover", args: { id: "Clima", x: 10, y: 20 } };
const ENVIAR: AccionBot = { tipo: "mensaje.enviar", args: { canal: "General", texto: "Hola" } };
const BOTAURA: Bot = {
  id: BOT, nombre: "Astraura", dueno: { tipo: "perfil", id: "yara", cuentaId: "cuenta:yara" }, origen: "astraura", gobierno: "jerarquico",
  personalidad: { calidez: 0.6, energia: 0.5, formalidad: 0.4, curiosidad: 0.7, humor: 0.5, concision: 0.6 },
  cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: ["red"], activo: true,
};
const REVERSO: ResultadoDeshacer = { accion: { tipo: "navegar", args: { ruta: "/dashboard" } } };
const es = (s: Partial<EstadoBucle> = {}): EstadoBucle => ({ ...bucleInicial(BOT), ...s });
function fila(tipo: TipoRegistro, deshacer?: ResultadoDeshacer): EntradaRegistro {
  return { at: 1000, botId: BOT, quien: "persona", tipo, accion: "navegar", motivo: "Probando.", ...(deshacer ? { deshacer } : {}) };
}
function montarTarjeta(p: Partial<Parameters<typeof TarjetaPropuesta>[0]>) {
  const props = { estado: es(), onConfirmar: vi.fn(), onRechazar: vi.fn(), ...p } as Parameters<typeof TarjetaPropuesta>[0];
  render(<TarjetaPropuesta {...props} />);
  return props;
}

describe("TarjetaPropuesta", () => {
  afterEach(() => cleanup());

  it("sin propuesta pendiente ni sentidos, no aparece", () => {
    montarTarjeta({});
    expect(screen.queryByTestId("tarjeta-propuesta")).toBeNull();
  });
  it("muestra el qué en palabras, el motivo y la pastilla de riesgo", () => {
    montarTarjeta({ estado: es({ fase: "esperando", pendiente: { accion: MOVER, decision: DEC("confirmacion") } }) });
    expect(screen.getByTestId("propuesta-que")).toHaveTextContent("Mover el widget Clima");
    expect(screen.getByText("Lo quiero para ayudarte.")).toBeInTheDocument();
    expect(screen.getByTestId("propuesta-riesgo")).toHaveTextContent("Riesgo bajo");
  });
  it("la propuesta que exige confirmación pinta Confirmar, y confirmar/rechazar llaman a sus funciones", async () => {
    const user = userEvent.setup();
    const p = montarTarjeta({ estado: es({ pendiente: { accion: MOVER, decision: DEC("confirmacion") } }) });
    await user.click(screen.getByTestId("boton-confirmar"));
    await user.click(screen.getByTestId("boton-rechazar"));
    expect(p.onConfirmar).toHaveBeenCalledTimes(1);
    expect(p.onRechazar).toHaveBeenCalledTimes(1);
  });
  it("votación: con onVotacion lo llama; sin ella, «Próximamente: votación de bots»", async () => {
    const user = userEvent.setup();
    montarTarjeta({ estado: es({ pendiente: { accion: MOVER, decision: DEC("votacion") } }) });
    expect(screen.getByText("Próximamente: votación de bots")).toBeInTheDocument();
    cleanup();
    const p = montarTarjeta({ estado: es({ pendiente: { accion: MOVER, decision: DEC("votacion") } }), onVotacion: vi.fn() });
    expect(screen.queryByTestId("boton-confirmar")).toBeNull();
    await user.click(screen.getByTestId("boton-votacion"));
    expect(p.onConfirmar).not.toHaveBeenCalled();
    expect(p.onVotacion).toHaveBeenCalledTimes(1);
  });
  it("consentimiento: «Confirmar» abre el diálogo de BOT1011E2 y lo concedido vuelve al padre", async () => {
    const user = userEvent.setup();
    const alConceder = vi.fn();
    montarTarjeta({
      estado: es({ pendiente: { accion: ENVIAR, decision: DEC("expreso") } }), consentimiento: { bot: BOTAURA, sesion: "publica" }, onConcederConsentimiento: alConceder,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByTestId("boton-confirmar"));
    await user.click(screen.getByRole("button", { name: "Permitir" }));
    expect(alConceder).toHaveBeenCalledTimes(1);
  });
  it("monta el IndicadorSentidos cuando un sentido está encendido", () => {
    montarTarjeta({ estado: es({ sentidosActivos: ["pantalla"] }), onApagarSentido: vi.fn(), onPausarBot: vi.fn() });
    expect(screen.getByTestId("anillo-sentidos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar el bot" })).toBeInTheDocument();
  });
});

describe("RegistroBot", () => {
  afterEach(() => cleanup());

  it("pinta las entradas (hora, quién, qué y motivo), la más reciente primero", () => {
    const usuario = { at: 1720000000000, botId: BOT, quien: "yara", tipo: "aplicada" as TipoRegistro, accion: "navegar" as const, motivo: "Volviste a la última." };
    render(<RegistroBot registro={[fila("aplicada", REVERSO), fila("confirmada"), usuario]} onDeshacer={vi.fn()} />);
    const filas = screen.getAllByTestId("registro-fila");
    expect(filas).toHaveLength(3);
    expect(filas[0]).toHaveTextContent("yara");
    expect(filas[1]).toHaveTextContent("Confirmada · navegar");
    expect(filas[2]).toHaveTextContent("Aplicada · navegar");
  });
  it("solo la ÚLTIMA aplicada reversible lleva «Deshacer», y al tocarla llama a onDeshacer", async () => {
    const user = userEvent.setup();
    const alDeshacer = vi.fn();
    render(<RegistroBot registro={[fila("aplicada", REVERSO), fila("aplicada", REVERSO), fila("confirmada")]} onDeshacer={alDeshacer} />);
    const botones = screen.getAllByTestId("boton-deshacer");
    expect(botones).toHaveLength(1);
    await user.click(botones[0]);
    expect(alDeshacer).toHaveBeenCalledTimes(1);
  });
  it("lo irreversible lo dice y no está el botón", () => {
    render(<RegistroBot registro={[fila("aplicada", { irreversible: "No consta qué se envió." }), fila("confirmada")]} onDeshacer={vi.fn()} />);
    expect(screen.queryByTestId("boton-deshacer")).toBeNull();
    expect(screen.getByTestId("registro-irreversible")).toHaveTextContent("No consta qué se envió.");
  });
  it("sin entradas no pinta nada, y `entradaDeshacible` devuelve null con la lista vacía", () => {
    render(<RegistroBot registro={[]} onDeshacer={vi.fn()} />);
    expect(screen.queryByTestId("registro-fila")).toBeNull();
    expect(entradaDeshacible([])).toBeNull();
  });
});
