/** Pruebas de `recordarDeCapsulas` (MVD1027F) con el cliente FALSO: ni una llamada real a 4490. */
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  bloqueDeRecuerdos, recordarDeCapsulas, recortarRecuerdos, sinFugas, TOPE_RECUERDOS_MS,
} from "../recuerdos-capsulas";
import type { ContextoCapsulas } from "@/lib/memorias/capsulas";
import type { ActorMemoria, AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";

const FECHA = new Date("2026-10-27T12:00:00.000Z"); // 2026T4 fijo, sin mirar el reloj
const RELOJ = (): number => 0;

interface Llamada { url: string; cuerpo: unknown }

/** fetch falso que contesta por NOMBRE de cápsula (`capsulas/<nombre>/buscar`); null → 404. */
function clienteFalso(respuestas: Record<string, unknown>) {
  const llamadas: Llamada[] = [];
  const f = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada);
    const nombre = /capsulas\/([^/]+)\//.exec(url)?.[1] ?? "";
    llamadas.push({ url, cuerpo: JSON.parse(String(init?.body ?? "null")) });
    const datos = respuestas[nombre];
    return datos === undefined
      ? new Response(null, { status: 404 })
      : new Response(JSON.stringify(datos), { status: 200 });
  });
  return { cliente: { fetch: f as unknown as typeof fetch, token: "t" }, llamadas };
}

function fr(id: string, alcance: string, texto: string, at = 0): {
  id: string; alcance: AlcanceMemoria; texto: string; origen: string; at: number;
} {
  return { id, alcance: alcance as AlcanceMemoria, texto, origen: `${id}.mv2`, at };
}

const PERSONALIDAD = "personalidad-aurora-2026T4.mv2e";
const PERFIL = "perfil-alex-cafe-2-2026T4.mv2e";
const GRUPO = "grupo-cafe-2026T4.mv2";

describe("recordarDeCapsulas · bloque básico", () => {
  it("busca k=4, primero lo cercano (personalidad → perfil) y arma el bloque", async () => {
    const { cliente, llamadas } = clienteFalso({
      [PERSONALIDAD]: { aciertos: [{ titulo: "Café", texto: "Planes de la cafetería" }] },
      [PERFIL]: { aciertos: [{ texto: "El perfil prefiere descafeinado" }] },
    });
    const bloque = await recordarDeCapsulas(
      { personalidadId: "aurora", perfilId: "alex-café 2" } satisfies ContextoCapsulas,
      "¿qué decidimos del café?",
      { fecha: FECHA, cliente, ahora: RELOJ },
    );
    expect(bloque).toContain("RECUERDOS (cápsulas Memvid):");
    expect(bloque.indexOf("Planes de la cafetería")).toBeGreaterThan(-1);
    expect(bloque.indexOf("Planes de la cafetería")).toBeLessThan(bloque.indexOf("El perfil prefiere descafeinado"));
    expect(bloque).toContain(`(${PERSONALIDAD})`);
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0].url).toContain(PERSONALIDAD);
    expect(llamadas[1].url).toContain(PERFIL);
    expect(llamadas[0].cuerpo).toEqual({ consulta: "¿qué decidimos del café?", k: 4 });
  });
});

