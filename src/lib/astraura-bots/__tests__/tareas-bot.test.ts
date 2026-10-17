// Pruebas de las tareas con director y verificación profesional (BOT1011W · astraura-bots.md §8).
import { describe, expect, it } from "vitest";
import type { Tarea } from "../tipos";
import { MAX_CRITERIO, MAX_CRITERIOS, asignarPasos, crearTarea, estadoDe, marcarCriterio, verificacionInicial } from "../tareas-bot";
import type { AgenteTarea, EstadoVerificacion, Paso, Problemas, Verificador } from "../tareas-bot";

const CRITERIOS = ["Las imágenes del banner cargan en el móvil", "El formulario de contacto envía correos", "Las pruebas unitarias pasan en verde"];
const AGENTES: AgenteTarea[] = [
  { id: "director", capacidades: ["Imágenes del banner en el móvil", "Correos", "Pruebas"] }, // ganaría el 1.º
  { id: "pintor", capacidades: ["Generar imagen", "Diseño gráfico"] }, // solo «imagen» ~ «imágenes»: sin quitar acentos no casaría
  { id: "cartero", capacidades: ["Enviar correo", "Formulario web"] },
  { id: "probador", capacidades: ["Pruebas unitarias", "Vitest"] },
];

/** Desenvuelve un resultado y, si trae problemas, la prueba falla diciendo cuáles. */
function sin<T extends object>(r: T | Problemas): T {
  if ("problemas" in r && Array.isArray(r.problemas)) throw new Error(r.problemas.join(" "));
  return r as T;
}
const tarea = (args: Record<string, unknown> = {}): Tarea => sin(crearTarea({ titulo: "Página del café", criterios: CRITERIOS, ...args }, "director", "genesis"));
const repartir = (t: Tarea, agentes: readonly AgenteTarea[] = AGENTES): { tarea: Tarea; pasos: Paso[] } => sin(asignarPasos(t, agentes));
const marcar = (v: EstadoVerificacion, c: string, tipo: Verificador, id: string, ok = true): EstadoVerificacion =>
  sin(marcarCriterio(v, c, { tipo, id }, ok, "Comprobado en Genesis con captura y registro."));

describe("crearTarea", () => {
  it("sin criterios comprobables no hay tarea", () => {
    for (const criterios of [undefined, [], ["  "], "hazlo bien"]) {
      const r = crearTarea({ titulo: "Algo", criterios }, "director", "genesis");
      expect("problemas" in r && r.problemas.join(" ")).toMatch(/criterio/);
    }
  });
  it("respeta el tope: 12 criterios de 200 caracteres sí; 13, uno más largo o repetidos no", () => {
    const doce = Array.from({ length: MAX_CRITERIOS }, (_, i) => `${i} ${"x".repeat(MAX_CRITERIO - 3)}`);
    expect("problemas" in crearTarea({ titulo: "T", criterios: doce }, "d", "genesis")).toBe(false);
    expect("problemas" in crearTarea({ titulo: "T", criterios: [...doce, "otro más"] }, "d", "genesis")).toBe(true);
    expect("problemas" in crearTarea({ titulo: "T", criterios: ["y".repeat(MAX_CRITERIO + 1)] }, "d", "genesis")).toBe(true);
    expect("problemas" in crearTarea({ titulo: "T", criterios: ["Carga", "carga"] }, "d", "genesis")).toBe(true);
  });
  it("verificador por defecto persona, id estable y nada con forma de clave", () => {
    const t = tarea();
    expect(t).toMatchObject({ verificador: "persona", estado: "propuesta", director: "director", agentes: [], origen: "genesis" });
    expect(tarea().id).toBe(t.id);
    const gemela = crearTarea({ titulo: "Página del café", criterios: CRITERIOS }, "director", "genesis", "1800");
    expect("id" in gemela && gemela.id !== t.id).toBe(true);
    expect("problemas" in crearTarea({ titulo: "T", criterios: ["ok"], verificador: "jefe" }, "d", "genesis")).toBe(true);
    const clave = ["s", "k-", "abcdefghijklmnopqrstuvwx"].join("");
    expect("problemas" in crearTarea({ titulo: "T", criterios: [`usa ${clave}`] }, "d", "genesis")).toBe(true);
  });
});

describe("asignarPasos", () => {
  it("reparte por palabras clave y el director no se queda pasos si hay más agentes", () => {
    const { tarea: t, pasos } = repartir(tarea());
    expect(pasos.map((p) => p.agente)).toEqual(["pintor", "cartero", "probador"]);
    expect(t).toMatchObject({ estado: "en-curso", agentes: ["cartero", "pintor", "probador"] });
  });
  it("es determinista: el orden de los agentes no cambia el reparto; sin coincidencias, equilibra la carga", () => {
    expect(repartir(tarea(), [...AGENTES].reverse()).pasos).toEqual(repartir(tarea()).pasos);
    const ciegos = [{ id: "b", capacidades: [] }, { id: "a", capacidades: [] }];
    expect(repartir(tarea(), ciegos).pasos.map((p) => p.agente)).toEqual(["a", "b", "a"]);
  });
  it("si el director es el único agente, hace él los pasos; sin agentes no hay reparto", () => {
    expect(repartir(tarea(), [AGENTES[0]]).pasos.every((p) => p.agente === "director")).toBe(true);
    expect("problemas" in asignarPasos(tarea(), [{ id: " ", capacidades: [] }])).toBe(true);
  });
});

