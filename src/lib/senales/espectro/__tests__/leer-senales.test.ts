/**
 * Tests de leerSenalesPublicadas (MAP1116B).
 */

import { describe, it, expect, vi } from "vitest";
import { leerSenalesPublicadas, type ResultadoLectura, type DepsLectura, MOTIVO_SIN_TABLA } from "../leer-senales";
import type { SenalEspectro } from "../modelo";

const UID_PROPIO = "mi-uid-123";
const UID_AJENO = "otro-uid-456";

function crearClienteMock(overrides: {
  data?: unknown[];
  error?: { code: string; message: string } | null;
  applyLimit?: boolean;
  applyOrder?: boolean;
} = {}) {
  let datos = overrides.data ?? [];
  if (overrides.applyOrder) {
    datos = [...datos].sort((a: any, b: any) => (b.medido_en ?? 0) - (a.medido_en ?? 0));
  }
  if (overrides.applyLimit) {
    datos = datos.slice(0, 500);
  }
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: datos, error: overrides.error ?? null })),
        })),
      })),
    })),
  };
}

function senalValida(overrides: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id: "s1",
    medio: "wifi",
    banda: "2.4 GHz",
    frecuenciaKhz: 2437000,
    anchoKhz: 20000,
    fuerzaDbm: -45,
    calidad: 0.8,
    origen: "medida",
    capa: "publica",
    fuente: "publicada por su dueño",
    medidoEn: 1_700_000_000_000,
    zona: "A1",
    compatibles: [],
    ...overrides,
  };
}

function filaBd(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    medio: "wifi",
    banda: "2.4 GHz",
    frecuencia_khz: 2437000,
    ancho_khz: 20000,
    fuerza_dbm: -45,
    calidad: 0.8,
    origen: "medida",
    capa: "publica",
    fuente: "escaneo del dueño",
    medido_en: 1_700_000_000_000,
    zona: "A1",
    vinculo_tipo: "antena",
    vinculo_id: UID_AJENO,
    compatibles: [],
    ...overrides,
  };
}

