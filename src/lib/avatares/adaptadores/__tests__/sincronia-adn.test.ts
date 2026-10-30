import { describe, expect, it } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import {
  EVENTO_ADN,
  adnParaNivelXr,
  aplicarEventoAdn,
  crearCacheAdn,
  crearEventoAdn,
  leerAdnUnaVez,
  leerAdnsDePresentes,
  sanearEventoAdn,
} from "@/lib/avatares/adaptadores/sincronia-adn";
import { mismosAvatares, sanearMetaAvatar } from "@/lib/vivo/espacial/avatares";

const REF = "biblioteca:av1";
const adn = (rev = 0): AdnAvatar => ({ ...adnPorDefecto("av1", "Ana", { tipo: "perfil", id: "p1" }), rev });

describe("caché de ADN por ref+rev", () => {
  it("lee una sola vez por revisión y comparte la lectura simultánea", async () => {
    const cache = crearCacheAdn();
    let llamadas = 0;
    const cargar = async () => {
      llamadas += 1;
      return adn(3);
    };
    const [a, b] = await Promise.all([
      leerAdnUnaVez(cache, REF, 3, cargar),
      leerAdnUnaVez(cache, REF, 3, cargar),
    ]);
    expect([a?.rev, b?.rev]).toEqual([3, 3]);
    expect(llamadas).toBe(1);
    await leerAdnUnaVez(cache, REF, 3, cargar);
    expect(llamadas).toBe(1);
  });

  it("una revisión nueva se vuelve a leer", async () => {
    const cache = crearCacheAdn();
    const vistas: number[] = [];
    const cargar = async (_ref: string, rev: number) => {
      vistas.push(rev);
      return adn(rev);
    };
    await leerAdnUnaVez(cache, REF, 1, cargar);
    await leerAdnUnaVez(cache, REF, 2, cargar);
    expect(vistas).toEqual([1, 2]);
  });

  it("sin ref o con una lectura rota devuelve null sin lanzar", async () => {
    const cache = crearCacheAdn();
    expect(await leerAdnUnaVez(cache, "", 1, async () => adn(1))).toBeNull();
    expect(await leerAdnUnaVez(cache, REF, 1, async () => {
      throw new Error("sin almacén");
    })).toBeNull();
  });

  it("lee el ADN de cada presente una vez y omite a quien no manda ref", async () => {
    const cache = crearCacheAdn();
    const pedidas: string[] = [];
    const cargar = async (ref: string, rev: number) => {
      pedidas.push(`${ref}@${rev}`);
      return { ...adn(rev), id: ref.slice("biblioteca:".length) };
    };
    const mapa = await leerAdnsDePresentes(cache, [
      { adnRef: REF, adnRev: 2 },
      { adnRef: REF, adnRev: 2 },
      { adnRef: "biblioteca:av2", adnRev: 1 },
      {},
    ], cargar);
    expect(pedidas.sort()).toEqual(["biblioteca:av1@2", "biblioteca:av2@1"]);
    expect([...mapa.keys()].sort()).toEqual(["biblioteca:av1", "biblioteca:av2"]);
  });
});

