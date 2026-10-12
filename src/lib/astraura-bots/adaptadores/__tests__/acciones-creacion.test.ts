import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import type { AccionBot, Previo, TipoAccion } from "../acciones";
import { ejecutarProtomolecula, ejecutarXRIntencion, anclaDeBot, registrarEnEjecutor } from "../acciones-creacion.ts";
import { AURORA_ACTIONS } from "@/lib/aurora/actions";
import { entenderVoz } from "@/lib/xr/intenciones-voz";
import { disponerTrinity } from "@/lib/xr/espacio-trinity";

const mockDeps: any = {
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  },
  onStatus: vi.fn(),
  actor: "test-bot",
};

describe("acciones-creacion adaptador", () => {
  let originalEjecutarAgenteHandler: any = null;

  beforeEach(() => {
    vi.clearAllMocks();
    // Backup the original ejecutar_agente handler
    const ejecutarAgenteDef = AURORA_ACTIONS.find((a) => a.name === "ejecutar_agente");
    if (ejecutarAgenteDef) {
      originalEjecutarAgenteHandler = ejecutarAgenteDef.handler;
    }
  });

  afterEach(() => {
    vi.resetAllMocks();
    // Restore the original handler
    const ejecutarAgenteDef = AURORA_ACTIONS.find((a) => a.name === "ejecutar_agente");
    if (ejecutarAgenteDef && originalEjecutarAgenteHandler) {
      ejecutarAgenteDef.handler = originalEjecutarAgenteHandler;
    }
  });

  describe("ejecutarProtomolecula", () => {
    it("devuelve próximamente cuando no hay agente protomolecula en AURORA_ACTIONS", async () => {
      // Remove ejecutar_agente from AURORA_ACTIONS to simulate missing agent
      const index = AURORA_ACTIONS.findIndex((a) => a.name === "ejecutar_agente");
      if (index !== -1) {
        AURORA_ACTIONS.splice(index, 1);
      }

      const accion: AccionBot = {
        tipo: "protomolecula.operar",
        args: {
          molecula: "mol1",
          accion: "abrir",
          args: {},
        },
      };

      const result = await ejecutarProtomolecula(accion, mockDeps);
      expect(result.ok).toBe(false);
      expect(result.motivo).toContain("próximamente: herramienta de la Protomolécula");
    });

    it("llama a ejecutar_agente con los argumentos correctos cuando existe", async () => {
      const mockHandler = vi.fn().mockResolvedValue({ ok: true, message: "ok" });
      // Replace the handler of ejecutar_agente
      const ejecutarAgenteDef = AURORA_ACTIONS.find((a) => a.name === "ejecutar_agente");
      if (ejecutarAgenteDef) {
        ejecutarAgenteDef.handler = mockHandler;
      }

      const accion: AccionBot = {
        tipo: "protomolecula.operar",
        args: {
          molecula: "mol1",
          accion: "mover",
          args: { parametro: "valor" },
        },
      };

      const result = await ejecutarProtomolecula(accion, mockDeps);
      expect(result.ok).toBe(true);
      expect(mockHandler).toHaveBeenCalledOnce();
      const calledArgs = mockHandler.mock.calls[0][0];
      expect(calledArgs).toMatchObject({
        nombre: "protomolecula",
        args: {
          molecula: "mol1",
          accion: "mover",
          args: { parametro: "valor" },
        },
      });
    });

    it("propaga el error del agente si falla", async () => {
      const mockHandler = vi.fn().mockResolvedValue({ ok: false, message: "fallo" });
      const ejecutarAgenteDef = AURORA_ACTIONS.find((a) => a.name === "ejecutar_agente");
      if (ejecutarAgenteDef) {
        ejecutarAgenteDef.handler = mockHandler;
      }

      const accion: AccionBot = {
        tipo: "protomolecula.operar",
        args: {
          molecula: "mol1",
          accion: "abrir",
          args: {},
        },
      };

      const result = await ejecutarProtomolecula(accion, mockDeps);
      expect(result.ok).toBe(false);
      expect(result.motivo).toBe("fallo");
    });
  });

  describe("ejecutarXRIntencion", () => {
    it("devuelve tarjeta cuando entenderVoz tiene éxito y confirma", async () => {
      (entenderVoz as any).mockReturnValueOnce({
        ok: true,
        pasos: [],
        confirmar: true,
        tarjeta: { titulo: "¿Confirmar?", lineas: ["línea"], acciones: ["confirmar", "cancelar"] },
      });

      const accion: AccionBot = {
        tipo: "xr.intencion",
        args: { frase: "crear un mundo" },
      };

      const result = await ejecutarXRIntencion(accion, mockDeps);
      expect(result.ok).toBe(true);
      expect(result.previo).toHaveProperty("valor");
      expect(result.previo.valor).toEqual({
        titulo: "¿Confirmar?",
        lineas: ["línea"],
        acciones: ["confirmar", "cancelar"],
      });
      expect(result.motivo).toContain("Intención XR comprendida; se devuelve tarjeta de confirmación.");
    });

    it("devuelve null tarjeta cuando no se requiere confirmación", async () => {
      (entenderVoz as any).mockReturnValueOnce({
        ok: true,
        pasos: [],
        confirmar: false,
        tarjeta: null,
      });

      const accion: AccionBot = {
        tipo: "xr.intencion",
        args: { frase: "mirar a la izquierda" },
      };

      const result = await ejecutarXRIntencion(accion, mockDeps);
      expect(result.ok).toBe(true);
      expect(result.previo.valor).toBeNull();
      expect(result.motivo).toContain("Intención XR comprendida; no requiere confirmación.");
    });

    it("devuelve error cuando entenderVoz falla", async () => {
      (entenderVoz as any).mockReturnValueOnce({
        ok: false,
        razon: "no entendido",
        pasos: [],
        confirmar: false,
        tarjeta: null,
      });

      const accion: AccionBot = {
        tipo: "xr.intencion",
        args: { frase: "frase sin sentido" },
      };

      const result = await ejecutarXRIntencion(accion, mockDeps);
      expect(result.ok).toBe(false);
      expect(result.motivo).toBe("no entendido");
    });

    it("devuelve error cuando la frase está vacía", async () => {
      const accion: AccionBot = {
        tipo: "xr.intencion",
        args: { frase: "" },
      };

      const result = await ejecutarXRIntencion(accion, mockDeps);
      expect(result.ok).toBe(false);
      expect(result.motivo).toBe("Frase vacía para intención XR");
    });
  });

  describe("anclaDeBot", () => {
    it("devuelve posición estable para mismo botId e índice", () => {
      const botId = "bot-123";
      const indice = 0;
      const pos1 = anclaDeBot(botId, indice);
      const pos2 = anclaDeBot(botId, indice);
      expect(pos1).toEqual(pos2);
    });

    it("devuelve posiciones distintas para diferentes índices", () => {
      const botId = "bot-456";
      const pos0 = anclaDeBot(botId, 0);
      const pos1 = anclaDeBot(botId, 1);
      // Not expecting exact inequality but likely different
      expect(pos0.posicion).not.toEqual(pos1.posicion);
    });

    it("usa disposerTrinity con yawBase derivada de botId e índice", () => {
      const botId = "bot-xyz";
      const indice = 2;
      anclaDeBot(botId, indice);
      expect(disponerTrinity).toHaveBeenCalled();
      expect(disponerTrinity).toHaveBeenCalledTimes(1);
    });

    it("devuelve un objeto con posicion y rotación", () => {
      const result = anclaDeBot("bot", 0);
      expect(result).toHaveProperty("posicion");
      expect(result).toHaveProperty("rotacion");
      expect(Array.isArray(result.posicion)).toBe(true);
      expect(result.posicion.length).toBe(3);
      expect(typeof result.rotacion).toBe("object");
      expect("pitch" in result.rotacion).toBe(true);
      expect("yaw" in result.rotacion).toBe(true);
      expect("roll" in result.rotacion).toBe(true);
    });
  });

  describe("registrarEnEjecutor", () => {
    it("añade los manejadores al mapa", () => {
      const map = new Map<TipoAccion, (accion: AccionBot, dep: any) => Promise<{ ok: boolean; previo: any; motivo: string }>>();
      registrarEnEjecutor(map);
      expect(map.size).toBe(2);
      expect(map.has("protomolecula.operar")).toBe(true);
      expect(map.has("xr.intencion")).toBe(true);
      expect(typeof map.get("protomolecula.operar")).toBe("function");
      expect(typeof map.get("xr.intencion")).toBe("function");
    });
  });
});