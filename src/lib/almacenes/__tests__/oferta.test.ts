import { describe, it, expect } from "vitest";
import {
  crearOfertaAlmacen,
  normalizarOfertaAlmacen,
  ofertaVigente,
  disponibleBytes,
  puedeServirOferta,
  etiquetaAmbito,
  type OfertaCapacidadAlmacen,
} from "../oferta";
import { crearFichaNodo, fichaCompacta, resumenRed } from "@/lib/network/capacidades-nodo";

const AHORA = 1_000_000;
const base = { cuentaId: "cuenta-1", activa: true, bytesOfrecidos: 50_000_000_000 };
const of = (p: Partial<OfertaCapacidadAlmacen> = {}) => crearOfertaAlmacen({ ...base, ...p });

describe("oferta de almacenamiento · apagada por defecto", () => {
  it("nace apagada, privada y sin capacidad", () => {
    const o = crearOfertaAlmacen();
    expect(o.activa).toBe(false);
    expect(o.ambito).toBe("privada");
    expect(o.bytesOfrecidos).toBe(0);
    expect(o.topeBytes).toBe(0);
    expect(o.cuando).toBe("siempre");
  });

  it("no se enciende sin dueño ni sin bytes", () => {
    expect(crearOfertaAlmacen({ activa: true, bytesOfrecidos: 10 }).activa).toBe(false);
    expect(crearOfertaAlmacen({ activa: true, cuentaId: "c1" }).activa).toBe(false);
    expect(of().activa).toBe(true);
  });

  it("recorta lo ofrecido al tope y sanea números", () => {
    const o = of({ bytesOfrecidos: 100, topeBytes: 60 });
    expect([o.bytesOfrecidos, o.topeBytes]).toEqual([60, 60]);
    const raro = of({ bytesOfrecidos: -5, topeBytes: Number.NaN });
    expect([raro.bytesOfrecidos, raro.topeBytes, raro.activa]).toEqual([0, 0, false]);
  });

  it("nunca amplía el público sin identificador", () => {
    expect(of({ ambito: "grupo" }).ambito).toBe("privada");
    expect(of({ ambito: "comunidad" }).ambito).toBe("privada");
    expect(of({ ambito: "grupo", grupoId: "g1" }).ambito).toBe("grupo");
  });
});

describe("oferta · cuándo vale y cuánto queda", () => {
  it("siempre vale mientras esté activa", () => {
    expect(ofertaVigente(of(), AHORA)).toBe(true);
    expect(ofertaVigente(of({ activa: false }), AHORA)).toBe(false);
  });

  it("la ventana respeta sus límites y sin fechas no vale", () => {
    const o = of({ cuando: "ventana", desdeMs: 100, hastaMs: 200 });
    expect([ofertaVigente(o, 99), ofertaVigente(o, 100), ofertaVigente(o, 200), ofertaVigente(o, 201)])
      .toEqual([false, true, true, false]);
    expect(ofertaVigente(of({ cuando: "ventana" }), AHORA)).toBe(false);
  });

  it("el disponible descuenta lo usado y nunca es negativo", () => {
    const o = of({ bytesOfrecidos: 100, topeBytes: 80 });
    expect([disponibleBytes(o), disponibleBytes(o, 30), disponibleBytes(o, 999)]).toEqual([80, 50, 0]);
    expect(disponibleBytes(of({ activa: false }))).toBe(0);
  });
});

describe("oferta · a quién sirve", () => {
  it("el dueño siempre puede usar la suya", () => {
    expect(puedeServirOferta(of({ ambito: "publica" }), { cuentaId: "cuenta-1" })).toBe(true);
  });

  it("privada solo a la misma cuenta", () => {
    expect(puedeServirOferta(of(), { cuentaId: "otra" })).toBe(false);
    expect(puedeServirOferta(of(), { cuentaId: "cuenta-1" })).toBe(true);
  });

  it("grupo y comunidad exigen pertenencia", () => {
    const g = of({ ambito: "grupo", grupoId: "g1" });
    expect([puedeServirOferta(g, { cuentaId: "x", grupos: ["g1"] }), puedeServirOferta(g, { cuentaId: "x", grupos: ["g2"] })])
      .toEqual([true, false]);
    const c = of({ ambito: "comunidad", comunidadId: "c1" });
    expect([puedeServirOferta(c, { cuentaId: "x", comunidades: ["c1"] }), puedeServirOferta(c, { cuentaId: "x" })])
      .toEqual([true, false]);
  });

  it("pública sirve a cualquiera, salvo agotada", () => {
    const p = of({ ambito: "publica", bytesOfrecidos: 10, topeBytes: 10 });
    expect(puedeServirOferta(p, { cuentaId: "quien-sea" })).toBe(true);
    expect(puedeServirOferta(p, { cuentaId: "quien-sea" }, { usoBytes: 10 })).toBe(false);
  });

  it("etiqueta en español para la interfaz", () => {
    expect(etiquetaAmbito("privada")).toContain("Privada");
    expect([etiquetaAmbito("grupo"), etiquetaAmbito("comunidad"), etiquetaAmbito("publica")])
      .toEqual(["Grupo", "Comunidad", "Pública"]);
  });
});

describe("oferta · se anuncia como las demás capacidades", () => {
  it("sin oferta activa no hay campo; con ella viaja normalizada", () => {
    expect("ofertaAlmacen" in crearFichaNodo({ nodoId: "n1", medio: "mac" })).toBe(false);
    const ficha = crearFichaNodo({ nodoId: "n1", medio: "mac", ofertaAlmacen: of({ ambito: "publica" }) });
    expect([ficha.ofertaAlmacen?.ambito, ficha.ofertaAlmacen?.activa]).toEqual(["publica", true]);
    expect(normalizarOfertaAlmacen(ficha.ofertaAlmacen)?.bytesOfrecidos).toBe(50_000_000_000);
    expect(resumenRed([ficha]).conAlmacen).toBe(1);
  });

  it("la apagada o la basura no se anuncia", () => {
    expect("ofertaAlmacen" in crearFichaNodo({ nodoId: "n2", medio: "linux", ofertaAlmacen: crearOfertaAlmacen() })).toBe(false);
    expect(normalizarOfertaAlmacen({ activa: true, cuentaId: "c", ambito: "inventado", bytesOfrecidos: 5 })).toBeUndefined();
  });

  it("la línea LoRa lleva la oferta activa sin pasar de 200 bytes", () => {
    const linea = fichaCompacta(crearFichaNodo({ nodoId: "nodo-mac", medio: "mac", ofertaAlmacen: of({ ambito: "grupo", grupoId: "g1" }) }));
    expect(linea).toContain("|og");
    expect(new TextEncoder().encode(linea).length).toBeLessThanOrEqual(200);
  });
});