describe("evento adn del canal de la escena", () => {
  it("se llama adn", () => {
    expect(EVENTO_ADN).toBe("adn");
  });

  it("crearEventoAdn filtra con sanearCambio y agrupa por clave", () => {
    const ev = crearEventoAdn(REF, 4, [
      { op: "morfologia", clave: "altura", valor: 0.2 },
      { op: "morfologia", clave: "altura", valor: 0.8 },
      { op: "inventado", x: 1 },
    ]);
    expect(ev?.ref).toBe(REF);
    expect(ev?.rev).toBe(4);
    expect(ev?.cambios).toEqual([{ op: "morfologia", clave: "altura", valor: 0.8 }]);
  });

  it("sin cambios válidos, con ref externa o revisión negativa no hay evento", () => {
    expect(crearEventoAdn(REF, 1, [{ op: "nada" }])).toBeNull();
    expect(crearEventoAdn("https://malo/x", 1, [{ op: "nombre", valor: "Ana" }])).toBeNull();
    expect(crearEventoAdn(REF, -1, [{ op: "nombre", valor: "Ana" }])).toBeNull();
    expect(sanearEventoAdn({ ref: REF, rev: 1, cambios: [] })).toBeNull();
  });

  it("aplicarEventoAdn solo aplica revisiones más nuevas y del mismo ref", () => {
    const base = adn(2);
    const ev = { ref: REF, rev: 5, cambios: [{ op: "morfologia", clave: "altura", valor: 0.9 }] };
    const r = aplicarEventoAdn(base, ev);
    expect(r.aplicado).toBe(true);
    expect(r.adn.rev).toBe(5);
    expect(r.adn.morfologia.altura).toBe(0.9);
    expect(aplicarEventoAdn(r.adn, ev).motivo).toBe("revision-vieja");
    expect(aplicarEventoAdn(base, { ...ev, rev: 6, ref: "biblioteca:otro" }).motivo).toBe("ref-distinta");
    expect(aplicarEventoAdn(base, { ...ev, rev: 3 }).motivo).toBeNull();
    expect(aplicarEventoAdn(base, { ...ev, rev: 1 }).motivo).toBe("revision-vieja");
  });

  it("un evento con cambios basura no toca el ADN", () => {
    const base = adn(1);
    const r = aplicarEventoAdn(base, {
      ref: REF,
      rev: 2,
      cambios: [{ op: "material", slot: "piel", campo: "color", valor: "no-color" }],
    });
    expect(r.aplicado).toBe(false);
    expect(r.adn).toBe(base);
  });
});

describe("nivel de avatar en XR", () => {
  const vestido = (): AdnAvatar => ({
    ...adn(0),
    base: { tipo: "vrm", ref: "biblioteca:av/ana.vrm" },
    esqueleto: { tipo: "vrm-humanoide", articulaciones: 55 },
    piezas: [
      { slot: "cabeza", ref: "biblioteca:p/cabeza" },
      { slot: "cabello", ref: "biblioteca:p/cabello" },
    ],
    expresionBase: { aa: 0.2, happy: 0.5 },
  });

  it("sale de la calidad actual y recorta con adnParaCalidad", () => {
    const min = adnParaNivelXr(vestido(), "minima");
    expect(min.calidad).toBe("orbe-manos");
    expect(min.adn.base.tipo).toBe("orbe");
    expect(min.adn.piezas).toEqual([]);

    const media = adnParaNivelXr(vestido(), "media");
    expect(media.calidad).toBe("vrm-ligero");
    expect(media.adn.piezas).toHaveLength(2);

    const max = adnParaNivelXr(vestido(), "maxima");
    expect(max.calidad).toBe("vrm-completo");
    expect(max.adn).toEqual(vestido());
  });
});

describe("MetaAvatar · ADN opcional", () => {
  it("conserva adnRef y adnRev válidos", () => {
    const m = sanearMetaAvatar({ nombre: "Ana", adnRef: REF, adnRev: 3.9 }, "ana:1");
    expect(m?.adnRef).toBe(REF);
    expect(m?.adnRev).toBe(3);
  });

  it("quien no los manda sigue igual", () => {
    const m = sanearMetaAvatar({ nombre: "Ana" }, "ana:1");
    expect(m?.adnRef).toBeUndefined();
    expect(m?.adnRev).toBeUndefined();
  });

  it("descarta refs externas y revisiones sin ref", () => {
    expect(sanearMetaAvatar({ adnRef: "https://x/y" }, "a")?.adnRef).toBeUndefined();
    const m = sanearMetaAvatar({ adnRev: 4 }, "a");
    expect(m?.adnRef).toBeUndefined();
    expect(m?.adnRev).toBeUndefined();
  });

  it("mismosAvatares nota un cambio de ADN o de revisión", () => {
    const a = sanearMetaAvatar({ adnRef: REF, adnRev: 1 }, "ana:1")!;
    const b = sanearMetaAvatar({ adnRef: REF, adnRev: 2 }, "ana:1")!;
    expect(mismosAvatares([a], [a])).toBe(true);
    expect(mismosAvatares([a], [b])).toBe(false);
  });
});



