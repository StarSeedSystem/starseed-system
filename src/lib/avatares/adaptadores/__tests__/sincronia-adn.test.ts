/** Sincronía del ADN del avatar (AV1011E): evento por el canal de la escena, caché read-once, emisor con `lote()` y nivel de XR. */
import { describe, expect, it } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "../../adn/adn";
import {
  adnParaXR,
  aplicarEventoAdn,
  avatarDeNivelXR,
  crearCacheAdn,
  crearEmisorAdn,
  estadoDeAdn,
  EVENTO_ADN,
  sanearEventoAdn,
  type EventoAdn,
} from "../sincronia-adn";

const adnDe = (id: string): AdnAvatar => adnPorDefecto(id, "Ana", { tipo: "perfil", id: "p1" });

describe("evento `adn` del canal de la escena", () => {
  it("deja pasar lo válido y tira lo demás", () => {
    expect(EVENTO_ADN).toBe("adn");
    const bien: EventoAdn = { ref: "biblioteca:adn-1", rev: 2, cambios: [{ op: "morfologia", clave: "altura", valor: 0.9 }] };
    expect(sanearEventoAdn(bien)).toEqual(bien);
    expect(sanearEventoAdn({ ...bien, ref: "https://ajeno/x.vrm" })).toBeNull(); // ref externa: fuera
    expect(sanearEventoAdn({ ...bien, rev: "2" })).toBeNull();
    expect(sanearEventoAdn({ ...bien, cambios: [] })).toBeNull();
    expect(sanearEventoAdn({ ...bien, cambios: [{ op: "no-existe" }] })).toBeNull();
    expect(sanearEventoAdn("pose")).toBeNull();
  });

  it("los cambios inválidos se tiran y los válidos se quedan (acotados y con tope de 64)", () => {
    const bien: EventoAdn = { ref: "biblioteca:adn-1", rev: 2, cambios: [] };
    const mixto = sanearEventoAdn({ ...bien, cambios: [{ op: "morfologia", clave: "altura", valor: 9 }, { op: "morfologia", clave: "fantasma", valor: 1 }] });
    expect(mixto?.cambios).toEqual([{ op: "morfologia", clave: "altura", valor: 1 }]);
    expect(sanearEventoAdn({ ...bien, cambios: Array.from({ length: 70 }, () => ({ op: "nombre", valor: "x" })) })?.cambios).toHaveLength(64);
  });

  it("estadoDeAdn nombra el ADN por su id, como el almacén (§12)", () => {
    expect(estadoDeAdn(adnDe("adn-1"))).toMatchObject({ ref: "biblioteca:adn-1", rev: 0 });
  });

  it("aplica un lote más nuevo y aterriza en su revisión, sin mutar el original", () => {
    const estado = estadoDeAdn(adnDe("adn-1"));
    const r = aplicarEventoAdn(estado, {
      ref: estado.ref,
      rev: 2,
      cambios: [{ op: "morfologia", clave: "altura", valor: 0.8 }, { op: "material", slot: "cabello", campo: "color", valor: "#00FF00" }],
    });
    expect(r?.aplicados).toBe(2);
    expect(r?.estado.rev).toBe(2);
    expect(r?.estado.adn.morfologia.altura).toBe(0.8);
    expect(r?.estado.adn.materiales.cabello?.color).toBe("#00ff00");
    expect(estado.adn.morfologia.altura).toBeUndefined();
  });

  it("no aplica lotes viejos, repetidos, de otro ADN o sin cambios válidos", () => {
    const estado = { ...estadoDeAdn(adnDe("adn-1")), rev: 3 };
    const crudo = { ref: estado.ref, rev: 2, cambios: [{ op: "nombre", valor: "Vieja" }] };
    expect(aplicarEventoAdn(estado, crudo)).toBeNull();
    expect(aplicarEventoAdn(estado, { ...crudo, rev: 3 })).toBeNull();
    expect(aplicarEventoAdn(estado, { ...crudo, rev: 4, ref: "biblioteca:adn-2" })).toBeNull();
    expect(aplicarEventoAdn(estado, { ...crudo, rev: 4, cambios: [{ op: "fantasma" }] })).toBeNull();
  });

  it("de un lote mixto aplica solo los cambios válidos y cuenta eso", () => {
    const estado = estadoDeAdn(adnDe("adn-1"));
    const r = aplicarEventoAdn(estado, { ref: estado.ref, rev: 1, cambios: [{ op: "nombre", valor: "Ana" }, { op: "aura", campo: "tono", valor: "no" }] });
    expect(r?.aplicados).toBe(1);
    expect(r?.estado.adn.nombre).toBe("Ana");
    expect(r?.estado.rev).toBe(1);
  });
});

