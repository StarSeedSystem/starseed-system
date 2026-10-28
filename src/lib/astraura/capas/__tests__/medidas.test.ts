import { describe, expect, it } from "vitest";
import { leerPreferenciaCapas } from "../../capas-conciencia";
import { planificar, type CapaInstalada, type EntradaPlanificador } from "../planificador";
import {
  VENTANA_MEDIDAS, crearAlmacenMedidas, mediaDe, ordenarPorMedidas,
  promediarMedidas, registrarMedida, type MedidaCapas,
} from "../medidas";

const SHA = "b".repeat(64);
const medida = (modelo: string, latenciaMs: number, extra: Partial<MedidaCapas> = {}): MedidaCapas =>
  ({ neurona: "a1", modelo, capa: "palabra", latenciaMs, ...extra });

const capa = (id: string, tipo: CapaInstalada["capa"]): CapaInstalada =>
  ({ id, capa: tipo, sha256: SHA, ramMinMb: 0 });
const INSTALADAS = [
  capa("ternary-bonsai-4b", "palabra"),
  capa("ternary-bonsai-1.7b", "palabra"),
  capa("needle3-reflejo", "reflejo"),
];
const BASE: EntradaPlanificador = {
  tarea: "chat", dificultad: 0.2, privacidad: "publica", segundoPlano: false,
  perfil: { medio: "nativo", conexion: "rapida", webgpu: true, ramMb: 8192, bateriaPct: 80, visible: true },
  presupuesto: { discoMb: 8000, ramMb: 8192 }, instaladas: INSTALADAS, nodos: [],
  preferencias: leerPreferenciaCapas(),
};

describe("registrarMedida", () => {
  it("guarda la media móvil de las últimas 20 medidas", () => {
    let almacen = crearAlmacenMedidas();
    for (let i = 1; i <= VENTANA_MEDIDAS + 1; i++) {
      almacen = registrarMedida(almacen, medida("ternary-bonsai-4b", i));
    }
    expect(almacen).toHaveLength(VENTANA_MEDIDAS);
    expect(mediaDe(almacen, "a1", "ternary-bonsai-4b")?.latenciaMs).toBe(11.5);
  });
  it("separa por neurona, modelo y capa", () => {
    let almacen = crearAlmacenMedidas();
    almacen = registrarMedida(almacen, medida("uno", 100));
    almacen = registrarMedida(almacen, medida("uno", 200, { neurona: "otra" }));
    almacen = registrarMedida(almacen, medida("uno", 300, { capa: "razon" }));
    almacen = registrarMedida(almacen, medida("dos", 400));
    expect(almacen).toHaveLength(4);
    expect(mediaDe(almacen, "a1", "uno", "palabra")?.latenciaMs).toBe(100);
  });
  it("descarta medidas imposibles", () => {
    const almacen = registrarMedida(crearAlmacenMedidas(), medida("uno", Number.NaN));
    expect(almacen).toHaveLength(0);
    expect(registrarMedida(almacen, medida("uno", 10, { acierto: 2 }))).toHaveLength(0);
  });
});
describe("promediarMedidas", () => {
  it("promedia latencia, tok/s y acierto de cada terna", () => {
    let almacen = crearAlmacenMedidas();
    almacen = registrarMedida(almacen, medida("uno", 100, { tokPorS: 10, acierto: 0.8 }));
    almacen = registrarMedida(almacen, medida("uno", 300, { tokPorS: 30, acierto: 1 }));
    const [media] = promediarMedidas(almacen, "a1");
    expect(media).toMatchObject({ modelo: "uno", muestras: 2, latenciaMs: 200, tokPorS: 20, acierto: 0.9 });
  });
  it("solo mira las medidas de la neurona pedida", () => {
    let almacen = crearAlmacenMedidas();
    almacen = registrarMedida(almacen, medida("uno", 100));
    almacen = registrarMedida(almacen, medida("dos", 200, { neurona: "otra" }));
    expect(promediarMedidas(almacen, "a1").map((m) => m.modelo)).toEqual(["uno"]);
    expect(promediarMedidas(almacen)).toHaveLength(2);
  });
});

describe("ordenarPorMedidas", () => {
  it("sin medidas conserva el orden del catálogo", () => {
    expect(ordenarPorMedidas(["a", "b", "c"], [], "a1")).toEqual(["a", "b", "c"]);
    expect(ordenarPorMedidas(["a", "b", "c"], [medida("otro", 10)], "a1")).toEqual(["a", "b", "c"]);
  });
  it("pone primero al más rápido cuando el acierto es el mismo", () => {
    let almacen = crearAlmacenMedidas();
    almacen = registrarMedida(almacen, medida("lento", 500, { acierto: 0.8 }));
    almacen = registrarMedida(almacen, medida("rápido", 50, { acierto: 0.8 }));
    expect(ordenarPorMedidas(["lento", "rápido"], almacen, "a1")).toEqual(["rápido", "lento"]);
  });
  it("pone primero al más acertado a igual velocidad", () => {
    let almacen = crearAlmacenMedidas();
    almacen = registrarMedida(almacen, medida("malo", 100, { acierto: 0.2 }));
    almacen = registrarMedida(almacen, medida("bueno", 100, { acierto: 0.9 }));
    expect(ordenarPorMedidas(["malo", "bueno"], almacen, "a1")).toEqual(["bueno", "malo"]);
  });
  it("deja después a los candidatos sin medida, en su orden", () => {
    const almacen = registrarMedida(crearAlmacenMedidas(), medida("medido", 100));
    expect(ordenarPorMedidas(["sin-uno", "medido", "sin-dos"], almacen, "a1"))
      .toEqual(["medido", "sin-uno", "sin-dos"]);
  });
  it("no mezcla medidas de otra neurona", () => {
    const almacen = registrarMedida(crearAlmacenMedidas(), medida("rápido", 10, { neurona: "otra" }));
    expect(ordenarPorMedidas(["lento", "rápido"], almacen, "a1")).toEqual(["lento", "rápido"]);
  });
  it("respeta la capa del candidato", () => {
    const almacen = registrarMedida(crearAlmacenMedidas(), medida("rápido", 10, { capa: "razon" }));
    const candidatos = [{ modelo: "lento", capa: "palabra" as const }, { modelo: "rápido", capa: "palabra" as const }];
    expect(ordenarPorMedidas(candidatos, almacen, "a1")).toEqual(candidatos);
  });
});

describe("planificador con medidas", () => {
  it("sin medidas la salida es idéntica a la de hoy", () => {
    const base = planificar(BASE);
    expect(base.modelo).toBe("ternary-bonsai-4b");
    expect(planificar({ ...BASE, medidas: [] })).toEqual(base);
  });
  it("reordena los candidatos de la capa antes de elegir", () => {
    const medidas = [
      medida("ternary-bonsai-4b", 900, { acierto: 0.3 }),
      medida("ternary-bonsai-1.7b", 80, { acierto: 0.9 }),
    ];
    const plan = planificar({ ...BASE, medidas, neurona: "a1" });
    expect(plan.modelo).toBe("ternary-bonsai-1.7b");
    expect(plan.respaldo[0]?.modelo).toBe("ternary-bonsai-4b");
  });
  it("las medidas de otra neurona no cambian el plan", () => {
    const medidas = [medida("ternary-bonsai-1.7b", 80, { acierto: 0.9, neurona: "otra" })];
    expect(planificar({ ...BASE, medidas, neurona: "a1" }).modelo).toBe("ternary-bonsai-4b");
  });
});
