/**
 * AvatarVivo · la fuente «procedural» se envuelve UNA sola vez en data URI (Ola 1026P, verificación de 1025U en
 * localhost:9002: el mundo de los avatares pintaba «Avatar animado: …» en grande porque la cara llegaba ya como data
 * URL y se envolvía otra vez; la imagen rota enseñaba su texto alternativo).
 *
 * Y `prefers-reduced-motion`: la vida 2,5D se corta y, si la preferencia cambia con el avatar montado, se nota
 * (unificación de la lectura reactiva, que antes era una copia local puntual y en la vía ADN ni reaccionaba).
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
import { AvatarVivo } from "../avatar-vivo";
import { useMovimientoReducido } from "../usar-movimiento";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="3"/></svg>';

let reducido = false;
let oyentes: Array<() => void> = [];

/** jsdom no evalúa media queries: se sustituye por una que sí responde, igual que en mundo-avatares.test.tsx. */
function simularMovimientoRedusido(valor: boolean) {
  reducido = valor;
  oyentes = [];
  window.matchMedia = ((consulta: string) => ({
    get matches() {
      return consulta.includes("reduced-motion") ? reducido : false;
    },
    media: consulta,
    addEventListener: (_: string, f: () => void) => oyentes.push(f),
    removeEventListener: (_: string, f: () => void) => {
      oyentes = oyentes.filter((x) => x !== f);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as never;
}

/** El contenedor 2,5D: el padre del `<img>` en la fuente procedural. */
function contenedor25D(container: HTMLElement): HTMLElement {
  const div = container.querySelector("img")?.parentElement;
  if (!div) throw new Error("No hay imagen");
  return div;
}

afterEach(cleanup);

describe("AvatarVivo · fuente procedural", () => {
  it("un SVG crudo se envuelve en su data URI", () => {
    const { container } = render(<AvatarVivo fuente={{ tipo: "procedural", svg: SVG }} tamano={32} />);
    const src = container.querySelector("img")?.getAttribute("src") ?? "";
    expect(src.startsWith("data:image/svg+xml;charset=utf-8,%3Csvg")).toBe(true);
  });

  it("lo que ya es una data URI pasa tal cual (nunca se envuelve dos veces)", () => {
    const yaUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`;
    const { container } = render(<AvatarVivo fuente={{ tipo: "procedural", svg: yaUri }} tamano={32} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(yaUri);
  });
});

/** Fuga mínima para leer el hook reactiva en la salida del árbol. */
function FugaRedusido() {
  const reducido = useMovimientoReducido();
  return <div data-testid="reducido">{String(reducido)}</div>;
}

describe("useMovimientoReducido · la fuente única del área", () => {
  it("arranca con lo que dice el sistema y reacciona si cambia montado", () => {
    simularMovimientoRedusido(false);
    render(<FugaRedusido />);
    expect(screen.getByTestId("reducido").textContent).toBe("false");
    reducido = true;
    act(() => {
      oyentes.forEach((f) => f());
    });
    expect(screen.getByTestId("reducido").textContent).toBe("true");
  });

  it("al desmontar deja de escuchar el cambio de preferencia", () => {
    simularMovimientoRedusido(false);
    const { unmount } = render(<FugaRedusido />);
    expect(oyentes.length).toBeGreaterThan(0);
    unmount();
    expect(oyentes.length).toBe(0);
  });
});

describe("AvatarVivo · prefers-reduced-motion", () => {
  it("con movimiento reducido el avatar procedural queda quieto (sin deriva 2,5D)", () => {
    simularMovimientoRedusido(true);
    const { container } = render(<AvatarVivo fuente={{ tipo: "procedural", svg: SVG }} tamano={32} />);
    expect(contenedor25D(container).style.transform).toBe("");
  });

  it("sin movimiento reducido hay vida 2,5D de respaldo, y si la preferencia cambia montado, se nota", () => {
    simularMovimientoRedusido(false);
    const { container } = render(<AvatarVivo fuente={{ tipo: "procedural", svg: SVG }} tamano={32} />);
    expect(contenedor25D(container).style.transform).toContain("rotate(0.4deg)");
    // Cambia la preferencia del sistema con el avatar abierto: la vida se corta…
    reducido = true;
    act(() => {
      oyentes.forEach((f) => f());
    });
    expect(contenedor25D(container).style.transform).toBe("");
    // …y vuelve a haber vida si la persona la reactiva.
    reducido = false;
    act(() => {
      oyentes.forEach((f) => f());
    });
    expect(contenedor25D(container).style.transform).toContain("rotate(0.4deg)");
  });
});
