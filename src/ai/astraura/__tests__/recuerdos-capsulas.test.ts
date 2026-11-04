/** Pruebas de recordarDeCapsulas (MVD1027F) con buscador FALSO: ni una llamada real a 4490. */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { recordarDeCapsulas } from "../recuerdos-capsulas";
import type { AciertoMemvid } from "@/lib/memorias/memvid-cliente";
import type { SujetoMemoria } from "@/lib/memorias/capsulas";

const FECHA = new Date("2026-10-27T12:00:00.000Z"); // fija: sin depender del reloj
const acierto = (texto: string): AciertoMemvid => ({ titulo: "t", texto });

/** Buscador falso: responde por «tipo:id» y apunta cada llamada para poder mirarla. */
function buscarFalso(responde: Record<string, AciertoMemvid[] | null>) {
  const llamadas: { quien: string; k: number; consulta: string }[] = [];
  const buscar = vi.fn(async (s: SujetoMemoria, consulta: string, k: number) => {
    llamadas.push({ quien: `${s.tipo}:${s.id}`, k, consulta });
    return responde[`${s.tipo}:${s.id}`] ?? null;
  });
  return { buscar, llamadas };
}

describe("recordarDeCapsulas", () => {
  it("devuelve «» con consulta vacía, sin cápsulas o si el servidor no responde", async () => {
    const f = buscarFalso({});
    expect(await recordarDeCapsulas({ perfilId: "alex" }, "  ", { buscar: f.buscar, fecha: FECHA })).toBe("");
    expect(f.llamadas).toEqual([]); // a consulta vacía ni pregunta
    const fa = buscarFalso({});
    expect(await recordarDeCapsulas({}, "hola", { buscar: fa.buscar, fecha: FECHA })).toBe("");
    expect(fa.llamadas).toEqual([]); // sin contexto no hay cápsulas que buscar
    const fn = buscarFalso({ "perfil:alex": null });
    expect(await recordarDeCapsulas({ perfilId: "alex" }, "hola", { buscar: fn.buscar, fecha: FECHA })).toBe("");
    expect(fn.llamadas.map((l) => l.quien)).toEqual(["perfil:alex"]); // preguntó, el servidor no llegó
  });

  it("pregunta k=4 y por cada cápsula de la más cercana a la más general, con la consulta directa", async () => {
    const { buscar, llamadas } = buscarFalso({
      "personalidad:aurora": [acierto("Aurora aprendió que la casa queda mejor con la cortina de la terraza abierta.")],
      "perfil:alex": [],
      "pagina:claustro": [acierto("El claustro publica la guía de cursos del trimestre.")],
    });
    const bloque = await recordarDeCapsulas(
      { personalidadId: "aurora", perfilId: "alex", paginaId: "claustro" },
      "luz de la casa",
      { buscar, fecha: FECHA },
    );
    expect(llamadas.map((l) => l.quien)).toEqual(["personalidad:aurora", "perfil:alex", "pagina:claustro"]);
    expect(new Set(llamadas.map((l) => l.k))).toEqual(new Set([4]));
    expect(llamadas.every((l) => l.consulta === "luz de la casa")).toBe(true);
    expect(bloque).toContain("RECUERDOS (cápsulas Memvid):");
    expect(bloque).toContain("cortina de la terraza");
    expect(bloque).toContain("guía de cursos");
  });

  it("para en 6 fragmentos y ya no pregunta a más cápsulas", async () => {
    const cuatro = ["una", "dos", "tres", "cuatro"].map((n) => acierto(`recuerdo ${n} con su cuerpo propio entero`));
    const { buscar, llamadas } = buscarFalso({
      "personalidad:aurora": cuatro,
      "agente:ayudante": cuatro,
      "cerebro:casa": [acierto("esto no debe entrar: el cupo de seis ya está lleno")],
    });
    const bloque = await recordarDeCapsulas(
      { personalidadId: "aurora", agenteId: "ayudante", cerebroId: "casa" },
      "recuerdos", { buscar, fecha: FECHA },
    );
    expect(bloque.split("\n").slice(1)).toHaveLength(6);
    expect(llamadas.map((l) => l.quien)).toEqual(["personalidad:aurora", "agente:ayudante"]);
    expect(bloque).not.toContain("el cupo de seis");
  });

  it("recorta el total a 1500 caracteres y deja de buscar", async () => {
    const { buscar, llamadas } = buscarFalso({
      "perfil:alex": [acierto("a".repeat(1000)), acierto("b".repeat(1000))],
      "pagina:claustro": [acierto("esto no debe llegar porque el espacio ya está lleno")],
    });
    const bloque = await recordarDeCapsulas(
      { perfilId: "alex", paginaId: "claustro" }, "consulta", { buscar, fecha: FECHA },
    );
    expect(bloque.split("\n").slice(1)).toEqual([`- ${"a".repeat(1000)}`, `- ${"b".repeat(500)}`]);
    expect(llamadas.map((l) => l.quien)).toEqual(["perfil:alex"]);
  });

  it("con modelo de nube deja fuera lo personal y sin nube lo conserva", async () => {
    const conPersonalidad = () => buscarFalso({
      "personalidad:aurora": [acierto("la fiesta sorpresa de Marta queda guardada a solas en el baúl de la casa entera")],
      "pagina:claustro": [acierto("el claustro publica la guía de cursos del trimestre y queda abierta al mundo")],
    });
    const sinNube = await recordarDeCapsulas(
      { personalidadId: "aurora", paginaId: "claustro" }, "fiesta",
      { buscar: conPersonalidad().buscar, fecha: FECHA },
    );
    expect(sinNube).toContain("Marta");
    const enNube = await recordarDeCapsulas(
      { personalidadId: "aurora", paginaId: "claustro" }, "fiesta",
      { buscar: conPersonalidad().buscar, fecha: FECHA, enNube: true },
    );
    expect(enNube).toContain("guía de cursos");
    expect(enNube).not.toContain("Marta");
  });

  it("un agente de grupo no pregunta a las cápsulas personales que no ve", async () => {
    const { buscar, llamadas } = buscarFalso({
      "grupo:luna": [acierto("la luna guarda las notas de la casa del grupo")],
      "pagina:claustro": [acierto("el claustro publica la guía de cursos del trimestre y queda abierta al mundo")],
    });
    const bloque = await recordarDeCapsulas(
      { personalidadId: "aurora", perfilId: "alex", grupoId: "luna", paginaId: "claustro" }, "notas",
      { buscar, fecha: FECHA, actor: { tipo: "agente-grupo", grupoId: "luna" } },
    );
    expect(llamadas.map((l) => l.quien)).toEqual(["grupo:luna", "pagina:claustro"]);
    expect(bloque).toContain("notas de la casa del grupo");
    expect(bloque).not.toContain("Aurora");
  });

  it("se rinde tras el tope total ante un buscador que cuelga", async () => {
    const buscar = vi.fn(() => new Promise<AciertoMemvid[] | null>(() => {}));
    const comenzo = Date.now();
    const bloque = await recordarDeCapsulas({ perfilId: "alex" }, "colgado", { buscar, topeMs: 40 });
    expect(bloque).toBe("");
    expect(Date.now() - comenzo).toBeLessThan(5000);
  });
});
