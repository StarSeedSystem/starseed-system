import { describe, expect, it } from "vitest";
import { decodificarZona, camposDeCapa, contarSenalesSinZona, type Campo } from "../cobertura";
import { CAPA_POR_ID, CAPA_RED_POR_ID } from "../capas";
import type { SenalEspectro } from "../../espectro/tipos";

const AHORA = 1_700_000_000_000;

function publicada(o: Partial<SenalEspectro>): SenalEspectro {
  return {
    id: "s1", medio: "wifi", banda: "2.4 GHz", frecuenciaKhz: 2437000, anchoKhz: 20000, fuerzaDbm: -45,
    calidad: 0.8, origen: "medida", capa: "publica", fuente: "publicada por su dueño", medidoEn: AHORA - 1000,
    zona: "ezs42", compatibles: [], vinculo: { tipo: "neurona", id: "neu-1" }, ...o,
  };
}

describe("decodificarZona: geohash ≤5 caracteres → centro y radio", () => {
  it("geohash válido de 5 caracteres devuelve centro y metros", () => {
    const r = decodificarZona("ezs42");
    expect(r).not.toBeNull();
    expect(r!.lat).toBeGreaterThan(-90);
    expect(r!.lat).toBeLessThan(90);
    expect(r!.lon).toBeGreaterThan(-180);
    expect(r!.lon).toBeLessThan(180);
    expect(r!.metros).toBeGreaterThan(0);
  });
  it("geohash de 1 carácter también funciona", () => {
    const r = decodificarZona("e");
    expect(r).not.toBeNull();
    expect(r!.metros).toBeGreaterThan(100000); // zona muy grande
  });
  it("más de 5 caracteres devuelve null", () => {
    expect(decodificarZona("ezs42a")).toBeNull();
  });
  it("carácter inválido devuelve null", () => {
    expect(decodificarZona("ezs4!")).toBeNull();
  });
  it("cadena vacía devuelve null", () => {
    expect(decodificarZona("")).toBeNull();
  });
});

