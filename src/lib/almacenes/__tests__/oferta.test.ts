/**
 * oferta.ts — la capacidad de almacenamiento como señal de capa (ALC1125F).
 *
 * Pruebas de funciones puras: saneado, visibilidad por audiencia, capacidad
 * realmente prestable ahora (cuánto, a quién, cuándo y con qué tope) y el
 * anuncio que viaja en la ficha de la neurona. Sin red, sin disco, sin relojes.
 */
import { describe, it, expect } from "vitest";
import {
  AUDIENCIAS_ALMACEN,
  OFERTA_ALMACEN_POR_DEFECTO,
  anuncioOfertaAlmacen,
  capacidadAlmacenPrestable,
  etiquetaAudiencia,
  ofertaAlmacenVisiblePara,
  sanearOfertaAlmacen,
  type OfertaAlmacen,
} from "../oferta";
import { crearFichaNodo } from "@/lib/network/capacidades-nodo";

/** Oferta encendida y válida para probar cada costura por separado. */
function ofertaBase(extra: Partial<OfertaAlmacen> = {}): OfertaAlmacen {
  return {
    ...OFERTA_ALMACEN_POR_DEFECTO,
    cuentaId: "cuenta-a",
    activa: true,
    ofrecerMb: 1000,
    audiencias: ["privada"],
    ...extra,
  };
}

describe("OfertaAlmacen por defecto y saneado", () => {
  it("nace apagada y sin capacidad: nadie ofrece nada sin encenderla", () => {
    expect(OFERTA_ALMACEN_POR_DEFECTO.activa).toBe(false);
    expect(OFERTA_ALMACEN_POR_DEFECTO.ofrecerMb).toBe(0);
    expect(OFERTA_ALMACEN_POR_DEFECTO.audiencias).toEqual([]);
    expect(OFERTA_ALMACEN_POR_DEFECTO.topes.soloCargando).toBe(true);
    expect(AUDIENCIAS_ALMACEN).toEqual(["privada", "grupo", "comunidad", "publica"]);
  });

  it("un valor nulo o ajeno vuelve a los valores por defecto sin lanzar", () => {
    expect(sanearOfertaAlmacen(null)).toEqual(OFERTA_ALMACEN_POR_DEFECTO);
    expect(sanearOfertaAlmacen(42)).toEqual(OFERTA_ALMACEN_POR_DEFECTO);
    expect(() => sanearOfertaAlmacen({ topes: "roto" })).not.toThrow();
  });

  it("descarta basura: activa solo con true, audiencias válidas y topes acotados", () => {
    const o = sanearOfertaAlmacen({
      activa: "sí",
      ofrecerMb: -5,
      audiencias: ["publica", "inventada", "publica"],
      topes: { maxMb: -1, reservaBateriaPct: 250 },
    });
    expect(o.activa).toBe(false);
    expect(o.ofrecerMb).toBe(0);
    expect(o.audiencias).toEqual(["publica"]);
    expect(o.topes.maxMb).toBe(0);
    expect(o.topes.reservaBateriaPct).toBe(100);
    expect(o.topes.soloCargando).toBe(true);
  });

  it("normaliza números, listas y ventanas con acentos y espacios", () => {
    const o = sanearOfertaAlmacen({
      cuentaId: " cuenta-a ",
      activa: true,
      ofrecerMb: 2048.7,
      audiencias: ["grupo"],
      grupos: [" g1 ", "g1", 5],
      ventanas: [{ desdeHora: 22, hastaHora: 6 }, { desdeHora: -1, hastaHora: 99 }],
      volumenes: ["vol-1", ""],
    });
    expect(o.cuentaId).toBe("cuenta-a");
    expect(o.ofrecerMb).toBe(2049);
    expect(o.grupos).toEqual(["g1"]);
    expect(o.ventanas).toEqual([{ desdeHora: 22, hastaHora: 6 }]);
    expect(o.volumenes).toEqual(["vol-1"]);
  });
});