describe("verificación", () => {
  it("un bot no verifica lo que él mismo hizo, ni el director su tarea", () => {
    const { tarea: t, pasos } = repartir(tarea({ verificador: "bot" }));
    const v = verificacionInicial(t, pasos);
    const propio = marcarCriterio(v, CRITERIOS[0], { tipo: "bot", id: "pintor" }, true, "Lo vi bien.");
    const director = marcarCriterio(v, CRITERIOS[0], { tipo: "bot", id: "director" }, true, "Lo vi bien.");
    expect("problemas" in propio && propio.problemas[0]).toMatch(/él mismo/);
    expect("problemas" in director && director.problemas[0]).toMatch(/director/);
    expect(marcarCriterio(verificacionInicial(t, []), CRITERIOS[0], { tipo: "bot", id: "pintor" }, true, "Yo.")).toMatchObject({ problemas: [expect.stringMatching(/No consta/)] });
    const cruzada = CRITERIOS.reduce((acc, c, i) => marcar(acc, c, "bot", ["probador", "pintor", "cartero"][i]), v);
    expect(estadoDe(t, cruzada)).toBe("hecha");
  });
  it("una persona verifica una tarea de persona; otro tipo de verificador o sin evidencia, no", () => {
    const { tarea: t, pasos } = repartir(tarea());
    const v = CRITERIOS.reduce((acc, c) => marcar(acc, c, "persona", "cuenta-alex"), verificacionInicial(t, pasos));
    expect(estadoDe(t, v)).toBe("hecha");
    expect("problemas" in marcarCriterio(v, CRITERIOS[0], { tipo: "pruebas", id: "vitest" }, true, "verde")).toBe(true);
    expect("problemas" in marcarCriterio(v, CRITERIOS[0], { tipo: "persona", id: "alex" }, true, "  ")).toBe(true);
    expect("problemas" in marcarCriterio(v, "Otro criterio", { tipo: "persona", id: "alex" }, true, "vale")).toBe(true);
  });
  it("las pruebas verifican una tarea de pruebas", () => {
    const { tarea: t, pasos } = repartir(tarea({ verificador: "pruebas" }));
    const v = CRITERIOS.reduce((acc, c) => marcar(acc, c, "pruebas", "vitest:src/app"), verificacionInicial(t, pasos));
    expect(estadoDe(t, v)).toBe("hecha");
  });
  it("un criterio en falso impide «hecha»; corregido y verificado, pasa", () => {
    const { tarea: t, pasos } = repartir(tarea());
    let v = CRITERIOS.reduce((acc, c) => marcar(acc, c, "persona", "alex"), verificacionInicial(t, pasos));
    v = marcar(v, CRITERIOS[1], "persona", "alex", false);
    expect(estadoDe(t, v)).toBe("verificando");
    expect(estadoDe(t, marcar(v, CRITERIOS[1], "persona", "alex"))).toBe("hecha");
  });
  it("estados intermedios: propuesta → en-curso → verificando → hecha; rechazada se queda", () => {
    const t0 = tarea();
    const { tarea: t1, pasos } = repartir(t0);
    const v = verificacionInicial(t1, pasos);
    expect([estadoDe(t0), estadoDe(t1, v)]).toEqual(["propuesta", "en-curso"]);
    const v1 = marcar(v, CRITERIOS[0], "persona", "alex");
    expect(estadoDe(t1, v1)).toBe("verificando");
    expect(estadoDe({ ...t1, estado: "rechazada" }, v1)).toBe("rechazada");
  });
  it("el estado guardado no manda: marcas manipuladas, de otra tarea o con un autor inventado no cuentan", () => {
    const { tarea: t, pasos } = repartir(tarea({ verificador: "bot" }));
    const ok = { ok: true, evidencia: "x" };
    const trampa = { ...verificacionInicial(t, pasos), marcas: Object.fromEntries(pasos.map((p) => [p.criterio, { ...ok, por: { tipo: "bot" as const, id: p.agente } }])) };
    expect(estadoDe({ ...t, estado: "hecha" }, trampa)).toBe("en-curso");
    expect(estadoDe(t, { ...trampa, hechoPor: Object.fromEntries(CRITERIOS.map((c) => [c, "fantasma"])) })).toBe("en-curso");
    const buena = CRITERIOS.reduce((acc, c, i) => marcar(acc, c, "bot", ["probador", "pintor", "cartero"][i]), verificacionInicial(t, pasos));
    expect(estadoDe(t, buena)).toBe("hecha");
    expect(estadoDe(t, { ...buena, tareaId: "otra" })).toBe("en-curso");
    expect(estadoDe({ ...t, verificador: "persona" }, buena)).toBe("en-curso");
  });
});
