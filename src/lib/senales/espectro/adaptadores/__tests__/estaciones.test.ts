import { describe, it, expect } from "vitest";
import { adaptarEstacionesASenales, type EstacionEntrada } from "../estaciones";
import type { SenalEspectro, CapaRed } from "../../tipos";

const ESTACION_BASE: EstacionEntrada = {
  id: "est-1",
  owner_id: "user-1",
  ambito_tipo: "persona",
  entidad_ref: null,
  titulo: "Radio Cosmos",
  descripcion: "Música espacial",
  tipo: "audio",
  fuente: "enlace",
  enlace: "https://radio.example.com/stream",
  formato: "mp3",
  imagen: null,
  idioma: "es",
  categorias: ["musica"],
  licencia: "cc0",
  visibilidad: "publica",
  empieza_en: null,
  termina_en: null,
  ultimo_latido: "2024-01-15T10:00:00Z",
  pausada: false,
  en_malla: false,
  espectadores: 5,
  created_at: "2024-01-10T10:00:00Z",
  updated_at: "2024-01-15T10:00:00Z",
};

function clonarEstacion(sobrescrituras: Partial<EstacionEntrada> = {}): EstacionEntrada {
  return { ...ESTACION_BASE, ...sobrescrituras };
}

describe("Adaptador de estaciones → señales de espectro", () => {
  it("convierte una estación pública ajena en señal con capa publica", () => {
    const estaciones = [clonarEstacion({ id: "est-publica", owner_id: "otro-user", visibilidad: "publica" })];
    const senales = adaptarEstacionesASenales(estaciones, "yo-user");

    expect(senales).toHaveLength(1);
    const s = senales[0];
    expect(s.medio).toBe("estacion");
    expect(s.capa).toBe("publica");
    expect(s.origen).toBe("declarada");
    expect(s.fuente).toBe("estación publicada por su dueño");
    expect(s.vinculo).toEqual({ tipo: "estacion", id: "est-publica" });
    expect(s.frecuenciaKhz).toBeNull();
    expect(s.anchoKhz).toBeNull();
    expect(s.banda).toBe("audio");
    expect(s.id).toBe("est-publica");
  });

  it("convierte una estación privada propia en señal con capa privada", () => {
    const estaciones = [clonarEstacion({ id: "est-privada", owner_id: "yo-user", visibilidad: "grupo" })];
    const senales = adaptarEstacionesASenales(estaciones, "yo-user");

    expect(senales).toHaveLength(1);
    expect(senales[0].capa).toBe("privada");
  });

  it("descarta estaciones privadas ajenas (visibilidad grupo de otro owner)", () => {
    const estaciones = [clonarEstacion({ id: "est-ajena", owner_id: "otro-user", visibilidad: "grupo" })];
    const senales = adaptarEstacionesASenales(estaciones, "yo-user");

    expect(senales).toHaveLength(0);
  });

  it("sin frecuencia declarada → frecuenciaKhz y anchoKhz null (no inventa números)", () => {
    const estaciones = [clonarEstacion({ id: "est-sin-freq", formato: "desconocido" })];
    const senales = adaptarEstacionesASenales(estaciones, "yo-user");

    expect(senales[0].frecuenciaKhz).toBeNull();
    expect(senales[0].anchoKhz).toBeNull();
  });

  it("extrae banda desde el tipo de estación", () => {
    const estaciones = [
      clonarEstacion({ id: "est-audio", tipo: "audio" }),
      clonarEstacion({ id: "est-video", tipo: "video" }),
      clonarEstacion({ id: "est-xr", tipo: "xr" }),
    ];
    const senales = adaptarEstacionesASenales(estaciones, "yo-user");

    expect(senales.find(s => s.id === "est-audio")?.banda).toBe("audio");
    expect(senales.find(s => s.id === "est-video")?.banda).toBe("video");
    expect(senales.find(s => s.id === "est-xr")?.banda).toBe("xr");
  });

  it("medidoEn usa ultimo_latido si existe, si no created_at, si no null", () => {
    const conLatido = clonarEstacion({ id: "con-latido", ultimo_latido: "2024-01-15T10:00:00Z", created_at: "2024-01-10T10:00:00Z" });
    const sinLatido = clonarEstacion({ id: "sin-latido", ultimo_latido: null, created_at: "2024-01-10T10:00:00Z" });
    const sinNada = clonarEstacion({ id: "sin-nada", ultimo_latido: null, created_at: null as any });

    const senales = adaptarEstacionesASenales([conLatido, sinLatido, sinNada], "yo-user");

    expect(senales.find(s => s.id === "con-latido")?.medidoEn).toBe(new Date("2024-01-15T10:00:00Z").getTime());
    expect(senales.find(s => s.id === "sin-latido")?.medidoEn).toBe(new Date("2024-01-10T10:00:00Z").getTime());
    expect(senales.find(s => s.id === "sin-nada")?.medidoEn).toBeNull();
  });

  it("fuerzaDbm y calidad son null (no medidos)", () => {
    const estaciones = [clonarEstacion({ id: "est-1" })];
    const senales = adaptarEstacionesASenales(estaciones, "yo-user");

    expect(senales[0].fuerzaDbm).toBeNull();
    expect(senales[0].calidad).toBeNull();
  });

  it("zona es null (sin coordenadas)", () => {
    const estaciones = [clonarEstacion({ id: "est-1" })];
    const senales = adaptarEstacionesASenales(estaciones, "yo-user");

    expect(senales[0].zona).toBeNull();
  });

  it("compatibles es array vacío", () => {
    const estaciones = [clonarEstacion({ id: "est-1" })];
    const senales = adaptarEstacionesASenales(estaciones, "yo-user");

    expect(senales[0].compatibles).toEqual([]);
  });

  it("array vacío de entrada devuelve array vacío", () => {
    const senales = adaptarEstacionesASenales([], "yo-user");
    expect(senales).toEqual([]);
  });

  it("estación con ambito_tipo entidad y visibilidad publica se incluye", () => {
    const estaciones = [clonarEstacion({ id: "est-entidad", ambito_tipo: "entidad", entidad_ref: "grupo-1", visibilidad: "publica", owner_id: "otro-user" })];
    const senales = adaptarEstacionesASenales(estaciones, "yo-user");

    expect(senales).toHaveLength(1);
    expect(senales[0].capa).toBe("publica");
  });
});