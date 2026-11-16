import { describe, expect, it } from "vitest";
import { CAPAS_SENALES, CAPA_POR_ID, GRUPOS_CAPA, COLOR_DESCONOCIDO, leyendaDe, pintarMarca, tramoDe } from "../capas";
import { construirMarcas, type MarcaGeo } from "../marcas";

const AHORA = 1_700_000_000_000;
const IDS_RED = ["red-publica", "red-comunidad", "red-privada", "red-externa"];

/** Ids que ya existían antes de MAP1116B: no cambian ni de id ni de orden. */
const IDS_EXISTENTES = [
  "cobertura-ble", "cobertura-wifi", "cobertura-lora", "enlaces-medidos",
  "senal-bluetooth", "senal-wifi", "senal-local", "senal-internet",
  "oferta-computo", "oferta-almacenamiento", "oferta-internet", "oferta-modelos",
  "conciencia-local", "conciencia-mesh", "conciencia-nube", "conciencia-colectiva",
  "hw-ram",
];
function marca(conPosicion: boolean): MarcaGeo {
  const [m] = construirMarcas({
    filas: [], medios: [], ahora: AHORA,
    yo: {
      neuronaId: "yo", nombre: "MaggaBook", plataforma: "macOS", capas: null, ficha: null,
      posicion: conPosicion ? { lat: 19.4326, lon: -99.1332, precisionM: 8, t: AHORA - 10_000 } : null,
      senales: {
        internet: { enLinea: true, tipo: "wifi", mbps: 10 }, malla: { pares: 0, otrasCuentas: 0 }, lora: { estado: "sin-radio", nodos: 0 },
        bluetooth: { disponible: true }, serie: { disponible: false, puertos: 0 }, reticulum: { disponible: false, motivo: "x" },
      },
    },
  });
  return m;
}

describe("grupo «Red completa»: existe con sus cuatro capas", () => {
  it("el grupo está declarado y las cuatro capas viven en él", () => {
    const grupo = GRUPOS_CAPA.find((g) => g.id === "red");
    expect(grupo?.titulo).toBe("Red completa (lo que cada dueño publica)");
    expect(CAPAS_SENALES.filter((c) => c.grupo === "red").map((c) => c.id)).toEqual(IDS_RED);
  });

  it("CAPA_POR_ID las incluye y las capas existentes no cambian de id ni de orden", () => {
    for (const id of IDS_RED) expect(CAPA_POR_ID[id]?.grupo).toBe("red");
    expect(CAPAS_SENALES.filter((c) => c.grupo !== "red").map((c) => c.id)).toEqual(IDS_EXISTENTES);
  });

  it("cada una tiene interruptor (id estable), descripción y fuente que cita los módulos del espectro", () => {
    for (const id of IDS_RED) {
      const c = CAPA_POR_ID[id];
      expect(c.etiqueta.length).toBeGreaterThan(3);
      expect(c.descripcion.length).toBeGreaterThan(10);
      expect(c.fuente).toMatch(/espectro\/(leer-senales|publicacion)\.ts/);
    }
  });

  it("estado honesto: parciales mientras no haya publicadores; la externa, sin fuente", () => {
    expect(CAPA_POR_ID["red-publica"].estado).toBe("parcial");
    expect(CAPA_POR_ID["red-comunidad"].estado).toBe("parcial");
    expect(CAPA_POR_ID["red-privada"].estado).toBe("parcial");
    expect(CAPA_POR_ID["red-externa"].estado).toBe("sin-fuente");
    expect(CAPA_POR_ID["red-externa"].fuente).toMatch(/^Sin fuente:/);
  });
});

describe("tramos por origen: lo estimado nunca usa el relleno de lo medido", () => {
  it("medida = relleno, declarada = anillo, estimada = rayado", () => {
    for (const id of IDS_RED) {
      const c = CAPA_POR_ID[id];
      expect(tramoDe(c, "medida").estilo).toBe("relleno");
      expect(tramoDe(c, "declarada").estilo).toBe("anillo");
      const est = tramoDe(c, "estimada");
      expect(est.estilo).toBe("rayado");
      expect(est.etiqueta.toLowerCase()).toContain("zona aproximada");
    }
  });
  it("ningún tramo estimado ni declarado usa «relleno», y el desconocido es gris y hueco", () => {
    for (const id of IDS_RED) {
      for (const t of CAPA_POR_ID[id].tramos) {
        if (t.id === "estimada" || t.id === "declarada") expect(t.estilo).not.toBe("relleno");
        if (t.id === "desconocido") {
          expect(t.estilo).toBe("hueco");
          expect(t.color).toBe(COLOR_DESCONOCIDO);
        }
      }
    }
  });

  it("la leyenda dice «publicado por su dueño» y «zona aproximada»", () => {
    for (const id of IDS_RED) {
      const etiquetas = leyendaDe(CAPA_POR_ID[id]).map((l) => l.etiqueta.toLowerCase());
      expect(etiquetas.some((e) => e.includes("publicado por su dueño"))).toBe(true);
      expect(etiquetas.some((e) => e.includes("zona aproximada"))).toBe(true);
    }
  });
});

describe("valor(): sin medida es «desconocido» y la privacidad se respeta", () => {
  it("pública y comunidad nunca pintan la posición exacta de un aparato personal", () => {
    const m = marca(true);
    for (const id of ["red-publica", "red-comunidad"]) {
      const { tramo, valor } = pintarMarca(CAPA_POR_ID[id], m);
      expect(tramo.id).toBe("desconocido");
      expect(valor.texto).toBe("desconocido");
      expect(valor.medida).toBe(false);
    }
  });

  it("la externa no pinta nada: hoy nada la alimenta", () => {
    const { tramo, valor } = pintarMarca(CAPA_POR_ID["red-externa"], marca(true));
    expect(tramo.id).toBe("desconocido");
    expect(valor.texto).toBe("desconocido");
  });

  it("privada: con posición del canal privado hay medida; sin ella, «desconocido»", () => {
    const con = pintarMarca(CAPA_POR_ID["red-privada"], marca(true));
    expect(con.tramo.id).toBe("medida");
    expect(con.valor.medida).toBe(true);
    expect(con.valor.t).toBe(AHORA - 10_000);

    const sin = pintarMarca(CAPA_POR_ID["red-privada"], marca(false));
    expect(sin.tramo.id).toBe("desconocido");
    expect(sin.valor.texto).toBe("desconocido");
  });
});
