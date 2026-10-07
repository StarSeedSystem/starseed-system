import { describe, it, expect } from "vitest";
import {
  faroDeEstacion,
  bytesDeFaro,
  anunciarEnMalla,
  estacionesDeFaros,
  MAX_BYTES_FARO,
} from "../malla";
import type { Estacion } from "../tipos";

function estacion(parcial: Partial<Estacion> = {}): Estacion {
  return {
    id: "est-123",
    owner_id: "u1",
    ambito_tipo: "persona",
    entidad_ref: null,
    titulo: "Radio libre del barrio",
    descripcion: "",
    tipo: "audio",
    fuente: "enlace",
    enlace: "https://radio.example.com/directo",
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

describe("faroDeEstacion y bytesDeFaro", () => {
  it("usa solo campos permitidos y ≤ 200 bytes", () => {
    const f = faroDeEstacion(estacion());
    expect(Object.keys(f).sort()).toEqual(["category", "id", "kind", "media_url", "name"]);
    expect(f.kind).toBe("estacion");
    expect(f.media_url).toBe("https://radio.example.com/directo");
    expect(bytesDeFaro(f)).toBeLessThanOrEqual(MAX_BYTES_FARO);
  });

  it("recorta el nombre con títulos larguísimos y sigue ≤ 200 bytes", () => {
    const f = faroDeEstacion(estacion({ titulo: "Título ".repeat(40) }));
    expect(f.name.length).toBeLessThanOrEqual(48);
    expect(bytesDeFaro(f)).toBeLessThanOrEqual(MAX_BYTES_FARO);
  });

  it("mide bien UTF-8 con tildes y emojis", () => {
    const f = faroDeEstacion(estacion({ titulo: "Música señal ñandú 🎶✨📡".repeat(5) }));
    expect(bytesDeFaro(f)).toBeLessThanOrEqual(MAX_BYTES_FARO);
  });

  it("usa la ruta interna si el enlace pasa de 120 caracteres", () => {
    const f = faroDeEstacion(estacion({ enlace: "https://x.tv/" + "a".repeat(200) }));
    expect(f.media_url).toBe("/estaciones/est-123");
    expect(bytesDeFaro(f)).toBeLessThanOrEqual(MAX_BYTES_FARO);
  });
});

describe("anunciarEnMalla con dependencias falsas", () => {
  it("envía por servidor y por radio con cls P2 y tipo post", async () => {
    const subidas: unknown[] = [];
    const colas: unknown[] = [];
    const r = await anunciarEnMalla(estacion(), {
      uploadPublic: async (env) => { subidas.push(env); return { ok: true }; },
      enqueueMeshSync: (item) => { colas.push(item); },
    });
    expect(r).toEqual({ servidor: true, radio: true });
    expect(subidas[0]).toMatchObject({ cls: "P2", ptype: "post", oid: "estacion:est-123" });
    expect(colas[0]).toMatchObject({ type: "post", cls: "P2" });
  });

  it("un fallo del servidor no impide la radio", async () => {
    const r = await anunciarEnMalla(estacion(), {
      uploadPublic: async () => { throw new Error("red caída"); },
      enqueueMeshSync: () => undefined,
    });
    expect(r).toEqual({ servidor: false, radio: true });
  });

  it("un fallo de la radio no impide el servidor", async () => {
    const r = await anunciarEnMalla(estacion(), {
      uploadPublic: async () => ({ ok: true }),
      enqueueMeshSync: () => { throw new Error("sin radio"); },
    });
    expect(r).toEqual({ servidor: true, radio: false });
  });
});

describe("estacionesDeFaros", () => {
  const faro = faroDeEstacion(estacion());
  it("acepta cuerpos sueltos y envueltos, y quita duplicados", () => {
    const r = estacionesDeFaros([faro, { body: faro }, { body: { body: faro } }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      id: "est-123",
      titulo: "Radio libre del barrio",
      tipo: "audio",
      enlace: "https://radio.example.com/directo",
      oidaPorMalla: true,
    });
  });

  it("descarta basura y enlaces inseguros", () => {
    const r = estacionesDeFaros([
      null,
      42,
      "texto",
      { body: { kind: "message", id: "x" } },
      { body: { ...faro, media_url: "javascript:alert(1)" } },
      { body: { ...faro, media_url: "http://inseguro.com" } },
      { body: { ...faro, id: "", name: "sin id" } },
    ]);
    expect(r).toEqual([]);
  });

  it("acepta rutas internas válidas", () => {
    const r = estacionesDeFaros([{ body: { ...faro, media_url: "/estaciones/est-123" } }]);
    expect(r).toHaveLength(1);
    expect(r[0].enlace).toBe("/estaciones/est-123");
  });
});
