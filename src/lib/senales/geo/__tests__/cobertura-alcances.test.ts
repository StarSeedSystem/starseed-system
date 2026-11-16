import { describe, expect, it } from "vitest";
import { ALCANCES, MEDIOS_ALCANCE, ROTULO_ALCANCE, metrosPorPixel, radioEnPixeles } from "../alcances";
import { CAPAS_SENALES, CAPA_ENLACES, CAPA_POR_ID, COLOR_DESCONOCIDO, pintarMarca } from "../capas";
import { camposDeCapa, lineasDeEnlaces } from "../cobertura";
import { calidadDeEnlace, enlacesMedidosDe, medioDeEnlace, mismosEnlaces } from "../enlaces-medidos";
import { parchesDeCapa } from "../parches";
import { construirMarcas, type EntradaMarcas } from "../marcas";
import type { PresenciaMedio } from "@/lib/neurons/presencia";

const AHORA = 1_700_000_000_000;
const sen = (o: Record<string, unknown> = {}) => ({
  internet: { enLinea: true, tipo: "wifi", mbps: 18 }, malla: { pares: 0, otrasCuentas: 0 }, lora: { estado: "sin-radio", nodos: 0 },
  serie: { disponible: false, puertos: 0 }, reticulum: { disponible: false, motivo: "x" }, bluetooth: { disponible: true }, ...o,
});
const fila = (id: string, yo = false) => ({ neuronId: id, nombre: id, plataforma: "Android", tipo: "mobile", online: true, esEsteDispositivo: yo, enlace: { estado: "sin-vinculo" } }) as never;
const medio = (n: string, s: unknown): PresenciaMedio => ({ n, m: "m", tipo: "web", etiqueta: "w", visible: true, desde: "", t: AHORA - 1000, s } as never);

function marcas(extra: Partial<EntradaMarcas> = {}) {
  return construirMarcas({
    filas: [fila("yo", true), fila("otra")], medios: [medio("otra", sen({ lora: { estado: "activa", nodos: 2 } }))], ahora: AHORA,
    yo: { neuronaId: "yo", nombre: "Yo", senales: sen() as never, capas: null, posicion: { lat: 19.4326, lon: -99.1332, precisionM: 5, t: AHORA - 5000 } },
    posiciones: { otra: { lat: 19.4330, lon: -99.1330, t: AHORA - 4000 } },
    canal: { unido: true, motivo: null },
    ...extra,
  });
}

describe("alcances: cada cifra lleva su fuente y se rotula como estimada", () => {
  it("tres medios, con metros positivos y fuente escrita", () => {
    expect(MEDIOS_ALCANCE).toEqual(["ble", "wifi", "lora"]);
    for (const k of MEDIOS_ALCANCE) {
      expect(ALCANCES[k].metros).toBeGreaterThan(0);
      expect(ALCANCES[k].fuente.length).toBeGreaterThan(40);
      expect(ALCANCES[k].fuente).toMatch(/referencia|Referencia/);
    }
  });
  it("metros a píxeles: a más zoom, más píxeles; en el ecuador a zoom 0, 156543 m por píxel", () => {
    expect(metrosPorPixel(0, 0)).toBeCloseTo(156543.03, 0);
    expect(radioEnPixeles(30, 19.43, 18)).toBeGreaterThan(radioEnPixeles(30, 19.43, 17));
    expect(radioEnPixeles(30, 19.43, 18)).toBeCloseTo(30 / (156543.03392 * Math.cos((19.43 * Math.PI) / 180) / 2 ** 18), 6);
  });
});

