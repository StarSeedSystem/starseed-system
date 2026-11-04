/** Pruebas de `recordarDeCapsulas` (MVD1027F) con el cliente de cápsulas FALSO:
 * ni una llamada de verdad a 4490 y sin reloj de pared (fecha fija de 2026T4). */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  componerBloque, limpiarParaNube, limitarRecuerdos, recordarDeCapsulas,
} from "../recuerdos-capsulas";
import type { AciertoMemvid } from "@/lib/memorias/memvid-cliente";
import type { SujetoMemoria, TipoSujeto } from "@/lib/memorias/capsulas";

const FECHA = new Date("2026-10-27T12:00:00.000Z");
const ESTADO = { perfilId: "alex", personalidadId: "aurora", actor: { tipo: "usuario" as const } };
type Llamada = { sujeto: SujetoMemoria; consulta: string; k: number };

function acierto(texto: string): AciertoMemvid {
  return { titulo: "Recuerdo", texto, uri: `mv2://prueba/${texto.slice(0, 5)}`, ts: 1761600000 };
}
/** Cliente falso: cada tipo de sujeto contesta lo que la prueba le puso. */
function clienteFalso(respuestas: Partial<Record<TipoSujeto, AciertoMemvid[] | null>>): {
  buscar: ReturnType<typeof vi.fn>; llamadas: Llamada[];
} {
  const llamadas: Llamada[] = [];
  const buscar = vi.fn(async (sujeto: SujetoMemoria, consulta: string, k: number) => {
    llamadas.push({ sujeto, consulta, k });
    return respuestas[sujeto.tipo] ?? [];
  });
  return { buscar, llamadas };
}
const OPCIONES = { fecha: FECHA };

describe("componerBloque y limitarRecuerdos (puros)", () => {
  it("bloque vacío vale \"\"; con recuerdos, lleva título y líneas con su origen", () => {
    expect(componerBloque([])).toBe("");
    const bloque = componerBloque([{ id: "x", alcance: "perfil", texto: "Tomo café", origen: "mv2://cafe", at: 0 }]);
    expect(bloque.startsWith("RECUERDOS (cápsulas Memvid):")).toBe(true);
    expect(bloque).toContain("- Tomo café (mv2://cafe)");
  });
  it("el límite: máx 6 recuerdos, 1.500 letras y el primero entra siempre", () => {
    const muchos = Array.from({ length: 9 }, (_, i) => ({
      id: String(i), alcance: "perfil" as const, texto: `r${i}`, origen: "", at: 0,
    }));
    expect(limitarRecuerdos(muchos)).toHaveLength(6);
    const largos = Array.from({ length: 3 }, (_, i) => ({
      id: String(i), alcance: "perfil" as const, texto: (i ? "b" : "a").repeat(2000), origen: "", at: 0,
    }));
    const salida = limitarRecuerdos(largos);
    expect(salida).toHaveLength(1);
    expect(salida[0].texto[0]).toBe("a");
  });
  it("limpiarParaNube: lo personal no sale; si aun así hay fuga, no sale nada", () => {
    const frs = [
      { id: "p", alcance: "personal" as const, texto: "El código de la caja fuerte del taller es cuatro mil doscientos doce y se dice en voz baja", origen: "p.mv2e", at: 0 },
      { id: "g", alcance: "grupo" as const, texto: "La huerta comunitaria riega los sábados", origen: "g.mv2", at: 0 },
    ];
    expect(limpiarParaNube([frs[1]])).toEqual([frs[1]]);
    expect(limpiarParaNube(frs)).toEqual([frs[1]]);
    const robado = { id: "g", alcance: "grupo" as const, texto: "Ojo: el código de la caja fuerte del taller es cuatro mil doscientos doce y se dice en voz baja, no lo cuentes", origen: "g.mv2", at: 0 };
    expect(limpiarParaNube([frs[0], robado])).toEqual([]);
  });
});

describe("recordarDeCapsulas con el cliente falso", () => {
  it("busca k=4 de lo más cercano a lo más general y ordena el bloque igual", async () => {
    const { buscar, llamadas } = clienteFalso({
      personalidad: [acierto("Le gusta el café de Yirgacheffe")],
      perfil: [acierto("Vive en Oaxaca")],
    });
    const bloque = await recordarDeCapsulas(ESTADO, "¿qué café?", { ...OPCIONES, buscar });
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0].sujeto.tipo).toBe("personalidad");
    expect(llamadas[1].sujeto.tipo).toBe("perfil");
    expect(llamadas[0].k).toBe(4);
    expect(llamadas[0].consulta).toBe("¿qué café?");
    expect(bloque.indexOf("Yirgacheffe")).toBeLessThan(bloque.indexOf("Oaxaca"));
  });
  it("para al llenar 6 recuerdos aunque queden cápsulas por buscar", async () => {
    const cuatro = Array.from({ length: 4 }, (_, i) => acierto(`frag-${i}`));
    const { buscar, llamadas } = clienteFalso({ personalidad: cuatro, agente: cuatro, perfil: cuatro });
    const bloque = await recordarDeCapsulas({ ...ESTADO, agenteId: "laya" }, "recientes", { ...OPCIONES, buscar });
    expect(bloque.split("\n")).toHaveLength(7);
    expect(llamadas).toHaveLength(2);
  });
  it("con el modelo en la nube, lo personal se queda en la máquina", async () => {
    const { buscar } = clienteFalso({
      personalidad: [acierto("Tu médico se llama Dra. Rosa y te ve los martes a las nueve en punto")],
      perfil: [acierto("Trabajas en la huerta comunitaria del barrio")],
    });
    const bloque = await recordarDeCapsulas({ ...ESTADO, esNube: true }, "salud", { ...OPCIONES, buscar });
    expect(bloque).toContain("huerta comunitaria");
    expect(bloque).not.toContain("Dra. Rosa");
  });
  it("sin servidor o con la cápsula caída, vale \"\" y no lanza", async () => {
    const { buscar } = clienteFalso({ personalidad: null });
    await expect(recordarDeCapsulas(ESTADO, "hola", { ...OPCIONES, buscar })).resolves.toBe("");
    const roto = vi.fn(async () => { throw new Error("4490 sin vida"); }) as unknown as typeof buscar;
    const { buscar: caido } = { buscar: roto };
    await expect(recordarDeCapsulas(ESTADO, "hola", { ...OPCIONES, buscar: caido })).resolves.toBe("");
  });
  it("el tope total manda: una cápsula colgada devuelve \"\" antes del segundo y medio", async () => {
    const lento = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 1200));
      return [acierto("uno bienvenido a la cápsula lenta del servidor dormido")];
    }) as unknown as ReturnType<typeof vi.fn>;
    const inicio = Date.now();
    await expect(recordarDeCapsulas(ESTADO, "hola", { ...OPCIONES, buscar: lento, topeMs: 100 })).resolves.toBe("");
    expect(Date.now() - inicio).toBeLessThan(1500);
  });
});
