/**
 * Los sueños montados en el Mundo de los avatares · Ola 1025U · U4. El armazón completo con la escena 3D simulada (como en
 * `mundo-avatares.test.tsx`) y el enrutador de IA simulado: el botón de la cabecera, el panel de cristal, un solo panel a la
 * vez, y que lo soñado llega a la crónica del mundo.
 */
import * as React from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  leer: vi.fn(),
  astrauraChat: vi.fn(),
  tienda: {
    enterVR: vi.fn(async () => ({})),
    enterAR: vi.fn(async () => ({})),
    getState: () => ({ session: undefined as unknown }),
    subscribe: vi.fn(() => () => undefined),
  },
}));

vi.mock("@react-three/fiber", () => ({
  Canvas: (p: { children?: React.ReactNode }) => <div data-testid="canvas">{p.children}</div>,
}));
vi.mock("../../mundo/escena-mundo", () => ({
  EscenaMundo: (p: { estado: { habitantes: Array<{ id: string; nombre: string }> }; onElegir: (id: string) => void }) => (
    <ul data-testid="escena">
      {p.estado.habitantes.map((x) => (
        <li key={x.id}>
          <button type="button" data-testid="habitante" onClick={() => p.onElegir(x.id)}>
            {x.nombre}
          </button>
        </li>
      ))}
    </ul>
  ),
}));
vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: (cargar: () => Promise<React.ComponentType<Record<string, unknown>>>) => {
      const Perezoso = React.lazy(() => cargar().then((c) => ({ default: c })));
      return function Diferido(p: Record<string, unknown>) {
        return (
          <React.Suspense fallback={null}>
            <Perezoso {...p} />
          </React.Suspense>
        );
      };
    },
  };
});
vi.mock("../../ficha/ficha-agente", () => ({
  FichaAgente: (p: { agente: { nombre: string } }) => <div data-testid="ficha-stub">{p.agente.nombre}</div>,
}));
vi.mock("@/lib/avatares/mundo/habitantes-cuenta", async (original) => ({
  ...(await original<typeof import("@/lib/avatares/mundo/habitantes-cuenta")>()),
  leerHabitantesDeCuenta: h.leer,
}));
vi.mock("@/components/xr/shell/almacen-xr", () => ({ obtenerAlmacenXR: vi.fn(async () => h.tienda) }));
vi.mock("@react-three/xr", () => ({ XR: (p: { children?: React.ReactNode }) => <div>{p.children}</div> }));
vi.mock("@/ai/astraura/router", () => ({
  astrauraChat: h.astrauraChat,
  getIntelligenceSettings: () => ({ mode: "auto", allowConfiguredPaid: false }),
  classifyTask: () => ({ kind: "creative" }),
  rankCandidates: () => [],
}));

import { AppearanceProvider } from "@/context/appearance-context";
import { MundoAvatares } from "../../mundo-avatares";
import { useEscenarios } from "../../mundo/use-escenarios";
import { crearAgenteMundoRef, type AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { guardarSuenos, leerSuenos } from "@/lib/avatares/suenos/almacen-suenos";

const agente = (i: number): AgenteMundoRef =>
  crearAgenteMundoRef({ origen: "personalidad", idOrigen: `p-${i}`, nombre: `Agente ${i}`, dueno: { tipo: "cuenta", id: "c1" } });
const varios = (n: number) => Array.from({ length: n }, (_, i) => agente(i));

function simularNavegador(webgl: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => (webgl ? {} : null)) as never);
  window.matchMedia = ((consulta: string) => ({
    matches: false,
    media: consulta,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as never;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "xr", { configurable: true, value: undefined });
}

async function montar(webgl: boolean, n = 3) {
  simularNavegador(webgl);
  render(
    <AppearanceProvider>
      <MundoAvatares habitantes={varios(n)} pausadoInicial />
    </AppearanceProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("boton-sonar")).toBeTruthy());
  if (webgl) await waitFor(() => expect(screen.getAllByTestId("habitante")).toHaveLength(n));
}

