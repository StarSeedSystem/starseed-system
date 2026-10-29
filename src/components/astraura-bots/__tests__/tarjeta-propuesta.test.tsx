/**
 * Pruebas de la tarjeta de propuesta y del registro del bot (BOT1011H2) en jsdom.
 * Sin red ni aparato: el bucle se construye con el núcleo puro (`avanzar`), que no se toca.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { avanzar, bucleInicial, type EntradaRegistro, type EstadoBucle, type TipoRegistro } from "@/lib/astraura-bots/bucle";
import type { AccionBot } from "@/lib/astraura-bots/acciones";
import type { Decision } from "@/lib/astraura-bots/permisos";
import type { Bot, Sentido } from "@/lib/astraura-bots/tipos";
import { describirAccion, TarjetaPropuesta } from "../tarjeta-propuesta";
import { RegistroBot } from "../registro-bot";

const ABRIR: AccionBot = { tipo: "navegar", args: { ruta: "/library" } };
const PERMITIDOS = { permitido: true, requiere: "nada" as const, motivo: "Permitido.", indicador: true };
const bot = (): Bot => ({ id: "bot:luna", nombre: "Luna", origen: "astraura", gobierno: "jerarquico", activo: true,
  dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" }, sentidosHabilitados: [],
  personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
  cuerpo: { forma: "orbe", tono: 200, escala: 1 } });
type PropsTarjeta = Parameters<typeof TarjetaPropuesta>[0]; type ExtraTarjeta = Pick<PropsTarjeta, "votacion" | "consentimiento" | "crearPropuesta">;

function esperando(accion: AccionBot, requiere: Decision["requiere"], sentidos: readonly Sentido[] = []): EstadoBucle {
  let e = bucleInicial("bot:luna");
  for (const sentido of sentidos) e = avanzar(e, { tipo: "observar", sentido, decision: PERMITIDOS, at: 1 });
  const decision: Decision = { permitido: false, requiere, motivo: "El bot lo propone; tú lo confirmas.", indicador: false };
  return avanzar(e, { tipo: "proponer", accion, decision, at: 2 });
}
function montarCard(estado: EstadoBucle, extra: ExtraTarjeta = {}) {
  const onConfirmar = vi.fn(), onRechazar = vi.fn();
  render(<TarjetaPropuesta bot={bot()} estado={estado} quien="cuenta-alex" onConfirmar={onConfirmar}
    onRechazar={onRechazar} onApagarSentido={vi.fn()} onPausarBot={vi.fn()} {...extra} />);
  return { onConfirmar, onRechazar };
}

let sello = 0;
const REG = (quien: string, tipo: TipoRegistro, extra: Partial<EntradaRegistro> = {}): EntradaRegistro =>
  ({ botId: "bot:luna", at: 1000 + sello++, quien, tipo, motivo: "Motivo de la entrada.", ...extra });
function renderRegistro(onDeshacer: (q: string) => void = vi.fn(), ...entradas: EntradaRegistro[]) {
  render(<RegistroBot estado={{ ...bucleInicial("bot:luna"), registro: entradas }} nombreBot="Luna" quien="cuenta-alex" onDeshacer={onDeshacer} />);
  return onDeshacer;
}
describe("TarjetaPropuesta", () => {
  afterEach(() => cleanup());
  it("sin propuesta pendiente no pinta; con ella sí, en palabras y con su riesgo", () => {
    montarCard(bucleInicial("bot:luna"));
    expect(screen.queryByTestId("tarjeta-propuesta")).toBeNull();
    cleanup();
    expect(describirAccion(ABRIR)).toBe("Abrir Biblioteca");
    montarCard(esperando(ABRIR, "confirmacion"));
    expect(screen.getByTestId("tarjeta-propuesta")).toBeInTheDocument();
    expect(screen.getByText("Abrir Biblioteca")).toBeInTheDocument();
    expect(screen.getByText("Riesgo bajo")).toBeInTheDocument();
    expect(screen.getByText("El bot lo propone; tú lo confirmas.")).toBeInTheDocument();
  });
  it("Confirmar y Rechazar llaman a sus funciones con quien decide", async () => {
    const user = userEvent.setup(), { onConfirmar, onRechazar } = montarCard(esperando(ABRIR, "confirmacion"));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirmar).toHaveBeenCalledWith("cuenta-alex");
    await user.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(onRechazar).toHaveBeenCalledWith("cuenta-alex");
  });
  it("votación: muestra su botón; sin operación (BOT1011J1) dice «próximamente», con ella va a `proponer`", async () => {
    const user = userEvent.setup();
    montarCard(esperando(ABRIR, "votacion"));
    await user.click(screen.getByRole("button", { name: "Llevar a votación" }));
    await screen.findByText("próximamente: votación de bots");
    cleanup();
    const entidad = { tipo: "grupo", id: "g1", slug: "casa", nombre: "Casa" } as const;
    const operacion = { tipo: "apariencia.aplicar", faja: "fondo", parche: {}, motivo: "Fondo del grupo." } as const;
    const crearPropuesta = vi.fn(async () => ({ ok: true as const, id: "prop-1" }));
    montarCard(esperando(ABRIR, "votacion"), { votacion: { entidad, operacion }, crearPropuesta });
    await user.click(screen.getByRole("button", { name: "Llevar a votación" }));
    expect(crearPropuesta).toHaveBeenCalledWith(entidad, operacion);
    await screen.findByText("La propuesta está en votación del grupo.");
  });
  it("consentimiento: «Dar permiso» abre el diálogo de BOT1011E2", async () => {
    const user = userEvent.setup();
    montarCard(esperando(ABRIR, "consentimiento"),
      { consentimiento: { sentido: "microfono", sesion: "privada", onConceder: vi.fn(), onDenegar: vi.fn() } });
    await user.click(screen.getByRole("button", { name: "Dar permiso" }));
    expect(screen.getByRole("dialog", { name: "Permiso de Luna" })).toBeInTheDocument();
  });
  it("monta el anillo de sentidos cuando hay un sentido encendido", () => {
    montarCard(esperando(ABRIR, "confirmacion", ["pantalla"]));
    expect(screen.getByTestId("anillo-sentidos")).toBeInTheDocument();
  });
});
describe("RegistroBot", () => {
  afterEach(() => cleanup());
  it("pinta las entradas con hora, quién, qué y motivo", () => {
    renderRegistro(vi.fn(), REG("bot", "sentido-on", { sentido: "microfono" }),
      REG("persona", "aplicada", { accion: "navegar" }), REG("bot", "pausa"));
    expect(screen.getByText("Registro de Luna")).toBeInTheDocument();
    expect(screen.getByText("persona")).toBeInTheDocument();
    expect(screen.getByText("encendió el sentido micrófono")).toBeInTheDocument();
    expect(screen.getByText("aplicó navegar")).toBeInTheDocument();
    expect(screen.getByText("se pausó")).toBeInTheDocument();
  });
  it("«Deshacer» SOLO en la última aplicada reversible; deshecha después, nada", async () => {
    const user = userEvent.setup();
    const onDeshacer = renderRegistro(vi.fn(),
      REG("persona", "aplicada", { accion: "computadora.ejecutar", deshacer: { irreversible: "no" } }),
      REG("persona", "aplicada", { accion: "navegar", deshacer: { accion: ABRIR } }),
      REG("persona", "sentido-on", { sentido: "pantalla" }));
    expect(screen.getAllByRole("button", { name: "Deshacer" })).toHaveLength(1);
    await user.click(screen.getAllByRole("button", { name: "Deshacer" })[0]);
    expect(onDeshacer).toHaveBeenCalledWith("cuenta-alex");
    cleanup();
    renderRegistro(vi.fn(), REG("persona", "aplicada", { accion: "navegar", deshacer: { accion: ABRIR } }),
      REG("persona", "deshecha", { accion: "navegar" }));
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });
  it("lo irreversible lo dice", () => {
    renderRegistro(vi.fn(), REG("persona", "aplicada", { accion: "computadora.ejecutar", deshacer: { irreversible: "se restaura su copia" } }));
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });
});
