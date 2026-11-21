import { describe, expect, it } from "vitest";
import { CAPA_POR_ID } from "../capas";
import { camposDeCapa, contarSenalesSinZona, decodificarZona } from "../cobertura";
import { construirMarcas } from "../marcas";
import type { SenalEspectro } from "../../espectro/tipos";

const AHORA = 1_700_000_000_000;
const ZONA = "9g3q";

/** Señal publicada de prueba, con capa, origen y vínculo a la carta. */
function publicada(o: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id: "s1", medio: "wifi", banda: "2.4 GHz", frecuenciaKhz: 2437000, anchoKhz: 20000, fuerzaDbm: -45,
    calidad: 0.8, origen: "medida", capa: "publica", fuente: "publicada por su dueño", medidoEn: AHORA - 1000,
    zona: ZONA, compatibles: [], vinculo: { tipo: "neurona", id: "neu-1" }, ...o,
  };
}

/** Marcas reales (construirMarcas) con las señales publicadas ya repartidas por su vínculo. */
function marcasCon(publicadas: SenalEspectro[]) {
  const fila = { neuronId: "neu-1", nombre: "Norte", plataforma: "Android", tipo: "mobile", online: true, esEsteDispositivo: false, enlace: { estado: "sin-vinculo" } } as never;
  return construirMarcas({
    filas: [fila], medios: [], ahora: AHORA,
    yo: { neuronaId: "yo", nombre: "Yo", capas: null, senales: null, posicion: { lat: 40.4168, lon: -3.7038, precisionM: 5, t: AHORA - 5000 } },
    posiciones: { "neu-1": { lat: 40.4168, lon: -3.7038, t: AHORA - 4000 } },
    canal: { unido: true, motivo: null },
    publicadas,
  });
}

describe("zonas de red: el mapa dibuja celdas, nunca puntos exactos", () => {
  it("decodifica el geohash a centro y radio de celda; lo que no es geohash no se decodifica", () => {
    const d = decodificarZona(ZONA)!;
    expect(d.lat).toBeCloseTo(19.4238, 3);
    expect(d.lon).toBeCloseTo(-99.3164, 3);
    expect(d.metros).toBeGreaterThan(5000);
    expect(decodificarZona("A1")).toBeNull();
    expect(decodificarZona("9g3q12")).toBeNull();
  });

  it("una señal publicada con zona se pinta como un campo estimado, no como su punto", () => {
    const campos = camposDeCapa(CAPA_POR_ID["red-publica"], marcasCon([publicada({ origen: "estimada" })]), AHORA);
    expect(campos).toHaveLength(1);
    expect(campos[0].marcaId).toBe("senal:s1");
    expect(campos[0].estilo).toBe("rayado");
    expect(campos[0].metros).toBeGreaterThan(1000);
    expect(campos[0].texto).toBe("zona aproximada · publicado por su dueño");
    // La marca está en Madrid y la zona en México: se usa la celda, jamás la posición exacta.
    expect(campos[0].lat).not.toBeCloseTo(40.4168, 2);
    expect(campos[0].lon).not.toBeCloseTo(-3.7038, 2);
  });

  it("sin zona no se dibuja y se cuenta aparte", () => {
    const senales = [publicada({ id: "con" }), publicada({ id: "sin", zona: null })];
    expect(camposDeCapa(CAPA_POR_ID["red-publica"], marcasCon([]), AHORA, senales)).toHaveLength(1);
    expect(contarSenalesSinZona(CAPA_POR_ID["red-publica"], marcasCon([]), senales)).toBe(1);
  });

  it("dos dueños en la misma zona se mezclan en el mismo campo", () => {
    const senales = [
      publicada({ id: "a", vinculo: { tipo: "neurona", id: "neu-1" } }),
      publicada({ id: "b", vinculo: { tipo: "neurona", id: "neu-2" } }),
    ];
    const campos = camposDeCapa(CAPA_POR_ID["red-publica"], marcasCon([]), AHORA, senales);
    expect(campos).toHaveLength(2);
    expect(campos[0].lat).toBe(campos[1].lat);
    expect(campos[0].lon).toBe(campos[1].lon);
  });

  it("lo medido lleva borde continuo y hora; lo estimado, rayado y sin hora", () => {
    const t = Date.UTC(2026, 0, 1, 12, 30);
    const senales = [
      publicada({ id: "medida", origen: "medida", medidoEn: t }),
      publicada({ id: "estimada", origen: "estimada", medidoEn: null }),
    ];
    const campos = camposDeCapa(CAPA_POR_ID["red-publica"], marcasCon([]), AHORA, senales);
    const medida = campos.find((c) => c.origen === "medida")!;
    const estimada = campos.find((c) => c.origen === "estimada")!;
    expect(medida.estilo).toBe("continuo");
    expect(estimada.estilo).toBe("rayado");
    expect(medida.texto).toMatch(/medida a las 12:30/);
    expect(medida.t).toBe(t);
    expect(estimada.t).toBeNull();
  });

  it("cada capa red-* pinta solo sus señales", () => {
    const senales = [publicada({ id: "p", capa: "publica" }), publicada({ id: "c", capa: "comunidad" })];
    expect(camposDeCapa(CAPA_POR_ID["red-publica"], marcasCon([]), AHORA, senales).map((c) => c.marcaId)).toEqual(["senal:p"]);
    expect(camposDeCapa(CAPA_POR_ID["red-comunidad"], marcasCon([]), AHORA, senales).map((c) => c.marcaId)).toEqual(["senal:c"]);
  });
});
