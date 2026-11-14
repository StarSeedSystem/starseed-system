import { describe, expect, it } from "vitest";
import { zonaAproximada, RADIO_ZONA_M } from "../zona";
import {
  anuncioParaAmbito, leerAnuncio, nivelParaAmbito, PREFERENCIA_POSICION_DEFECTO,
  type PosicionCruda, type PreferenciaPosicion,
} from "../modelo-geo";

const cruda: PosicionCruda = { lat: 40.416775, lon: -3.70379, precisionM: 12.4, t: 1_700_000_000_000, fuente: "gps" };
const con = (p: Partial<PreferenciaPosicion>): PreferenciaPosicion => ({ ...PREFERENCIA_POSICION_DEFECTO, ...p });

function distanciaM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

describe("zona aproximada (≈1 km)", () => {
  it("un punto cae en una celda de ≈1 km y no se devuelve el punto", () => {
    const z = zonaAproximada(cruda.lat, cruda.lon)!;
    expect(z).not.toBeNull();
    expect(`${z.lat},${z.lon}`).not.toBe(`${cruda.lat},${cruda.lon}`);
    expect(z.radioM).toBe(RADIO_ZONA_M);
    const alto = distanciaM({ lat: z.latMin, lon: z.lonMin }, { lat: z.latMax, lon: z.lonMin });
    const ancho = distanciaM({ lat: z.latMin, lon: z.lonMin }, { lat: z.latMin, lon: z.lonMax });
    expect(alto).toBeGreaterThan(900); expect(alto).toBeLessThan(1100);
    expect(ancho).toBeGreaterThan(900); expect(ancho).toBeLessThan(1100);
    expect(cruda.lat).toBeGreaterThanOrEqual(z.latMin); expect(cruda.lat).toBeLessThan(z.latMax);
    expect(cruda.lon).toBeGreaterThanOrEqual(z.lonMin); expect(cruda.lon).toBeLessThan(z.lonMax);
  });

  it("mide ≈1 km también lejos del ecuador", () => {
    const z = zonaAproximada(64.1466, -21.9426)!;
    const ancho = distanciaM({ lat: z.latMin, lon: z.lonMin }, { lat: z.latMin, lon: z.lonMax });
    expect(ancho).toBeGreaterThan(900); expect(ancho).toBeLessThan(1100);
  });

  it("puntos de la misma celda dan la misma zona; vecinos, otra", () => {
    const a = zonaAproximada(40.4168, -3.7038)!;
    const b = zonaAproximada(40.4169, -3.7039)!;
    const c = zonaAproximada(40.5168, -3.7038)!;
    expect(a.celda).toBe(b.celda);
    expect(c.celda).not.toBe(a.celda);
  });

  it("nunca devuelve el punto exacto, ni siquiera si cae justo en el centro de la celda", () => {
    const z0 = zonaAproximada(10.1234, 20.5678)!;
    const exactoEnCentro = zonaAproximada(z0.lat, z0.lon)!;
    expect(exactoEnCentro.lat === z0.lat && exactoEnCentro.lon === z0.lon).toBe(false); // la entrada era el centro: se enseña la esquina
    expect(exactoEnCentro.celda).toBe(z0.celda);
    for (let i = 0; i < 500; i++) {
      const lat = -80 + Math.random() * 160, lon = -179 + Math.random() * 358;
      const z = zonaAproximada(lat, lon)!;
      expect(z.lat === lat && z.lon === lon).toBe(false);
    }
  });

  it("rechaza coordenadas inválidas", () => {
    expect(zonaAproximada(NaN, 0)).toBeNull();
    expect(zonaAproximada(91, 0)).toBeNull();
    expect(zonaAproximada(0, 181)).toBeNull();
  });
});

