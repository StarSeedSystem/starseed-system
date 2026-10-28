import { describe, expect, it } from "vitest";
import { validarAccion } from "../acciones";
import {
  MAX_CAPAS_POR_BOT, MAX_TEXTO_CAPA, apilar, esCapaValida, normalizarCapa, retirar, retirarDeBot,
  type CapaActiva,
} from "../capa-pantalla";

// Clave de EJEMPLO montada en tiempo de ejecución (trampa nº 12 de CLAUDE.md: la protección de secretos).
const CLAVE = ["s", "k-"].join("") + "ejemploNoReal123";

const SPEC = {
  version: 1, superficie: "os:capa-bot", titulo: "Resumen",
  bloques: [{ tipo: "texto", id: "t1", props: { contenido: "Tres tareas abiertas", inventada: "fuera" } }],
};
const problemasDe = (r: ReturnType<typeof normalizarCapa>): string[] => ("problemas" in r ? r.problemas : []);
const capa = (id: string, botId = "bot-a"): CapaActiva => ({ id, botId, nombreBot: botId, forma: "nota", texto: id });

describe("normalizarCapa · formas válidas", () => {
  it("resaltar y flecha con objetivo; el texto se recorta", () => {
    expect(normalizarCapa({ forma: "resaltar", objetivo: "boton-publicar" })).toEqual({ forma: "resaltar", objetivo: "boton-publicar" });
    expect(normalizarCapa({ forma: "flecha", objetivo: "menu:ajustes", texto: "  Aquí  " })).toEqual({ forma: "flecha", objetivo: "menu:ajustes", texto: "Aquí" });
  });
  it("una nota puede ir suelta, sin objetivo", () => {
    expect(normalizarCapa({ forma: "nota", texto: "Te queda una votación abierta" })).toEqual({ forma: "nota", texto: "Te queda una votación abierta" });
  });
  it("widget con UiSpec válida: queda la copia DEPURADA (la prop no declarada no pasa)", () => {
    const r = normalizarCapa({ forma: "widget", uiSpec: SPEC });
    expect(esCapaValida(r)).toBe(true);
    if (!esCapaValida(r)) return;
    expect(r.uiSpec?.titulo).toBe("Resumen");
    expect(r.uiSpec?.bloques[0].props).toEqual({ contenido: "Tres tareas abiertas" });
  });
  it("lo que deja pasar validarAccion de capa-pantalla también lo acepta la capa", () => {
    const { accion } = validarAccion({ tipo: "capa-pantalla", args: { forma: "widget", uiSpec: SPEC, texto: "Mira" } });
    expect(accion).not.toBeNull();
    expect(esCapaValida(normalizarCapa(accion?.args))).toBe(true);
  });
});

describe("normalizarCapa · rechazos", () => {
  it("forma desconocida o argumentos que no son objeto", () => {
    expect(problemasDe(normalizarCapa({ forma: "ventana-emergente" }))[0]).toMatch(/Forma desconocida/);
    expect(problemasDe(normalizarCapa(null))).toEqual(["La capa no es un objeto."]);
    expect(problemasDe(normalizarCapa({ forma: Object.create(null) }))[0]).toMatch(/^Forma desconocida: object /);
  });
  it("widget con UiSpec inválida (bloque «script») se rechaza, y sin UiSpec también", () => {
    const mala = { version: 1, superficie: "os:capa-bot", bloques: [{ tipo: "script", id: "x", props: {} }] };
    expect(problemasDe(normalizarCapa({ forma: "widget", uiSpec: mala }))[0]).toMatch(/UiSpec inválida/);
    expect(problemasDe(normalizarCapa({ forma: "widget", uiSpec: { ...SPEC, version: 0 } }))[0]).toMatch(/UiSpec inválida/);
    expect(problemasDe(normalizarCapa({ forma: "widget" }))).toEqual(["Un widget necesita su UiSpec."]);
  });
  it("una UiSpec fuera de un widget no se cuela", () => {
    expect(problemasDe(normalizarCapa({ forma: "nota", texto: "Hola", uiSpec: SPEC }))).toEqual(["La UiSpec solo cabe en la forma «widget»."]);
  });
  it("código en el texto se rechaza (script, javascript:, manejadores)", () => {
    for (const texto of ["<script>alert(1)</script>", "javascript:void(0)", "pulsa onclick=hacer()"]) {
      expect(problemasDe(normalizarCapa({ forma: "nota", texto }))[0], texto).toMatch(/parece código/);
    }
  });
  it("texto: tope de 280, no vacío y sin claves ni rutas del disco", () => {
    expect(esCapaValida(normalizarCapa({ forma: "nota", texto: "a".repeat(MAX_TEXTO_CAPA) }))).toBe(true);
    expect(problemasDe(normalizarCapa({ forma: "nota", texto: "a".repeat(MAX_TEXTO_CAPA + 1) }))[0]).toMatch(/280/);
    expect(problemasDe(normalizarCapa({ forma: "nota", texto: "   " }))[0]).toMatch(/no vacía/);
    expect(problemasDe(normalizarCapa({ forma: "nota", texto: `usa ${CLAVE}` }))[0]).toMatch(/forma de clave/);
    expect(problemasDe(normalizarCapa({ forma: "nota" }))).toEqual(["Una nota necesita texto."]);
  });
  it("resaltar y flecha sin objetivo, u objetivo con forma de selector, se rechazan", () => {
    expect(problemasDe(normalizarCapa({ forma: "resaltar" }))[0]).toMatch(/necesita un objetivo/);
    expect(problemasDe(normalizarCapa({ forma: "flecha", objetivo: "div > a[href]" }))[0]).toMatch(/identificador/);
  });
});