describe("ofertaAlmacenVisiblePara · a quién se ofrece", () => {
  it("privada solo la ve la propia cuenta", () => {
    const o = ofertaBase({ audiencias: ["privada"] });
    expect(ofertaAlmacenVisiblePara(o, { cuentaId: "cuenta-a" })).toBe(true);
    expect(ofertaAlmacenVisiblePara(o, { cuentaId: "cuenta-b" })).toBe(false);
    expect(ofertaAlmacenVisiblePara(o, { cuentaId: "" })).toBe(false);
  });

  it("pública la ve cualquiera, aunque no comparta cuenta", () => {
    const o = ofertaBase({ audiencias: ["publica"] });
    expect(ofertaAlmacenVisiblePara(o, { cuentaId: "cuenta-b" })).toBe(true);
  });

  it("grupo y comunidad exigen coincidencia real de sus identificadores", () => {
    const o = sanearOfertaAlmacen(ofertaBase({
      audiencias: ["grupo", "comunidad"],
      grupos: ["g1"],
      comunidades: ["c1"],
    }));
    expect(ofertaAlmacenVisiblePara(o, { cuentaId: "otra", grupos: ["g1"] })).toBe(true);
    expect(ofertaAlmacenVisiblePara(o, { cuentaId: "otra", comunidades: ["c1"] })).toBe(true);
    expect(ofertaAlmacenVisiblePara(o, { cuentaId: "otra", grupos: ["g2"] })).toBe(false);
  });

  it("apagada o sin audiencia no es visible para nadie", () => {
    expect(ofertaAlmacenVisiblePara(ofertaBase({ activa: false, audiencias: ["publica"] }), { cuentaId: "x" })).toBe(false);
    expect(ofertaAlmacenVisiblePara(ofertaBase({ audiencias: [] }), { cuentaId: "cuenta-a" })).toBe(false);
  });
});

describe("capacidadAlmacenPrestable · cuánto y cuándo, con tope", () => {
  it("apagada no presta nada y lo explica", () => {
    const r = capacidadAlmacenPrestable(ofertaBase({ activa: false }), { hora: 12, cargando: true, libreMb: 8000 });
    expect(r.disponible).toBe(false);
    expect(r.prestaMb).toBe(0);
    expect(r.motivo).toContain("apagada");
  });

  it("presta el mínimo entre lo ofrecido, el tope y el espacio libre medido", () => {
    const r = capacidadAlmacenPrestable(
      ofertaBase({ ofrecerMb: 5000, topes: { maxMb: 2000, soloCargando: false, reservaBateriaPct: 30 } }),
      { hora: 12, libreMb: 8000 },
    );
    expect(r).toMatchObject({ disponible: true, prestaMb: 2000 });
    const porLibre = capacidadAlmacenPrestable(
      ofertaBase({ ofrecerMb: 5000, topes: { maxMb: 0, soloCargando: false, reservaBateriaPct: 0 } }),
      { hora: 12, libreMb: 1000 },
    );
    expect(porLibre.prestaMb).toBe(1000);
  });

  it("sin tope explícito (maxMb 0) el tope es lo ofrecido", () => {
    const r = capacidadAlmacenPrestable(ofertaBase({ ofrecerMb: 2000, topes: { maxMb: 0, soloCargando: false, reservaBateriaPct: 0 } }), { hora: 12, libreMb: 8000 });
    expect(r.prestaMb).toBe(2000);
  });

  it("respeta las ventanas horarias, también las que cruzan medianoche", () => {
    const noche = ofertaBase({ ventanas: [{ desdeHora: 22, hastaHora: 6 }] });
    expect(capacidadAlmacenPrestable(noche, { hora: 23, libreMb: 8000, cargando: true }).disponible).toBe(true);
    expect(capacidadAlmacenPrestable(noche, { hora: 2, libreMb: 8000, cargando: true }).disponible).toBe(true);
    expect(capacidadAlmacenPrestable(noche, { hora: 12, libreMb: 8000, cargando: true }).disponible).toBe(false);
  });

  it("la batería y el modo solo-cargando frenan la oferta", () => {
    const baja = capacidadAlmacenPrestable(
      ofertaBase({ topes: { maxMb: 0, soloCargando: false, reservaBateriaPct: 30 } }),
      { hora: 12, libreMb: 8000, bateriaPct: 10, cargando: false },
    );
    expect(baja.disponible).toBe(false);
    expect(baja.motivo).toContain("Batería");
    const soloCarga = capacidadAlmacenPrestable(
      ofertaBase({ topes: { maxMb: 0, soloCargando: true, reservaBateriaPct: 0 } }),
      { hora: 12, libreMb: 8000, cargando: false },
    );
    expect(soloCarga.disponible).toBe(false);
  });

  it("sin medida de espacio libre no se inventa capacidad", () => {
    const r = capacidadAlmacenPrestable(
      ofertaBase({ topes: { maxMb: 0, soloCargando: false, reservaBateriaPct: 0 } }),
      { hora: 12, libreMb: null },
    );
    expect(r).toMatchObject({ disponible: false, prestaMb: 0 });
    expect(r.motivo.toLowerCase()).toContain("sin medida");
  });

  it("descuenta lo ya comprometido del espacio libre", () => {
    const r = capacidadAlmacenPrestable(
      ofertaBase({ ofrecerMb: 2000, topes: { maxMb: 0, soloCargando: false, reservaBateriaPct: 0 } }),
      { hora: 12, libreMb: 5000, comprometidoMb: 4500 },
    );
    expect(r.prestaMb).toBe(500);
  });
});

