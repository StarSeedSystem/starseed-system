import { describe, expect, it, vi, beforeEach } from "vitest";
import { ejecutarAccion } from "../adaptadores/ejecutor-acciones";
import { validarAccion, type AccionBot } from "../acciones";
import type { DepsEjecutor } from "../adaptadores/ejecutor-acciones";
import { Mock } from "vitest";

// Mock the dependencies
vi.mock("../adaptadores/computadora-cliente");
vi.mock("../adaptadores/acciones-creacion");
vi.mock("@/lib/aurora/actions");

const { ejecutar } = await import("../adaptadores/computadora-cliente");
const { registrarEnEjecutor } = await import("../adaptadores/acciones-creacion");
const { AURORA_ACTIONS } = await import("@/lib/aurora/actions");

const makeDeps = (overrides: Partial<DepsEjecutor> = {}): DepsEjecutor => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn() },
  onStatus: vi.fn(),
  actor: "bot:test",
  apariencia: undefined,
  ...overrides,
});

const valida = (bruto: unknown): AccionBot => {
  const v = validarAccion(bruto);
  if (!v.accion) throw new Error(v.problemas.join(" "));
  return v.accion;
};

describe("ejecutorAccion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debe ejecutar computadora.ejecutar llamando al cliente de la computadora", async () => {
    const accion = valida({ tipo: "computadora.ejecutar", args: { orden: "ls -la", motivo: "Prueba" } });
    const deps = makeDeps();
    const mockResultado = { ok: true, datos: { salida: "hola mundo", codigo: 0 } };
    (ejecutar as Mock).mockResolvedValue(mockResultado);

    const resultado = await ejecutarAccion(accion, deps);

    expect(ejecutar as Mock).toHaveBeenCalledTimes(1);
    expect(ejecutar as Mock).toHaveBeenCalledWith("bot:test", "ls -la", {});
    expect(resultado).toEqual({ ok: true, previo: {}, motivo: "Orden ejecutada: hola mundo" });
  });

  it("debe manejar el error de la computadora", async () => {
    const accion = valida({ tipo: "computadora.ejecutar", args: { orden: "ls -la" } });
    const deps = makeDeps();
    const mockResultado = { ok: false, motivo: "Computadora no disponible" };
    (ejecutar as Mock).mockResolvedValue(mockResultado);

    const resultado = await ejecutarAccion(accion, deps);

    expect(resultado).toEqual({ ok: false, previo: {}, motivo: "Computadora no disponible" });
  });

  it("debe devolver «próximamente» para una acción desconocida", async () => {
    const accion = valida({ tipo: "pagina.editar", args: { pagina: "pagina-1", cambios: {} } });
    const deps = makeDeps();

    const resultado = await ejecutarAccion(accion, deps);

    expect(resultado).toEqual({ ok: false, previo: {}, motivo: "próximamente: editar páginas llega con BOT1011J1." });
  });
});