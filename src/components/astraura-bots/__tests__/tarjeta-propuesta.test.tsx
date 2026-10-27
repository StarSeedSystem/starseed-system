/**
 * Pruebas de la tarjeta de propuesta y del registro (BOT1011H2) en jsdom, sin red ni aparato.
 * El estado del bucle se construye con el núcleo puro (`bucleInicial`), que no se modifica.
 */
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { bucleInicial, type EstadoBucle, type EntradaRegistro } from "@/lib/astraura-bots/bucle";
import type { Decision } from "@/lib/astraura-bots/permisos";
import type { AccionBot } from "@/lib/astraura-bots/acciones";
import type { Bot } from "@/lib/astraura-bots/tipos";
import { TarjetaPropuesta, fraseDeAccion } from "../tarjeta-propuesta";
import { RegistroBot, ultimaDeshacible, textoIrreversible } from "../registro-bot";

const CONFIRMACION: Decision =
  { permitido: false, requiere: "confirmacion", motivo: "El bot lo propone; tú lo confirmas.", indicador: false };
const VOTACION: Decision =
  { permitido: false, requiere: "votacion", motivo: "Es de todos: lo decide una votación del grupo.", indicador: false };
const CONSENTIMIENTO: Decision =
  { permitido: false, requiere: "consentimiento", motivo: "Tus datos son tuyos: pide consentimiento.", indicador: false };
const ABRIR: AccionBot = { tipo: "abrir-app", args: { app: "biblioteca", modo: "ver" } };
const MOVER_CLIMA: AccionBot = { tipo: "widget.mover", args: { id: "Clima", x: 1, y: 2, w: 3, h: 3 } };
const BOT: Bot = {
  id: "bot:luna", nombre: "Luna", dueno: { tipo: "perfil", id: "perf", cuentaId: "cta" },
  origen: "astraura", gobierno: "jerarquico",
  personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
  cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: ["microfono"], activo: true,
};

function estado(fase: EstadoBucle["fase"], accion: AccionBot | null, decision: Decision): EstadoBucle {
  const s = bucleInicial("bot:luna");
  return { ...s, fase, pendiente: accion ? { accion, decision } : undefined, sentidosActivos: [] };
}

function montar(e: EstadoBucle, extra: Partial<Parameters<typeof TarjetaPropuesta>[0]> = {}) {
  const onConfirmar = vi.fn(), onRechazar = vi.fn(), onLlevarAVotacion = vi.fn();
  render(
    <div className="relative">
      <TarjetaPropuesta estado={e} nombreBot="Luna" onConfirmar={onConfirmar} onRechazar={onRechazar}
        onApagarSentido={vi.fn()} onPausarBot={vi.fn()} onLlevarAVotacion={onLlevarAVotacion} {...extra} />
    </div>,
  );
  return { onConfirmar, onRechazar, onLlevarAVotacion };
}

describe("TarjetaPropuesta", () => {
  afterEach(() => cleanup());

  it("solo se pinta con una propuesta pendiente en «esperando»", () => {
    const vacio = render(
      <TarjetaPropuesta estado={estado("esperando", null, CONFIRMACION)} onConfirmar={vi.fn()}
        onRechazar={vi.fn()} onApagarSentido={vi.fn()} onPausarBot={vi.fn()} />,
    );
    expect(vacio.container.querySelector('[role="dialog"]')).toBeNull();
    vacio.unmount();
    montar(estado("actuando", ABRIR, CONFIRMACION));
    expect(screen.queryByRole("dialog", { name: "Propuesta de Luna" })).toBeNull();
    cleanup();
    montar(estado("esperando", ABRIR, CONFIRMACION));
    expect(screen.getByRole("dialog", { name: "Propuesta de Luna" })).toHaveTextContent("Abrir una aplicación");
    expect(screen.getByText("El bot lo propone; tú lo confirmas.")).toBeInTheDocument();
  });

  it("la pastilla dice qué y riesgo, y confirmar y rechazar llaman a sus funciones", () => {
    const { onConfirmar, onRechazar } = montar(estado("esperando", ABRIR, CONFIRMACION));
    expect(screen.getByText("Riesgo bajo")).toBeInTheDocument();
    expect(fraseDeAccion(MOVER_CLIMA)).toBe("Mover el widget Clima");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onRechazar).toHaveBeenCalledTimes(1);
  });

  it("la votación muestra su botón y lo llama; sin operación se ve «próximamente»", () => {
    const { onLlevarAVotacion: onLlevarAVotacionBuscada } = montar(estado("esperando", MOVER_CLIMA, VOTACION));
    expect(screen.getByRole("button", { name: /Llevar a votación/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Llevar a votación/ }));
    expect(onLlevarAVotacionBuscada).toHaveBeenCalledTimes(1);
  });

  it("consentimiento/expreso abre el diálogo de BOT1011E2 con bot y sentido", () => {
    montar(estado("esperando", ABRIR, CONSENTIMIENTO), { botConsentimiento: BOT, sentidoConsentimiento: "microfono" });
    fireEvent.click(screen.getByRole("button", { name: /Permitir micrófono/ }));
    expect(screen.getByText(/Luna quiere usar micrófono/)).toBeInTheDocument();
  });
});

describe("RegistroBot", () => {
  afterEach(() => cleanup());
  const t = 1_700_000_000_000;
  const aplicada: EntradaRegistro = {
    at: t, botId: "bot:luna", quien: "bot", tipo: "aplicada", accion: "abrir-app",
    motivo: "Para mostrarte lo que pediste.", deshacer: { accion: { tipo: "navegar", args: { ruta: "/salas" } } },
  };

  it("pinta hora, quién, qué y motivo de cada entrada", () => {
    render(<RegistroBot registro={[aplicada]} onDeshacer={vi.fn()} />);
    const item = screen.getByText(/Aplicó «abrir-app»/);
    expect(item).toHaveTextContent("bot");
    expect(screen.getByText("Para mostrarte lo que pediste.")).toBeInTheDocument();
    expect(ultimaDeshacible([aplicada])).toBe(aplicada);
  });

  it("deshacer solo en la última aplicada reversible; la irreversible lo dice", () => {
    const onDeshacer = vi.fn();
    const irreversible: EntradaRegistro = { ...aplicada, accion: "computadora.ejecutar", deshacer: { irreversible: "Se restaura la copia." } };
    render(<RegistroBot registro={[irreversible, { ...aplicada, tipo: "propuesta" } as EntradaRegistro]} onDeshacer={onDeshacer} />);
    expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
    expect(textoIrreversible(irreversible)).toBe("Se restaura la copia.");
    cleanup();
    render(<RegistroBot registro={[aplicada, { ...aplicada, at: t + 1, tipo: "propuesta", deshacer: undefined, motivo: "Te lo quería proponer." }]} onDeshacer={onDeshacer} />);
    expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
    cleanup();
    render(<RegistroBot registro={[aplicada]} onDeshacer={onDeshacer} />);
    expect(ultimaDeshacible([aplicada])).toBe(aplicada);
    fireEvent.click(screen.getByRole("button", { name: /Deshacer/ }));
    expect(onDeshacer).toHaveBeenCalledTimes(1);
  });
});