describe("anuncioOfertaAlmacen · lo que viaja en la ficha", () => {
  it("apagada no se anuncia", () => {
    expect(anuncioOfertaAlmacen(ofertaBase({ activa: false }))).toBeUndefined();
    expect(anuncioOfertaAlmacen(ofertaBase({ ofrecerMb: 0 }))).toBeUndefined();
    expect(anuncioOfertaAlmacen(ofertaBase({ audiencias: [] }))).toBeUndefined();
  });

  it("encendida anuncia cuánto, a quién y el tope, sin listas privadas", () => {
    const anuncio = anuncioOfertaAlmacen(sanearOfertaAlmacen(ofertaBase({
      ofrecerMb: 4096,
      audiencias: ["publica"],
      grupos: ["g1"],
      volumenes: ["vol-1"],
      topes: { maxMb: 2048, soloCargando: false, reservaBateriaPct: 20 },
    })));
    expect(anuncio).toEqual({
      activa: true,
      ofrecerMb: 4096,
      audiencias: ["publica"],
      maxMb: 2048,
      volumenes: ["vol-1"],
    });
    expect(anuncio && "grupos" in anuncio).toBe(false);
    expect(anuncio && "ventanas" in anuncio).toBe(false);
  });
});

describe("crearFichaNodo · la oferta se anuncia como una capacidad más", () => {
  it("lleva el anuncio cuando está encendida", () => {
    const ficha = crearFichaNodo({
      nodoId: "nodo-almacen",
      medio: "linux",
      almacenOferta: ofertaBase({ ofrecerMb: 4096, volumenes: ["vol-1"] }),
    });
    expect(ficha.almacenOferta).toEqual({
      activa: true,
      ofrecerMb: 4096,
      audiencias: ["privada"],
      maxMb: 0,
      volumenes: ["vol-1"],
    });
  });

  it("sin oferta o apagada, la ficha no anuncia nada (compatibilidad hacia atrás)", () => {
    expect(crearFichaNodo({ nodoId: "n1", medio: "mac" }).almacenOferta).toBeUndefined();
    const apagada = crearFichaNodo({ nodoId: "n2", medio: "mac", almacenOferta: ofertaBase({ activa: false }) });
    expect(apagada.almacenOferta).toBeUndefined();
  });
});

describe("etiquetaAudiencia · textos de interfaz en español", () => {
  it("nombra cada audiencia con su contexto", () => {
    expect(etiquetaAudiencia("privada")).toBe("Mi cuenta");
    expect(etiquetaAudiencia("publica")).toBe("Público");
  });
});
