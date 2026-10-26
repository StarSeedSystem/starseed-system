/**
 * Mundo de los avatares · Ola 1025U · U1. El armazón completo con la rama de WebGL SIMULADA (jsdom no tiene WebGL, así
 * que `getContext` devuelve un objeto y `Canvas` se sustituye por un contenedor): la escena 3D se mockea con una lista
 * de botones, porque lo que se prueba aquí es lo que ensambla `MundoAvatares`.
 *
 * Cada defecto conocido tiene su prueba, y cae sin su arreglo:
 *  · hooks tras el `return` temprano → «Rendered more hooks» al detectarse el WebGL;
 *  · el mundo nunca se guardaba;
 *  · el tope de habitantes se callaba;
 *  · el movimiento reducido solo se leía una vez y la pestaña oculta no paraba nada.
 */
import * as React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  escena: vi.fn(),
  ficha: vi.fn(),
  leer: vi.fn(),
  tienda: {
    enterVR: vi.fn(async () => ({})),
    enterAR: vi.fn(async () => ({})),
    getState: () => ({ session: undefined as unknown }),
    subscribe: vi.fn(() => () => undefined),
  },
}));

vi.mock("@react-three/fiber", () => ({
  Canvas: (p: { children?: React.ReactNode; frameloop?: string }) => (
    <div data-testid="canvas" data-frameloop={p.frameloop}>
      {p.children}
    </div>
  ),
}));
vi.mock("../mundo/escena-mundo", () => ({
  EscenaMundo: (p: { estado: { habitantes: Array<{ id: string; nombre: string }> }; onElegir: (id: string) => void; enXR: boolean }) => {
    h.escena(p);
    return (
      <ul data-testid="escena" data-enxr={String(p.enXR)}>
        {p.estado.habitantes.map((x) => (
          <li key={x.id}>
            <button type="button" data-testid="habitante" onClick={() => p.onElegir(x.id)}>
              {x.nombre}
            </button>
          </li>
        ))}
      </ul>
    );
  },
}));
// next/dynamic en jsdom: carga perezosa con React.lazy, como en el navegador.
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
vi.mock("../ficha/ficha-agente", () => ({
  FichaAgente: (p: { agente: { id: string; nombre: string; esBotIA: boolean }; alCerrar?: () => void }) => {
    h.ficha(p);
    return (
      <div data-testid="ficha-stub">{p.agente.nombre}</div>
    );
  },
}));
vi.mock("@/lib/avatares/mundo/habitantes-cuenta", async (original) => ({
  ...(await original<typeof import("@/lib/avatares/mundo/habitantes-cuenta")>()),
  leerHabitantesDeCuenta: h.leer,
}));
vi.mock("@/components/xr/shell/almacen-xr", () => ({ obtenerAlmacenXR: vi.fn(async () => h.tienda) }));
vi.mock("@react-three/xr", () => ({
  XR: (p: { children?: React.ReactNode }) => <div data-testid="xr-conectado">{p.children}</div>,
}));

import { AppearanceProvider } from "@/context/appearance-context";
import { MundoAvatares } from "../mundo-avatares";
import { crearAgenteMundoRef, type AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { claveMundo, mundoInicial } from "@/lib/avatares/mundo/simulacion";

const agente = (i: number, origen: AgenteMundoRef["origen"] = "personalidad"): AgenteMundoRef =>
  crearAgenteMundoRef({
    origen,
    idOrigen: `${origen}-${i}`,
    nombre: `Agente ${i}`,
    dueno: origen === "personalidad" ? { tipo: "cuenta", id: "c1" } : { tipo: "grupo", id: "g1" },
  });
const varios = (n: number, origen: AgenteMundoRef["origen"] = "personalidad") => Array.from({ length: n }, (_, i) => agente(i, origen));

let reducido = false;
let oculta = false;
let oyentesMovimiento: Array<() => void> = [];

function simularNavegador(opciones: { webgl: boolean; xr?: "vr" | "ninguno" }) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => (opciones.webgl ? {} : null)) as never);
  window.matchMedia = ((consulta: string) => ({
    matches: consulta.includes("reduced-motion") ? reducido : false,
    media: consulta,
    addEventListener: (_: string, f: () => void) => oyentesMovimiento.push(f),
    removeEventListener: (_: string, f: () => void) => {
      oyentesMovimiento = oyentesMovimiento.filter((x) => x !== f);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as never;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => oculta });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "xr", {
    configurable: true,
    value: opciones.xr === "vr" ? { isSessionSupported: async (m: string) => m === "immersive-vr" } : undefined,
  });
}

