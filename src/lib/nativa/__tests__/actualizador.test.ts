import { describe, expect, it, vi } from "vitest";
import {
  checkUpdate,
  crearEstadoInicial,
  descargarEInstalar,
  escucharCambiosActualizacion,
  estadoActualizacion,
  obtenerEstadoActualizacion,
  reiniciarParaActualizar,
  EVENTO_ACTUALIZACION,
  type EstadoActualizacion,
  type TauriMock,
} from "../actualizador";

const crearMockTauri = (respuestas: Record<string, unknown> = {}): TauriMock => {
  const llamadas: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
  const eventos: Map<string, (e: { payload: unknown }) => void> = new Map();

  return {
    core: {
      invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
        llamadas.push({ cmd, args });
        const r = respuestas[cmd];
        if (r instanceof Error) throw r;
        if (typeof r === "string" && r.startsWith("FALLA:")) throw r.slice(6);
        return r;
      }),
    },
    event: {
      listen: vi.fn(async (ev: string, cb: (e: { payload: unknown }) => void) => {
        eventos.set(ev, cb);
        return () => eventos.delete(ev);
      }),
    },
    _llamadas: llamadas as unknown as TauriMock["_llamadas"],
    _eventos: eventos as unknown as TauriMock["_eventos"],
  };
};

describe("actualizador", () => {
  describe("checkUpdate", () => {
    it("devuelve error cuando Tauri no está disponible", async () => {
      const r = await checkUpdate(null);
      expect(r.ok).toBe(false);
      expect(r.estado.fase).toBe("error");
      expect(r.error).toBe("Solo en la app nativa de StarSeed OS.");
    });

    it("devuelve error cuando invoke no existe", async () => {
      const r = await checkUpdate({ core: {} });
      expect(r.ok).toBe(false);
      expect(r.estado.fase).toBe("error");
    });

    it("retorna al-día cuando no hay actualización", async () => {
      const mock = crearMockTauri({ check_update: { ok: true, version: "0.4.0" } });
      const r = await checkUpdate(mock);
      expect(r.ok).toBe(true);
      expect(r.estado.fase).toBe("descargando");
    });

    it("maneja error del comando", async () => {
      const mock = crearMockTauri({ check_update: new Error("Red no disponible") });
      const r = await checkUpdate(mock);
      expect(r.ok).toBe(false);
      expect(r.estado.fase).toBe("error");
      expect(r.error).toContain("Red no disponible");
    });
  });

  describe("descargarEInstalar", () => {
    it("devuelve error cuando Tauri no está disponible", async () => {
      const r = await descargarEInstalar(null);
      expect(r.ok).toBe(false);
      expect(r.estado.fase).toBe("error");
      expect(r.error).toBe("Solo en la app nativa de StarSeed OS.");
    });

    it("retorna estado lista cuando la instalación se completa", async () => {
      const mock = crearMockTauri({ check_update: { ok: true, version: "0.4.0" } });
      const r = await descargarEInstalar(mock);
      expect(r.ok).toBe(true);
      expect(r.estado.fase).toBe("lista");
      expect(r.estado.pendiente_reinicio).toBe(true);
    });
  });

  describe("reiniciarParaActualizar", () => {
    it("devuelve false cuando Tauri no está disponible", () => {
      expect(reiniciarParaActualizar(null)).toBe(false);
    });

    it("llama al comando restart_app", async () => {
      const mock = crearMockTauri();
      const result = reiniciarParaActualizar(mock);
      expect(result).toBe(true);
    });
  });

  describe("obtenerEstadoActualizacion", () => {
    it("devuelve estado por defecto cuando Tauri no está disponible", async () => {
      const estado = await obtenerEstadoActualizacion(null);
      expect(estado.fase).toBe("error");
      expect(estado.pendiente_reinicio).toBe(false);
    });

    it("retorna el estado del comando", async () => {
      const mockEstado: EstadoActualizacion = {
        fase: "descargando",
        version: "0.4.0",
        descargado: 1024,
        total: 4096,
        progreso: 25,
        pendiente_reinicio: false,
        ok: false,
      };
      const mock = crearMockTauri({ estado_actualizacion: mockEstado });
      const estado = await obtenerEstadoActualizacion(mock);
      expect(estado.fase).toBe("descargando");
      expect(estado.version).toBe("0.4.0");
      expect(estado.progreso).toBe(25);
    });
  });

  describe("escucharCambiosActualizacion", () => {
    it("retorna funcion de desuscripcion vacia cuando Tauri no está disponible", async () => {
      const unsubscribe = await escucharCambiosActualizacion(null, () => {});
      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("llama al callback cuando llega un evento", async () => {
      const mock = crearMockTauri();
      const callback = vi.fn();
      const unsubscribe = await escucharCambiosActualizacion(mock, callback);

      const mockEstado: EstadoActualizacion = {
        fase: "instalando",
        version: "0.4.0",
        pendiente_reinicio: false,
        ok: false,
      };
      const eventos = (mock as unknown as { _eventos: Map<string, (e: { payload: unknown }) => void> })._eventos;
      eventos.get(EVENTO_ACTUALIZACION)?.({ payload: mockEstado });

      expect(callback).toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe("estadoActualizacion", () => {
    it("calcula progreso correctamente", () => {
      const estado = estadoActualizacion({
        fase: "descargando",
        version: "0.4.0",
        descargado: 768,
        total: 1024,
        pendiente_reinicio: false,
        ok: false,
      });
      expect(estado.progreso).toBe(75);
    });

    it("no calcula progreso cuando no hay total", () => {
      const estado = estadoActualizacion({
        fase: "descargando",
        pendiente_reinicio: false,
        ok: false,
      });
      expect(estado.progreso).toBeUndefined();
    });

    it("marca ok cuando fase es al-dia", () => {
      const estado = estadoActualizacion({
        fase: "al-dia",
        pendiente_reinicio: false,
        ok: false,
      });
      expect(estado.ok).toBe(true);
    });

    it("marca ok cuando fase es lista", () => {
      const estado = estadoActualizacion({
        fase: "lista",
        pendiente_reinicio: false,
        ok: false,
      });
      expect(estado.ok).toBe(true);
    });
  });

  describe("crearEstadoInicial", () => {
    it("crea estado inicial valido", () => {
      const estado = crearEstadoInicial();
      expect(estado.fase).toBe("buscando");
      expect(estado.pendiente_reinicio).toBe(false);
      expect(estado.ok).toBe(false);
    });
  });
});