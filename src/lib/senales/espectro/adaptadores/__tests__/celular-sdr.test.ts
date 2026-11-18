// Tests de los adaptadores de celular y SDR (MAP1116B).
import { describe, it, expect } from "vitest";
import { adaptadorCelular, adaptadorSdr, SIN_SDR, type FuenteEspectroReal, type PuntoMedido } from "../celular-sdr";

function sdrFalso(puntos: PuntoMedido[], disponible = true) {
  const llamadas = { total: 0, desde: 0, hasta: 0 };
  const fuente: FuenteEspectroReal = {
    nombre: "Falso SDR",
    disponible: async () => disponible,
    barrer: async (desdeKhz, hastaKhz) => {
      llamadas.total += 1;
      llamadas.desde = desdeKhz;
      llamadas.hasta = hastaKhz;
      return puntos;
    },
  };
  return { fuente, llamadas };
}

describe("adaptadorCelular", () => {
  it("sin lectura o con celda vacía devuelve solo sinFuente", () => {
    const sinLectura = adaptadorCelular(null);
    expect(sinLectura.senales).toEqual([]);
    expect(sinLectura.sinFuente).toEqual([
      { medio: "celular", motivo: "este aparato no entrega la celda ni la banda móvil a la app" },
    ]);
    const vacia = adaptadorCelular({ celda: {} });
    expect(vacia.senales).toEqual([]);
    expect(vacia.sinFuente.length).toBe(1);
  });
  it("convierte una lectura con banda, frecuencia y fuerza", () => {
    const resultado = adaptadorCelular({
      celda: { banda: "B1", frecuenciaKhz: 2_140_000, fuerzaDbm: -95 },
    });
    expect(resultado.sinFuente).toEqual([]);
    expect(resultado.senales.length).toBe(1);
    const senal = resultado.senales[0];
    expect(senal.medio).toBe("celular");
    expect(senal.banda).toBe("Banda 1 (2100 MHz) — FDD");
    expect(senal.frecuenciaKhz).toBe(2_140_000);
    expect(senal.fuerzaDbm).toBe(-95);
    expect(senal.origen).toBe("medida");
    expect(senal.capa).toBe("propia");
    expect(senal.fuente).toBe("lectura de celda del aparato");
    expect(typeof senal.medidoEn).toBe("number");
  });
  it("deduce la banda solo con la frecuencia", () => {
    const resultado = adaptadorCelular({ celda: { frecuenciaKhz: 942_500, fuerzaDbm: -101 } });
    expect(resultado.senales[0].banda).toBe("Banda 8 (900 MHz) — FDD");
  });
  it("con banda sin frecuencia no inventa un número", () => {
    const resultado = adaptadorCelular({ celda: { banda: "n78" } });
    expect(resultado.senales[0].banda).toBe("Banda n78 (3500 MHz) — TDD NR");
    expect(resultado.senales[0].frecuenciaKhz).toBeNull();
    expect(resultado.senales[0].origen).toBe("estimada");
  });
});

describe("adaptadorSdr", () => {
  it("SIN_SDR no está disponible y no barre", async () => {
    expect(await SIN_SDR.disponible()).toBe(false);
    expect(await SIN_SDR.barrer(1, 2)).toEqual([]);
  });
  it("sin receptor devuelve solo sinFuente", async () => {
    const resultado = await adaptadorSdr(SIN_SDR, { desdeKhz: 100_000, hastaKhz: 6_000_000 });
    expect(resultado.senales).toEqual([]);
    expect(resultado.sinFuente).toEqual([
      { medio: "sdr", motivo: "no hay un receptor SDR conectado" },
    ]);
  });
  it("con SDR falso devuelve señales medidas y nombra la fuente", async () => {
    const puntos = [
      { frecuenciaKhz: 2_442_000, fuerzaDbm: -65 },
      { frecuenciaKhz: 868_000, fuerzaDbm: -90 },
    ];
    const { fuente, llamadas } = sdrFalso(puntos);
    const resultado = await adaptadorSdr(fuente, { desdeKhz: 800_000, hastaKhz: 2_500_000 });
    expect(resultado.sinFuente).toEqual([]);
    expect(resultado.senales.length).toBe(2);
    expect(llamadas).toEqual({ total: 1, desde: 800_000, hasta: 2_500_000 });
    for (const senal of resultado.senales) {
      expect(senal.medio).toBe("sdr");
      expect(senal.origen).toBe("medida");
      expect(senal.fuente).toBe("SDR conectado: Falso SDR");
      expect(typeof senal.medidoEn).toBe("number");
    }
    expect(resultado.senales[0].frecuenciaKhz).toBe(2_442_000);
    expect(resultado.senales[0].fuerzaDbm).toBe(-65);
  });
  it("un SDR no disponible no llama a barrer", async () => {
    const { fuente, llamadas } = sdrFalso([{ frecuenciaKhz: 1000, fuerzaDbm: -1 }], false);
    const resultado = await adaptadorSdr(fuente, { desdeKhz: 1, hastaKhz: 2 });
    expect(resultado.sinFuente.length).toBe(1);
    expect(llamadas.total).toBe(0);
  });
  it("descarta puntos sin frecuencia o fuerza válidas", async () => {
    const { fuente } = sdrFalso([
      { frecuenciaKhz: Number.NaN, fuerzaDbm: -50 },
      { frecuenciaKhz: -1, fuerzaDbm: -50 },
      { frecuenciaKhz: 100_000, fuerzaDbm: Number.POSITIVE_INFINITY },
      { frecuenciaKhz: 100_000, fuerzaDbm: -50 },
    ]);
    const resultado = await adaptadorSdr(fuente, { desdeKhz: 1, hastaKhz: 2 });
    expect(resultado.senales.length).toBe(1);
  });
  it("si el barrido falla lo dice en vez de inventar señales", async () => {
    const fuente: FuenteEspectroReal = {
      nombre: "SDR roto",
      disponible: async () => true,
      barrer: async () => { throw new Error("fallo"); },
    };
    const resultado = await adaptadorSdr(fuente, { desdeKhz: 1, hastaKhz: 2 });
    expect(resultado.senales).toEqual([]);
    expect(resultado.sinFuente[0]).toEqual({
      medio: "sdr",
      motivo: "el receptor SDR está conectado pero no entregó el barrido",
    });
  });
});