beforeEach(() => {
  localStorage.clear();
  h.leer.mockReset();
  h.leer.mockResolvedValue({ agentes: [], entidades: [], avisos: [], sinSesion: false });
  h.astrauraChat.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("el botón y el panel dentro del mundo", () => {
  it("«Soñar juntos» está en la cabecera, también sin WebGL, y mide al menos 44 px", async () => {
    await montar(false);
    const b = screen.getByRole("button", { name: /Soñar juntos/ });
    expect(b.className).toMatch(/min-h-11/);
    expect(screen.queryByTestId("canvas")).toBeNull();
  });

  it("abre el panel «Sueños» (no modal), con su propia etiqueta de cerrar, y Escape lo cierra", async () => {
    await montar(false);
    expect(screen.queryByRole("dialog", { name: "Sueños" })).toBeNull();
    fireEvent.click(screen.getByTestId("boton-sonar"));
    const panel = screen.getByRole("dialog", { name: "Sueños" });
    expect(panel.getAttribute("aria-modal")).toBe("false");
    expect(within(panel).getByRole("button", { name: "Cerrar los sueños" })).toBeTruthy();
    expect(within(panel).getByLabelText("Tema del sueño")).toBeTruthy();
    // Los tres agentes del mundo se pueden elegir.
    expect(within(panel).getAllByRole("checkbox")).toHaveLength(3);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Sueños" })).toBeNull();
  });

  it("un solo panel a la vez: abrir los sueños suelta la ficha, y elegir a alguien cierra los sueños", async () => {
    await montar(true);
    fireEvent.click(screen.getAllByTestId("habitante")[0]);
    expect(await screen.findByTestId("ficha-stub")).toBeTruthy();
    fireEvent.click(screen.getByTestId("boton-sonar"));
    expect(screen.queryByTestId("ficha-stub")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Sueños" })).toBeTruthy();
    fireEvent.click(screen.getAllByTestId("habitante")[1]);
    expect(screen.queryByRole("dialog", { name: "Sueños" })).toBeNull();
    expect(await screen.findByTestId("ficha-stub")).toBeTruthy();
    expect(screen.getByTestId("boton-sonar").getAttribute("aria-pressed")).toBe("false");
  });

  it("en 3D, mientras los sueños están abiertos, la crónica lateral no tapa el panel", async () => {
    await montar(true);
    expect(screen.getByLabelText("Crónica del mundo")).toBeTruthy();
    fireEvent.click(screen.getByTestId("boton-sonar"));
    expect(screen.queryByLabelText("Crónica del mundo")).toBeNull();
  });
});

describe("lo soñado llega a la crónica del mundo", () => {
  it("un sueño completo deja su creación de tipo «sueño» con sus autores", async () => {
    h.astrauraChat.mockImplementation(async () => ({
      text: "Veo un faro que respira.",
      route: { ok: true, local: false, free: true, sourceLabel: "BitNet 1.58 local" },
    }));
    await montar(false);
    fireEvent.click(screen.getByTestId("boton-sonar"));
    const panel = screen.getByRole("dialog", { name: "Sueños" });
    fireEvent.click(within(panel).getByRole("checkbox", { name: /^Agente 0/ }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: /^Agente 1/ }));
    fireEvent.change(within(panel).getByLabelText("Tema del sueño"), { target: { value: "un faro" } });
    fireEvent.click(within(panel).getByRole("button", { name: /Empezar a soñar/ }));

    await waitFor(() => expect(within(panel).getAllByTestId("tarjeta-sueno")[0].getAttribute("data-estado")).toBe("completo"), { timeout: 5000 });
    expect(h.astrauraChat).toHaveBeenCalledTimes(4);

    // La crónica (a pantalla completa, sin WebGL) lo cuenta: una obra por autor.
    const obras = screen.getAllByText("Sueño compartido: un faro");
    expect(obras).toHaveLength(2);
    expect(screen.getAllByText("sueño")).toHaveLength(2);
    expect(screen.queryByText("Todavía no se ha creado ninguna obra.")).toBeNull();
  });
});

describe("borrar un escenario", () => {
  it("también olvida los sueños que guardaba", () => {
    const { result } = renderHook(() => useEscenarios());
    let creado: { id: string } | undefined;
    act(() => {
      const r = result.current.crear({ nombre: "Otro mundo", visibilidad: "privado" } as never);
      if (r.ok) creado = r.escenario;
    });
    expect(creado).toBeDefined();
    const id = creado!.id;
    guardarSuenos(id, { automaticos: true, suenos: [] });
    expect(leerSuenos(id).automaticos).toBe(true);
    act(() => {
      result.current.borrar(id, true);
    });
    expect(leerSuenos(id)).toEqual({ automaticos: false, suenos: [] });
    expect(localStorage.getItem(`starseed.mundo.suenos.${id}.v1`)).toBeNull();
  });
});
