// @vitest-environment jsdom
/** DIR1125L · el estado del Bluetooth directo se sondea UNA vez para todas las copias del gancho (antes, una por copia). */
import { act } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const puente = vi.hoisted(() => {
  const estado = { n: 0 };
  const baja = vi.fn();
  return {
    baja,
    llamar: vi.fn(async (_cmd: string) => ({ ok: true, valor: { n: ++estado.n } })),
    escuchar: vi.fn(async (_ev: string, _f: (x: unknown) => void) => baja),
  };
});
vi.mock("@/lib/nativa/puente", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/nativa/puente")>()),
  esAppNativa: () => true,
  puenteNativo: () => ({ llamar: puente.llamar, escuchar: puente.escuchar }),
}));
vi.mock("@/lib/malla/bluetooth-directo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/malla/bluetooth-directo")>()),
  leerEstadoBle: (v: unknown) => (v && typeof v === "object" ? (v as never) : null),
}));

import { useEstadoBluetooth } from "@/lib/malla/bluetooth-directo-estado";
import { COMANDO_ESTADO_BLE, EVENTO_CAMBIO_BLE } from "@/lib/malla/bluetooth-directo";

const IDS = ["a", "b", "c", "d"];
function Sonda({ id }: { id: string }) {
  const e = useEstadoBluetooth() as unknown as { n?: number } | null;
  return <span data-testid={id}>{e ? String(e.n) : "nada"}</span>;
}
const cuatro = () => <>{IDS.map((id) => <Sonda key={id} id={id} />)}</>;
const sondeos = () => puente.llamar.mock.calls.filter((c) => c[0] === COMANDO_ESTADO_BLE).length;
const vaciar = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe("DIR1125L · estado del Bluetooth directo compartido", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    puente.llamar.mockClear();
    puente.escuchar.mockClear();
    puente.baja.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("cuatro copias: un solo sondeo al montar, una sola escucha y el mismo estado para todas", async () => {
    const { getByTestId } = render(cuatro());
    await act(vaciar);
    expect(sondeos()).toBe(1);
    expect(puente.escuchar.mock.calls.filter((c) => c[0] === EVENTO_CAMBIO_BLE)).toHaveLength(1);
    const vals = IDS.map((id) => getByTestId(id).textContent);
    expect(new Set(vals).size).toBe(1);
    expect(vals[0]).not.toBe("nada");
  });

  it("cada 15 s, UN sondeo para las cuatro copias", async () => {
    render(cuatro());
    await act(vaciar);
    expect(sondeos()).toBe(1);
    await act(async () => { vi.advanceTimersByTime(15_000); await vaciar(); });
    expect(sondeos()).toBe(2);
    await act(async () => { vi.advanceTimersByTime(15_000); await vaciar(); });
    expect(sondeos()).toBe(3);
  });

  it("al desmontar la última copia deja de sondear y de escuchar; al volver a montar, sondea enseguida", async () => {
    const { unmount } = render(cuatro());
    await act(vaciar);
    unmount();
    expect(puente.baja).toHaveBeenCalledTimes(1);
    const n = sondeos();
    vi.advanceTimersByTime(60_000);
    expect(sondeos()).toBe(n);
    render(cuatro());
    await act(vaciar);
    expect(sondeos()).toBe(n + 1);
  });
});
