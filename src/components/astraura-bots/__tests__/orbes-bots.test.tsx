/**
 * Pruebas del anfitrión de orbes hermanas (BOT1011C2) en jsdom.
 * La orbe en miniatura, el movimiento reducido y la sesión se simulan: sin canvas ni red.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

const reducido = vi.hoisted(() => ({ valor: false }));
vi.mock("@/components/aurora/quantum-orb-avatar", () => ({
  QuantumOrbAvatar: ({ personaId }: { personaId?: string }) => <span data-testid="orbe" data-persona={personaId} />,
}));
vi.mock("@/components/aurora/quantum-orb", () => ({ prefersReducedMotion: () => reducido.valor }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => null }));

import type { Bot } from "@/lib/astraura-bots/tipos";
import { EVENTO_BUCLE_UI } from "@/lib/astraura-bots/adaptadores/evento-bucle-ui";
import { OrbesBots, CLAVE_ORBES, EVENTO_ENFOCADO, leerPosiciones } from "../orbes-bots";

const PERFIL = "local";
function bot(id: string, nombre: string, activo = true): Bot {
  return {
    id, nombre, origen: "astraura", gobierno: "jerarquico", dueno: { tipo: "perfil", id: PERFIL, cuentaId: PERFIL },
    personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
    cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: [], activo,
  };
}
function sembrar(bots: Bot[], abiertos: Record<string, string>) {
  window.localStorage.setItem("starseed.astraura.bots.v1", JSON.stringify({ version: 1, bots, actualizado: {} }));
  window.localStorage.setItem("starseed.astraura.orbes-abiertos", JSON.stringify(abiertos));
}
const PRED = bot(`astraura:${PERFIL}`, "Astraura");
const PRINCIPAL = { xRatio: 0.9, yRatio: 0.88 };

describe("OrbesBots", () => {
  beforeEach(() => { window.localStorage.clear(); reducido.valor = false; });
  afterEach(() => cleanup());

  it("sin sesión usa esta neurona, no duplica el predeterminado y solo pinta los abiertos y activos", async () => {
    sembrar([PRED, bot("bot:a", "Luna"), bot("bot:b", "Sol"), bot("bot:c", "Dormido", false)], { "bot:a": "1", "bot:c": "1", [PRED.id]: "1" });
    render(<OrbesBots principal={PRINCIPAL} />);
    expect(await screen.findByLabelText("Orbe de Luna")).toBeTruthy();
    expect(screen.queryByLabelText("Orbe de Astraura")).toBeNull();
    expect(screen.queryByLabelText("Orbe de Sol")).toBeNull();
    expect(screen.queryByLabelText("Orbe de Dormido")).toBeNull();
    expect(screen.getAllByTestId("orbe")).toHaveLength(1);
  });

  it("el ojo de «Mis bots» abre la orbe al momento y los bots de entidad llegan por `extra`", () => {
    sembrar([PRED, bot("bot:b", "Sol")], {});
    render(<OrbesBots perfilId={PERFIL} principal={PRINCIPAL} extra={[bot("grupo:1", "Asamblea"), PRED]} />);
    expect(screen.getByLabelText("Orbe de Asamblea")).toBeTruthy();
    expect(screen.queryByLabelText("Orbe de Sol")).toBeNull();
    act(() => { window.dispatchEvent(new CustomEvent("starseed:orbe-bot", { detail: { id: "bot:b", abierto: true } })); });
    expect(screen.getByLabelText("Orbe de Sol")).toBeTruthy();
    expect(screen.queryByLabelText("Orbe de Astraura")).toBeNull();
  });

  it("tocar una orbe la enfoca y emite su id", () => {
    sembrar([PRED, bot("bot:a", "Luna")], { "bot:a": "1" });
    render(<OrbesBots perfilId={PERFIL} principal={PRINCIPAL} />);
    const recibidos: unknown[] = [];
    const oir = (e: Event) => recibidos.push((e as CustomEvent).detail);
    window.addEventListener(EVENTO_ENFOCADO, oir);
    const orbe = screen.getByLabelText("Orbe de Luna");
    fireEvent.pointerDown(orbe, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(orbe, { clientX: 102, clientY: 101, pointerId: 1 });
    window.removeEventListener(EVENTO_ENFOCADO, oir);
    expect(recibidos).toEqual([{ id: "bot:a" }]);
    expect(orbe.getAttribute("aria-pressed")).toBe("true");
  });

  it("arrastrar mueve la orbe y guarda su posición por bot", () => {
    sembrar([PRED, bot("bot:a", "Luna")], { "bot:a": "1" });
    render(<OrbesBots perfilId={PERFIL} principal={PRINCIPAL} />);
    const orbe = screen.getByLabelText("Orbe de Luna");
    fireEvent.pointerDown(orbe, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(orbe, { clientX: 300, clientY: 384, pointerId: 1 });
    fireEvent.pointerUp(orbe, { clientX: 300, clientY: 384, pointerId: 1 });
    const pos = leerPosiciones()["bot:a"];
    expect(pos.xRatio).toBeCloseTo(300 / window.innerWidth);
    expect(pos.yRatio).toBeCloseTo(384 / window.innerHeight);
    expect(JSON.parse(window.localStorage.getItem(CLAVE_ORBES) ?? "{}").version).toBe(1);
    expect(orbe.style.left).toBe(`${300 - 24}px`);
  });

  it("lee la posición guardada, ignora el formato en lista y respeta el movimiento reducido", () => {
    window.localStorage.setItem(CLAVE_ORBES, JSON.stringify(["bot:a"]));
    expect(leerPosiciones()).toEqual({});
    window.localStorage.setItem(CLAVE_ORBES, JSON.stringify({ version: 1, posiciones: { "bot:a": { xRatio: 0.3, yRatio: 0.4 }, roto: { xRatio: "x" } } }));
    expect(Object.keys(leerPosiciones())).toEqual(["bot:a"]);
    reducido.valor = true;
    sembrar([PRED, bot("bot:a", "Luna")], { "bot:a": "1" });
    render(<OrbesBots perfilId={PERFIL} principal={PRINCIPAL} />);
    const orbe = screen.getByLabelText("Orbe de Luna");
    expect(parseFloat(orbe.style.left)).toBeCloseTo(0.3 * window.innerWidth - 24);
    expect(orbe.style.transition).toBe("none");
  });

  it("más de cinco orbes: el resto va a «más» y elegir una la trae a la vista", () => {
    const nombres = ["Uno", "Dos", "Tres", "Cuatro", "Cinco"];
    sembrar([PRED, ...nombres.map((n, i) => bot(`bot:${i}`, n))], Object.fromEntries(nombres.map((_, i) => [`bot:${i}`, "1"])));
    render(<OrbesBots perfilId={PERFIL} principal={PRINCIPAL} />);
    expect(screen.getAllByTestId("orbe")).toHaveLength(4);
    expect(screen.queryByLabelText("Orbe de Cinco")).toBeNull();
    const mas = screen.getByLabelText("Más bots (1 sin mostrar)");
    const recibidos: unknown[] = [];
    const oir = (e: Event) => recibidos.push((e as CustomEvent).detail);
    window.addEventListener(EVENTO_ENFOCADO, oir);
    fireEvent.change(mas, { target: { value: "bot:4" } });
    window.removeEventListener(EVENTO_ENFOCADO, oir);
    expect(screen.getByLabelText("Orbe de Cinco")).toBeTruthy();
    expect(screen.getAllByTestId("orbe")).toHaveLength(4);
    expect(recibidos).toEqual([{ id: "bot:4" }]);
  });

  it("la orbe respira con el preset de su estado (Ola 1024D) y queda quieta con movimiento reducido", () => {
    sembrar([PRED, bot("bot:a", "Luna")], { "bot:a": "1" });
    render(<OrbesBots perfilId={PERFIL} principal={PRINCIPAL} />);
    const orbe = screen.getByLabelText("Orbe de Luna");
    expect(orbe.style.animation).toContain("orbe-bot-bot-a-reposo");
    expect(orbe.style.animation).toContain("5320ms");
    act(() => {
      window.dispatchEvent(new CustomEvent(EVENTO_BUCLE_UI, {
        detail: {
          botId: "bot:a",
          evento: {
            tipo: "observar", sentido: "microfono", at: 1,
            decision: { permitido: true, requiere: "nada", motivo: "Permitido.", indicador: true },
          },
        },
      }));
    });
    expect(orbe.style.animation).toContain("orbe-bot-bot-a-escucha");
    expect(orbe.style.animation).toContain("3800ms");
    expect(orbe.style.animation).not.toContain("200ms");
    reducido.valor = true;
    render(<OrbesBots perfilId={PERFIL} principal={PRINCIPAL} extra={[bot("bot:r", "Réplica")]} />);
    const quieta = screen.getByLabelText("Orbe de Réplica");
    expect(quieta.style.animation).toBe("none");
    expect(quieta.style.transition).toBe("none");
  });

  it("el anillo de sentidos se monta sobre la orbe y se apaga con el bucle (BOT1011E2)", () => {
    sembrar([PRED, bot("bot:a", "Luna")], { "bot:a": "1" });
    render(<OrbesBots perfilId={PERFIL} principal={PRINCIPAL} />);
    expect(screen.queryByTestId("anillo-sentidos")).toBeNull();
    act(() => {
      window.dispatchEvent(new CustomEvent(EVENTO_BUCLE_UI, {
        detail: {
          botId: "bot:a",
          evento: {
            tipo: "observar", sentido: "microfono", at: 1,
            decision: { permitido: true, requiere: "nada", motivo: "Permitido.", indicador: true },
          },
        },
      }));
    });
    expect(screen.getByTestId("anillo-sentidos")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Luna está usando: micrófono");
    fireEvent.click(screen.getByLabelText("Apagar este sentido: micrófono"));
    expect(screen.queryByTestId("anillo-sentidos")).toBeNull();
    act(() => {
      window.dispatchEvent(new CustomEvent(EVENTO_BUCLE_UI, {
        detail: {
          botId: "bot:a",
          evento: {
            tipo: "observar", sentido: "pantalla", at: 2,
            decision: { permitido: true, requiere: "nada", motivo: "Permitido.", indicador: true },
          },
        },
      }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Pausar el bot" }));
    expect(screen.queryByTestId("anillo-sentidos")).toBeNull();
  });
});
