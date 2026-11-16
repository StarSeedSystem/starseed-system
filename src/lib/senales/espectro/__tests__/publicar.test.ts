/**
 * Tests para publicar señales.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { publicarSenales, FilaPublicable, reiniciarEstadoPublicar } from "../publicar";

describe("publicarSenales", () => {
  beforeEach(() => {
    reiniciarEstadoPublicar();
  });

  it("debe rechazar si no hay uid", async () => {
    const res = await publicarSenales({ uid: null, filas: [], ahora: new Date() });
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("Sin sesión");
  });

  it("debe realizar upsert con el uid correcto", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    const ahora = new Date(Date.now() + 60000);

    const res = await publicarSenales({
      cliente: mockSupabase as any,
      uid: "user123",
      filas: [],
      ahora,
    });

    expect(res.ok).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledWith("os_senales_publicas");
  });

  it("inyecta owner_id con el uid correcto", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    const filas: FilaPublicable[] = [{
      device_id: "dev1",
      capa: "publica",
      comunidad: null,
      medio: "lora",
      banda: "868",
      frecuencia_khz: 868000,
      ancho_khz: 125,
      fuerza_dbm: -100,
      calidad: 1,
      origen: "medida",
      zona: "A",
      ficha: null,
      medido_en: new Date().toISOString(),
    }];

    const ahora = new Date(Date.now() + 60000);

    const res = await publicarSenales({
      cliente: mockSupabase as any,
      uid: "user123",
      filas,
      ahora,
    });

    expect(res.ok).toBe(true);
    const callArgs = mockSupabase.upsert.mock.calls[0][0];
    expect(callArgs[0].owner_id).toBe("user123");
  });

  it("tabla ausente devuelve motivo y no reintenta antes de 5 min", async () => {
    const errorSinTabla = { code: "42P01", message: "relation does not exist" };
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: errorSinTabla }),
    };

    const ahora = new Date(Date.now() + 60000);

    const res = await publicarSenales({
      cliente: mockSupabase as any,
      uid: "user123",
      filas: [],
      ahora,
    });

    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("las señales públicas aún no están activadas en este servidor");
    expect(res.publicadas).toBe(0);
  });

  it("apagar un medio borra solo sus filas por device_id", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };

    const ahora = new Date(Date.now() + 60000);

    const res = await publicarSenales({
      cliente: mockSupabase as any,
      uid: "user123",
      filas: [],
      ahora,
      deviceIdsAEliminar: ["dev1", "dev2"],
    });

    expect(res.ok).toBe(true);
    expect(mockSupabase.delete).toHaveBeenCalledTimes(2);
    expect(mockSupabase.eq).toHaveBeenCalledTimes(4);
  });

  it("no más de una tanda en 45 s", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    const ahora = new Date(Date.now() + 30000);

    await publicarSenales({
      cliente: mockSupabase as any,
      uid: "user123",
      filas: [],
      ahora,
    });

    const segunda = new Date(Date.now() + 40000);
    const res = await publicarSenales({
      cliente: mockSupabase as any,
      uid: "user123",
      filas: [],
      ahora: segunda,
    });

    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("Demasiado pronto");
  });
});