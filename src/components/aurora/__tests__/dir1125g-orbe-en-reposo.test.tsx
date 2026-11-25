// @vitest-environment jsdom
/**
 * DIR1125G · el orbe de Aurora no gasta en lo que no se ve.
 * Medido el 25-11 en la Maggabox (ventana de prueba aparte, misma web y mismo motor): con los dos bucles del orbe el hilo principal
 * iba al 62 %; parando la orbe cuántica mientras es invisible, al 48 %; y sin transiciones invisibles en el orbe, al 33 %.
 */
import { act } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/astraura/astraura-158-presence", () => ({ Astraura158PresenceDot: () => null }));
vi.mock("@/ai/astraura/router", () => ({ ROUTE_EVENT: "ss:ruta-de-prueba", lastRoute: () => null }));

import { AuroraOrb } from "@/components/aurora/aurora-orb";
import { QuantumOrb } from "@/components/aurora/quantum-orb";
import { MODO_CHANGED_EVENT, MODO_KEY } from "@/lib/perf/modo-rendimiento";

/** Un contexto 2D de mentira POR LIENZO que cuenta las órdenes de dibujo que recibe. */
const cuentas = new WeakMap<HTMLCanvasElement, { n: number }>();
const contextos = new WeakMap<HTMLCanvasElement, unknown>();
function contextoDe(lienzo: HTMLCanvasElement): unknown {
  const ya = contextos.get(lienzo);
  if (ya) return ya;
  const cuenta = { n: 0 };
  cuentas.set(lienzo, cuenta);
  const degradado = { addColorStop() {} };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(obj, clave) {
      if (typeof clave !== "string") return undefined;
      if (clave in obj) return obj[clave];
      if (clave === "canvas") return lienzo;
      return () => {
        cuenta.n++;
        return degradado;
      };
    },
    set(obj, clave, valor) {
      obj[String(clave)] = valor;
      return true;
    },
  });
  contextos.set(lienzo, ctx);
  return ctx;
}
const ordenes = (l: Element | null | undefined): number => (l ? cuentas.get(l as HTMLCanvasElement)?.n ?? 0 : 0);
const pasar = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
function ponerModo(modo: string) {
  window.localStorage.setItem(MODO_KEY, modo);
  window.dispatchEvent(new Event(MODO_CHANGED_EVENT));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    return contextoDe(this);
  } as unknown as HTMLCanvasElement["getContext"];
  // jsdom no trae matchMedia y la orbe cuántica pregunta por «reducir movimiento».
  window.matchMedia = ((consulta: string) => ({
    matches: false,
    media: consulta,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("DIR1125G · la orbe cuántica se puede pausar", () => {
  it("sin pausa pinta en cada refresco, como siempre", async () => {
    ponerModo("alto");
    const { container } = render(<QuantumOrb size={64} />);
    const lienzo = container.querySelector("canvas");
    await pasar(3000);
    const antes = ordenes(lienzo);
    await pasar(1000);
    expect(ordenes(lienzo) - antes).toBeGreaterThan(55);
  });

  it("en pausa ni pinta ni pide cuadros", async () => {
    ponerModo("alto");
    const { container } = render(<QuantumOrb size={64} pausado />);
    const lienzo = container.querySelector("canvas");
    await pasar(3000);
    const antes = ordenes(lienzo);
    const pedidos = vi.spyOn(globalThis, "requestAnimationFrame");
    await pasar(2000);
    expect(ordenes(lienzo) - antes).toBe(0);
    expect(pedidos).not.toHaveBeenCalled();
    pedidos.mockRestore();
  });

  it("al quitar la pausa vuelve a pintar, y al ponerla se para otra vez", async () => {
    ponerModo("eficiente");
    const { container, rerender } = render(<QuantumOrb size={64} pausado />);
    const lienzo = container.querySelector("canvas");
    await pasar(3000);
    rerender(<QuantumOrb size={64} />);
    let antes = ordenes(lienzo);
    await pasar(1000);
    expect(ordenes(lienzo) - antes).toBeGreaterThan(0); // en «eficiente»: unas 10 veces por segundo
    rerender(<QuantumOrb size={64} pausado />);
    await pasar(50);
    antes = ordenes(lienzo);
    await pasar(2000);
    expect(ordenes(lienzo) - antes).toBe(0);
  });

  it("desmontarla en pausa no deja nada pedido", async () => {
    ponerModo("alto");
    const { container, unmount } = render(<QuantumOrb size={64} pausado />);
    const lienzo = container.querySelector("canvas");
    await pasar(500);
    unmount();
    const antes = ordenes(lienzo);
    await pasar(1000);
    expect(ordenes(lienzo) - antes).toBe(0);
  });
});

describe("DIR1125G · el orbe de Aurora solo pinta la capa que se ve", () => {
  const capas = (c: HTMLElement) => {
    const todos = Array.from(c.querySelectorAll("canvas"));
    const cuantica = todos.find((l) => l.className.includes("block")) ?? null;
    const reposo = todos.find((l) => l !== cuantica) ?? null;
    return { cuantica, reposo };
  };

  it("en reposo la cuántica (invisible) no pinta y la de reposo sí", async () => {
    ponerModo("alto");
    const { container } = render(<AuroraOrb size={56} speaking={false} listening={false} paused={false} supported />);
    await pasar(3000);
    const { cuantica, reposo } = capas(container);
    expect(cuantica).not.toBeNull();
    expect(reposo).not.toBeNull();
    const c0 = ordenes(cuantica);
    const r0 = ordenes(reposo);
    await pasar(1000);
    expect(ordenes(cuantica) - c0).toBe(0);
    expect(ordenes(reposo) - r0).toBeGreaterThan(55);
  });

  it("al hablar la cuántica pinta enseguida; al callar sigue durante el fundido y luego se para", async () => {
    ponerModo("alto");
    const { container, rerender } = render(<AuroraOrb size={56} speaking={false} listening={false} paused={false} supported />);
    await pasar(3000);
    const { cuantica } = capas(container);
    rerender(<AuroraOrb size={56} speaking listening={false} paused={false} supported />);
    let antes = ordenes(cuantica);
    await pasar(300);
    expect(ordenes(cuantica) - antes).toBeGreaterThan(0);
    rerender(<AuroraOrb size={56} speaking={false} listening={false} paused={false} supported />);
    antes = ordenes(cuantica);
    await pasar(250); // el fundido de salida dura 260 ms: todavía se ve
    expect(ordenes(cuantica) - antes).toBeGreaterThan(0);
    await pasar(400);
    antes = ordenes(cuantica);
    await pasar(1500);
    expect(ordenes(cuantica) - antes).toBe(0);
  });
});
