import { describe, expect, it } from "vitest";
import { CAPAS_SENALES, CAPA_POR_ID, COLOR_DESCONOCIDO, NOTA_PARCHE, estadoCapasInicial, leyendaDe, pintarMarca, sanearEstadoCapas } from "../capas";
import { parchesDeCapa } from "../parches";
import { fichaDeMarca } from "../ficha-geo";
import { construirMarcas, type MarcaGeo } from "../marcas";
import type { PresenciaMedio } from "@/lib/neurons/presencia";
import { resumirSenales } from "@/lib/neurons/senales-medio";

const AHORA = 1_700_000_000_000;

function marca(p: Partial<MarcaGeo> = {}): MarcaGeo {
  const [m] = construirMarcas({
    filas: [], medios: [], ahora: AHORA,
    yo: {
      neuronaId: "yo", nombre: "MaggaBook", plataforma: "macOS", capas: null, ficha: null,
      posicion: { lat: 19.4326, lon: -99.1332, precisionM: 8, t: AHORA - 10_000 },
      senales: { internet: { enLinea: true, tipo: "wifi", mbps: 10 }, malla: { pares: 0, otrasCuentas: 0 }, lora: { estado: "sin-radio", nodos: 0 }, bluetooth: { disponible: true }, serie: { disponible: false, puertos: 0 }, reticulum: { disponible: false, motivo: "x" } },
    },
  });
  return { ...m, ...p };
}

describe("capas: una sola tabla para leyenda y pintura", () => {
  it("todas las capas tienen fuente declarada y un tramo «sin medir» gris y hueco", () => {
    expect(CAPAS_SENALES.length).toBeGreaterThanOrEqual(12);
    for (const c of CAPAS_SENALES) {
      expect(["real", "parcial", "sin-fuente", "estimado"]).toContain(c.estado);
      expect(c.fuente.length).toBeGreaterThan(5);
      const d = c.tramos.find((t) => t.id === "desconocido");
      expect(d?.estilo).toBe("hueco");
      expect(d?.color).toBe(COLOR_DESCONOCIDO);
    }
  });

  it("la leyenda sale de los mismos tramos con los que se pinta", () => {
    for (const c of CAPAS_SENALES) {
      expect(leyendaDe(c).map((l) => l.etiqueta)).toEqual(c.tramos.map((t) => t.etiqueta));
    }
  });

  it("sin fuente = siempre gris y hueco; nunca un color inventado", () => {
    const m = marca();
    for (const c of CAPAS_SENALES.filter((x) => x.estado === "sin-fuente")) {
      const { tramo } = pintarMarca(c, m);
      expect(tramo.id).toBe("desconocido");
    }
    // Bluetooth y Wi-Fi ya tienen fuente real (enlaces medidos); la oferta de recursos ahora es "parcial" (viene de la presencia); solo red-externa sigue sin fuente.
    expect(CAPAS_SENALES.filter((x) => x.estado === "sin-fuente").map((x) => x.id)).toEqual(["red-externa"]);
  });

  it("internet 10 Mb/s: calidad media, con color", () => {
    const { tramo, valor } = pintarMarca(CAPA_POR_ID["senal-internet"], marca());
    expect(tramo.id).not.toBe("desconocido");
    expect(valor.medida).toBe(true);
  });

  it("la nota dice que el parche no es un alcance", () => {
    expect(NOTA_PARCHE).toMatch(/no es un alcance de cobertura/);
  });

  it("estado guardado: ids raros fuera, opacidad acotada, internet activa de inicio", () => {
    expect(estadoCapasInicial().activas).toEqual(["senal-internet", "cobertura-ble", "cobertura-wifi", "enlaces-medidos"]);
    const s = sanearEstadoCapas({ activas: ["senal-wifi", "nope", "senal-wifi", 3], opacidad: { "senal-wifi": 5, nope: 1, "senal-internet": 0 } });
    expect(s.activas).toEqual(["senal-wifi"]);
    expect(s.opacidad).toEqual({ "senal-wifi": 1, "senal-internet": 0.1 });
    expect(sanearEstadoCapas("x")).toEqual(estadoCapasInicial());
  });
});