describe("caché del ADN de los presentes", () => {
  it("lee UNA vez por ref+rev, aunque dos lleguen a la vez", async () => {
    let llamadas = 0;
    const cache = crearCacheAdn(async () => { llamadas += 1; return adnDe("adn-1"); });
    const [a, b] = await Promise.all([cache.leer("biblioteca:adn-1", 2), cache.leer("biblioteca:adn-1", 2)]);
    expect(llamadas).toBe(1);
    expect(a?.id).toBe("adn-1");
    expect(b?.id).toBe("adn-1");
    expect(cache.tiene("biblioteca:adn-1", 2)).toBe(true);
  });

  it("otra revisión es otra lectura", async () => {
    let llamadas = 0;
    const cache = crearCacheAdn(async () => { llamadas += 1; return adnDe("adn-1"); });
    await cache.leer("biblioteca:adn-1", 1);
    await cache.leer("biblioteca:adn-1", 2);
    expect(llamadas).toBe(2);
  });

  it("lo que no trajo nada (o falló) no se cachea: se puede reintentar", async () => {
    let llamadas = 0;
    const cache = crearCacheAdn(async () => {
      llamadas += 1;
      if (llamadas === 1) return null;
      if (llamadas === 2) throw new Error("sin almacén");
      return adnDe("adn-1");
    });
    expect(await cache.leer("biblioteca:adn-1", 1)).toBeNull();
    expect(cache.tiene("biblioteca:adn-1", 1)).toBe(false);
    expect(await cache.leer("biblioteca:adn-1", 1)).toBeNull();
    expect((await cache.leer("biblioteca:adn-1", 1))?.id).toBe("adn-1");
    expect(llamadas).toBe(3);
  });

  it("el tope saca la entrada más vieja", async () => {
    let llamadas = 0;
    const cache = crearCacheAdn(async () => { llamadas += 1; return adnDe("adn-1"); }, 2);
    await cache.leer("biblioteca:a", 1);
    await cache.leer("biblioteca:b", 1);
    await cache.leer("biblioteca:c", 1);
    expect(cache.tiene("biblioteca:a", 1)).toBe(false);
    await cache.leer("biblioteca:a", 1);
    expect(llamadas).toBe(4);
  });
});

describe("emisor de la edición en vivo", () => {
  const opciones = (enviados: EventoAdn[], otros: number, t: { v: number }) => ({
    enviar: (e: EventoAdn) => enviados.push(e),
    actual: () => ({ ref: "biblioteca:adn-1", rev: 1 } as const),
    otros: () => otros,
    ahora: () => t.v,
  });

  it("a solas no emite nada (nadie lo recibiría)", () => {
    const enviados: EventoAdn[] = [];
    const e = crearEmisorAdn(opciones(enviados, 0, { v: 0 }));
    e.encolar({ op: "nombre", valor: "Ana" });
    e.bombear();
    expect(enviados).toHaveLength(0);
  });

  it("agrupa por clave, lleva el ref/rev vivos y respeta el intervalo de 10 Hz", () => {
    const enviados: EventoAdn[] = [];
    const t = { v: 0 };
    const e = crearEmisorAdn(opciones(enviados, 2, t));
    e.encolar({ op: "morfologia", clave: "altura", valor: 0.2 });
    e.encolar({ op: "morfologia", clave: "altura", valor: 0.9 });
    e.bombear(); // el primero sale ya
    expect(enviados).toEqual([{ ref: "biblioteca:adn-1", rev: 1, cambios: [{ op: "morfologia", clave: "altura", valor: 0.9 }] }]);
    e.encolar({ op: "nombre", valor: "Ana" });
    t.v = 50;
    e.bombear(); // aún no toca: 50 < 100 ms
    expect(enviados).toHaveLength(1);
    t.v = 100;
    e.bombear();
    expect(enviados).toHaveLength(2);
    expect(enviados[1].cambios).toEqual([{ op: "nombre", valor: "Ana" }]);
    expect(e.lotesEnviados()).toBe(2);
  });

  it("sin ADN activo no emite aunque haya cola", () => {
    const enviados: EventoAdn[] = [];
    const e = crearEmisorAdn({ ...opciones(enviados, 3, { v: 0 }), actual: () => null });
    e.encolar({ op: "nombre", valor: "Ana" });
    e.bombear();
    expect(enviados).toHaveLength(0);
  });

  it("con mucha gente baja la frecuencia, igual que las poses", () => {
    const enviados: EventoAdn[] = [];
    const t = { v: 0 };
    const e = crearEmisorAdn(opciones(enviados, 10, t));
    for (let i = 0; i < 20; i++) {
      e.encolar({ op: "morfologia", clave: "altura", valor: i / 20 });
      t.v = i * 16; // 60 fps
      e.bombear();
    }
    expect(enviados.length).toBeLessThanOrEqual(4); // 320 ms a 250 ms/lote
  });
});

describe("XR · el nivel de avatar sale de la calidad actual", () => {
  it("cada nivel de calidad mapea a su nivel de avatar", () => {
    expect(avatarDeNivelXR("minima")).toBe("orbe-manos");
    expect(avatarDeNivelXR("baja")).toBe("cabeza-manos");
    expect(avatarDeNivelXR("media")).toBe("vrm-ligero");
    expect(avatarDeNivelXR("alta")).toBe("vrm");
    expect(avatarDeNivelXR("maxima")).toBe("vrm-completo");
  });

  it("en el nivel más bajo eres tu orbe; en el más alto se dibuja todo (§6)", () => {
    const adn: AdnAvatar = {
      ...adnDe("adn-1"),
      base: { tipo: "vrm", ref: "biblioteca:avatares/plantillas/arla.vrm" },
      esqueleto: { tipo: "vrm-humanoide", articulaciones: 55 },
      expresionBase: { aa: 1, ih: 1, ou: 1, ee: 1, oh: 1, blink: 1, happy: 0.8, sad: 0.3 },
    };
    const bajo = adnParaXR(adn, "minima");
    expect(bajo.adn.base.tipo).toBe("orbe");
    expect(bajo.presupuesto.forma).toBe("orbe");
    const medio = adnParaXR(adn, "baja");
    expect(Object.keys(medio.adn.expresionBase).sort()).toEqual(["aa", "blink", "ee", "happy", "ih", "ou"]);
    expect(medio.presupuesto.expresiones).toBe(6);
    const alto = adnParaXR(adn, "maxima");
    expect(alto.adn.base.tipo).toBe("vrm");
    expect(Object.keys(alto.adn.expresionBase)).toHaveLength(8);
  });
});