function montar(props: React.ComponentProps<typeof MundoAvatares> = {}) {
  return render(
    <AppearanceProvider>
      <MundoAvatares {...props} />
    </AppearanceProvider>,
  );
}

async function asentar() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let errores: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  reducido = false;
  oculta = false;
  oyentesMovimiento = [];
  localStorage.clear();
  h.escena.mockClear();
  h.ficha.mockClear();
  h.leer.mockReset();
  h.leer.mockResolvedValue({ agentes: [], entidades: [], avisos: [], sinSesion: false });
  h.tienda.enterVR.mockClear();
  h.tienda.enterAR.mockClear();
  vi.useFakeTimers();
  errores = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("la escena 3D con WebGL simulado", () => {
  it("monta el lienzo y sus habitantes SIN el error «Rendered more hooks» (hooks tras el return temprano)", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(3) });
    await asentar();
    expect(screen.getByTestId("canvas")).toBeTruthy();
    expect(screen.getAllByTestId("habitante")).toHaveLength(3);
    const mensajes = errores.mock.calls.map((c) => String(c[0]));
    expect(mensajes.some((m) => /Rendered (more|fewer) hooks|change in the order of Hooks/i.test(m))).toBe(false);
  });

  it("el lienzo dibuja con la pestaña a la vista y deja de dibujar al ocultarse", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(2) });
    await asentar();
    expect(screen.getByTestId("canvas").getAttribute("data-frameloop")).toBe("always");
    oculta = true;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByTestId("canvas").getAttribute("data-frameloop")).toBe("never");
    oculta = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByTestId("canvas").getAttribute("data-frameloop")).toBe("always");
  });

  it("sin WebGL muestra la crónica a pantalla completa y no monta ningún lienzo", async () => {
    simularNavegador({ webgl: false });
    montar({ habitantes: varios(2) });
    await asentar();
    expect(screen.queryByTestId("canvas")).toBeNull();
    expect(screen.getByText(/tick 0/)).toBeTruthy();
  });

  it("con prefers-reduced-motion no hay lienzo; y si la preferencia cambia con el mundo abierto, se nota", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(2) });
    await asentar();
    expect(screen.getByTestId("canvas")).toBeTruthy();
    reducido = true;
    await act(async () => {
      oyentesMovimiento.forEach((f) => f());
    });
    expect(screen.queryByTestId("canvas")).toBeNull();
    reducido = false;
    await act(async () => {
      oyentesMovimiento.forEach((f) => f());
    });
    expect(screen.getByTestId("canvas")).toBeTruthy();
  });
});