describe("recordarDeCapsulas · cortes y fallos", () => {
  const piezas = Array.from({ length: 8 }, (_, i) => ({ texto: `Recuerdo número ${i}` }));

  it("para en 6 fragmentos y no consulta más cápsulas", async () => {
    const { cliente, llamadas } = clienteFalso({ [PERSONALIDAD]: { aciertos: piezas }, [PERFIL]: { aciertos: piezas } });
    const bloque = await recordarDeCapsulas(
      { personalidadId: "aurora", perfilId: "x" } satisfies ContextoCapsulas, "bases", { fecha: FECHA, cliente, ahora: RELOJ },
    );
    expect(bloque.split("\n")).toHaveLength(7); // encabezado + 6
    expect(llamadas).toHaveLength(1); // al llenar, no va a la siguiente cápsula
  });

  it("para en 1500 caracteres: el primero entra siempre, el que desborda no", async () => {
    const largo = "a".repeat(1600);
    const { cliente } = clienteFalso({ [PERSONALIDAD]: { aciertos: [{ texto: largo }, { texto: "corto" }] } });
    const bloque = await recordarDeCapsulas(
      { personalidadId: "aurora" } satisfies ContextoCapsulas, "cmientos", { fecha: FECHA, cliente, ahora: RELOJ },
    );
    expect(bloque).toContain(largo);
    expect(bloque.includes("corto")).toBe(false);
  });

  it("un agente de grupo no ve ni la cápsula de perfil", async () => {
    const actor: ActorMemoria = { tipo: "agente-grupo", grupoId: "cafe" };
    const { cliente, llamadas } = clienteFalso({ [GRUPO]: { aciertos: [{ texto: "Plaza del grupo" }] } });
    const bloque = await recordarDeCapsulas(
      { personalidadId: "aurora", perfilId: "alex-café 2", grupoId: "cafe" } satisfies ContextoCapsulas,
      "plaza", { actor, fecha: FECHA, cliente, ahora: RELOJ },
    );
    expect(bloque).toContain("Plaza del grupo");
    expect(bloque).not.toContain("descafeinado");
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toContain(GRUPO);
  });

  it("a nube: nada personal sale y lo que repite lo personal (≥40 caracteres) es fuga", async () => {
    const secreto = "Fin del plan del café con Marta para el jueves a las diez en punto con pastel";
    const { cliente } = clienteFalso({
      [PERSONALIDAD]: { aciertos: [{ texto: secreto }] },
      [GRUPO]: { aciertos: [{ texto: `${secreto} (copia compartida)` }, { texto: "Agenda pública del café" }] },
    });
    const bloque = await recordarDeCapsulas(
      { personalidadId: "aurora", grupoId: "cafe" } satisfies ContextoCapsulas, "café", { aNube: true, fecha: FECHA, cliente, ahora: RELOJ },
    );
    expect(bloque).not.toContain(secreto);
    expect(bloque).not.toContain("copia compartida");
    expect(bloque).toContain("Agenda pública del café");
  });

  it("sin servidor, consulta vacía o sin cápsulas: «» y nada lanza", async () => {
    const f = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    const cliente = { fetch: f as unknown as typeof fetch, token: "t" };
    await expect(recordarDeCapsulas({ personalidadId: "aurora" } satisfies ContextoCapsulas, "café", { fecha: FECHA, cliente, ahora: RELOJ })).resolves.toBe("");
    await expect(recordarDeCapsulas({ personalidadId: "aurora" } satisfies ContextoCapsulas, "   ", { fecha: FECHA, cliente, ahora: RELOJ })).resolves.toBe("");
    await expect(recordarDeCapsulas({} satisfies ContextoCapsulas, "café", { fecha: FECHA, cliente, ahora: RELOJ })).resolves.toBe("");
  });

  it("tope total de 800 ms: si el reloj pasa el límite, deja de buscar", async () => {
    const { cliente, llamadas } = clienteFalso({ [PERSONALIDAD]: { aciertos: [{ texto: "Arriba" }] }, [PERFIL]: { aciertos: [{ texto: "Abajo" }] } });
    const ahora = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(10).mockReturnValue(TOPE_RECUERDOS_MS + 100);
    const bloque = await recordarDeCapsulas(
      { personalidadId: "aurora", perfilId: "x" } satisfies ContextoCapsulas, "tope", { fecha: FECHA, cliente, ahora },
    );
    expect(bloque).toContain("Arriba");
    expect(bloque).not.toContain("Abajo");
    expect(llamadas).toHaveLength(1);
  });
});

describe("ayudantes puros", () => {
  it("sinFugas: personal solo sale si NO va a la nube; textos que repiten lo personal, descartados", () => {
    const secreto = "Fin del plan del café con Marta para el jueves a las diez en punto con pastel";
    const personal = fr("p", "personal", secreto);
    expect(sinFugas([personal], false)).toEqual([personal]);
    expect(sinFugas([personal], true)).toEqual([]);
    const corto = fr("c", "grupo", "plan corto del café, menos de cuarenta");
    expect(sinFugas([personal, corto], true).map((f) => f.id)).toEqual(["c"]);
  });

  it("recortarRecuerdos: máximo 6 fragmentos y 1500 caracteres; el primero entra siempre", () => {
    const muchos = Array.from({ length: 8 }, (_, i) => fr(`f${i}`, "publica", `t${i}`));
    expect(recortarRecuerdos(muchos)).toHaveLength(6);
    const uno = fr("largo", "publica", "a".repeat(1600));
    expect(recortarRecuerdos([uno, fr("s", "publica", "corto")]).map((f) => f.id)).toEqual(["largo"]);
    expect(recortarRecuerdos([])).toEqual([]);
  });

  it("bloqueDeRecuerdos: encabezado fijo, sin fragmentos vale «»", () => {
    expect(bloqueDeRecuerdos([])).toBe("");
    expect(bloqueDeRecuerdos([fr("a", "perfil", "texto uno")])).toBe("RECUERDOS (cápsulas Memvid):\n- (a.mv2) texto uno");
  });
});
