import { describe, it, expect } from "vitest";
import {
  bytesEfectivos,
  crearOfertaApagada,
  describirOferta,
  disponibleAhora,
  fichaOfertaCompacta,
  formatearBytes,
  nivelCompartir,
  normalizarOfertaAlmacen,
  type OfertaAlmacenSenal,
} from "../oferta";
import { crearFichaNodo, fichaCompacta } from "@/lib/network/capacidades-nodo";

const GB = 1024 * 1024 * 1024;

const activa = (o: Partial<OfertaAlmacenSenal> = {}): OfertaAlmacenSenal => ({
  almacenId: "vol-abc",
  nodoId: "neurona-1",
  activa: true,
  bytesOfrecidos: 50 * GB,
  topeBytes: 100 * GB,
  destino: "comunidad",
  cuando: "siempre",
  ...o,
});

describe("crearOfertaApagada", () => {
  it("nace apagada, privada, a mano y sin bytes", () => {
    const o = crearOfertaApagada("neurona-1", "vol-abc");
    expect(o).toEqual({
      almacenId: "vol-abc",
      nodoId: "neurona-1",
      activa: false,
      bytesOfrecidos: 0,
      topeBytes: 0,
      destino: "privada",
      cuando: "a-mano",
    });
    expect(bytesEfectivos(o)).toBe(0);
  });
});

describe("normalizarOfertaAlmacen", () => {
  it("descarta lo que no tiene identidad de almacén y neurona", () => {
    expect(normalizarOfertaAlmacen(null)).toBeUndefined();
    expect(normalizarOfertaAlmacen("x")).toBeUndefined();
    expect(normalizarOfertaAlmacen({ nodoId: "n1" })).toBeUndefined();
    expect(normalizarOfertaAlmacen({ almacenId: "v1" })).toBeUndefined();
    expect(normalizarOfertaAlmacen({ almacenId: "  ", nodoId: "n1" })).toBeUndefined();
  });

  it("solo enciende con un true explícito (apagada por defecto)", () => {
    const base = { almacenId: "v1", nodoId: "n1", bytesOfrecidos: 10, topeBytes: 10 };
    expect(normalizarOfertaAlmacen(base)?.activa).toBe(false);
    expect(normalizarOfertaAlmacen({ ...base, activa: "sí" })?.activa).toBe(false);
    expect(normalizarOfertaAlmacen({ ...base, activa: 1 })?.activa).toBe(false);
    expect(normalizarOfertaAlmacen({ ...base, activa: true })?.activa).toBe(true);
  });

  it("recorta los bytes al tope y nunca acepta negativos", () => {
    const o = normalizarOfertaAlmacen({
      almacenId: "v1", nodoId: "n1", activa: true,
      bytesOfrecidos: 500, topeBytes: 100,
    });
    expect(o?.bytesOfrecidos).toBe(100);
    expect(o?.topeBytes).toBe(100);

    const neg = normalizarOfertaAlmacen({
      almacenId: "v1", nodoId: "n1", bytesOfrecidos: -5, topeBytes: -1,
    });
    expect(neg?.bytesOfrecidos).toBe(0);
    expect(neg?.topeBytes).toBe(0);
  });

  it("lo dudoso cae al lado seguro: privada y a mano", () => {
    const o = normalizarOfertaAlmacen({
      almacenId: "v1", nodoId: "n1", destino: "planeta", cuando: "cuando-sea",
    });
    expect(o?.destino).toBe("privada");
    expect(o?.cuando).toBe("a-mano");
  });

  it("conserva una franja válida y descarta la inválida", () => {
    const buena = normalizarOfertaAlmacen({
      almacenId: "v1", nodoId: "n1", cuando: "programada",
      franja: { desde: 22, hasta: 6 },
    });
    expect(buena?.franja).toEqual({ desde: 22, hasta: 6 });

    const mala = normalizarOfertaAlmacen({
      almacenId: "v1", nodoId: "n1", cuando: "programada",
      franja: { desde: 30, hasta: 6 },
    });
    expect(mala?.franja).toBeUndefined();
  });
});

describe("bytesEfectivos", () => {
  it("apagada no cede nada, aunque declare bytes", () => {
    expect(bytesEfectivos(activa({ activa: false }))).toBe(0);
  });

  it("nunca supera el tope", () => {
    expect(bytesEfectivos(activa({ bytesOfrecidos: 500 * GB, topeBytes: 80 * GB }))).toBe(80 * GB);
    expect(bytesEfectivos(activa({ bytesOfrecidos: 30 * GB, topeBytes: 80 * GB }))).toBe(30 * GB);
  });
});

