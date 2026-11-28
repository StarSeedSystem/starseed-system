import { describe, it, expect } from "vitest";
import {
  AMBITOS_OFERTA,
  ofertaApagada,
  esAmbitoOfertaValido,
  normalizarOferta,
  ofertaVigente,
  capacidadOfertadaMb,
  ofertaPermitidaPara,
  cupoPara,
  anunciarOferta,
  formatearOferta,
  type OfertaCapacidadAlmacen,
  type QuienOferta,
} from "../oferta";
import { crearFichaNodo, type DatosFichaNodo } from "@/lib/network/capacidades-nodo";

const AHORA = 1_700_000_000_000;

const base: OfertaCapacidadAlmacen = {
  nodoId: "nodo-1",
  cuentaId: "cuenta-ana",
  mb: 10_240,
  ambito: "publica",
  activa: true,
  t: AHORA,
};

const ana: QuienOferta = { cuentaId: "cuenta-ana" };
const bea: QuienOferta = { cuentaId: "cuenta-bea" };

describe("oferta de almacenamiento · apagada por defecto", () => {
  it("ofertaApagada no ofrece nada y dice «apagado»", () => {
    const o = ofertaApagada("nodo-1", "cuenta-ana", AHORA);
    expect(o.activa).toBe(false);
    expect(o.mb).toBe(0);
    expect(o.ambito).toBe("privada");
    expect(capacidadOfertadaMb(o, AHORA)).toBe(0);
    expect(formatearOferta(o)).toBe("Almacenamiento: apagado");
  });

  it("esAmbitoOfertaValido reconoce los cuatro ámbitos", () => {
    expect(AMBITOS_OFERTA).toEqual(["privada", "grupo", "comunidad", "publica"]);
    for (const a of AMBITOS_OFERTA) expect(esAmbitoOfertaValido(a)).toBe(true);
    expect(esAmbitoOfertaValido("otro")).toBe(false);
    expect(esAmbitoOfertaValido("")).toBe(false);
    expect(esAmbitoOfertaValido(null)).toBe(false);
  });
});

describe("normalizarOferta · sanea lo que llega de otra neurona", () => {
  it("acepta una oferta válida y la devuelve intacta", () => {
    const o = normalizarOferta({ ...base, grupos: ["g1"], horas: { inicio: 8, fin: 20 }, topeMb: 2048 });
    expect(o).not.toBeNull();
    expect(o?.nodoId).toBe("nodo-1");
    expect(o?.mb).toBe(10_240);
    expect(o?.grupos).toEqual(["g1"]);
    expect(o?.horas).toEqual({ inicio: 8, fin: 20 });
    expect(o?.topeMb).toBe(2048);
    expect(o?.activa).toBe(true);
  });

  it("apaga por defecto si no trae «activa» y pone t a 0 si falta", () => {
    const o = normalizarOferta({ nodoId: "n", cuentaId: "c", mb: 100, ambito: "grupo" });
    expect(o?.activa).toBe(false);
    expect(o?.t).toBe(0);
  });

  it("rechaza lo que no tiene lo esencial", () => {
    expect(normalizarOferta(null)).toBeNull();
    expect(normalizarOferta({ cuentaId: "c", mb: 1, ambito: "publica" })).toBeNull();
    expect(normalizarOferta({ nodoId: "n", mb: 1, ambito: "publica" })).toBeNull();
    expect(normalizarOferta({ nodoId: "n", cuentaId: "c", mb: -1, ambito: "publica" })).toBeNull();
    expect(normalizarOferta({ nodoId: "n", cuentaId: "c", mb: 1, ambito: "inventado" })).toBeNull();
  });

  it("descarta un horario inválido en vez de reventar", () => {
    const o = normalizarOferta({ ...base, horas: { inicio: 20, fin: 8 } });
    expect(o?.horas).toBeUndefined();
  });

  it("anunciarOferta devuelve una oferta sana o la apagada", () => {
    expect(anunciarOferta(base)?.mb).toBe(10_240);
    const rota = anunciarOferta({ ...base, mb: -5 });
    expect(rota.activa).toBe(false);
    expect(rota.mb).toBe(0);
  });
});

