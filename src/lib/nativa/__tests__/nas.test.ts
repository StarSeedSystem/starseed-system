import { describe, expect, it, vi } from "vitest";
import type { CarpetaConcedida } from "../tipos";
import {
  aBase64,
  atenderPeticionNas,
  autorizarPeticionNas,
  deBase64,
  dentroDe,
  leerPeticionNas,
  NAS_TROZO_MAX,
  normalizarRuta,
  planTrozos,
  type ContextoServidorNas,
} from "../nas";

const carpeta = (ruta: string, nas: boolean): CarpetaConcedida => ({ ruta, modo: "lectura", nas, desde_ms: 1, amplia: false });
const ctx: ContextoServidorNas = {
  miUid: "uid-alex",
  carpetas: [carpeta("/datos/musica", true), carpeta("/datos/fotos", false), carpeta("C:/Users/alex/Docs", true)],
  sirveCerebro: false,
};
const mio = { tipo: "cuenta" as const, uid: "uid-alex" };

describe("NAS de la cuenta: forma de las peticiones", () => {
  it("acepta solo peticiones bien formadas", () => {
    expect(leerPeticionNas({ t: "nas.listar", id: "a", ruta: "/datos/musica" })).toEqual({ t: "nas.listar", id: "a", ruta: "/datos/musica" });
    expect(leerPeticionNas({ t: "nas.leer", id: "a", ruta: "/x", desde: 0, largo: 0 })).toBeNull();
    expect(leerPeticionNas({ t: "nas.leer", id: "a", ruta: "/x", desde: -1, largo: 5 })).toBeNull();
    expect(leerPeticionNas({ t: "nas.escribir", id: "a", ruta: "/x" })).toBeNull();
    expect(leerPeticionNas({ t: "nas.estado" })).toBeNull();
    expect(leerPeticionNas("hola")).toBeNull();
  });

  it("normaliza rutas y rechaza las relativas y las que suben", () => {
    expect(normalizarRuta("/datos//musica/./disco/")).toBe("/datos/musica/disco");
    expect(normalizarRuta("C:\\Users\\alex\\Docs")).toBe("C:/Users/alex/Docs");
    expect(normalizarRuta("/")).toBe("/");
    expect(normalizarRuta("datos/musica")).toBeNull();
    expect(normalizarRuta("/datos/musica/../fotos")).toBeNull();
    expect(normalizarRuta("/a\0b")).toBeNull();
  });

  it("dentroDe compara por componentes", () => {
    expect(dentroDe("/datos/musica", "/datos/musica/x.flac")).toBe(true);
    expect(dentroDe("/datos/musica", "/datos/musica2/x.flac")).toBe(false);
    expect(dentroDe("/", "/cualquier/cosa")).toBe(true);
  });
});

describe("NAS de la cuenta: permisos", () => {
  it("solo mis neuronas, nunca otra cuenta ni quien no diga su cuenta", () => {
    const p = { t: "nas.listar" as const, id: "1", ruta: "/datos/musica" };
    expect(autorizarPeticionNas(p, mio, ctx).ok).toBe(true);
    expect(autorizarPeticionNas(p, { tipo: "par", uid: "otra" }, ctx).ok).toBe(false);
    expect(autorizarPeticionNas(p, { tipo: "local" }, ctx).ok).toBe(false);
  });

  it("solo carpetas compartidas y dentro de ellas", () => {
    const listar = (ruta: string) => autorizarPeticionNas({ t: "nas.listar", id: "1", ruta }, mio, ctx);
    expect(listar("/datos/musica/rock")).toMatchObject({ ok: true, carpeta: { ruta: "/datos/musica" } });
    expect(listar("/datos/fotos")).toMatchObject({ ok: false }); // concedida pero no compartida
    expect(listar("/etc")).toMatchObject({ ok: false });
    expect(listar("/datos/musica/../fotos")).toMatchObject({ ok: false });
    expect(listar("C:/Users/alex/Docs/a.pdf")).toMatchObject({ ok: true });
  });

  it("cada medio lleva lo que cabe: LoRa solo el estado, el relé no lleva archivos", () => {
    const lora = { tipo: "lora" as const, uid: "uid-alex" };
    const rele = { tipo: "rele" as const, uid: "uid-alex" };
    expect(autorizarPeticionNas({ t: "nas.estado", id: "1" }, lora, ctx).ok).toBe(true);
    expect(autorizarPeticionNas({ t: "nas.listar", id: "1", ruta: "/datos/musica" }, lora, ctx).ok).toBe(false);
    expect(autorizarPeticionNas({ t: "nas.leer", id: "1", ruta: "/datos/musica/a", desde: 0, largo: 10 }, rele, ctx).ok).toBe(false);
  });

  it("trozos acotados y cerebro solo si se comparte", () => {
    const grande = { t: "nas.leer" as const, id: "1", ruta: "/datos/musica/a", desde: 0, largo: NAS_TROZO_MAX + 1 };
    expect(autorizarPeticionNas(grande, mio, ctx).ok).toBe(false);
    const preg = { t: "cerebro.preguntar" as const, id: "1", texto: "hola" };
    expect(autorizarPeticionNas(preg, mio, ctx).ok).toBe(false);
    expect(autorizarPeticionNas(preg, mio, { ...ctx, sirveCerebro: true }).ok).toBe(true);
  });
});

describe("NAS de la cuenta: atender", () => {
  it("lee por Rust y devuelve base64; lo denegado ni llega a Rust", async () => {
    const deps = {
      nasListar: vi.fn(async () => ({ ok: true as const, valor: [] })),
      nasLeer: vi.fn(async () => ({ ok: true as const, valor: new Uint8Array([104, 111, 108, 97]) })),
    };
    const r = await atenderPeticionNas({ t: "nas.leer", id: "z", ruta: "/datos/musica/a.txt", desde: 0, largo: 4 }, mio, ctx, deps);
    expect(r).toEqual({ t: "nas.ok", id: "z", datos: { desde: 0, b64: "aG9sYQ==" } });
    const no = await atenderPeticionNas({ t: "nas.leer", id: "y", ruta: "/datos/fotos/a.jpg", desde: 0, largo: 4 }, mio, ctx, deps);
    expect(no.t).toBe("nas.error");
    expect(deps.nasLeer).toHaveBeenCalledTimes(1);
  });

  it("el error de Rust (p. ej. enlace simbólico fuera) llega tal cual", async () => {
    const deps = {
      nasListar: async () => ({ ok: false as const, motivo: "Esa ruta no está dentro de ninguna carpeta compartida con tus neuronas (NAS)." }),
      nasLeer: async () => ({ ok: false as const, motivo: "x" }),
    };
    const r = await atenderPeticionNas({ t: "nas.listar", id: "w", ruta: "/datos/musica/enlace" }, mio, ctx, deps);
    expect(r).toMatchObject({ t: "nas.error", motivo: expect.stringContaining("NAS") });
  });

  it("base64 de ida y vuelta y plan de trozos", () => {
    const b = new Uint8Array(70_000).map((_, i) => i % 256);
    expect(Array.from(deBase64(aBase64(b)))).toEqual(Array.from(b));
    expect(planTrozos(600_000)).toEqual([
      { desde: 0, largo: NAS_TROZO_MAX },
      { desde: NAS_TROZO_MAX, largo: NAS_TROZO_MAX },
      { desde: 2 * NAS_TROZO_MAX, largo: 600_000 - 2 * NAS_TROZO_MAX },
    ]);
    expect(planTrozos(0)).toEqual([]);
  });
});
