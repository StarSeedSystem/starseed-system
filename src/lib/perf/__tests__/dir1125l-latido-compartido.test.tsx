// @vitest-environment jsdom
/** DIR1125L · un solo reloj por periodo: N oyentes, UN setInterval, todos en la misma llamada; oculta, se para. */
import { act } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { relojesEnMarcha, suscribirLatido, useLatido } from "@/lib/perf/latido-compartido";

function ponerVisibilidad(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
  document.dispatchEvent(new Event("visibilitychange"));
}

function Reloj({ id }: { id: string }) {
  const t = useLatido(15_000);
  return <span data-testid={id}>{t}</span>;
}

describe("DIR1125L · reloj compartido", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ponerVisibilidad("visible");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    ponerVisibilidad("visible");
  });

  it("cuatro oyentes del mismo periodo comparten UN setInterval y laten en la misma llamada, con la misma hora", () => {
    const espia = vi.spyOn(globalThis, "setInterval");
    const vistos: number[][] = [[], [], [], []];
    const bajas = vistos.map((v) => suscribirLatido(15_000, (t) => { v.push(t); }));
    expect(espia.mock.calls.filter((c) => c[1] === 15_000)).toHaveLength(1);
    expect(relojesEnMarcha()).toBe(1);
    vi.advanceTimersByTime(15_000);
    expect(vistos.map((v) => v.length)).toEqual([1, 1, 1, 1]);
    expect(new Set(vistos.map((v) => v[0])).size).toBe(1);
    bajas.forEach((b) => b());
    expect(relojesEnMarcha()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(vistos.map((v) => v.length)).toEqual([1, 1, 1, 1]);
    espia.mockRestore();
  });

  it("con la pestaña oculta el reloj se para; al volver a verse late una vez enseguida y sigue", () => {
    const v: number[] = [];
    const baja = suscribirLatido(15_000, (t) => { v.push(t); });
    ponerVisibilidad("hidden");
    expect(relojesEnMarcha()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(v).toHaveLength(0);
    ponerVisibilidad("visible");
    expect(v).toHaveLength(1);
    vi.advanceTimersByTime(15_000);
    expect(v).toHaveLength(2);
    baja();
  });

  it("periodos distintos van cada uno por su lado y un oyente roto no para a los demás", () => {
    const a: number[] = [];
    const b: number[] = [];
    const bajas = [
      suscribirLatido(15_000, () => { throw new Error("roto"); }),
      suscribirLatido(15_000, (t) => { a.push(t); }),
      suscribirLatido(45_000, (t) => { b.push(t); }),
    ];
    expect(relojesEnMarcha()).toBe(2);
    vi.advanceTimersByTime(45_000);
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(1);
    bajas.forEach((x) => x());
    expect(relojesEnMarcha()).toBe(0);
  });

  it("useLatido: cuatro componentes reciben la misma hora en un solo latido", () => {
    const ids = ["a", "b", "c", "d"];
    const { getByTestId } = render(<>{ids.map((id) => <Reloj key={id} id={id} />)}</>);
    expect(relojesEnMarcha()).toBe(1);
    const antes = getByTestId("a").textContent;
    act(() => { vi.advanceTimersByTime(15_000); });
    const despues = ids.map((id) => getByTestId(id).textContent);
    expect(new Set(despues).size).toBe(1);
    expect(despues[0]).not.toBe(antes);
    cleanup();
    expect(relojesEnMarcha()).toBe(0);
  });
});