describe("ofertaVigente y capacidadOfertadaMb · cuándo", () => {
  it("una oferta encendida sin horario está siempre vigente", () => {
    expect(ofertaVigente(base, AHORA)).toBe(true);
    expect(capacidadOfertadaMb(base, AHORA)).toBe(10_240);
  });

  it("respeta el horario diario con la hora inyectada", () => {
    const o: OfertaCapacidadAlmacen = { ...base, horas: { inicio: 8, fin: 20 } };
    expect(ofertaVigente(o, AHORA, 8)).toBe(true);
    expect(ofertaVigente(o, AHORA, 9)).toBe(true);
    expect(ofertaVigente(o, AHORA, 20)).toBe(false);
    expect(ofertaVigente(o, AHORA, 7)).toBe(false);
    expect(capacidadOfertadaMb(o, AHORA, 21)).toBe(0);
  });

  it("apagada o sin capacidad no ofrece aunque esté en horario", () => {
    expect(ofertaVigente({ ...base, activa: false }, AHORA, 9)).toBe(false);
    expect(ofertaVigente({ ...base, mb: 0 }, AHORA, 9)).toBe(false);
  });
});

describe("ofertaPermitidaPara y cupoPara · a quién y con qué tope", () => {
  it("la pública la ve cualquiera", () => {
    expect(ofertaPermitidaPara(base, bea)).toBe(true);
    expect(cupoPara(base, bea, AHORA)).toBe(10_240);
  });

  it("la privada solo la ve su cuenta", () => {
    const o: OfertaCapacidadAlmacen = { ...base, ambito: "privada" };
    expect(ofertaPermitidaPara(o, ana)).toBe(true);
    expect(ofertaPermitidaPara(o, bea)).toBe(false);
    expect(cupoPara(o, bea, AHORA)).toBe(0);
  });

  it("la de grupo solo la ven sus grupos", () => {
    const o: OfertaCapacidadAlmacen = { ...base, ambito: "grupo", grupos: ["g1", "g2"] };
    expect(ofertaPermitidaPara(o, { cuentaId: "x", grupos: ["g2"] })).toBe(true);
    expect(ofertaPermitidaPara(o, { cuentaId: "x", grupos: ["g3"] })).toBe(false);
    expect(ofertaPermitidaPara(o, { cuentaId: "x" })).toBe(false);
  });

  it("la de comunidad solo la ve su comunidad", () => {
    const o: OfertaCapacidadAlmacen = { ...base, ambito: "comunidad", comunidadId: "com-1" };
    expect(ofertaPermitidaPara(o, { cuentaId: "x", comunidadId: "com-1" })).toBe(true);
    expect(ofertaPermitidaPara(o, { cuentaId: "x", comunidadId: "com-2" })).toBe(false);
  });

  it("el tope por persona recorta el cupo", () => {
    const o: OfertaCapacidadAlmacen = { ...base, topeMb: 2048 };
    expect(cupoPara(o, bea, AHORA)).toBe(2048);
  });
});

describe("formatearOferta · texto de interfaz en español", () => {
  it("muestra GB cuando pasa de 1024 MB", () => {
    expect(formatearOferta(base)).toBe("Almacenamiento: 10 GB · pública");
  });

  it("muestra MB por debajo de 1 GB", () => {
    const o: OfertaCapacidadAlmacen = { ...base, mb: 512, ambito: "privada" };
    expect(formatearOferta(o)).toBe("Almacenamiento: 512 MB · privada");
  });

  it("añade horario y tope cuando existen", () => {
    const o: OfertaCapacidadAlmacen = {
      ...base,
      mb: 1536,
      ambito: "grupo",
      horas: { inicio: 8, fin: 20 },
      topeMb: 512,
    };
    expect(formatearOferta(o)).toBe(
      "Almacenamiento: 1.5 GB · de grupo · 8:00–20:00 · tope 512 MB por persona",
    );
  });
});

describe("integración con la ficha de capacidades de la neurona", () => {
  it("anuncia la oferta de almacenamiento en la ficha", () => {
    const ficha = crearFichaNodo({ nodoId: "nodo-1", medio: "mac", ofertaAlmacen: base });
    expect(ficha.ofertaAlmacen?.mb).toBe(10_240);
    expect(ficha.ofertaAlmacen?.ambito).toBe("publica");
  });

  it("omite la oferta cuando no hay dato", () => {
    const ficha = crearFichaNodo({ nodoId: "nodo-2", medio: "linux" } satisfies DatosFichaNodo);
    expect(ficha.ofertaAlmacen).toBeUndefined();
  });

  it("omite una oferta inválida en vez de anunciarla", () => {
    const ficha = crearFichaNodo({ nodoId: "nodo-3", medio: "nube", ofertaAlmacen: { ...base, mb: -1 } });
    expect(ficha.ofertaAlmacen).toBeUndefined();
  });
});