describe("camposDeCapa con capas red-*: cada señal con zona pinta un campo", () => {
  const marcaId = "neurona:neu-1";
  const marcas: any[] = [{
    id: marcaId, neuronaId: "neu-1", nombre: "Test", esYo: false, forma: "punto",
    estado: "activa", posicion: { tipo: "exacta", lat: 19.43, lon: -99.13, t: AHORA - 1000 },
    calidad: { valor: null, t: null, fuente: "" }, enlace: { estado: "sin-vinculo", latenciaMs: null, t: null },
    antenas: [], capas: { lista: null, t: null, fuente: "" }, hardware: { ramClase: null, backendLocal: null, sirveAstraura: null, fuentesServibles: null, t: null, fuente: "" },
    publicadas: [
      publicada({ id: "m1", capa: "publica", origen: "medida", medidoEn: AHORA - 1000, zona: "ezs42" }),
      publicada({ id: "m2", capa: "publica", origen: "estimada", medidoEn: AHORA - 2000, zona: "ezs43" }),
    ],
  }];

  it("capa red-publica devuelve un campo por señal con zona, con estilo según origen", () => {
    const capa = CAPA_POR_ID["red-publica"];
    const campos = camposDeCapa(capa, marcas, AHORA);
    expect(campos).toHaveLength(2);
    const c1 = campos.find((c) => c.marcaId === "senal:m1")!;
    expect(c1.estilo).toBe("continuo");
    expect(c1.origen).toBe("medida");
    expect(c1.t).toBe(AHORA - 1000);
    expect(c1.texto).toContain("zona aproximada · publicado por su dueño");
    expect(c1.texto).toContain("medida a las");
    const c2 = campos.find((c) => c.marcaId === "senal:m2")!;
    expect(c2.estilo).toBe("rayado");
    expect(c2.origen).toBe("estimada");
    expect(c2.texto).toContain("zona aproximada · publicado por su dueño");
    expect(c2.texto).not.toContain("medida a las");
  });

  it("señal sin zona no produce campo y se cuenta aparte", () => {
    const marcasConSinZona = [{
      ...marcas[0],
      publicadas: [
        publicada({ id: "con-zona", capa: "publica", origen: "medida", zona: "ezs42" }),
        publicada({ id: "sin-zona", capa: "publica", origen: "medida", zona: null }),
        publicada({ id: "zona-vacia", capa: "publica", origen: "medida", zona: "" }),
        publicada({ id: "zona-larga", capa: "publica", origen: "medida", zona: "ezs42abc" }),
      ],
    }];
    const capa = CAPA_POR_ID["red-publica"];
    const campos = camposDeCapa(capa, marcasConSinZona, AHORA);
    expect(campos).toHaveLength(1);
    expect(campos[0].marcaId).toBe("senal:con-zona");
    const sinZona = contarSenalesSinZona(capa, marcasConSinZona);
    expect(sinZona).toBe(3);
  });

  it("dos dueños en la misma zona producen dos campos (se mezclan)", () => {
    const marcasDos = [
      {
        ...marcas[0],
        id: "neurona:neu-1",
        neuronaId: "neu-1",
        publicadas: [publicada({ id: "a1", capa: "publica", origen: "medida", zona: "ezs42" })],
      },
      {
        ...marcas[0],
        id: "neurona:neu-2",
        neuronaId: "neu-2",
        publicadas: [publicada({ id: "b1", capa: "publica", origen: "declarada", zona: "ezs42" })],
      },
    ];
    const capa = CAPA_POR_ID["red-publica"];
    const campos = camposDeCapa(capa, marcasDos, AHORA);
    expect(campos).toHaveLength(2);
    expect(campos.map((c) => c.marcaId).sort()).toEqual(["senal:a1", "senal:b1"]);
    expect(campos[0].lat).toBeCloseTo(campos[1].lat, 4);
    expect(campos[0].lon).toBeCloseTo(campos[1].lon, 4);
  });

  it("lo medido (origen:medida) lleva borde continuo y hora; lo estimado/declarado es rayado", () => {
    const marcasOrigen = [{
      ...marcas[0],
      publicadas: [
        publicada({ id: "med", capa: "publica", origen: "medida", medidoEn: AHORA - 1000, zona: "ezs42" }),
        publicada({ id: "dec", capa: "publica", origen: "declarada", medidoEn: AHORA - 2000, zona: "ezs42" }),
        publicada({ id: "est", capa: "publica", origen: "estimada", medidoEn: AHORA - 3000, zona: "ezs42" }),
      ],
    }];
    const capa = CAPA_POR_ID["red-publica"];
    const campos = camposDeCapa(capa, marcasOrigen, AHORA);
    const cMed = campos.find((c) => c.marcaId === "senal:med")!;
    const cDec = campos.find((c) => c.marcaId === "senal:dec")!;
    const cEst = campos.find((c) => c.marcaId === "senal:est")!;
    expect(cMed.estilo).toBe("continuo");
    expect(cMed.t).toBe(AHORA - 1000);
    expect(cDec.estilo).toBe("rayado");
    expect(cEst.estilo).toBe("rayado");
  });

  it("ninguna entrada ajena produce un marcador puntual (solo campos de zona)", () => {
    const capa = CAPA_POR_ID["red-publica"];
    const campos = camposDeCapa(capa, marcas, AHORA);
    for (const c of campos) {
      expect(c.marcaId).toMatch(/^senal:/);
    }
  });

  it("las cuatro capas red-* funcionan igual", () => {
    for (const id of ["red-publica", "red-comunidad", "red-privada", "red-externa"]) {
      const capa = CAPA_POR_ID[id];
      const marcasCapa = [{
        ...marcas[0],
        publicadas: [publicada({ id: id + "-1", capa: CAPA_RED_POR_ID[id], origen: "medida", zona: "ezs42" })],
      }];
      const campos = camposDeCapa(capa, marcasCapa, AHORA);
      expect(campos).toHaveLength(1);
      expect(campos[0].marcaId).toBe(`senal:${id}-1`);
    }
  });
});

describe("capas de alcance (cobertura-*) siguen funcionando", () => {
  const marcas: any[] = [{
    id: "neurona:yo", neuronaId: "yo", nombre: "Yo", esYo: true, forma: "punto",
    estado: "activa", posicion: { tipo: "exacta", lat: 19.43, lon: -99.13, t: AHORA - 1000 },
    calidad: { valor: null, t: null, fuente: "" }, enlace: { estado: "propio", latenciaMs: null, t: null },
    antenas: [{ kind: "ble", etiqueta: "Bluetooth", valor: "encendido", medida: true, calidad: null, t: AHORA, fuente: "", encendida: true }],
    capas: { lista: null, t: null, fuente: "" }, hardware: { ramClase: null, backendLocal: null, sirveAstraura: null, fuentesServibles: null, t: null, fuente: "" },
  }];

  it("cobertura-ble devuelve campo rayado para neurona con radio encendida y posición viva", () => {
    const capa = CAPA_POR_ID["cobertura-ble"];
    const campos = camposDeCapa(capa, marcas, AHORA);
    expect(campos).toHaveLength(1);
    expect(campos[0].estilo).toBe("rayado");
    expect(campos[0].metros).toBe(10);
  });
});