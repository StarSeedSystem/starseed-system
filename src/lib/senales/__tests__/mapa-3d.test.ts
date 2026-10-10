/**
 * Pruebas del MODELO PURO del Mapa 3D de señales reales. Sin DOM ni WebGL: la
 * geometría de cuñas se comprueba contra `three` de verdad (RingGeometry girado
 * como en la escena), y la orientación del suelo contra la colocación REAL del
 * agregador de señales (`collectDetectedSignals`), para que radar plano y mapa 3D
 * no puedan discrepar sin que esto se ponga rojo.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  ANTENNA_SECTOR, collectDetectedSignals, radiusFracForMeters,
  type AntennaKind, type DetectedSignal,
} from "@/ai/astraura/mesh/signals";
import type { MeshState } from "@/ai/astraura/mesh/types";
import {
  ALTURA_MAX, FAMILIAS, FORMA_POR_FAMILIA, KIND_ANGLE, MODOS_ALTURA, RADIO_ESCENA,
  RECIENTE_MS, SALTOS_MAX, VENTANA_FRESCURA_MS,
  alturaDe, antenasPropias, colorCalidad, construirMarcadores, cunaDeSector, descripcionAccesible,
  FOV_VERTICAL, encuadreCamara, esColocable, filtrarSenales, idsConEtiqueta, leyendaAltura, lineaResumen, posicionEnSuelo,
  radioHalo, radioMarcador, resumenMapa, resumenVivo, saltosDe, sectoresDelSuelo, textoCalidad, textoDistancia,
  construirMedios, ORBITA_MEDIO, ORBITA_MEDIO_YO,
} from "../mapa-3d";
import type { EstadoAparato, MedioMapa, VivoMapa } from "../tipos-vivo";

const AHORA = 1_800_000_000_000;

function senal(id: string, o: Partial<DetectedSignal> = {}): DetectedSignal {
  const antenna: AntennaKind = o.antenna ?? "lora";
  return {
    id,
    antenna,
    antennaLabel: antenna,
    signalType: "prueba",
    label: id,
    detail: "prueba",
    quality: 0.5,
    qualityDetail: "prueba",
    metrics: [],
    compatible: true,
    compatDetail: "prueba",
    starseed: null,
    placement: {
      angleRad: 0, radiusFrac: 0.5, accuracyFrac: 0.1, mode: "rf",
      distanceM: 300, accuracyM: 100, detail: "prueba",
    },
    lastHeard: AHORA,
    actions: [],
    simulated: false,
    color: "#34d399",
    ...o,
  };
}

describe("constantes compartidas con el radar plano", () => {
  it("la rosa de antenas propias conserva los ejes históricos del radar", () => {
    const grados = (k: keyof typeof KIND_ANGLE) => Math.round((KIND_ANGLE[k] * 180) / Math.PI);
    expect(grados("mesh")).toBe(-90);
    expect(grados("serial")).toBe(-45);
    expect(grados("bluetooth")).toBe(0);
    expect(grados("wifi")).toBe(33);
    expect(grados("cellular")).toBe(57);
    expect(grados("gps")).toBe(180);
    expect(grados("nfc")).toBe(-147);
    expect(grados("telephony")).toBe(-123);
  });

  it("los colores de calidad cortan en 0,34 y 0,62 y sin métrica es gris", () => {
    expect(colorCalidad(0.62)).toBe("#34d399");
    expect(colorCalidad(0.619)).toBe("#fbbf24");
    expect(colorCalidad(0.34)).toBe("#fbbf24");
    expect(colorCalidad(0.339)).toBe("#fb7185");
    expect(colorCalidad(null)).toBe("#8b8b9e");
    expect(textoCalidad(null)).toBe("sin métrica");
    expect(textoCalidad(0.9)).toBe("fuerte");
    expect(textoCalidad(0.5)).toBe("media");
    expect(textoCalidad(0.1)).toBe("débil");
  });

  it("hay una forma distinta por cada familia de antena", () => {
    expect(new Set(FAMILIAS.map((f) => FORMA_POR_FAMILIA[f])).size).toBe(FAMILIAS.length);
  });
});

describe("posición en el suelo", () => {
  it("arriba del radar (−90°) es −z y el este (0°) es +x", () => {
    const arriba = posicionEnSuelo(senal("a", { placement: { ...senal("x").placement, angleRad: -Math.PI / 2, radiusFrac: 0.5 } }));
    expect(arriba.x).toBeCloseTo(0, 6);
    expect(arriba.z).toBeCloseTo(-0.5 * RADIO_ESCENA, 6);
    const este = posicionEnSuelo(senal("b", { placement: { ...senal("x").placement, angleRad: 0, radiusFrac: 0.5 } }));
    expect(este.x).toBeCloseTo(0.5 * RADIO_ESCENA, 6);
    expect(este.z).toBeCloseTo(0, 6);
  });

  it("acota el radio como el radar: nunca encima del centro ni fuera del disco", () => {
    const cerca = posicionEnSuelo(senal("c", { placement: { ...senal("x").placement, radiusFrac: 0 } }));
    expect(Math.hypot(cerca.x, cerca.z)).toBeCloseTo(0.1 * RADIO_ESCENA, 6);
    const lejos = posicionEnSuelo(senal("d", { placement: { ...senal("x").placement, radiusFrac: 5 } }));
    expect(Math.hypot(lejos.x, lejos.z)).toBeCloseTo(0.97 * RADIO_ESCENA, 6);
  });

  it("un vecino con GPS al NORTE real queda arriba (−z) y uno al ESTE queda a la derecha (+x)", () => {
    const mesh = {
      status: "ready", transport: "serial", region: "EU_868",
      self: { num: 1, isSelf: true, lat: 40.0, lon: -3.0, lastHeard: AHORA, presence: "online" },
      nodes: [
        { num: 2, shortName: "norte", lat: 40.005, lon: -3.0, lastHeard: AHORA, presence: "online", snr: 5 },
        { num: 3, shortName: "este", lat: 40.0, lon: -2.995, lastHeard: AHORA, presence: "online", snr: 5 },
      ],
      edges: [], remoteTopologies: [],
    } as unknown as MeshState;
    const lista = collectDetectedSignals({ mesh, includeExternal: false, now: AHORA });
    const norte = posicionEnSuelo(lista.find((s) => s.id === "lora:2")!);
    const este = posicionEnSuelo(lista.find((s) => s.id === "lora:3")!);
    expect(lista.find((s) => s.id === "lora:2")!.placement.mode).toBe("gps");
    expect(norte.z).toBeLessThan(0);
    expect(Math.abs(norte.x)).toBeLessThan(0.01);
    expect(este.x).toBeGreaterThan(0);
    expect(Math.abs(este.z)).toBeLessThan(0.01);
  });

  it("no pinta colocaciones con NaN", () => {
    expect(esColocable(senal("a"))).toBe(true);
    expect(esColocable(senal("b", { placement: { ...senal("x").placement, angleRad: Number.NaN } }))).toBe(false);
    expect(esColocable(senal("c", { placement: { ...senal("x").placement, radiusFrac: Number.POSITIVE_INFINITY } }))).toBe(false);
    expect(construirMarcadores([senal("a"), senal("b", { placement: { ...senal("x").placement, angleRad: Number.NaN } })], "calidad", AHORA).map((m) => m.id)).toEqual(["a"]);
  });

  it("el halo se recorta como en el radar y el marcador crece con la calidad", () => {
    const minimo = radioHalo(senal("a", { placement: { ...senal("x").placement, accuracyFrac: 0 } }));
    expect(minimo).toBeCloseTo(0.027 * RADIO_ESCENA, 6);
    const maximo = radioHalo(senal("b", { placement: { ...senal("x").placement, accuracyFrac: 3 } }));
    expect(maximo).toBeCloseTo(0.62 * RADIO_ESCENA, 6);
    expect(radioMarcador(1)).toBeGreaterThan(radioMarcador(0.2));
    // Sin métrica pesa lo mismo que una calidad baja (0,25), como en el radar plano.
    expect(radioMarcador(null)).toBeCloseTo(radioMarcador(0.25), 6);
  });
});

describe("altura: un eje con significado y sin datos inventados", () => {
  it("plano deja todo en el suelo, medido", () => {
    expect(alturaDe(senal("a"), "plano", AHORA)).toEqual({ y: 0, medida: true });
  });

  it("calidad: proporcional; sin métrica se queda en el suelo y NO medida", () => {
    expect(alturaDe(senal("a", { quality: 1 }), "calidad", AHORA)).toEqual({ y: ALTURA_MAX, medida: true });
    expect(alturaDe(senal("b", { quality: 0.5 }), "calidad", AHORA).y).toBeCloseTo(ALTURA_MAX / 2, 6);
    expect(alturaDe(senal("c", { quality: null }), "calidad", AHORA)).toEqual({ y: 0, medida: false });
    expect(alturaDe(senal("d", { quality: 7 }), "calidad", AHORA).y).toBe(ALTURA_MAX);
  });

  it("frescura: recién oída arriba, a los 10 min en el suelo, sin dato no medida", () => {
    expect(alturaDe(senal("a", { lastHeard: AHORA }), "frescura", AHORA).y).toBeCloseTo(ALTURA_MAX, 6);
    expect(alturaDe(senal("b", { lastHeard: AHORA - VENTANA_FRESCURA_MS / 2 }), "frescura", AHORA).y).toBeCloseTo(ALTURA_MAX / 2, 6);
    expect(alturaDe(senal("c", { lastHeard: AHORA - VENTANA_FRESCURA_MS * 3 }), "frescura", AHORA).y).toBe(0);
    expect(alturaDe(senal("d", { lastHeard: null }), "frescura", AHORA)).toEqual({ y: 0, medida: false });
    // Un reloj adelantado respecto a la fuente no puede sacarla del techo.
    expect(alturaDe(senal("e", { lastHeard: AHORA + 60_000 }), "frescura", AHORA).y).toBe(ALTURA_MAX);
  });

  it("saltos: solo los que informan «Saltos»; 0 saltos es un dato medido en el suelo", () => {
    const con = (n: string) => senal("s", { metrics: [{ label: "Saltos", value: n }] });
    expect(saltosDe(con("2"))).toBe(2);
    expect(saltosDe(senal("x"))).toBeNull();
    expect(saltosDe(con("raro"))).toBeNull();
    expect(alturaDe(con("0"), "saltos", AHORA)).toEqual({ y: 0, medida: true });
    expect(alturaDe(con("2"), "saltos", AHORA).y).toBeCloseTo((2 / SALTOS_MAX) * ALTURA_MAX, 6);
    expect(alturaDe(con("9"), "saltos", AHORA).y).toBe(ALTURA_MAX);
    expect(alturaDe(senal("x"), "saltos", AHORA)).toEqual({ y: 0, medida: false });
  });

  it("cada modo tiene su explicación para la leyenda", () => {
    for (const m of MODOS_ALTURA) expect(leyendaAltura(m.id).length).toBeGreaterThan(20);
    expect(MODOS_ALTURA.map((m) => m.id)).toEqual(["calidad", "frescura", "saltos", "plano"]);
  });
});

describe("enlaces medidos en los marcadores", () => {
  it("un nodo LoRa oído por el radio es un enlace de RF; lo que oye otra neurona no", () => {
    expect(construirMarcadores([senal("lora:7", { antenna: "lora" })], "plano", AHORA)[0].enlaceMapa?.clase).toBe("rf-lora");
    expect(construirMarcadores([senal("remoto:n1:lora:7", { antenna: "lora" })], "plano", AHORA)[0].enlaceMapa).toBeNull();
  });

  it("BLE, IP, serie y relé no son enlaces", () => {
    for (const antenna of ["ble", "ip", "serial", "relay"] as AntennaKind[]) {
      expect(construirMarcadores([senal(`${antenna}:x`, { antenna })], "plano", AHORA)[0].enlaceMapa).toBeNull();
    }
  });

  it("con la vista en vivo, un aparato lleva su estado, su enlace y lo que oye", () => {
    const vivo: VivoMapa = {
      enlaces: new Map([["neuron:1", { clase: "p2p-red-local", etiqueta: "P2P · misma red local", latenciaMs: 12 }]]),
      estados: new Map<string, EstadoAparato>([["neuron:1", "activa"], ["neuron:2", "desconectada"]]),
      medios: [], extras: [], oidas: new Map([["neuron:1", 3]]), presenciaConectada: true,
    };
    const ms = construirMarcadores([senal("neuron:1", { antenna: "account" }), senal("neuron:2", { antenna: "account" })], "plano", AHORA, vivo);
    expect(ms[0]).toMatchObject({ esAparato: true, estado: "activa", tenue: false, oidas: 3, colorEstado: "#34d399" });
    expect(ms[0].enlaceMapa?.clase).toBe("p2p-red-local");
    expect(ms[1]).toMatchObject({ estado: "desconectada", tenue: true, oidas: 0 });
    expect(ms[1].enlaceMapa).toBeNull();
  });
});

describe("construirMarcadores", () => {
  it("traduce cada canal visual desde un dato real de la señal", () => {
    const s = senal("neuron:1", {
      antenna: "account", quality: 0.9, color: "#c084fc", simulated: true,
      lastHeard: AHORA - 5_000,
      starseed: { via: "neuron-registry", sourceId: "1", name: "Mac", ownAccount: true, capabilities: [] },
    });
    const [m] = construirMarcadores([s], "calidad", AHORA);
    expect(m.forma).toBe("icosaedro");
    expect(m.colorNucleo).toBe(colorCalidad(0.9));
    expect(m.colorContorno).toBe("#c084fc");
    expect(m.conCuenta).toBe(true);
    expect(m.simulada).toBe(true);
    expect(m.reciente).toBe(true);
    expect(m.y).toBeCloseTo(0.9 * ALTURA_MAX, 6);
    expect(m.alturaMedida).toBe(true);
  });

  it("«reciente» es oída hace menos de 30 s, ni antes ni con futuro", () => {
    const lista = construirMarcadores(
      [
        senal("a", { lastHeard: AHORA - RECIENTE_MS + 1 }),
        senal("b", { lastHeard: AHORA - RECIENTE_MS }),
        senal("c", { lastHeard: AHORA + 1000 }),
        senal("d", { lastHeard: null }),
      ],
      "plano", AHORA,
    );
    expect(lista.map((m) => m.reciente)).toEqual([true, false, false, false]);
  });

  it("es determinista: mismas entradas, mismos marcadores", () => {
    const entrada = [senal("a"), senal("b", { quality: null })];
    expect(construirMarcadores(entrada, "calidad", AHORA)).toEqual(construirMarcadores(entrada, "calidad", AHORA));
  });
});

describe("cuñas de sector sobre el suelo", () => {
  it("las cuñas de CADA familia caen en su rumbo una vez girado el anillo como en la escena", () => {
    for (const familia of FAMILIAS) {
      const sec = ANTENNA_SECTOR[familia];
      const { thetaStart, thetaLength } = cunaDeSector(sec.center, sec.half);
      const geo = new THREE.RingGeometry(0.7, RADIO_ESCENA, 40, 1, thetaStart, thetaLength);
      geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
      const pos = geo.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const ang = Math.atan2(pos.getZ(i), pos.getX(i));
        // Diferencia angular con el centro del sector, normalizada a (−π, π].
        let d = ang - sec.center;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        expect(Math.abs(d)).toBeLessThanOrEqual(sec.half + 1e-6);
      }
      geo.dispose();
    }
  });

  it("marca como vivas solo las familias con señales y rotula en el borde", () => {
    const secs = sectoresDelSuelo([senal("a", { antenna: "ble" }), senal("b", { antenna: "ble" }), senal("c", { antenna: "lora" })]);
    expect(secs.map((s) => s.familia)).toEqual([...FAMILIAS]);
    expect(secs.filter((s) => s.viva).map((s) => s.familia).sort()).toEqual(["ble", "lora"]);
    const lora = secs.find((s) => s.familia === "lora")!;
    expect(lora.z).toBeLessThan(-RADIO_ESCENA); // LoRa está arriba (−z), fuera del disco
    expect(Math.hypot(lora.x, lora.z)).toBeCloseTo(RADIO_ESCENA + 0.9, 6);
  });
});

describe("antenas propias", () => {
  const fuente = (kind: keyof typeof KIND_ANGLE, status: string) => ({ kind, label: `${kind}!`, status, detail: "d" });

  it("solo se dibujan las que existen (activa, disponible o informativa)", () => {
    const lista = antenasPropias([
      fuente("mesh", "active"), fuente("gps", "available"), fuente("telephony", "info"),
      fuente("nfc", "unsupported"), fuente("wifi", "off"),
    ]);
    expect(lista.map((a) => a.kind)).toEqual(["mesh", "gps", "telephony"]);
  });

  it("cuanto más en uso, más cerca del centro", () => {
    const [activa, disponible, info] = antenasPropias([
      fuente("mesh", "active"), fuente("mesh", "available"), fuente("mesh", "info"),
    ]);
    const d = (a: { x: number; z: number }) => Math.hypot(a.x, a.z);
    expect(d(activa)).toBeLessThan(d(disponible));
    expect(d(disponible)).toBeLessThan(d(info));
  });

  it("se alinean con el eje de su antena (LoRa arriba)", () => {
    const [mesh] = antenasPropias([fuente("mesh", "active")]);
    expect(mesh.x).toBeCloseTo(0, 6);
    expect(mesh.z).toBeLessThan(0);
  });
});

describe("filtros, resumen y etiquetas", () => {
  const propia = { via: "neuron-registry" as const, sourceId: "n", name: "Mac", ownAccount: true, capabilities: [] };
  const lista = [
    senal("lora:1", { antenna: "lora", simulated: true, quality: 0.8 }),
    senal("ble:1", { antenna: "ble", quality: null, compatible: false, placement: { ...senal("x").placement, mode: "sector", distanceM: null } }),
    senal("neuron:1", { antenna: "account", starseed: propia, placement: { ...senal("x").placement, mode: "gps" } }),
    senal("neuron:2", { antenna: "account", starseed: { ...propia, ownAccount: false } }),
  ];

  const f = (o: Partial<Parameters<typeof filtrarSenales>[1]> = {}) => ({ ocultas: [], cuenta: "todas" as const, ocultarDesconectados: false, ...o });

  it("filtra por familia oculta y por cuenta", () => {
    expect(filtrarSenales(lista, f())).toHaveLength(4);
    expect(filtrarSenales(lista, f({ ocultas: ["ble"] })).map((s) => s.id)).toEqual(["lora:1", "neuron:1", "neuron:2"]);
    expect(filtrarSenales(lista, f({ cuenta: "propia" })).map((s) => s.id)).toEqual(["neuron:1"]);
    expect(filtrarSenales(lista, f({ cuenta: "otra" })).map((s) => s.id)).toEqual(["neuron:2"]);
    expect(filtrarSenales(lista, f({ cuenta: "ninguna" })).map((s) => s.id)).toEqual(["lora:1", "ble:1"]);
    expect(filtrarSenales(lista, f({ ocultas: ["account"], cuenta: "propia" }))).toEqual([]);
  });

  it("«ocultar desconectados» quita solo aparatos desconectados (por la vista en vivo o por su latido)", () => {
    const vivo = { enlaces: new Map(), estados: new Map<string, EstadoAparato>([["neuron:1", "desconectada"]]), medios: [], extras: [], oidas: new Map(), presenciaConectada: true } as VivoMapa;
    expect(filtrarSenales(lista, f({ ocultarDesconectados: true }), vivo).map((s) => s.id)).toEqual(["lora:1", "ble:1", "neuron:2"]);
    const sinVivo = [senal("neuron:9", { antenna: "account", starseed: { ...propia, online: false } }), senal("neuron:8", { antenna: "account", starseed: { ...propia, online: true } })];
    expect(filtrarSenales(sinVivo, f({ ocultarDesconectados: true })).map((s) => s.id)).toEqual(["neuron:8"]);
  });

  it("resume solo lo que hay: GPS, RF, sector, cuentas, simuladas", () => {
    const r = resumenMapa(lista);
    expect(r).toMatchObject({ total: 4, gps: 1, rf: 2, sector: 1, conCuenta: 2, tuyas: 1, compatibles: 3, sinCalidad: 1, simuladas: 1 });
    expect(r.porCuenta).toEqual({ todas: 4, propia: 1, otra: 1, ninguna: 2 });
    expect(r.porFamilia).toEqual({ lora: 1, relay: 0, account: 2, ip: 0, ble: 1, serial: 0 });
    expect(resumenMapa([]).total).toBe(0);
  });

  it("etiquetas: siempre la elegida y la apuntada; en «todas», las primeras hasta el máximo", () => {
    const ms = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
    expect([...idsConEtiqueta(ms, { modo: "seleccion", seleccionId: null, apuntadaId: null })]).toEqual([]);
    expect([...idsConEtiqueta(ms, { modo: "seleccion", seleccionId: "d", apuntadaId: "b" })].sort()).toEqual(["b", "d"]);
    expect([...idsConEtiqueta(ms, { modo: "todas", seleccionId: null, apuntadaId: null, max: 2 })]).toEqual(["a", "b"]);
    // La elegida no gasta el cupo de las «principales».
    expect([...idsConEtiqueta(ms, { modo: "todas", seleccionId: "e", apuntadaId: null, max: 2 })].sort()).toEqual(["a", "b", "e"]);
    expect([...idsConEtiqueta(ms, { modo: "todas", seleccionId: "a", apuntadaId: null, max: 2 })].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("textos", () => {
  it("distancias legibles y honestas", () => {
    expect(textoDistancia(null)).toBe("sin distancia");
    expect(textoDistancia(250)).toBe("250 m");
    expect(textoDistancia(1500)).toBe("1,5 km");
  });

  it("la línea de resumen dice calidad, distancia y de dónde sale la posición", () => {
    expect(lineaResumen(senal("a", { quality: 0.756 }))).toBe("76/100 · ≈300 m (est. RF)");
    expect(lineaResumen(senal("b", { quality: null, placement: { ...senal("x").placement, mode: "sector", distanceM: null } }))).toBe("sin métrica · sin distancia (sin posición)");
  });

  it("la descripción accesible cuenta lo que hay y declara el eje de altura", () => {
    expect(descripcionAccesible(resumenMapa([]), "calidad")).toContain("ninguna señal");
    const d = descripcionAccesible(resumenMapa([senal("a")]), "frescura");
    expect(d).toContain("1 señales");
    expect(d).toContain("frescura");
    expect(d).toContain("distancia estimada por radiofrecuencia");
  });

  it("con aparatos, la descripción dice cuántos están activos y cuántos tienen enlace medido", () => {
    const rv = { aparatos: 3, porEstado: { activa: 2, "segundo-plano": 0, "en-linea": 1, desconectada: 0 }, conCanal: 2, medios: 4, oidas: 0 };
    expect(descripcionAccesible(resumenMapa([senal("a")]), "calidad", rv)).toContain("3 aparatos de tu cuenta, 2 activos ahora y 2 con enlace medido");
  });
});

describe("encuadreCamara", () => {
  const dist = (p: number[], o: number[]) => Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]);

  it("en horizontal la vista inclinada es cercana y mira al centro del suelo", () => {
    const e = encuadreCamara(900, 480, "inclinada");
    expect(e.posicion[0]).toBe(0);
    expect(e.posicion[1]).toBeGreaterThan(0);
    // 22,5 unidades del centro del disco, mirando al suelo (y = 0).
    expect(dist(e.posicion, [0, 0, 0])).toBeCloseTo(22.5, 1);
    expect(e.objetivo[1]).toBe(0);
  });

  it("en vertical se aleja y se eleva para que el disco quepa a lo ancho", () => {
    const ancha = encuadreCamara(900, 480, "inclinada");
    const movil = encuadreCamara(340, 380, "inclinada");
    expect(dist(movil.posicion, [0, 0, 0])).toBeGreaterThan(dist(ancha.posicion, [0, 0, 0]));
    expect(movil.posicion[1]).toBeGreaterThan(ancha.posicion[1]);
    // El disco con sus rótulos (radio ≈ 12) cabe en la mitad del campo horizontal a esa distancia.
    const tanH = Math.tan((FOV_VERTICAL / 2) * (Math.PI / 180)) * (340 / 380);
    expect(dist(movil.posicion, [0, 0, 0]) * tanH).toBeGreaterThanOrEqual(12.3);
  });

  it("desde arriba mira en vertical al centro y respeta lienzos estrechos", () => {
    const e = encuadreCamara(900, 480, "cenital");
    expect(e.posicion[0]).toBe(0);
    expect(e.objetivo).toEqual([0, 0, 0]);
    expect(encuadreCamara(300, 600, "cenital").posicion[1]).toBeGreaterThan(e.posicion[1]);
  });

  it("medidas inválidas no producen NaN", () => {
    for (const [a, b] of [[0, 0], [-5, 10], [NaN, 300]] as const) {
      for (const v of ["inclinada", "cenital"] as const) {
        const e = encuadreCamara(a, b, v);
        expect([...e.posicion, ...e.objetivo].every(Number.isFinite)).toBe(true);
      }
    }
  });
});

describe("resumen en vivo y medios", () => {
  const vivo: VivoMapa = {
    enlaces: new Map([
      ["neuron:1", { clase: "p2p-turn", etiqueta: "x", latenciaMs: 80 }],
      ["neuron:2", { clase: "rele", etiqueta: "x", latenciaMs: null }],
      ["local:a", { clase: "directo-sin-internet", etiqueta: "x", latenciaMs: 5 }],
    ]),
    estados: new Map<string, EstadoAparato>([["neuron:1", "activa"], ["neuron:2", "en-linea"], ["local:a", "en-linea"]]),
    medios: [], extras: [], oidas: new Map(), presenciaConectada: true,
  };
  const lista = [
    senal("neuron:1", { antenna: "account" }), senal("neuron:2", { antenna: "account" }), senal("local:a", { antenna: "account" }),
    senal("remoto:n1:lora:5", { antenna: "lora" }), senal("lora:1"),
  ];

  it("cuenta aparatos por estado y solo da por «con canal» el P2P y el directo (no el relé)", () => {
    expect(resumenVivo(lista, vivo)).toMatchObject({
      aparatos: 3, conCanal: 2, medios: 0, oidas: 1,
      porEstado: { activa: 1, "segundo-plano": 0, "en-linea": 2, desconectada: 0 },
    });
    expect(resumenVivo(lista, null)).toMatchObject({ aparatos: 3, conCanal: 0, oidas: 1 });
  });

  const medio = (m: string, padreId: string): MedioMapa => ({
    id: `medio:${m}`, m, neuronaId: "n", padreId, etiqueta: m, tipo: "navegador", visible: true, propio: padreId === "yo", desde: "2026-10-10T00:00:00Z",
    ficha: { titulo: m, subtitulo: "", resumen: "", secciones: [] },
  });

  it("los medios orbitan a su aparato a un radio fijo y los de «Tú» al centro", () => {
    const ms = construirMarcadores([senal("neuron:1", { antenna: "account" })], "plano", AHORA);
    const sat = construirMedios([medio("a", "neuron:1"), medio("b", "neuron:1"), medio("c", "yo")], ms);
    expect(sat).toHaveLength(3);
    for (const s of sat.filter((x) => x.medio.padreId === "neuron:1")) {
      expect(Math.hypot(s.x - s.padre.x, s.z - s.padre.z)).toBeCloseTo(ORBITA_MEDIO, 6);
    }
    const yo = sat.find((x) => x.id === "medio:c")!;
    expect(Math.hypot(yo.x, yo.z)).toBeCloseTo(ORBITA_MEDIO_YO, 6);
    const [a, b] = sat.filter((x) => x.medio.padreId === "neuron:1");
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1);
  });

  it("un medio cuyo aparato no se dibuja (filtrado o ausente) no sale", () => {
    expect(construirMedios([medio("z", "neuron:99")], construirMarcadores([senal("neuron:1", { antenna: "account" })], "plano", AHORA))).toEqual([]);
  });
});
