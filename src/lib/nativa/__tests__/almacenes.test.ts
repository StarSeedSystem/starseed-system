/*
 * almacenes.test.ts — pruebas del cliente TypeScript para almacenes_listar (ALC1125B).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Almacen, AlmacenesListarResultado } from "@/lib/nativa/tipos";
import { sanearAlmacenesListar, tauriGlobal, listarAlmacenes } from "@/lib/nativa/almacenes";

const almacenValido: Almacen = {
  etiqueta: "Disco USB",
  uuid: "123e4567e89b12d3a456426614174000",
  serie: "ABC123DEF456",
  sistema_archivos: "exfat",
  extraible: true,
  total_bytes: 100000000000,
  libre_bytes: 50000000000,
  punto_montaje: "/media/usuario/USB",
  es_disco_sistema: false,
  tipo: "extraible",
  plataforma: "linux",
  motivo: null,
};

const resultadoValido: AlmacenesListarResultado = {
  almacenes: [almacenValido],
  plataforma: "linux",
  motivo: null,
};

describe("sanearAlmacenesListar", () => {
  it("devuelve null si la entrada no es un objeto", () => {
    expect(sanearAlmacenesListar(null)).toBeNull();
    expect(sanearAlmacenesListar("texto")).toBeNull();
    expect(sanearAlmacenesListar(123)).toBeNull();
  });

  it("devuelve null si almacenes no es un array", () => {
    expect(sanearAlmacenesListar({ almacenes: "no-array", plataforma: "linux", motivo: null })).toBeNull();
    expect(sanearAlmacenesListar({ almacenes: null, plataforma: "linux", motivo: null })).toBeNull();
  });

  it("parsea correctamente un almacén válido", () => {
    const entrada = {
      almacenes: [
        {
          etiqueta: "Disco USB",
          uuid: "123e4567e89b12d3a456426614174000",
          serie: "ABC123DEF456",
          sistema_archivos: "exfat",
          extraible: true,
          total_bytes: 100000000000,
          libre_bytes: 50000000000,
          punto_montaje: "/media/usuario/USB",
          es_disco_sistema: false,
          tipo: "extraible",
          plataforma: "linux",
          motivo: null,
        },
      ],
      plataforma: "linux",
      motivo: null,
    };
    const r = sanearAlmacenesListar(entrada);
    expect(r).not.toBeNull();
    expect(r?.almacenes.length).toBe(1);
    expect(r?.almacenes[0].etiqueta).toBe("Disco USB");
    expect(r?.almacenes[0].uuid).toBe("123e4567e89b12d3a456426614174000");
    expect(r?.almacenes[0].sistema_archivos).toBe("exfat");
    expect(r?.almacenes[0].extraible).toBe(true);
    expect(r?.plataforma).toBe("linux");
  });

  it("acepta sistema_archivos como objeto { desconocido: string }", () => {
    const entrada = {
      almacenes: [
        {
          etiqueta: "Disco raro",
          uuid: "aaa",
          serie: "bbb",
          sistema_archivos: { desconocido: "zfs" },
          extraible: false,
          total_bytes: 1000,
          libre_bytes: 500,
          punto_montaje: "/mnt/raro",
          es_disco_sistema: false,
          tipo: "interno",
          plataforma: "linux",
          motivo: null,
        },
      ],
      plataforma: "linux",
      motivo: null,
    };
    const r = sanearAlmacenesListar(entrada);
    expect(r).not.toBeNull();
    expect(r?.almacenes[0].sistema_archivos).toEqual({ desconocido: "zfs" });
  });

  it("ignora almacenes no-objeto y null, pero acepta objetos con campos parciales", () => {
    const entrada = {
      almacenes: [almacenValido, "no-objeto", null, { etiqueta: "incompleto" }],
      plataforma: "linux",
      motivo: null,
    };
    const r = sanearAlmacenesListar(entrada);
    expect(r).not.toBeNull();
    // El objeto { etiqueta: "incompleto" } se acepta con valores por defecto
    expect(r?.almacenes.length).toBe(2);
    expect(r?.almacenes[0].etiqueta).toBe("Disco USB");
    expect(r?.almacenes[1].etiqueta).toBe("incompleto");
  });

  it("normaliza campos faltantes a valores por defecto", () => {
    const entrada = {
      almacenes: [
        {
          // faltan campos opcionales
          uuid: "abc",
        },
      ],
      plataforma: "linux",
      motivo: null,
    };
    const r = sanearAlmacenesListar(entrada);
    expect(r).not.toBeNull();
    expect(r?.almacenes[0].etiqueta).toBe("");
    expect(r?.almacenes[0].uuid).toBe("abc");
    expect(r?.almacenes[0].total_bytes).toBe(0);
    expect(r?.almacenes[0].extraible).toBe(false);
  });
});

describe("tauriGlobal", () => {
  const originalWindow = global.window;

  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.stubGlobal("window", originalWindow);
  });

  it("devuelve null si window no existe", () => {
    vi.stubGlobal("window", undefined);
    expect(tauriGlobal()).toBeNull();
  });

  it("devuelve null si __TAURI__ no existe", () => {
    vi.stubGlobal("window", {});
    expect(tauriGlobal()).toBeNull();
  });

  it("devuelve __TAURI__ si existe", () => {
    const tauri = { core: { invoke: vi.fn() } };
    vi.stubGlobal("window", { __TAURI__: tauri });
    expect(tauriGlobal()).toBe(tauri);
  });
});

describe("listarAlmacenes", () => {
  const mockInvoke = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("window", {
      __TAURI__: { core: { invoke: mockInvoke } },
    });
  });

  afterEach(() => {
    vi.stubGlobal("window", global.window);
  });

  it("devuelve error si no hay invoke", async () => {
    vi.stubGlobal("window", { __TAURI__: { core: {} } });
    const r = await listarAlmacenes();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("Solo en la app nativa");
  });

  it("devuelve resultado exitoso si invoke responde bien", async () => {
    mockInvoke.mockResolvedValue({
      almacenes: [
        {
          etiqueta: "Disco USB",
          uuid: "123e4567e89b12d3a456426614174000",
          serie: "ABC123DEF456",
          sistema_archivos: "exfat",
          extraible: true,
          total_bytes: 100000000000,
          libre_bytes: 50000000000,
          punto_montaje: "/media/usuario/USB",
          es_disco_sistema: false,
          tipo: "extraible",
          plataforma: "linux",
          motivo: null,
        },
      ],
      plataforma: "linux",
      motivo: null,
    });
    const r = await listarAlmacenes();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.almacenes.length).toBe(1);
      expect(r.valor.almacenes[0].etiqueta).toBe("Disco USB");
    }
  });

  it("devuelve error si invoke lanza", async () => {
    mockInvoke.mockRejectedValue(new Error("Comando no permitido"));
    const r = await listarAlmacenes();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("Comando no permitido");
  });

  it("devuelve error si la respuesta no es válida", async () => {
    mockInvoke.mockResolvedValue({ almacenes: "no-array" });
    const r = await listarAlmacenes();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("no válida");
  });
});