describe("disponibleAhora", () => {
  const ctx = { hora: 12, conectada: true };

  it("apagada o sin bytes nunca aplica", () => {
    expect(disponibleAhora(activa({ activa: false }), ctx)).toBe(false);
    expect(disponibleAhora(activa({ bytesOfrecidos: 0 }), ctx)).toBe(false);
  });

  it("siempre aplica si está encendida", () => {
    expect(disponibleAhora(activa({ cuando: "siempre" }), ctx)).toBe(true);
  });

  it("al-conectar exige conexión", () => {
    const o = activa({ cuando: "al-conectar" });
    expect(disponibleAhora(o, { hora: 12, conectada: true })).toBe(true);
    expect(disponibleAhora(o, { hora: 12, conectada: false })).toBe(false);
  });

  it("a-mano no se anuncia solo", () => {
    expect(disponibleAhora(activa({ cuando: "a-mano" }), ctx)).toBe(false);
  });

  it("programada respeta la franja, incluso cruzando la medianoche", () => {
    const o = activa({ cuando: "programada", franja: { desde: 22, hasta: 6 } });
    expect(disponibleAhora(o, { hora: 23, conectada: true })).toBe(true);
    expect(disponibleAhora(o, { hora: 3, conectada: true })).toBe(true);
    expect(disponibleAhora(o, { hora: 12, conectada: true })).toBe(false);
  });

  it("programada sin franja no aplica", () => {
    expect(disponibleAhora(activa({ cuando: "programada" }), ctx)).toBe(false);
  });
});

describe("nivelCompartir", () => {
  it("reutiliza los niveles del internet compartido", () => {
    expect(nivelCompartir("privada")).toBe("mi-cuenta");
    expect(nivelCompartir("grupo")).toBe("grupo");
    expect(nivelCompartir("comunidad")).toBe("vinculos");
    expect(nivelCompartir("publica")).toBe("publico");
  });
});

describe("formatearBytes", () => {
  it("usa unidades legibles en español", () => {
    expect(formatearBytes(0)).toBe("0 B");
    expect(formatearBytes(1024)).toBe("1 KB");
    expect(formatearBytes(1536)).toBe("1.5 KB");
    expect(formatearBytes(50 * GB)).toBe("50 GB");
  });
});

describe("describirOferta", () => {
  it("describe una oferta encendida con destino y cuándo", () => {
    const texto = describirOferta(activa());
    expect(texto).toContain("50 GB");
    expect(texto).toContain("mi comunidad");
    expect(texto).toContain("siempre");
  });

  it("avisa cuando está apagada", () => {
    expect(describirOferta(activa({ activa: false }))).toBe(
      "Almacenamiento apagado: no se cede capacidad.",
    );
  });

  it("avisa cuando está encendida pero sin capacidad cedible", () => {
    expect(describirOferta(activa({ bytesOfrecidos: 0 }))).toBe(
      "Almacenamiento activo, pero sin capacidad cedible.",
    );
  });
});

describe("fichaOfertaCompacta", () => {
  it("no ensucia la ficha cuando no hay nada que anunciar", () => {
    expect(fichaOfertaCompacta(activa({ activa: false }))).toBe("");
    expect(fichaOfertaCompacta(activa({ bytesOfrecidos: 0 }))).toBe("");
  });

  it("codifica destino y GB efectivos", () => {
    expect(fichaOfertaCompacta(activa())).toBe("oc50");
    expect(fichaOfertaCompacta(activa({ destino: "privada", bytesOfrecidos: 10 * GB }))).toBe("op10");
    expect(fichaOfertaCompacta(activa({ destino: "publica", bytesOfrecidos: 500 * GB, topeBytes: 80 * GB }))).toBe("ou80");
  });
});

describe("capacidades-nodo · oferta de almacenamiento como señal de capa", () => {
  it("crearFichaNodo normaliza e incluye la oferta", () => {
    const ficha = crearFichaNodo({
      nodoId: "neurona-1",
      medio: "linux",
      ofertaAlmacen: activa({ almacenId: "vol-abc" }),
    });
    expect(ficha.ofertaAlmacen?.almacenId).toBe("vol-abc");
    expect(ficha.ofertaAlmacen?.destino).toBe("comunidad");
    expect(ficha.ofertaAlmacen?.activa).toBe(true);
  });

  it("sin oferta, la ficha la omite (apagada por defecto)", () => {
    const ficha = crearFichaNodo({ nodoId: "neurona-1", medio: "linux" });
    expect(ficha.ofertaAlmacen).toBeUndefined();
  });

  it("fichaCompacta anuncia el token de la oferta y usa o- si está apagada", () => {
    const conOferta = crearFichaNodo({
      nodoId: "neurona-1", medio: "linux", ofertaAlmacen: activa(),
    });
    expect(fichaCompacta(conOferta)).toContain("oc50");

    const apagada = crearFichaNodo({
      nodoId: "neurona-1", medio: "linux", ofertaAlmacen: activa({ activa: false }),
    });
    expect(fichaCompacta(apagada)).toContain("|o-");
  });
});