describe("apilar y retirar", () => {
  it(`como mucho ${MAX_CAPAS_POR_BOT} capas por bot: la novena retira la más vieja de ESE bot`, () => {
    let capas: CapaActiva[] = [capa("ajena", "bot-b")];
    for (let i = 1; i <= MAX_CAPAS_POR_BOT + 1; i++) capas = apilar(capas, capa(`c${i}`));
    const delA = capas.filter((c) => c.botId === "bot-a").map((c) => c.id);
    expect(delA).toHaveLength(MAX_CAPAS_POR_BOT);
    expect(delA[0]).toBe("c2");
    expect(delA.at(-1)).toBe("c9");
    expect(capas.some((c) => c.id === "ajena")).toBe(true);
  });
  it("por debajo del tope no se retira nada: la nueva va al final y la lista original no cambia", () => {
    const antes = [capa("a1"), capa("a2")];
    const despues = apilar(antes, { ...capa("a3"), forma: "flecha", objetivo: "menu:ajustes" });
    expect(despues.map((c) => c.id)).toEqual(["a1", "a2", "a3"]);
    expect(despues[2].forma).toBe("flecha");
    expect(antes.map((c) => c.id)).toEqual(["a1", "a2"]);
  });
  it("con menos de 8 añade al final sin tocar las demás y conserva la capa tal cual", () => {
    const antes = [capa("a1"), capa("b1", "bot-b")];
    const nueva: CapaActiva = {
      forma: "flecha", objetivo: "boton-enviar", texto: "Envía aquí",
      id: "a2", botId: "bot-a", nombreBot: "Bot A",
    };
    const despues = apilar(antes, nueva);
    expect(despues).toHaveLength(3);
    expect(despues[2]).toBe(nueva);
    expect(despues.slice(0, 2)).toEqual(antes);
    expect(antes).toHaveLength(2);
  });
  it("el mismo id sustituye en su sitio y no cuenta dos veces", () => {
    const capas = apilar(apilar([capa("x"), capa("y")], { ...capa("x"), texto: "nueva" }), capa("z"));
    expect(capas.map((c) => c.id)).toEqual(["x", "y", "z"]);
    expect(capas[0].texto).toBe("nueva");
  });
  it("retirar por id (el «Quitar» y el deshacer), sin mutar la lista original", () => {
    const antes = [capa("a1"), capa("a2"), capa("b1", "bot-b")];
    expect(retirar(antes, "a2").map((c) => c.id)).toEqual(["a1", "b1"]);
    expect(retirar(antes, "no-existe")).toHaveLength(3);
    expect(antes).toHaveLength(3);
  });
  it("retirarDeBot quita solo lo de ese bot (al pausarlo nada suyo queda en pantalla)", () => {
    expect(retirarDeBot([capa("a1"), capa("b1", "bot-b"), capa("a2")], "bot-a").map((c) => c.id)).toEqual(["b1"]);
  });

  it("apilar cuando hay menos de 8", () => {
    const capas: CapaActiva[] = [
      { forma: "resaltar", objetivo: "1", id: "1", botId: "bot1", nombreBot: "Bot1" },
      { forma: "nota", texto: "Nota 1", id: "2", botId: "bot1", nombreBot: "Bot1" }
    ];

    const nueva: CapaActiva = { forma: "flecha", texto: "Flecha 1", id: "3", botId: "bot1", nombreBot: "Bot1" };
    const resultado = apilar(capas, nueva);

    expect(resultado.length).toBe(3);
    expect(resultado[2]).toBe(nueva);
  });

  it("eliminar la capa más vieja cuando hay 8 o más", () => {
    const capas: CapaActiva[] = Array.from({ length: 8 }, (_, i) => ({
      forma: "resaltar",
      objetivo: `${i + 1}`,
      id: `${i + 1}`,
      botId: "bot1",
      nombreBot: "Bot1"
    }));

    const nueva: CapaActiva = { forma: "nota", texto: "Nueva nota", id: "9", botId: "bot1", nombreBot: "Bot1" };
    const resultado = apilar(capas, nueva);

    expect(resultado.length).toBe(8);
    expect(resultado[0]).not.toBe(capas[0]);
    expect(resultado[7]).toBe(nueva);
  });
});