describe("capas de cobertura: estimado, nunca medido", () => {
  it("hay una capa por medio, estado «estimado», tramo rayado y su leyenda dice «alcance estimado»", () => {
    for (const k of MEDIOS_ALCANCE) {
      const c = CAPA_POR_ID[`cobertura-${k}`];
      expect(c.tipo).toBe("alcance");
      expect(c.estado).toBe("estimado");
      const t = c.tramos.find((x) => x.id === "estimado")!;
      expect(t.estilo).toBe("rayado");
      expect(t.etiqueta.toLowerCase()).toContain("alcance estimado");
      expect(c.fuente).toContain("no medido");
    }
  });
  it("ninguna capa de alcance usa el estilo «relleno» de lo medido, ni ninguna medida usa «rayado»", () => {
    for (const c of CAPAS_SENALES) {
      for (const t of c.tramos) {
        if ((c.tipo === "alcance" && t.id === "estimado") || (c.grupo === "red" && t.id === "estimada")) expect(t.estilo).toBe("rayado");
        else expect(t.estilo).not.toBe("rayado");
      }
    }
  });
  it("BLE1115C: el Bluetooth se estima en 10 m (uso interior típico), no en 30, y sigue rotulado como estimado", () => {
    expect(ALCANCES.ble.metros).toBe(10);
    expect(ALCANCES.ble.fuente).toMatch(/10 m/);
    expect(ALCANCES.ble.fuente).not.toMatch(/se toma 30 m/);
    expect(ROTULO_ALCANCE).toBe("alcance estimado");
  });
  it("un campo por neurona con la radio encendida y posición en vivo, con el radio de la tabla", () => {
    const m = marcas();
    const ble = camposDeCapa(CAPA_POR_ID["cobertura-ble"], m, AHORA);
    expect(ble.map((c) => c.marcaId).sort()).toEqual(["neurona:otra", "neurona:yo"]);
    expect(ble.every((c) => c.metros === ALCANCES.ble.metros)).toBe(true);
    // LoRa: solo la neurona «otra» anuncia radio activa.
    expect(camposDeCapa(CAPA_POR_ID["cobertura-lora"], m, AHORA).map((c) => c.marcaId)).toEqual(["neurona:otra"]);
  });
  it("sin radio, sin posición o con posición antigua: no hay campo (y el parche de alcance no existe)", () => {
    const sinBt = marcas({ yo: { neuronaId: "yo", nombre: "Yo", senales: sen({ bluetooth: { disponible: false } }) as never, capas: null, posicion: { lat: 1, lon: 1, precisionM: null, t: AHORA } } });
    expect(camposDeCapa(CAPA_POR_ID["cobertura-ble"], sinBt, AHORA).map((c) => c.marcaId)).toEqual(["neurona:otra"]);
    expect(camposDeCapa(CAPA_POR_ID["cobertura-ble"], marcas({ posiciones: {} }), AHORA).map((c) => c.marcaId)).toEqual(["neurona:yo"]);
    expect(camposDeCapa(CAPA_POR_ID["cobertura-ble"], marcas(), AHORA + 10 * 60_000)).toEqual([]);
    expect(parchesDeCapa(CAPA_POR_ID["cobertura-ble"], marcas(), AHORA)).toEqual([]);
  });
  it("radio desconocida: gris y hueco", () => {
    const m = marcas({ medios: [] }).find((x) => x.id === "neurona:otra")!;
    const { tramo } = pintarMarca(CAPA_POR_ID["cobertura-wifi"], m);
    expect(tramo.color).toBe(COLOR_DESCONOCIDO);
    expect(tramo.estilo).toBe("hueco");
  });
});