describe("la simulación: pausa, pestaña oculta y guardado", () => {
  const tick = () => Number(/tick (\d+)/.exec(screen.getAllByText(/tick \d+/)[0].textContent ?? "")?.[1]);

  it("avanza con el tiempo, se detiene en pausa y vuelve a avanzar al reanudar", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(2) });
    await asentar();
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    const t1 = tick();
    expect(t1).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("boton-pausar"));
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(tick()).toBe(t1);
    fireEvent.click(screen.getByTestId("boton-reanudar"));
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(tick()).toBeGreaterThan(t1);
  });

  it("con la pestaña oculta el tiempo pasa y el mundo no avanza", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(2) });
    await asentar();
    oculta = true;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const antes = tick();
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(tick()).toBe(antes);
  });

  it("el mundo SE GUARDA en este aparato y al volver sigue donde estaba (antes no se guardaba nunca)", async () => {
    simularNavegador({ webgl: true });
    const primera = montar({ habitantes: varios(3) });
    await asentar();
    await act(async () => {
      vi.advanceTimersByTime(12_000);
    });
    const antes = tick();
    expect(antes).toBeGreaterThanOrEqual(5);
    const guardado = localStorage.getItem(claveMundo("mi-mundo"));
    expect(guardado).toBeTruthy();
    primera.unmount();

    montar({ habitantes: varios(3) });
    await asentar();
    expect(tick()).toBeGreaterThanOrEqual(antes - (antes % 5));
    expect(tick()).toBeGreaterThan(0);
  });

  it("un mundo recién abierto sin nada guardado empieza en el tick 0 y guarda su primer estado", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(2) });
    await asentar();
    expect(localStorage.getItem(claveMundo("mi-mundo"))).toBeTruthy();
  });

  it("estadoInicial y pausadoInicial siguen funcionando (contrato histórico)", async () => {
    simularNavegador({ webgl: false });
    montar({ estadoInicial: mundoInicial([{ id: "a1", nombre: "Astra" }]), pausadoInicial: true });
    await asentar();
    expect(screen.getByText(/tick 0/)).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText(/tick 0/)).toBeTruthy();
  });
});

describe("habitantes reales de la cuenta", () => {
  it("son los de la cuenta: personalidades, bots de entidades y agentes de grupo", async () => {
    simularNavegador({ webgl: true });
    h.leer.mockResolvedValue({
      agentes: [agente(1), agente(2, "bot"), agente(3, "agente-grupo")],
      entidades: [{ tipo: "grupo", id: "g1", nombre: "Mi círculo" }],
      avisos: [],
      sinSesion: false,
    });
    montar();
    await asentar();
    expect(screen.getAllByTestId("habitante").map((b) => b.textContent)).toEqual(["Agente 1", "Agente 2", "Agente 3"]);
  });

  it("sin agentes reales el mundo lo dice y no inventa a nadie", async () => {
    simularNavegador({ webgl: true });
    montar();
    await asentar();
    expect(screen.queryAllByTestId("habitante")).toHaveLength(0);
    expect(screen.getByTestId("aviso-mundo-vacio").textContent).toMatch(/vacío/);
    expect(screen.getByTestId("aviso-mundo-vacio").textContent).toMatch(/No se inventa/);
  });

  it("mientras lee la cuenta lo dice y no toca el mundo guardado", async () => {
    simularNavegador({ webgl: true });
    h.leer.mockReturnValue(new Promise(() => undefined));
    montar();
    await asentar();
    expect(screen.getByTestId("aviso-mundo-cargando")).toBeTruthy();
    expect(localStorage.getItem(claveMundo("mi-mundo"))).toBeNull();
  });

  it("si una fuente falla lo dice, y NO pisa el mundo guardado con una lista incompleta", async () => {
    simularNavegador({ webgl: true });
    h.leer.mockResolvedValue({ agentes: [agente(1)], entidades: [], avisos: ["No se pudieron leer los bots de 2 entidades."], sinSesion: false });
    montar();
    await asentar();
    expect(screen.getByTestId("aviso-mundo-fuente").textContent).toMatch(/bots de 2 entidades/);
    await act(async () => {
      vi.advanceTimersByTime(8_000);
    });
    expect(localStorage.getItem(claveMundo("mi-mundo"))).toBeNull();
  });

  it("todos se dicen «Bot de IA» y su juego se dice juego", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(2) });
    await asentar();
    const aviso = screen.getByTestId("aviso-mundo-juego").textContent ?? "";
    expect(aviso).toMatch(/Bot de IA/);
    expect(aviso).toMatch(/simulación de juego/);
  });
});

describe("tope de habitantes visibles", () => {
  it("con 30 agentes se ven 24 y el aviso dice cuántos quedan fuera", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(30) });
    await asentar();
    expect(screen.getAllByTestId("habitante")).toHaveLength(24);
    expect(screen.getByTestId("aviso-mundo-tope").textContent).toMatch(/24 de 30/);
    expect(screen.getByTestId("aviso-mundo-tope").textContent).toMatch(/6 fuera/);
  });

  it("bajo el tope no hay aviso de tope", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(5) });
    await asentar();
    expect(screen.queryByTestId("aviso-mundo-tope")).toBeNull();
  });
});