describe("leerSenalesPublicadas", () => {
  it("devuelve estado ok con señales normalizadas y capa/fuente correctas", async () => {
    const cliente = crearClienteMock({ data: [filaBd()] });
    const deps: DepsLectura = { cliente: cliente as any, uid: UID_PROPIO };
    const res = await leerSenalesPublicadas(deps);

    expect(res.estado).toBe("ok");
    expect(res.senales.length).toBe(1);
    expect(res.senales[0].capa).toBe("publica");
    expect(res.senales[0].fuente).toBe("publicada por su dueño");
    expect(res.senales[0].vinculo?.id).toBe(UID_AJENO);
  });

  it("excluye la señal cuyo vinculo.id coincide con el uid propio", async () => {
    const cliente = crearClienteMock({ data: [filaBd({ vinculo_id: UID_PROPIO })] });
    const deps: DepsLectura = { cliente: cliente as any, uid: UID_PROPIO };
    const res = await leerSenalesPublicadas(deps);

    expect(res.estado).toBe("ok");
    expect(res.senales.length).toBe(0);
  });

  it("mantiene señales de otros uids aunque el propio uid aparezca en otra fila", async () => {
    const cliente = crearClienteMock({
      data: [
        filaBd({ id: "s1", vinculo_id: UID_PROPIO }),
        filaBd({ id: "s2", vinculo_id: UID_AJENO }),
      ],
    });
    const deps: DepsLectura = { cliente: cliente as any, uid: UID_PROPIO };
    const res = await leerSenalesPublicadas(deps);

    expect(res.estado).toBe("ok");
    expect(res.senales.length).toBe(1);
    expect(res.senales[0].id).toBe("s2");
  });

  it("filtra filas inválidas (normalizarSenal devuelve null) y no rompe", async () => {
    const cliente = crearClienteMock({
      data: [
        filaBd({ id: "valida", vinculo_id: UID_AJENO }),
        filaBd({ id: "invalida-frecuencia", frecuencia_khz: 0, vinculo_id: UID_AJENO }),
        filaBd({ id: "invalida-zona", zona: "ABCDEF", vinculo_id: UID_AJENO }),
      ],
    });
    const deps: DepsLectura = { cliente: cliente as any, uid: UID_PROPIO };
    const res = await leerSenalesPublicadas(deps);

    expect(res.estado).toBe("ok");
    expect(res.senales.length).toBe(1);
    expect(res.senales[0].id).toBe("valida");
  });

  it("devuelve estado sin-tabla con el motivo correcto cuando la tabla no existe", async () => {
    const cliente = crearClienteMock({
      error: { code: "PGRST205", message: 'relation "os_senales_publicas" does not exist' },
    });
    const deps: DepsLectura = { cliente: cliente as any, uid: UID_PROPIO };
    const res = await leerSenalesPublicadas(deps);

    expect(res.estado).toBe("sin-tabla");
    expect(res.motivo).toBe(MOTIVO_SIN_TABLA);
    expect(res.senales).toEqual([]);
  });

  it("devuelve estado sin-tabla también con error genérico de relación inexistente", async () => {
    const cliente = crearClienteMock({
      error: { code: "42P01", message: 'relation "public.os_senales_publicas" does not exist' },
    });
    const deps: DepsLectura = { cliente: cliente as any, uid: UID_PROPIO };
    const res = await leerSenalesPublicadas(deps);

    expect(res.estado).toBe("sin-tabla");
    expect(res.motivo).toBe(MOTIVO_SIN_TABLA);
  });

  it("devuelve estado sin-sesion cuando no hay cliente", async () => {
    const deps: DepsLectura = { cliente: null as any, uid: UID_PROPIO };
    const res = await leerSenalesPublicadas(deps);

    expect(res.estado).toBe("sin-sesion");
    expect(res.motivo).toContain("no hay cliente de Supabase");
    expect(res.senales).toEqual([]);
  });

  it("devuelve estado error con el mensaje de error para otros códigos", async () => {
    const cliente = crearClienteMock({
      error: { code: "PGRST116", message: "permission denied" },
    });
    const deps: DepsLectura = { cliente: cliente as any, uid: UID_PROPIO };
    const res = await leerSenalesPublicadas(deps);

    expect(res.estado).toBe("error");
    expect(res.motivo).toBe("permission denied");
    expect(res.senales).toEqual([]);
  });

  it("respeta el límite de 500 filas (pasa limit al query)", async () => {
    const rows = Array.from({ length: 600 }, (_, i) => filaBd({ id: `s${i}`, vinculo_id: `uid-${i}` }));
    const cliente = crearClienteMock({ data: rows, applyLimit: true });
    const deps: DepsLectura = { cliente: cliente as any, uid: UID_PROPIO };
    const res = await leerSenalesPublicadas(deps);

    expect(res.estado).toBe("ok");
    expect(res.senales.length).toBeLessThanOrEqual(500);
  });

  it("ordena por medido_en descendente (más recientes primero)", async () => {
    const ahora = 1_700_000_000_000;
    const cliente = crearClienteMock({
      data: [
        filaBd({ id: "antigua", medido_en: ahora - 100_000, vinculo_id: UID_AJENO }),
        filaBd({ id: "reciente", medido_en: ahora - 10_000, vinculo_id: UID_AJENO }),
      ],
      applyOrder: true,
    });
    const deps: DepsLectura = { cliente: cliente as any, uid: UID_PROPIO };
    const res = await leerSenalesPublicadas(deps);

    expect(res.estado).toBe("ok");
    expect(res.senales.length).toBe(2);
    expect(res.senales[0].id).toBe("reciente");
    expect(res.senales[1].id).toBe("antigua");
  });

  it("devuelve array vacío y estado ok cuando no hay datos", async () => {
    const cliente = crearClienteMock({ data: [] });
    const deps: DepsLectura = { cliente: cliente as any, uid: UID_PROPIO };
    const res = await leerSenalesPublicadas(deps);

    expect(res.estado).toBe("ok");
    expect(res.senales).toEqual([]);
  });

  it("no duplica la propia señal si llega por camino local (vinculo.id === uid)", async () => {
    const cliente = crearClienteMock({
      data: [
        filaBd({ id: "s1", vinculo_id: UID_PROPIO }),
        filaBd({ id: "s2", vinculo_id: UID_PROPIO }),
        filaBd({ id: "s3", vinculo_id: UID_AJENO }),
      ],
    });
    const deps: DepsLectura = { cliente: cliente as any, uid: UID_PROPIO };
    const res = await leerSenalesPublicadas(deps);

    expect(res.estado).toBe("ok");
    expect(res.senales.length).toBe(1);
    expect(res.senales[0].id).toBe("s3");
  });
});