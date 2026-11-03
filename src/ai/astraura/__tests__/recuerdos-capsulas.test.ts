// Pruebas de los recuerdos de cápsulas Memvid (MVD1027F) — SOLO funciones puras del
// módulo, con el cliente falso inyectado en `buscarFn` (sin red ni disco)
import { describe, expect, it } from "vitest";
import {
  bloqueDeRecuerdos,
  capsulasParaScope,
  consultaDeTurno,
  recuerdosDeCapsulas,
  recordarDeCapsulas,
  type FragmentoCapsula,
} from "@/ai/astraura/recuerdos-capsulas";
import { capsulasParaContexto, type ContextoCapsulas } from "@/lib/memorias/capsulas";

const PRIVADO = "El ensayo privado sobre la marea del sábado se aplazó hasta la luna nueva";
const CORTOS = [0, 1, 2, 3].map((i) => ({ texto: `recuerdo ${i} del sujeto` }));
const llamadas: { tipo: string; id: string; k: number }[] = [];
type BuscarFn = (s: { tipo: string; id: string }, consulta: string, k: number) => Promise<{ texto: string }[]>;

/** Cliente falso: apunta cada llamada y contesta por tipo de sujeto («error»: se cae). */
function falso(guion: Record<string, { texto: string }[]> | "error"): BuscarFn {
  llamadas.length = 0;
  return (sujeto: { tipo: string; id: string }, _c: string, k: number) => {
    llamadas.push({ tipo: sujeto.tipo, id: sujeto.id, k });
    if (guion === "error") return Promise.reject(new Error("servidor caído"));
    return Promise.resolve(guion[sujeto.tipo] ?? CORTOS);
  };
}
const LLAMADAS = () => llamadas.map((l) => l.tipo);
const CONTEXTO: ContextoCapsulas = { personalidadId: "aurora", cerebroId: "cerebro-activo", grupoId: "cafe", paginaId: "manual" };

describe("consultaDeTurno y bloqueDeRecuerdos", () => {
  it("toma el último turno del usuario, recortado; sin usuario, vacía", () => {
    expect(consultaDeTurno([
      { role: "user", content: "  ¿qué hice el martes?  " },
      { role: "assistant", content: "algo" },
    ])).toBe("¿qué hice el martes?");
    expect(consultaDeTurno([{ role: "system", content: "sistema" }])).toBe("");
  });
  it("bloque con la frase a bala; vacío con nada", () => {
    const bloque = bloqueDeRecuerdos([{ texto: "quedamos a las seis", alcance: "grupo" }]);
    expect(bloque).toContain("RECUERDOS (cápsulas Memvid):");
    expect(bloque).toContain("• quedamos a las seis");
    expect(bloqueDeRecuerdos([])).toBe("");
  });
});

describe("recuerdosDeCapsulas · cliente falso", () => {
  it("va de la cápsula más cercana a la más general y para en el tope de 6", async () => {
    const frag: FragmentoCapsula[] = await recuerdosDeCapsulas(CONTEXTO, "¿qué hice?", { buscarFn: falso({}) });
    expect(LLAMADAS()).toEqual(["personalidad", "cerebro"]);
    expect(llamadas[0]).toMatchObject({ tipo: "personalidad", id: "aurora", k: 4 });
    expect(frag).toHaveLength(6);
    expect(frag[0]?.alcance).toBe("personal");
  });
  it("respeta el tope de 1.500 caracteres: lleno, deja de consultar cápsulas", async () => {
    const guion = { personalidad: [{ texto: "x".repeat(1500) }, { texto: "y".repeat(300) }] };
    const frag = await recuerdosDeCapsulas(CONTEXTO, "¿a dónde?", { buscarFn: falso(guion) });
    expect(frag).toHaveLength(1);
    expect(LLAMADAS()).toEqual(["personalidad"]);
  });
  it("sin consulta o sin cliente no llama a ninguna cápsula", async () => {
    expect(await recuerdosDeCapsulas(CONTEXTO, "   ", { buscarFn: falso({}) })).toEqual([]);
    expect(LLAMADAS()).toEqual([]);
    expect(await recuerdosDeCapsulas(CONTEXTO, "¿qué hice?")).toEqual([]);
    expect(LLAMADAS()).toEqual([]);
  });
  it("una cápsula caída no tumba el resto: sigue la siguiente", async () => {
    await recuerdosDeCapsulas(CONTEXTO, "¿qué hice?", { buscarFn: falso("error") });
    expect(LLAMADAS()).toEqual(["personalidad", "cerebro", "grupo", "pagina"]);
  });
});

describe("alcance de memoria del chat y del actor", () => {
  it("«compartida» deja solo lo de grupo/página; «cerebro-activo» solo el cerebro", () => {
    const capsulas = capsulasParaContexto(CONTEXTO, { tipo: "usuario" }, new Date());
    const tipos = (alcance: string) => capsulasParaScope(capsulas, alcance).map((c) => c.sujeto.tipo).sort();
    expect(tipos("compartida")).toEqual(["grupo", "pagina"]);
    expect(tipos("cerebro-activo")).toEqual(["cerebro"]);
    expect(tipos("personal")).toEqual(["cerebro", "personalidad"]);
    expect(capsulasParaScope(capsulas, "todas")).toHaveLength(capsulas.length);
  });
  it("a un agente de grupo solo se le consulta lo que su alcance permite", async () => {
    const frag = await recuerdosDeCapsulas(CONTEXTO, "¿qué hice?", {
      buscarFn: falso({}),
      actor: { tipo: "agente-grupo" },
      esModeloNube: false,
    });
    expect(LLAMADAS()).toEqual(["grupo", "pagina"]);
    expect(frag.every((f) => f.alcance !== "personal")).toBe(true);
  });
});
describe("criba de fuga hacia la nube", () => {
  const conGuion = (esModeloNube?: boolean) =>
    recuerdosDeCapsulas({ grupoId: "cafe", personalidadId: "aurora" }, "¿qué hice?", {
      buscarFn: (s) => Promise.resolve(s.tipo === "grupo" ? [{ texto: `Resumen: ${PRIVADO}.` }, ...CORTOS] : [{ texto: PRIVADO }]),
      ...(esModeloNube === undefined ? {} : { esModeloNube }),
    });
  it("con destino de nube, fuera lo que cita la memoria privada de alguien", async () => {
    const frag = await conGuion(undefined);
    expect(frag[0]?.texto).toBe(PRIVADO);
    expect(frag[0]?.alcance).toBe("personal");
    expect(frag.some((f) => f.alcance === "grupo" && f.texto.includes(PRIVADO))).toBe(false);
    expect(frag.map((f) => f.texto)).toEqual([PRIVADO, ...CORTOS.map((c) => c.texto)]);
  });
  it("con fuente local no se criba: el bloque lleva también la cita de grupo", async () => {
    const frag = await conGuion(false);
    expect(frag[0]?.alcance).toBe("personal");
    expect(frag.some((f) => f.texto.includes(PRIVADO))).toBe(true);
    expect(frag).toHaveLength(6);
  });
});

describe("recordarDeCapsulas", () => {
  it("devuelve el bloque; si todo cae, la cadena vacía", async () => {
    const bloque = await recordarDeCapsulas({ cerebroId: "cerebro-vivo" }, "¿qué hice?", { buscarFn: falso({}) });
    expect(bloque.split("\n")[0]).toBe("RECUERDOS (cápsulas Memvid):");
    expect(bloque).toContain("• recuerdo 0 del sujeto");
    expect(await recordarDeCapsulas(CONTEXTO, "¿qué hice?", { buscarFn: falso("error") })).toBe("");
  });
});
