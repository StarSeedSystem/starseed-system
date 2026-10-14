import { describe, expect, it } from "vitest";
import {
  recordar, recuerdos, regularAhora, transferir,
  type DepMemoriaCerebro, type RecuerdoEnCerebro,
} from "../adaptadores/memoria-cerebro";
import type { Bot } from "../tipos";

/** Bot de pruebas: perfil propio, grupo o invitado según el caso. */
function hacerBot(tipo: "perfil" | "grupo" | "invitado"): Bot {
  return {
    id: `b-${tipo}`, nombre: `Bot ${tipo}`,
    dueno: tipo === "grupo"
      ? { tipo: "grupo", id: "gr-1", cuentaId: "cta-1" }
      : { tipo: "perfil", id: "pf-1", cuentaId: "cta-1" },
    origen: tipo === "invitado" ? "externo" : "astraura",
    gobierno: "jerarquico",
    personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
    cuerpo: { forma: "orbe", tono: 200, escala: 1 },
    sentidosHabilitados: [], activo: true,
  };
}

function hacerRecuerdo(botId: string, parcial: Partial<RecuerdoEnCerebro> = {}): RecuerdoEnCerebro {
  return {
    id: "r1", botId, alcance: "personal", texto: "recuerdo de prueba", origen: "t",
    at: 1000, bytes: 20, usos: 0, cuentaId: "cta-1", ...parcial,
  };
}

function hacerDep(lista: RecuerdoEnCerebro[], extra: Partial<DepMemoriaCerebro> = {}) {
  const borrados: string[] = [];
  const dep: DepMemoriaCerebro = {
    leer: async () => lista,
    escribir: async () => true,
    borrar: async (_b, ids) => { borrados.push(...ids); },
    origen: async () => ({ neurona: "n1", cuentaId: "cta-1" }),
    destinos: async () => [
      { neurona: "n2", cuentaId: "cta-1", tipo: "propia" },
      { neurona: "nx", cuentaId: "cta-x", tipo: "propia" },
    ],
    enviarPorMalla: async () => ({ ok: true }),
    ahora: () => 10_000,
    ...extra,
  };
  return { dep, borrados };
}

describe("memoria-cerebro (BOT1011R)", () => {
  it("escribe un recuerdo dentro de su alcance", async () => {
    const bot = hacerBot("perfil");
    const r = await recordar(bot, "personal", "aprendí esto", hacerDep([]).dep);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.cuentaId).toBe("cta-1");
  });

  it("rechaza escribir fuera de alcance (invitado → personal)", async () => {
    const r = await recordar(hacerBot("invitado"), "personal", "x", hacerDep([]).dep);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no puede escribir");
  });

  it("un bot de grupo no lee memoria personal ni de perfil", async () => {
    const lista = [
      hacerRecuerdo("b-grupo", { alcance: "personal" }),
      hacerRecuerdo("b-grupo", { id: "r2", alcance: "grupo", grupoId: "gr-1" }),
      hacerRecuerdo("b-grupo", { id: "r3", alcance: "publica" }),
    ];
    const r = await recuerdos(hacerBot("grupo"), "", hacerDep(lista).dep);
    expect(r.ok && r.valor.map((x) => x.id)).toEqual(["r2", "r3"]);
  });

  it("un invitado solo ve lo público", async () => {
    const lista = [
      hacerRecuerdo("b-invitado", { alcance: "grupo", grupoId: "gr-1" }),
      hacerRecuerdo("b-invitado", { id: "r2", alcance: "publica" }),
    ];
    const r = await recuerdos(hacerBot("invitado"), "", hacerDep(lista).dep);
    expect(r.ok && r.valor.map((x) => x.id)).toEqual(["r2"]);
  });

  it("un bot personal no lee recuerdos de OTRA cuenta", async () => {
    const lista = [hacerRecuerdo("b-perfil", { cuentaId: "cta-2" })];
    const r = await recuerdos(hacerBot("perfil"), "", hacerDep(lista).dep);
    expect(r.ok && r.valor).toEqual([]);
  });

  it("la consulta filtra por texto", async () => {
    const lista = [
      hacerRecuerdo("b-perfil", { texto: "la casa es azul" }),
      hacerRecuerdo("b-perfil", { id: "r2", texto: "el mar de otoño" }),
    ];
    const r = await recuerdos(hacerBot("perfil"), "casa", hacerDep(lista).dep);
    expect(r.ok && r.valor.map((x) => x.id)).toEqual(["r1"]);
  });

  it("regular borra lo olvidado solo del almacén del bot", async () => {
    const ahora = 400 * 24 * 60 * 60 * 1000;
    const lista = [
      hacerRecuerdo("b-perfil", { id: "viejo", bytes: 6 * 1024 * 1024, at: 0, usos: 0 }),
      hacerRecuerdo("b-perfil", { id: "fijado", bytes: 1, fijado: true }),
    ];
    const { dep, borrados } = hacerDep(lista, { ahora: () => ahora });
    const r = await regularAhora(hacerBot("perfil"), "web", dep);
    expect(r.ok && r.valor.olvidados).toEqual(["viejo"]);
    expect(borrados).toEqual(["viejo"]);
  });

  it("transferir respeta el plan: lo personal solo va a neuronas de la misma cuenta", async () => {
    const envios: string[][] = [];
    const lista = [
      hacerRecuerdo("b-perfil", { id: "pers", alcance: "personal" }),
      hacerRecuerdo("b-perfil", { id: "pub", alcance: "publica" }),
    ];
    const { dep } = hacerDep(lista, {
      enviarPorMalla: async (tramo) => { envios.push([tramo.destino.neurona, ...tramo.ids]); return { ok: true }; },
    });
    const r = await transferir(hacerBot("perfil"), dep);
    expect(r.ok && r.valor.enviados).toBe(3);
    // «pers» nunca viaja a la neurona ajena «nx».
    const haciaNx = envios.find((e) => e[0] === "nx") ?? [];
    expect(haciaNx).not.toContain("pers");
  });

  it("sin malla responde «próximamente» y nunca por LoRa", async () => {
    const { dep } = hacerDep([hacerRecuerdo("b-perfil")]);
    delete dep.enviarPorMalla;
    const r = await transferir(hacerBot("perfil"), dep);
    expect(!r.ok && r.error.startsWith("próximamente")).toBe(true);
  });

  it("los errores de las dependencias no lanzan: vuelven como fallo", async () => {
    const { dep } = hacerDep([], { leer: async () => { throw new Error("sin red"); } });
    const r = await recuerdos(hacerBot("perfil"), "", dep);
    expect(r.ok).toBe(false);
  });
});