describe("parches", () => {
  it("posición viva: pinta con su tramo", () => {
    const p = parchesDeCapa(CAPA_POR_ID["senal-internet"], [marca()], AHORA);
    expect(p).toHaveLength(1);
    expect(p[0].viva).toBe(true);
    expect(p[0].estilo).toBe("relleno");
  });

  it("posición de hace 2 h: gris hueco, nunca color", () => {
    const vieja = marca({ posicion: { tipo: "exacta", lat: 19.43, lon: -99.13, t: AHORA - 2 * 3600_000 } });
    const [p] = parchesDeCapa(CAPA_POR_ID["senal-internet"], [vieja], AHORA);
    expect(p.viva).toBe(false);
    expect(p.estilo).toBe("hueco");
    expect(p.color).toBe(COLOR_DESCONOCIDO);
  });

  it("sin posición: no hay parche", () => {
    const sin = marca({ posicion: { tipo: "desconocida", motivo: "x" } });
    expect(parchesDeCapa(CAPA_POR_ID["senal-internet"], [sin], AHORA)).toEqual([]);
  });
});

describe("ficha", () => {
  it("solo valores medidos con su hora; lo demás, «desconocido»", () => {
    const f = JSON.stringify(fichaDeMarca(marca(), AHORA));
    expect(f).toContain("MaggaBook");
    expect(f).toMatch(/desconocid/);
    expect(f).toContain("19.4326");
    expect(f).not.toMatch(/zona|público|publico|aproximad/i);
  });

  it("posición desconocida: dice el motivo, sin coordenadas", () => {
    const f = JSON.stringify(fichaDeMarca(marca({ posicion: { tipo: "desconocida", motivo: "MOTIVO-PRUEBA" } }), AHORA));
    expect(f).toContain("MOTIVO-PRUEBA");
  });
});