describe("la ficha del agente en el panel de cristal", () => {
  it("elegir un habitante abre la ficha con SU referencia (un Bot de IA) y se cierra con la X del panel y con Escape", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(3) });
    await asentar();
    expect(screen.queryByTestId("panel-cristal")).toBeNull();

    fireEvent.click(screen.getAllByTestId("habitante")[1]);
    const panel = screen.getByTestId("panel-cristal");
    expect(panel.getAttribute("role")).toBe("dialog");
    // La ficha se descarga a demanda (next/dynamic, aquí React.lazy): se asienta y aparece.
    await asentar();
    expect(within(panel).getByTestId("ficha-stub").textContent).toContain("Agente 1");
    const props = h.ficha.mock.calls.at(-1)?.[0] as { agente: AgenteMundoRef; alCerrar?: () => void };
    expect(props.agente.id).toBe("personalidad:personalidad-1");
    expect(props.agente.esBotIA).toBe(true);
    // Una sola X: la del panel. La ficha no recibe `alCerrar` y no pinta la suya.
    expect(props.alCerrar).toBeUndefined();
    expect(within(panel).getByText("Bot de IA")).toBeTruthy();
    expect(within(panel).getAllByRole("button", { name: /cerrar/i })).toHaveLength(1);

    fireEvent.click(within(panel).getByRole("button", { name: /cerrar/i }));
    expect(screen.queryByTestId("panel-cristal")).toBeNull();

    fireEvent.click(screen.getAllByTestId("habitante")[2]);
    await asentar();
    expect(within(screen.getByTestId("panel-cristal")).getByTestId("ficha-stub").textContent).toContain("Agente 2");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("panel-cristal")).toBeNull();
  });

  it("el panel pasa el foco a sí mismo y es una hoja inferior en móvil y un panel lateral desde sm", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(2) });
    await asentar();
    const boton = screen.getAllByTestId("habitante")[0];
    boton.focus();
    fireEvent.click(boton);
    const panel = screen.getByTestId("panel-cristal");
    expect(document.activeElement).toBe(panel);
    expect(panel.className).toMatch(/inset-x-0/);
    expect(panel.className).toMatch(/bottom-0/);
    expect(panel.className).toMatch(/sm:right-3/);
    expect(panel.className).toMatch(/backdrop-blur/);
  });

  it("en la crónica sin WebGL también se abre la ficha de quien se elija", async () => {
    simularNavegador({ webgl: false });
    montar({ habitantes: varios(2) });
    await asentar();
    // Hay que dejar que alguien aparezca en la crónica: un paso basta para que cada habitante tenga su línea.
    const nombre = screen.getAllByText("Agente 0")[0];
    fireEvent.click(nombre);
    expect(screen.getByTestId("panel-cristal")).toBeTruthy();
  });
});

