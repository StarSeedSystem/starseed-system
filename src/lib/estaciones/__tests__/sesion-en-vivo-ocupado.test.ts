// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { crearLlaves, idDeLlave } from "../cripto-estacion";
import { SesionEnVivo, type CanalEstacion } from "../sesion-en-vivo";
import type { FichaSesion } from "../transmision-parametrica";

const mockSoltar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actualizaciones/momento-navegador", () => ({
  marcarOcupado: vi.fn().mockReturnValue(mockSoltar),
}));

let T = 1_700_000_000_000;

function canalAbierto(): CanalEstacion {
  const alAbrir = new Set<() => void>();
  let abierto = false;
  return {
    tipo: "internet",
    etiqueta: "Internet (Supabase Realtime)",
    enviar: () => undefined,
    alRecibir: () => () => undefined,
    abierto: () => abierto,
    oyentes: () => 0,
    alAbrir(cb) {
      alAbrir.add(cb);
      return () => alAbrir.delete(cb);
    },
    abrir() {
      abierto = true;
      for (const cb of Array.from(alAbrir)) cb();
    },
    cerrar: () => undefined,
  };
}

async function ficha(): Promise<FichaSesion> {
  const llaves = await crearLlaves();
  return {
    v: 1,
    id: await idDeLlave(llaves.publica),
    fuente: "omnifrecuencias",
    titulo: "Prueba de marca de directo",
    enlace: "/estaciones/vivo/test-id",
    pk: llaves.publica,
    privada: false,
    params: { tipo: "omnifrecuencias", entonacion: { volumen: 0.5, osciladores: [{ id: "a", f: 432, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0 }] } },
    creada: T,
  };
}

const abiertas: SesionEnVivo[] = [];
afterEach(() => {
  for (const s of abiertas.splice(0)) s.cerrar();
  mockSoltar.mockClear();
  vi.clearAllMocks();
});

const sinTiempo = {
  poner: (() => 0) as unknown as typeof setTimeout,
  quitar: (() => undefined) as unknown as typeof clearTimeout,
};

describe("SesionEnVivo marca de directo (§4 del contrato)", () => {
  it("al arrancar con llave marca directo y libera al cerrar", async () => {
    const f = await ficha();
    const llaves = await crearLlaves();
    const canal = canalAbierto();

    const { marcarOcupado } = await import("../../actualizaciones/momento-navegador");
    vi.mocked(marcarOcupado).mockClear();

    const s = new SesionEnVivo({ ...sinTiempo, ficha: f, llave: llaves.privada, canales: [canal] });
    canal.abrir();
    s.arrancar();

    expect(vi.mocked(marcarOcupado)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(marcarOcupado)).toHaveBeenCalledWith(f.id, "directo");

    s.cerrar();

    expect(mockSoltar).toHaveBeenCalledTimes(1);
  });

  it("un oyente sin llave no marca nada", async () => {
    const f = await ficha();
    const canal = canalAbierto();

    const { marcarOcupado } = await import("../../actualizaciones/momento-navegador");
    vi.mocked(marcarOcupado).mockClear();

    const s = new SesionEnVivo({ ...sinTiempo, ficha: f, canales: [canal] });
    canal.abrir();
    s.arrancar();

    expect(vi.mocked(marcarOcupado)).not.toHaveBeenCalled();
    expect(s.foto().control).toBe(false);
  });

  it("tomarControl sin llave previo marca directo si está arrancada", async () => {
    const f = await ficha();
    const llavesConControl = await crearLlaves();
    const canal = canalAbierto();

    const { marcarOcupado } = await import("../../actualizaciones/momento-navegador");
    vi.mocked(marcarOcupado).mockClear();
    mockSoltar.mockClear();

    const s = new SesionEnVivo({ ...sinTiempo, ficha: f, canales: [canal] });
    canal.abrir();
    s.arrancar();

    expect(s.foto().control).toBe(false);
    expect(vi.mocked(marcarOcupado)).not.toHaveBeenCalled();

    s.tomarControl(llavesConControl.privada);

    expect(vi.mocked(marcarOcupado)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(marcarOcupado)).toHaveBeenCalledWith(f.id, "directo");
    expect(s.foto().control).toBe(true);

    s.cerrar();

    expect(mockSoltar).toHaveBeenCalledTimes(1);
  });

  it("tomarControl con llave previa no vuelve a marcar directo", async () => {
    const f = await ficha();
    const llaves = await crearLlaves();
    const canal = canalAbierto();

    const { marcarOcupado } = await import("../../actualizaciones/momento-navegador");
    vi.mocked(marcarOcupado).mockClear();
    mockSoltar.mockClear();

    const s = new SesionEnVivo({ ...sinTiempo, ficha: f, llave: llaves.privada, canales: [canal] });
    canal.abrir();
    s.arrancar();

    expect(vi.mocked(marcarOcupado)).toHaveBeenCalledTimes(1);

    const otrasLlaves = await crearLlaves();
    s.tomarControl(otrasLlaves.privada);

    // No vuelve a marcar porque ya tenía llave
    expect(vi.mocked(marcarOcupado)).toHaveBeenCalledTimes(1);
  });
});