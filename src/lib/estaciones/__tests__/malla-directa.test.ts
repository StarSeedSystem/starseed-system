import { describe, it, expect, vi, afterEach } from "vitest";
import { anunciarPorEnlacesDirectos, escucharEstacionesDirectas } from "../malla-directa";
import type { Estacion } from "../tipos";
import { faroDeEstacion } from "../malla";
vi.mock("@/lib/malla/registro-enlaces-locales");
vi.mock("@/lib/malla/transporte-universal");
import { enlacesLocalesVivos } from "@/lib/malla/registro-enlaces-locales";
import { enviarMensaje, alRecibirMensaje } from "@/lib/malla/transporte-universal";
const createMockEstacion = (o: Partial<Estacion> = {}): Estacion => ({
  id: "test-id",
  owner_id: "test-owner",
  ambito_tipo: "persona",
  entidad_ref: null,
  titulo: "Test Station",
  descripcion: "A test station",
  tipo: "audio",
  fuente: "enlace",
  enlace: "https://example.com",
  formato: "mp3",
  imagen: null,
  idioma: "es",
  categorias: [],
  licencia: "cc0",
  visibilidad: "publica",
  empieza_en: null,
  termina_en: null,
  ultimo_latido: null,
  pausada: false,
  en_malla: false,
  espectadores: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...o,
});
describe("malla-directa", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
  describe("anunciarPorEnlacesDirectos", () => {
    it("should announce via two links and one failure", async () => {
      (enlacesLocalesVivos as any).mockReturnValue([{ id: "link1" }, { id: "link2" }, { id: "link3" }]);
      (enviarMensaje as any)
        .mockResolvedValueOnce({ ok: true, enlace: { id: "link1" } })
        .mockResolvedValueOnce({ ok: true, enlace: { id: "link2" } })
        .mockResolvedValueOnce({ ok: false, enlace: undefined });
      const estacion = createMockEstacion();
      const result = await anunciarPorEnlacesDirectos(estacion);
      expect(result.enviados).toBe(2);
      expect(result.enlaces).toEqual(["link1", "link2"]);
      expect(enviarMensaje).toHaveBeenCalledTimes(3);
      expect(enviarMensaje).toHaveBeenNthCalledWith(1, { enlaceId: "link1" }, "estacion", faroDeEstacion(estacion));
      expect(enviarMensaje).toHaveBeenNthCalledWith(2, { enlaceId: "link2" }, "estacion", faroDeEstacion(estacion));
      expect(enviarMensaje).toHaveBeenNthCalledWith(3, { enlaceId: "link3" }, "estacion", faroDeEstacion(estacion));
    });

    it("anuncia con dependencias inyectadas: dos enlaces bien y un tercero falla (enviados = 2)", async () => {
      const resultados: Array<{ ok: boolean; enlace?: { id: string } }> = [
        { ok: true, enlace: { id: "en-1" } },
        { ok: true, enlace: { id: "en-2" } },
        { ok: false },
      ];
      let idx = 0;
      const r = await anunciarPorEnlacesDirectos(createMockEstacion(), {
        enlaces: async () => [{ id: "en-1" }, { id: "en-2" }, { id: "en-3" }],
        enviar: async () => resultados[idx++],
      });
      expect(r.enviados).toBe(2);
      expect(r.enlaces).toEqual(["en-1", "en-2"]);
      expect(enlacesLocalesVivos).not.toHaveBeenCalled();
      expect(enviarMensaje).not.toHaveBeenCalled();
    });
  });
  describe("escucharEstacionesDirectas", () => {
    it("un faro válido recibido llega a cb", () => {
      const oidasRecibidas: unknown[] = [];
      const baja = escucharEstacionesDirectas((oidas) => {
        oidasRecibidas.push(oidas);
      }, {
        alRecibir: (canal, cb) => {
          cb({ cuerpo: { kind: "estacion", id: "e1", name: "Radio 1", category: "audio", media_url: "/r1" } });
          return () => {};
        },
      });
      baja();
      expect(oidasRecibidas.length).toBeGreaterThan(0);
      expect(oidasRecibidas[0]).toHaveLength(1);
    });
    it("should call cb with valid faro and ignore invalid when deps provided", () => {
      const cb = vi.fn();
      const mockAlRecibirMensaje = vi.fn().mockImplementation((canal: string, callback: (m: unknown) => void) => {
        return () => { };
      });
      const deps = { alRecibir: (canal: string, callback: (m: unknown) => void) => mockAlRecibirMensaje(canal, callback) };
      const unsubscribe = escucharEstacionesDirectas(cb, deps);
      const faroValido = faroDeEstacion(createMockEstacion());
      const mensajeValido = { cuerpo: faroValido };
      const alRecibirCallback = mockAlRecibirMensaje.mock.calls[0][1];
      alRecibirCallback(mensajeValido);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith([expect.objectContaining({ id: faroValido.id, titulo: faroValido.name, tipo: faroValido.category, enlace: faroValido.media_url, oidaPorMalla: true })]);
      const mensajeInvalido = { cuerpo: { kind: "not-estacion", id: "invalid", name: "Invalid", category: "audio", media_url: "https://example.com" } };
      alRecibirCallback(mensajeInvalido);
      expect(cb).toHaveBeenCalledTimes(1);
      unsubscribe();
    });
  });
});