describe("entrar en VR/AR", () => {
  it("sin XR en el aparato NO se pinta nada: ni botón ni aviso de «no tienes VR»", async () => {
    simularNavegador({ webgl: true, xr: "ninguno" });
    montar({ habitantes: varios(2) });
    await asentar();
    expect(screen.queryByTestId("entrada-xr-mundo")).toBeNull();
    expect(screen.queryByText(/Entrar en/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/no tiene VR|no tienes VR|sin VR|Comprobando tu visor/i);
    expect(screen.queryByTestId("xr-conectado")).toBeNull();
    expect(screen.getAllByTestId("habitante")).toHaveLength(2);
  });

  it("con un visor VR el botón sale, la escena va dentro de <XR> y pulsarlo abre la sesión", async () => {
    simularNavegador({ webgl: true, xr: "vr" });
    montar({ habitantes: varios(2) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    await asentar();
    const boton = screen.getByRole("button", { name: "Entrar en VR" });
    expect(screen.getByTestId("xr-conectado")).toBeTruthy();
    expect(within(screen.getByTestId("xr-conectado")).getByTestId("escena")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Entrar en AR" })).toBeNull();
    // Objetivo táctil de 44 px.
    expect(boton.className).toMatch(/min-h-11/);
    await act(async () => {
      fireEvent.click(boton);
    });
    expect(h.tienda.enterVR).toHaveBeenCalledTimes(1);
    expect(h.tienda.enterAR).not.toHaveBeenCalled();
  });

  it("si el visor rechaza la sesión, lo explica con el motivo", async () => {
    simularNavegador({ webgl: true, xr: "vr" });
    h.tienda.enterVR.mockRejectedValueOnce(Object.assign(new Error("x"), { name: "SecurityError" }));
    montar({ habitantes: varios(1) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    await asentar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Entrar en VR" }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/https/);
  });
});

describe("escenarios dentro del mundo", () => {
  const tick = () => Number(/tick (\d+)/.exec(screen.getAllByText(/tick \d+/)[0].textContent ?? "")?.[1]);
  const abrirSelector = () => fireEvent.click(screen.getByTestId("selector-escenario"));

  it("en un escenario público NO viven tus personalidades personales (alcance de memoria), en uno privado sí", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: [agente(1, "personalidad"), agente(2, "bot"), agente(3, "agente-grupo")] });
    await asentar();
    expect(screen.getAllByTestId("habitante").map((b) => b.textContent)).toEqual(["Agente 1", "Agente 2", "Agente 3"]);

    abrirSelector();
    fireEvent.click(screen.getByRole("radio", { name: /Público/ }));
    expect(screen.getAllByTestId("habitante").map((b) => b.textContent)).toEqual(["Agente 2", "Agente 3"]);

    fireEvent.click(screen.getByRole("radio", { name: /Privado/ }));
    expect(screen.getAllByTestId("habitante")).toHaveLength(3);
  });

  it("cada escenario tiene su propio mundo guardado: el nuevo empieza de cero y el primero conserva el suyo", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(3) });
    await asentar();
    await act(async () => {
      vi.advanceTimersByTime(12_000);
    });
    const primero = tick();
    expect(primero).toBeGreaterThanOrEqual(5);

    abrirSelector();
    fireEvent.change(screen.getByLabelText("Nombre del escenario nuevo"), { target: { value: "Otro mundo" } });
    fireEvent.click(screen.getByRole("button", { name: /Crear/ }));
    await asentar();
    expect(screen.getByTestId("nombre-escenario-activo").textContent).toBe("Otro mundo");
    expect(tick()).toBeLessThan(primero);
    expect(Object.keys(localStorage).filter((k) => k.startsWith("starseed.mundo.avatares.v1."))).toHaveLength(2);

    fireEvent.click(screen.getAllByTestId("opcion-escenario")[0]);
    await asentar();
    expect(screen.getByTestId("nombre-escenario-activo").textContent).toBe("Mi mundo");
    expect(tick()).toBeGreaterThanOrEqual(primero - (primero % 5));
  });

  it("cambiar de escenario suelta la ficha abierta: era de otro mundo", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(2) });
    await asentar();
    fireEvent.click(screen.getAllByTestId("habitante")[0]);
    expect(screen.getByTestId("panel-cristal")).toBeTruthy();
    abrirSelector();
    fireEvent.change(screen.getByLabelText("Nombre del escenario nuevo"), { target: { value: "Otro" } });
    fireEvent.click(screen.getByRole("button", { name: /Crear/ }));
    await asentar();
    expect(screen.queryByTestId("panel-cristal")).toBeNull();
  });

  it("las zonas del escenario llegan a la escena (una por zona, con las del escenario activo)", async () => {
    simularNavegador({ webgl: true });
    montar({ habitantes: varios(2) });
    await asentar();
    const ultima = h.escena.mock.calls.at(-1)?.[0] as { disposicion: { zonas: Array<{ id: string }> } };
    expect(ultima.disposicion.zonas.map((z) => z.id).sort()).toEqual(["agora", "biblioteca", "suenos", "taller"]);
  });
});
