import { describe, it, expect } from "vitest";
import { anunciarPorEnlacesDirectos, escucharEstacionesDirectas } from "../malla-directa";
import type { Estacion } from "../tipos";

function estacion(parcial: Partial<Estacion> = {}): Estacion {
  return {
    id: "est-101",
    owner_id: "u1",
    ambito_tipo: "persona",
    entidad_ref: null,
    titulo: "Estación de prueba",
    descripcion: "",
    tipo: "audio",
    fuente: "enlace",
    enlace: "https://ejemplo.com/audio",
    formato: "audio",
    imagen: null,
    idioma: "es",
    categorias: [],
    licencia: "cc-by",
    visibilidad: "publica",
    empieza_en: null,
    termina_en: null,
    ultimo_latido: null,
    pausada: false,
    en_malla: true,
    espectadores: 0,
    created_at: "",
    updated_at: "",
    ...parcial,
  };
}

describe("anunciarPorEnlacesDirectos", () => {
  it("anuncia por dos enlaces y un tercero falla (enviados = 2)", async () => {
    const resultados = [
      { ok: true, enlace: { id: "en-1" } },
      { ok: true, enlace: { id: "en-2" } },
      { ok: false },
    ];
    let idx = 0;
    const r = await anunciarPorEnlacesDirectos(estacion(), {
      enlaces: async () => [{ id: "en-1" }, { id: "en-2" }, { id: "en-3" }],
      enviar: async () => {
        const res = resultados[idx++];
        return res;
      },
    });
    expect(r.enviados).toBe(2);
    expect(r.enlaces).toEqual(["en-1", "en-2"]);
  });
});

describe("escucharEstacionesDirectas", () => {
  it("un faro válido recibido llega a cb", () => {
    const oidasRecibidas: unknown[] = [];
    const baja = escucharEstacionesDirectas((oidas) => {
      oidasRecibidas.push(oidas);
    }, {
      alRecibir: (canal, cb) => {
        // simula recepción válida
        cb({ cuerpo: { kind: "estacion", id: "e1", name: "Radio 1", category: "audio", media_url: "/r1" } });
        return () => {};
      },
    });
    baja();
    expect(oidasRecibidas.length).toBeGreaterThan(0);
    expect(oidasRecibidas[0]).toHaveLength(1);
  });

  it("un faro inválido no llega a cb", () => {
    const oidasRecibidas: unknown[] = [];
    const baja = escucharEstacionesDirectas((oidas) => {
      oidasRecibidas.push(oidas);
    }, {
      alRecibir: (canal, cb) => {
        cb({ cuerpo: { kind: "message", id: "x" } });
        return () => {};
      },
    });
    baja();
    expect(oidasRecibidas).toHaveLength(0);
  });
});