describe("capas de oferta (AQ07)", () => {
  const s = resumirSenales({ enLinea: true, conexion: { type: "wifi", effectiveType: "4g", downlink: 10 }, malla: { propios: 0, otrasCuentas: 0 }, mesh: null, bluetooth: null, serie: { api: true, puertos: 0 } });

  function medioConOferta(o: { computo: boolean; almacenamiento: boolean; internet: boolean }): PresenciaMedio {
    return {
      n: "neurona-1",
      m: "medio-1",
      t: AHORA,
      tipo: "navegador",
      etiqueta: "Chrome",
      visible: true,
      desde: new Date(AHORA).toISOString(),
      s,
      o,
    };
  }

  function medioSinOferta(): PresenciaMedio {
    return {
      n: "neurona-1",
      m: "medio-1",
      t: AHORA,
      tipo: "navegador",
      etiqueta: "Chrome",
      visible: true,
      desde: new Date(AHORA).toISOString(),
      s,
    };
  }

  function marcaConMedios(medios: PresenciaMedio[]): MarcaGeo {
    const marcas = construirMarcas({
      filas: [{ neuronId: "neurona-1", nombre: "Neurona Test", plataforma: "macOS", online: true, esEsteDispositivo: false, tipo: "desktop", enlace: { estado: "conectado", latenciaMs: 50 } }],
      medios,
      ahora: AHORA,
      yo: {
        neuronaId: "yo", nombre: "Yo", plataforma: "macOS", capas: null, ficha: undefined,
        posicion: { lat: 19.4326, lon: -99.1332, precisionM: 8, t: AHORA - 10_000 },
        senales: s,
      },
    });
    const m = marcas.find((marca) => marca.neuronaId === "neurona-1");
    if (!m) throw new Error("Neurona test no encontrada en marcas");
    return m;
  }

  it("oferta-computo: anuncia → valor; no anuncia → desconocido", () => {
    const capa = CAPA_POR_ID["oferta-computo"];
    expect(capa).toBeDefined();

    // Neurona que anuncia cómputo
    const mCon = marcaConMedios([medioConOferta({ computo: true, almacenamiento: false, internet: false })]);
    const { tramo: tramoCon, valor: valorCon } = pintarMarca(capa!, mCon);
    expect(tramoCon.id).not.toBe("desconocido");
    expect(valorCon.medida).toBe(true);
    expect(valorCon.texto).toContain("cómputo");

    // Neurona que anuncia explícitamente que NO ofrece cómputo (tiene campo o pero computo=false)
    const mNoOfrece = marcaConMedios([medioConOferta({ computo: false, almacenamiento: true, internet: false })]);
    const { tramo: tramoNoOfrece, valor: valorNoOfrece } = pintarMarca(capa!, mNoOfrece);
    expect(tramoNoOfrece.id).toBe("no");
    expect(valorNoOfrece.medida).toBe(true);
    expect(valorNoOfrece.texto).toContain("no ofrece cómputo");

    // Neurona que NO anuncia la oferta en absoluto (sin campo o)
    const mSinOferta = marcaConMedios([medioSinOferta()]);
    const { tramo: tramoSin, valor: valorSin } = pintarMarca(capa!, mSinOferta);
    expect(tramoSin.id).toBe("desconocido");
    expect(valorSin.medida).toBe(false);
  });

  it("oferta-almacenamiento: anuncia → valor; no anuncia → desconocido", () => {
    const capa = CAPA_POR_ID["oferta-almacenamiento"];
    expect(capa).toBeDefined();

    const mCon = marcaConMedios([medioConOferta({ computo: false, almacenamiento: true, internet: false })]);
    const { tramo: tramoCon, valor: valorCon } = pintarMarca(capa!, mCon);
    expect(tramoCon.id).not.toBe("desconocido");
    expect(valorCon.medida).toBe(true);
    expect(valorCon.texto).toContain("almacenamiento");

    const mNoOfrece = marcaConMedios([medioConOferta({ computo: true, almacenamiento: false, internet: false })]);
    const { tramo: tramoNoOfrece, valor: valorNoOfrece } = pintarMarca(capa!, mNoOfrece);
    expect(tramoNoOfrece.id).toBe("no");
    expect(valorNoOfrece.medida).toBe(true);
    expect(valorNoOfrece.texto).toContain("no ofrece almacenamiento");

    const mSinOferta = marcaConMedios([medioSinOferta()]);
    const { tramo: tramoSin, valor: valorSin } = pintarMarca(capa!, mSinOferta);
    expect(tramoSin.id).toBe("desconocido");
    expect(valorSin.medida).toBe(false);
  });

  it("oferta-internet: anuncia → valor; no anuncia → desconocido", () => {
    const capa = CAPA_POR_ID["oferta-internet"];
    expect(capa).toBeDefined();

    const mCon = marcaConMedios([medioConOferta({ computo: false, almacenamiento: false, internet: true })]);
    const { tramo: tramoCon, valor: valorCon } = pintarMarca(capa!, mCon);
    expect(tramoCon.id).not.toBe("desconocido");
    expect(valorCon.medida).toBe(true);
    expect(valorCon.texto).toContain("internet");

    const mNoOfrece = marcaConMedios([medioConOferta({ computo: true, almacenamiento: true, internet: false })]);
    const { tramo: tramoNoOfrece, valor: valorNoOfrece } = pintarMarca(capa!, mNoOfrece);
    expect(tramoNoOfrece.id).toBe("no");
    expect(valorNoOfrece.medida).toBe(true);
    expect(valorNoOfrece.texto).toContain("no ofrece internet compartido");

    const mSinOferta = marcaConMedios([medioSinOferta()]);
    const { tramo: tramoSin, valor: valorSin } = pintarMarca(capa!, mSinOferta);
    expect(tramoSin.id).toBe("desconocido");
    expect(valorSin.medida).toBe(false);
  });

  it("las capas de oferta ya no son 'sin-fuente' cuando hay datos", () => {
    expect(CAPA_POR_ID["oferta-computo"]?.estado).not.toBe("sin-fuente");
    expect(CAPA_POR_ID["oferta-almacenamiento"]?.estado).not.toBe("sin-fuente");
    expect(CAPA_POR_ID["oferta-internet"]?.estado).not.toBe("sin-fuente");
  });
});