describe("regla de privacidad: dueño, autorizado y público", () => {
  it("por defecto no sale NADA del aparato, salvo para su dueño", () => {
    expect(PREFERENCIA_POSICION_DEFECTO).toEqual({ cuenta: "no", publica: "no", autorizados: {} });
    expect(anuncioParaAmbito(cruda, PREFERENCIA_POSICION_DEFECTO, { tipo: "cuenta" })).toBeNull();
    expect(anuncioParaAmbito(cruda, PREFERENCIA_POSICION_DEFECTO, { tipo: "publico" })).toBeNull();
    expect(anuncioParaAmbito(cruda, PREFERENCIA_POSICION_DEFECTO, { tipo: "autorizado", id: "grupo-1" })).toBeNull();
    expect(anuncioParaAmbito(cruda, PREFERENCIA_POSICION_DEFECTO, { tipo: "dueno" })).toMatchObject({ k: "exacta", lat: cruda.lat, lon: cruda.lon });
  });

  it("con nivel «zona» el anuncio NO contiene el punto crudo (ni en su texto serializado)", () => {
    for (const ambito of [{ tipo: "cuenta" }, { tipo: "publico" }] as const) {
      const a = anuncioParaAmbito(cruda, con({ cuenta: "zona", publica: "zona" }), ambito)!;
      expect(a.k).toBe("zona");
      const txt = JSON.stringify(a);
      expect(txt).not.toContain(String(cruda.lat));
      expect(txt).not.toContain(String(cruda.lon));
      expect(txt).not.toContain("40.4167");
      expect(a).not.toHaveProperty("lat");
    }
  });

  it("«publicar punto exacto» es una decisión aparte: público en «zona» no da el punto aunque la cuenta lo tenga exacto", () => {
    const p = con({ cuenta: "exacta", publica: "zona" });
    expect(anuncioParaAmbito(cruda, p, { tipo: "cuenta" })!.k).toBe("exacta");
    expect(anuncioParaAmbito(cruda, p, { tipo: "publico" })!.k).toBe("zona");
    expect(anuncioParaAmbito(cruda, con({ publica: "exacta" }), { tipo: "publico" })!.k).toBe("exacta");
  });

  it("un ámbito autorizado recibe solo lo que el dueño le concedió; los demás, nada", () => {
    const p = con({ autorizados: { "grupo-1": "zona", "grupo-2": "exacta" } });
    expect(anuncioParaAmbito(cruda, p, { tipo: "autorizado", id: "grupo-1" })!.k).toBe("zona");
    expect(anuncioParaAmbito(cruda, p, { tipo: "autorizado", id: "grupo-2" })!.k).toBe("exacta");
    expect(anuncioParaAmbito(cruda, p, { tipo: "autorizado", id: "otro" })).toBeNull();
    expect(nivelParaAmbito(p, { tipo: "autorizado", id: "otro" })).toBe("no");
  });

  it("un nodo fijo público muestra su punto solo si su operador lo publica", () => {
    const p = con({ publica: "zona" });
    expect(anuncioParaAmbito(cruda, p, { tipo: "publico" }, { fijo: true })).toBeNull();
    expect(anuncioParaAmbito(cruda, p, { tipo: "publico" }, { fijo: true, operadorPublicaPunto: true })!.k).toBe("exacta");
  });

  it("sin posición o con una posición inválida no sale nada", () => {
    expect(anuncioParaAmbito(null, con({ cuenta: "exacta" }), { tipo: "cuenta" })).toBeNull();
    expect(anuncioParaAmbito({ ...cruda, lat: 200 }, con({ cuenta: "exacta" }), { tipo: "cuenta" })).toBeNull();
  });

  it("al leer un anuncio ajeno, una «zona» se vuelve a calcular desde su centro y lo mal formado se descarta", () => {
    const a = anuncioParaAmbito(cruda, con({ cuenta: "zona" }), { tipo: "cuenta" })!;
    expect(leerAnuncio(JSON.parse(JSON.stringify(a)))).toEqual(a);
    expect(leerAnuncio({ k: "zona", zona: { lat: 1, lon: 1, celda: "otra" }, t: 1 })).toBeNull();
    expect(leerAnuncio({ k: "exacta", lat: "x", lon: 1, t: 1 })).toBeNull();
    expect(leerAnuncio(null)).toBeNull();
    expect(leerAnuncio({ k: "exacta", lat: 1, lon: 1 })).toBeNull();
  });
});
