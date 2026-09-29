// @vitest-environment jsdom
/**
 * bucle-fondo — contrato «consumo» (2026-09-29): solo la líder sondea, nada con el dispositivo
 * oculto (y UNA puesta al día al volver), freno remoto sin peticiones, espera exponencial ante
 * fallos que se arreglan solos y parada PERMANENTE ante 400/404, con un único aviso.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const g1 = vi.hoisted(() => ({
  lider: true,
  freno: false,
  oyentes: new Set<() => void>(),
}));

vi.mock("@/lib/consumo/lider-pestana", () => ({
  esLider: () => g1.lider,
  alCambiarLider: (cb: () => void) => {
    g1.oyentes.add(cb);
    return () => g1.oyentes.delete(cb);
  },
}));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => g1.freno }));

let visibilidad: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibilidad });

function ponerVisibilidad(v: DocumentVisibilityState): void {
  visibilidad = v;
  document.dispatchEvent(new Event("visibilitychange"));
}

function cambiarLider(v: boolean): void {
  g1.lider = v;
  for (const cb of g1.oyentes) cb();
}

async function modulo() {
  return import("@/lib/network/bucle-fondo");
}

const MIN = 60_000;

beforeEach(() => {
  // Aislamiento: cada `vi.resetModules()` crea otra instancia de bucle-fondo en el MISMO proceso
  // y el BroadcastChannel real de Node las conecta entre sí (mensajes de pruebas anteriores).
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.useFakeTimers();
  vi.resetModules();
  g1.lider = true;
  g1.freno = false;
  g1.oyentes.clear();
  visibilidad = "visible";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("clasificarFallo / esperaTrasFallos / falloDe", () => {
  test("400 y 404 paran; 401/402/403/429/5xx y red se reintentan", async () => {
    const { clasificarFallo } = await modulo();
    expect(clasificarFallo(null)).toBe("ok");
    expect(clasificarFallo({ status: 400, code: "PGRST100" })).toBe("permanente");
    expect(clasificarFallo({ status: 404 })).toBe("permanente");
    expect(clasificarFallo({ code: "42703" })).toBe("permanente");
    for (const status of [401, 402, 403, 429, 500, 503]) {
      expect(clasificarFallo({ status })).toBe("reintentar");
    }
    expect(clasificarFallo({ message: "Failed to fetch" })).toBe("reintentar");
  });

  test("la espera crece de 1 a 30 min y no pasa de ahí", async () => {
    const { esperaTrasFallos } = await modulo();
    expect(esperaTrasFallos(1)).toBe(1 * MIN);
    expect(esperaTrasFallos(2)).toBe(2 * MIN);
    expect(esperaTrasFallos(5)).toBe(16 * MIN);
    expect(esperaTrasFallos(6)).toBe(30 * MIN);
    expect(esperaTrasFallos(40)).toBe(30 * MIN);
  });

  test("falloDe lee status y code de una respuesta de supabase-js", async () => {
    const { falloDe } = await modulo();
    expect(falloDe({ error: null, status: 200 })).toBeNull();
    expect(falloDe({ error: { code: "42703", message: "column x does not exist" }, status: 400 })).toEqual({
      status: 400,
      code: "42703",
      message: "column x does not exist",
    });
  });
});

describe("crearBucle", () => {
  test("solo la pestaña líder sondea; al pasar a líder arranca", async () => {
    const { crearBucle } = await modulo();
    g1.lider = false;
    const tarea = vi.fn(async () => undefined);
    const b = crearBucle({ nombre: "prueba-lider", intervaloMs: 5 * MIN, tarea });
    b.iniciar();
    await vi.advanceTimersByTimeAsync(20 * MIN);
    expect(tarea).not.toHaveBeenCalled();

    cambiarLider(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(tarea).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(tarea).toHaveBeenCalledTimes(2);

    cambiarLider(false);
    await vi.advanceTimersByTimeAsync(30 * MIN);
    expect(tarea).toHaveBeenCalledTimes(2);
    b.detener();
  });

  test("con la pestaña oculta no hay vueltas; al volver, UNA sola de puesta al día", async () => {
    const { crearBucle } = await modulo();
    const tarea = vi.fn(async () => undefined);
    const b = crearBucle({ nombre: "prueba-oculta", intervaloMs: 5 * MIN, tarea });
    b.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(tarea).toHaveBeenCalledTimes(1);

    ponerVisibilidad("hidden");
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(tarea).toHaveBeenCalledTimes(1);

    ponerVisibilidad("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(tarea).toHaveBeenCalledTimes(2); // la puesta al día
    await vi.advanceTimersByTimeAsync(4 * MIN);
    expect(tarea).toHaveBeenCalledTimes(2); // y luego, cadencia normal
    await vi.advanceTimersByTimeAsync(1 * MIN);
    expect(tarea).toHaveBeenCalledTimes(3);
    b.detener();
  });

  test("volver a ser visible ANTES de que toque no adelanta la vuelta", async () => {
    const { crearBucle } = await modulo();
    const tarea = vi.fn(async () => undefined);
    const b = crearBucle({ nombre: "prueba-pronto", intervaloMs: 10 * MIN, tarea });
    b.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    ponerVisibilidad("hidden");
    await vi.advanceTimersByTimeAsync(2 * MIN);
    ponerVisibilidad("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(tarea).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(8 * MIN);
    expect(tarea).toHaveBeenCalledTimes(2);
    b.detener();
  });

  test("un 400 para el bucle hasta recargar y avisa UNA vez nombrando la consulta", async () => {
    const { crearBucle } = await modulo();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tarea = vi.fn(async () => ({ fallo: { status: 400, code: "42703", message: "column posts.type does not exist" } }));
    const b = crearBucle({ nombre: "prueba-400", consulta: "GET posts?type=neq.comment", intervaloMs: MIN, tarea });
    b.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(120 * MIN);
    ponerVisibilidad("hidden");
    ponerVisibilidad("visible");
    await vi.advanceTimersByTimeAsync(10 * MIN);
    await b.ahora();
    expect(tarea).toHaveBeenCalledTimes(1);
    expect(b.estado().detenido).toBe(true);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0][0])).toContain("GET posts?type=neq.comment");
    b.detener();
  });

  test("fallos que se arreglan solos: espera exponencial y vuelta a la cadencia al recuperarse", async () => {
    const { crearBucle } = await modulo();
    let status = 503;
    const tarea = vi.fn(async () => (status ? { fallo: { status } } : undefined));
    const b = crearBucle({ nombre: "prueba-503", intervaloMs: 3_000, tarea });
    b.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(tarea).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MIN - 1);
    expect(tarea).toHaveBeenCalledTimes(1); // 1 min tras el 1.er fallo, no 3 s
    await vi.advanceTimersByTimeAsync(1);
    expect(tarea).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(tarea).toHaveBeenCalledTimes(3); // 2 min tras el 2.º
    status = 0;
    await vi.advanceTimersByTimeAsync(4 * MIN);
    expect(tarea).toHaveBeenCalledTimes(4); // se recupera
    await vi.advanceTimersByTimeAsync(3_000);
    expect(tarea).toHaveBeenCalledTimes(5); // cadencia normal otra vez
    expect(b.estado().fallosSeguidos).toBe(0);
    b.detener();
  });

  test("con el freno remoto activo no sale ninguna petición", async () => {
    const { crearBucle } = await modulo();
    g1.freno = true;
    const tarea = vi.fn(async () => undefined);
    const b = crearBucle({ nombre: "prueba-freno", intervaloMs: 5 * MIN, tarea });
    b.iniciar();
    await vi.advanceTimersByTimeAsync(60 * MIN);
    await b.ahora();
    expect(tarea).not.toHaveBeenCalled();
    g1.freno = false;
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(tarea).toHaveBeenCalledTimes(1);
    b.detener();
  });

  test("ahora() corre aunque la pestaña no sea líder (acción del usuario)", async () => {
    const { crearBucle } = await modulo();
    g1.lider = false;
    const tarea = vi.fn(async () => undefined);
    const b = crearBucle({ nombre: "prueba-ahora", intervaloMs: 10 * MIN, tarea });
    b.iniciar();
    await b.ahora();
    expect(tarea).toHaveBeenCalledTimes(1);
    b.detener();
  });

  test("siguienteMs cambia la cadencia de esa vuelta (adaptativa)", async () => {
    const { crearBucle } = await modulo();
    const tarea = vi.fn(async () => ({ siguienteMs: 30 * MIN }));
    const b = crearBucle({ nombre: "prueba-adaptativa", intervaloMs: 10 * MIN, tarea });
    b.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(29 * MIN);
    expect(tarea).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MIN);
    expect(tarea).toHaveBeenCalledTimes(2);
    b.detener();
  });
});