describe("ficha de marca: recursos compartidos (AQ07)", () => {
  const s = resumirSenales({ enLinea: true, conexion: { type: "wifi", effectiveType: "4g", downlink: 10 }, malla: { propios: 0, otrasCuentas: 0 }, mesh: null, bluetooth: null, serie: { api: true, puertos: 0 } });

  function medioConOferta(o: { computo: boolean; almacenamiento: boolean; internet: boolean }): PresenciaMedio {
    return {
      n: "neurona-1",
      m: "medio-1",
      t: AHORA,
      tipo: "navegador",
      etiqueta: "Chrome",
      visible: true,
      desde: new Date(AHORA).toISOString(),
      s,
      o,
    };
  }

  function medioSinOferta(): PresenciaMedio {
    return {
      n: "neurona-1",
      m: "medio-1",
      t: AHORA,
      tipo: "navegador",
      etiqueta: "Chrome",
      visible: true,
      desde: new Date(AHORA).toISOString(),
      s,
    };
  }

  function marcaConMedios(medios: PresenciaMedio[]): MarcaGeo {
    const marcas = construirMarcas({
      filas: [{ neuronId: "neurona-1", nombre: "Neurona Test", plataforma: "macOS", online: true, esEsteDispositivo: false, tipo: "desktop", enlace: { estado: "conectado", latenciaMs: 50 } }],
      medios,
      ahora: AHORA,
      yo: {
        neuronaId: "yo", nombre: "Yo", plataforma: "macOS", capas: null, ficha: undefined,
        posicion: { lat: 19.4326, lon: -99.1332, precisionM: 8, t: AHORA - 10_000 },
        senales: s,
      },
    });
    const m = marcas.find((marca) => marca.neuronaId === "neurona-1");
    if (!m) throw new Error("Neurona test no encontrada en marcas");
    return m;
  }

  it("ficha con oferta: muestra recursos compartidos declarados", () => {
    const m = marcaConMedios([medioConOferta({ computo: true, almacenamiento: true, internet: false })]);
    const ficha = fichaDeMarca(m, AHORA);
    const seccionOfrece = ficha.secciones.find((sec) => sec.id === "ofrece");
    expect(seccionOfrece).toBeDefined();
    const datoRecursos = seccionOfrece!.datos.find((d) => d.etiqueta === "Recursos compartidos");
    expect(datoRecursos).toBeDefined();
    expect(datoRecursos!.estado).toBe("declarado");
    expect(datoRecursos!.valor).toContain("cómputo");
    expect(datoRecursos!.valor).toContain("almacenamiento");
    expect(datoRecursos!.valor).not.toContain("internet");
    expect(datoRecursos!.fuente).toContain("presencia de la cuenta");
  });

  it("ficha con solo internet compartido: muestra solo internet", () => {
    const m = marcaConMedios([medioConOferta({ computo: false, almacenamiento: false, internet: true })]);
    const ficha = fichaDeMarca(m, AHORA);
    const seccionOfrece = ficha.secciones.find((sec) => sec.id === "ofrece");
    const datoRecursos = seccionOfrece!.datos.find((d) => d.etiqueta === "Recursos compartidos");
    expect(datoRecursos).toBeDefined();
    expect(datoRecursos!.estado).toBe("declarado");
    expect(datoRecursos!.valor).toBe("internet");
  });

  it("ficha sin oferta: dice desconocido con motivo", () => {
    const m = marcaConMedios([medioSinOferta()]);
    const ficha = fichaDeMarca(m, AHORA);
    const seccionOfrece = ficha.secciones.find((sec) => sec.id === "ofrece");
    const datoRecursos = seccionOfrece!.datos.find((d) => d.etiqueta === "Recursos compartidos");
    expect(datoRecursos).toBeDefined();
    expect(datoRecursos!.estado).toBe("no-medido");
    expect(datoRecursos!.valor).toBe("desconocido");
    expect(datoRecursos!.nota).toContain("no anuncia su oferta");
  });

  it("ficha con oferta vacía (todos false): muestra 'ninguno'", () => {
    const m = marcaConMedios([medioConOferta({ computo: false, almacenamiento: false, internet: false })]);
    const ficha = fichaDeMarca(m, AHORA);
    const seccionOfrece = ficha.secciones.find((sec) => sec.id === "ofrece");
    const datoRecursos = seccionOfrece!.datos.find((d) => d.etiqueta === "Recursos compartidos");
    expect(datoRecursos).toBeDefined();
    expect(datoRecursos!.estado).toBe("declarado");
    expect(datoRecursos!.valor).toBe("ninguno");
  });
});