describe("enlaces medidos: Bluetooth y Wi-Fi con número real", () => {
  const crudos = [
    { id: "ble:b1", tipo: "ble", abierto: true, rttMs: 80, capacidadKbps: 300, alcanza: { neuronDeviceId: "otra" } },
    { id: "nativo:192.168.1.5", tipo: "nativo", abierto: true, rttMs: 12, capacidadKbps: null, alcanza: { neuronDeviceId: "otra" } },
    { id: "local:x", tipo: "local", abierto: true, ruta: "internet", rttMs: 50, alcanza: { neuronDeviceId: "otra" } },
    { id: "ble:b2", tipo: "ble", abierto: true, rttMs: null, capacidadKbps: null, alcanza: { neuronDeviceId: "otra" } },
    { id: "ble:b3", tipo: "ble", abierto: false, rttMs: 10, alcanza: { neuronDeviceId: "otra" } },
  ];
  it("solo entran los abiertos, de medio conocido y con alguna medida", () => {
    const e = enlacesMedidosDe(crudos, AHORA);
    expect(e.map((x) => [x.id, x.medio])).toEqual([["ble:b1", "ble"], ["nativo:192.168.1.5", "wifi"]]);
    expect(medioDeEnlace({ id: "l", tipo: "local", abierto: true, ruta: "misma-red-local" })).toBe("wifi");
    expect(mismosEnlaces(e, enlacesMedidosDe(crudos, AHORA + 5))).toBe(true);
  });
  it("calidad: por ida y vuelta; sin ella, por capacidad; sin nada, null", () => {
    expect(calidadDeEnlace({ rttMs: 20, kbps: null })).toBe(1);
    expect(calidadDeEnlace({ rttMs: null, kbps: 10_000 })).toBe(0.5);
    expect(calidadDeEnlace({ rttMs: null, kbps: null })).toBeNull();
  });
  it("las capas Bluetooth y Wi-Fi dejan de decir «sin medir» cuando hay un enlace con medida, y siguen grises si no", () => {
    const enlaces = enlacesMedidosDe(crudos, AHORA);
    const con = marcas({ enlaces }).find((x) => x.id === "neurona:otra")!;
    const sin = marcas().find((x) => x.id === "neurona:otra")!;
    const b = pintarMarca(CAPA_POR_ID["senal-bluetooth"], con);
    expect(b.valor.medida).toBe(true);
    expect(b.tramo.id).not.toBe("desconocido");
    expect(b.valor.texto).toContain("80 ms");
    expect(pintarMarca(CAPA_POR_ID["senal-wifi"], con).valor.medida).toBe(true);
    expect(pintarMarca(CAPA_POR_ID["senal-bluetooth"], sin).tramo.id).toBe("desconocido");
    expect(pintarMarca(CAPA_POR_ID["senal-wifi"], sin).tramo.id).toBe("desconocido");
  });
  it("una línea por enlace medido entre dos puntos en vivo, coloreada por su calidad, con la hora de la medida", () => {
    const enlaces = enlacesMedidosDe(crudos, AHORA);
    const l = lineasDeEnlaces(enlaces, marcas({ enlaces }), AHORA, () => "12:00");
    expect(l).toHaveLength(2);
    expect(l[0].texto).toContain("medido a las 12:00");
    expect(l[0].color).toBe(CAPA_ENLACES.tramos.find((t) => t.id === "regular")!.color); // 80 ms
    expect(l[1].color).toBe(CAPA_ENLACES.tramos.find((t) => t.id === "buena")!.color); // 12 ms
    // si la otra neurona no tiene posición, no hay línea
    expect(lineasDeEnlaces(enlaces, marcas({ enlaces, posiciones: {} }), AHORA, () => "")).toEqual([]);
  });
  it("vive: al cambiar la presencia o los enlaces, el resultado cambia sin recargar", () => {
    const a = camposDeCapa(CAPA_POR_ID["cobertura-ble"], marcas(), AHORA).length;
    const b = camposDeCapa(CAPA_POR_ID["cobertura-ble"], marcas({ posiciones: {} }), AHORA).length;
    expect(a).toBe(2);
    expect(b).toBe(1);
  });
});

describe("capas de capacidad: color donde se anuncia, gris y hueco donde no se sabe", () => {
  it("conciencia: encendida con color; sin anuncio, gris hueco", () => {
    const con = marcas({ medios: [{ ...medio("otra", sen()), c: ["capa:local", "capa:nube"] } as never] }).find((x) => x.id === "neurona:otra")!;
    expect(pintarMarca(CAPA_POR_ID["conciencia-nube"], con).tramo.id).toBe("si");
    const sin = marcas().find((x) => x.id === "neurona:otra")!;
    expect(pintarMarca(CAPA_POR_ID["conciencia-nube"], sin).tramo).toMatchObject({ color: COLOR_DESCONOCIDO, estilo: "hueco" });
    for (const id of ["oferta-computo", "oferta-almacenamiento", "oferta-internet"]) expect(pintarMarca(CAPA_POR_ID[id], con).tramo.id).toBe("desconocido");
  });
});

describe("líneas: dos medios entre las mismas neuronas", () => {
  it("el segundo se apila (más fino, encima) y cada uno lleva su propio color y su hora", () => {
    const enlaces = enlacesMedidosDe([
      { id: "ble:1", tipo: "ble", abierto: true, rttMs: 300, alcanza: { neuronDeviceId: "otra" } },
      { id: "nativo:1", tipo: "nativo", abierto: true, rttMs: 15, alcanza: { neuronDeviceId: "otra" } },
    ], AHORA);
    const l = lineasDeEnlaces(enlaces, marcas({ enlaces }), AHORA, () => "09:05");
    expect(l.map((x) => x.pila)).toEqual([0, 1]);
    expect(l[0].color).not.toBe(l[1].color);
    expect(l.every((x) => x.texto.includes("09:05"))).toBe(true);
  });
});
