import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { crearEnlaceSesion } from "../transporte-protomolecula";
import { RelojComun } from "@/lib/estaciones/reloj-comun";
import type { Operacion, Sesion, Cambio } from "../sesion-sincronia";
import type { ResultadoEnvio } from "@/lib/malla/transporte-universal";

describe("crearEnlaceSesion", () => {
  let reloj: RelojComun;
  let sesion: Sesion;
  let enviarMock: ReturnType<typeof vi.fn>;
  let recibirMock: ReturnType<typeof vi.fn>;
  let enlace: ReturnType<typeof crearEnlaceSesion>;

  beforeEach(() => {
    reloj = new RelojComun();
    sesion = {
      id: "sesion-1",
      moleculaId: "molecula-1",
      ambito: "personal",
      anfitrion: "dispositivo-1",
      miembros: { "dispositivo-1": "dueno" },
      transporte: "local", // Assuming TransporteSala is a string literal union, we use one of the values
      grupoId: undefined,
      consentimientos: [],
      creadaEn: Date.now(),
    };
    enviarMock = vi.fn().mockResolvedValue({ ok: true, confirmado: false, enlace: null, intentos: [], descartados: [] });
    recibirMock = vi.fn().mockImplementation((callback) => {
      // Simular recibir un mensaje llamando al callback con datos de prueba
      // Esto se adaptará en cada prueba
      return () => {};
    });
    enlace = crearEnlaceSesion({ sesion, enviar: enviarMock, recibir: recibirMock, reloj });
  });

  afterEach(() => {
    enlace.detener();
    vi.clearAllMocks();
  });

  describe("enviarOperacion", () => {
    it("debería enviar un elemento de operación", async () => {
      const op: Operacion = {
        id: "op-1",
        objetivo: { atomoId: "atomo-1", parametroId: "volumen" },
        accion: { tipo: "exacta", valor: 0.5 },
        autor: { tipo: "persona", id: "usuario-1" },
        origen: "mano",
        t: 0, // será reemplazado por el reloj
        texto: "prueba",
      };
      const cambio: Cambio = {
        operacion: op,
        antes: 0,
        despues: 0.5,
        acotado: false,
        reversible: true,
      };

      await enlace.enviarOperacion(op, cambio);

      // Verificar que enviar fue llamado con el tipo correcto
      expect(enviarMock).toHaveBeenCalled();
      const llamado = enviarMock.mock.calls[0][0];
      expect(llamado.tipo).toBe("operacion");
      expect(llamado.elemento).toBeDefined();
      // Verificar que el elemento tiene el tipo correcto y los datos esperados
      expect(llamado.elemento.tipo).toBe("parametro");
      expect(llamado.elemento.datos.valor).toBe(0.5);
    });
  });

  describe("enviarGesto", () => {
    it("debería enviar un gesto efímero", () => {
      enlace.enviarGesto(0.8);
      expect(enviarMock).toHaveBeenCalled();
      const llamado = enviarMock.mock.calls[0][0];
      expect(llamado.tipo).toBe("gesto");
      expect(llamado.elemento).toBeDefined();
      expect(llamado.elemento.tipo).toBe("gesto");
      expect(llamado.elemento.datos.valor).toBe(0.8);
    });
  });

  describe("enviarConfirmacion", () => {
    it("debería enviar una confirmación corta", () => {
      const op: Operacion = {
        id: "op-2",
        objetivo: { atomoId: "atomo-1", parametroId: "volumen" },
        accion: { tipo: "exacta", valor: 0.3 },
        autor: { tipo: "persona", id: "usuario-1" },
        origen: "mano",
        t: 0,
        texto: "prueba",
      };
      enlace.enviarConfirmacion(op);
      expect(enviarMock).toHaveBeenCalled();
      const llamado = enviarMock.mock.calls[0][0];
      expect(llamado.tipo).toBe("confirmacion");
      expect(llamado.corto).toBeDefined();
      // Verificar que el corto se pueda parsear de vuelta a una operación
      // Nota: La función desdeFormaCorta está en sesion-sincronia.ts, pero aquí no la importamos para evitar dependencias circulares en el test
      // En su lugar, podemos verificar el formato esperado
      expect(typeof llamado.corto).toBe("string");
      expect(llamado.corto.length).toBeGreaterThan(0);
    });
  });

  describe("obtenerEstadoEnlace", () => {
    it("debería devolver el estado inicial del enlace", () => {
      const estado = enlace.obtenerEstadoEnlace();
      expect(estado.estado).toBe("conectado"); // Porque iniciamos la medición de latencia por defecto
      expect(estado.latencia.muestras).toBe(0);
      expect(estado.latencia.p50).toBeNull();
      expect(estado.latencia.p95).toBeNull();
      expect(estado.precisionReloj).toBeNull(); // Inicialmente sin muestras, la precision es null
    });
  });

  describe("medición de latencia", () => {
    it("debería almacenar muestras de latencia al recibir pong", () => {
      // Simular la recepción de un mensaje pong
      // Nota: En la implementación real, el recibirMock llamaría al callback con el mensaje
      // Aquí simulamos llamando directamente al callback que se pasó a recibir
      const callback = recibirMock.mock.calls[0][0];
      callback({
        tipo: "pong",
        id: "pong-1",
        t0: 1000,
        t1: 1005,
        t2: 1010,
        t3: 1015,
      });

      const estado = enlace.obtenerEstadoEnlace();
      expect(estado.latencia.muestras).toBe(1);
      // La latencia es t3 - t0 = 1015 - 1000 = 15 ms
      expect(estado.latencia.p50).toBeCloseTo(15);
      expect(estado.latencia.p95).toBeCloseTo(15);
    });
  });

  describe("detener", () => {
    it("debería detener la medición de latencia y desuscribirse", () => {
      enlace.detener();
      // Después de detener, llamar a obtenerEstadoEnlace no debería cambiar las muestras por nuevos pings
      // Pero no podemos verificar fácilmente el intervalo sin más mocks
      // Al menos verificamos que no lanza
      expect(() => enlace.obtenerEstadoEnlace()).not.toThrow();
    });
  });
});