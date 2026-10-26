// @vitest-environment jsdom
/**
 * Ejecutor de sueños · Ola 1025U · U4. Con el almacén REAL de la ficha de cada agente (jsdom) y una IA de mentira:
 * un sueño completo deja recuerdos y mueve un poco los rasgos; sin IA no se inventa nada; se puede cancelar; y el
 * tope de llamadas de la ficha corta el sueño.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardarConfigAgente, leerConfigAgente, leerRecuerdosAgente } from "@/lib/avatares/agente/almacen-agente";
import { configPorDefecto } from "@/lib/avatares/agente/config-agente";
import { crearAgenteMundoRef, type AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { ejecutarSueno, type GeneradorIA, type PeticionIA } from "../ejecutor";
import { TOPES_SUENO, nuevoSueno, planSueno, usoVacio, type Sueno, type UsoSuenos } from "../sueno";

const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);

const luna = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "luna", nombre: "Luna", dueno: { tipo: "perfil", id: "p1" } });
const sol = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "sol", nombre: "Sol", dueno: { tipo: "perfil", id: "p1" } });
const pagina = crearAgenteMundoRef({ origen: "bot", idOrigen: "pg1", nombre: "Voz de la Página", dueno: { tipo: "pagina", id: "pagina-1" } });

function nuevo(participantes: AgenteMundoRef[], tema = "las estrellas"): Sueno {
  const r = planSueno(participantes, tema);
  if (!r.ok) throw new Error(r.motivo);
  return nuevoSueno(r.plan, "esc-1", "manual", T0);
}

/** El reloj y el uso por hora en memoria, para no depender del disco en lo que no se prueba. */
function entorno() {
  let uso: UsoSuenos = usoVacio();
  let reloj = T0;
  return {
    ahora: () => (reloj += 10),
    leerUso: () => uso,
    guardarUso: (u: UsoSuenos) => {
      uso = u;
    },
    uso: () => uso,
  };
}

const iaQueResponde = (texto = (n: number, p: PeticionIA) => `Imagino algo nuevo número ${n} desde ${p.agenteId}`): GeneradorIA => {
  let n = 0;
  return async (p) => ({ ok: true, texto: texto(++n, p), fuente: "BitNet 1.58 local", gratis: true });
};

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("un sueño completo", () => {
  it("pide un turno por autor en orden, con su id y sin permiso de pago, y los escribe limpios", async () => {
    const e = entorno();
    const llamadas: PeticionIA[] = [];
    const ia: GeneradorIA = async (p) => {
      llamadas.push(p);
      return { ok: true, texto: `${p.agenteId.includes("luna") ? "Luna" : "Sol"}: «Veo una escalera de luz»`, gratis: true };
    };
    const fin = await ejecutarSueno(nuevo([luna, sol]), { generar: ia, ...e });
    expect(fin.estado).toBe("completo");
    expect(fin.turnos).toHaveLength(4);
    expect(fin.turnos.map((t) => t.autorId)).toEqual([luna.id, sol.id, luna.id, sol.id]);
    expect(fin.turnos[0].texto).toBe("Veo una escalera de luz");
    expect(llamadas.map((l) => l.agenteId)).toEqual([luna.id, sol.id, luna.id, sol.id]);
    for (const l of llamadas) {
      expect(l.permitirPago).toBe(false);
      expect(l.maxTokens).toBe(TOPES_SUENO.maxTokensTurno);
      expect(l.mensajes[0].role).toBe("system");
    }
    // El hilo crece: el segundo turno ya ve lo que dijo Luna.
    expect(JSON.stringify(llamadas[1].mensajes)).toMatch(/Luna: Veo una escalera de luz/);
    expect(fin.terminadoEn).toBeGreaterThan(T0);
  });

  it("cada llamada queda apuntada en el uso de la hora", async () => {
    const e = entorno();
    await ejecutarSueno(nuevo([luna, sol]), { generar: iaQueResponde(), ...e });
    expect(e.uso().llamadas[luna.id]).toHaveLength(2);
    expect(e.uso().llamadas[sol.id]).toHaveLength(2);
  });

  it("al despertar cada quien guarda su recuerdo y evoluciona un poco, y la ficha puede deshacerlo", async () => {
    const e = entorno();
    const avanzado: Sueno[] = [];
    const fin = await ejecutarSueno(nuevo([luna, sol]), { generar: iaQueResponde(), ...e, alAvanzar: (s) => avanzado.push(s) });
    expect(fin.consolidacion).toMatchObject({ recuerdos: 2, rasgos: 4, avisos: [] });
    for (const a of [luna, sol]) {
      const recuerdos = leerRecuerdosAgente(a);
      expect(recuerdos).toHaveLength(1);
      expect(recuerdos[0]).toMatchObject({ alcance: "personal", origen: "sueño" });
      expect(recuerdos[0].texto).toMatch(/^Soñé con/);
      const d = leerConfigAgente(a).desarrollo;
      expect(d.historial.length).toBe(2);
      expect(d.historial.every((h) => Math.abs(h.delta) <= 0.01 + 1e-9)).toBe(true);
      expect(d.historial[0].motivo).toMatch(/^Sueño: las estrellas/);
    }
    // alAvanzar: uno por turno y uno al final con el sueño completo y consolidado.
    expect(avanzado).toHaveLength(5);
    expect(avanzado[avanzado.length - 1]).toEqual(fin);
    expect(avanzado.slice(0, 4).every((s) => s.estado === "en-curso")).toBe(true);
  });

  it("un agente público no guarda lo personal de otro: su recuerdo es público y no lleva lo que dijo la personalidad", async () => {
    const e = entorno();
    const fin = await ejecutarSueno(
      nuevo([luna, pagina]),
      { generar: async (p) => ({ ok: true, texto: p.agenteId === luna.id ? "SECRETO-DE-LUNA vive en lo personal" : "Imagino un río de luz", gratis: true }), ...e },
    );
    expect(fin.estado).toBe("completo");
    const dePagina = leerRecuerdosAgente(pagina);
    expect(dePagina).toHaveLength(1);
    expect(dePagina[0].alcance).toBe("publica");
    expect(dePagina[0].texto).not.toMatch(/SECRETO-DE-LUNA/);
    // Luna, personal, sí puede llevar lo que dijo la página (público cabe en lo personal).
    const deLuna = leerRecuerdosAgente(luna);
    expect(deLuna[0].alcance).toBe("personal");
    expect(deLuna[0].texto).toMatch(/Voz de la Página: Imagino un río de luz/);
  });

  it("el empuje diario tiene tope: cuando ya no cabe más se dice, no se esconde", async () => {
    const e = entorno();
    // Cada sueño empuja 0,01 por rasgo y el tope de la ficha es 0,05 al día: el sexto sueño del día ya no mueve nada.
    let ultimo: Sueno | null = null;
    for (let i = 0; i < 6; i++) ultimo = await ejecutarSueno(nuevo([luna]), { generar: iaQueResponde(), ...e });
    expect(ultimo!.consolidacion!.rasgos).toBe(0);
    expect(ultimo!.consolidacion!.avisos.join(" ")).toMatch(/Luna: sus rasgos ya se movieron hoy/);
  });
});

describe("sin IA no se inventa nada", () => {
  it("si el generador dice que no hay IA, el sueño queda «sin-ia» con el motivo, sin turnos ni recuerdos", async () => {
    const e = entorno();
    const fin = await ejecutarSueno(nuevo([luna, sol]), { generar: async () => ({ ok: false, motivo: "No hay una IA gratuita disponible." }), ...e });
    expect(fin).toMatchObject({ estado: "sin-ia", turnos: [], motivo: "No hay una IA gratuita disponible." });
    expect(fin.consolidacion).toBeUndefined();
    expect(leerRecuerdosAgente(luna)).toEqual([]);
    expect(leerConfigAgente(luna).desarrollo.historial).toEqual([]);
  });

  it("una respuesta vacía tampoco se rellena", async () => {
    const e = entorno();
    const fin = await ejecutarSueno(nuevo([luna]), { generar: async () => ({ ok: true, texto: "  «»  " }), ...e });
    expect(fin.estado).toBe("sin-ia");
    expect(fin.motivo).toMatch(/no se inventa/i);
    expect(fin.turnos).toEqual([]);
  });

  it("un generador que lanza no tumba al ejecutor", async () => {
    const e = entorno();
    const fin = await ejecutarSueno(nuevo([luna]), { generar: async () => { throw new Error("boom"); }, ...e });
    expect(fin).toMatchObject({ estado: "sin-ia", motivo: "La IA falló: boom" });
  });

  it("si la IA se cae a mitad, se conservan los turnos que sí hubo y no se consolida nada", async () => {
    const e = entorno();
    let n = 0;
    const fin = await ejecutarSueno(
      nuevo([luna, sol]),
      { generar: async () => (++n <= 2 ? { ok: true, texto: `Turno ${n}`, gratis: true } : { ok: false, motivo: "Sin cupo" }), ...e },
    );
    expect(fin.estado).toBe("sin-ia");
    expect(fin.turnos).toHaveLength(2);
    expect(leerRecuerdosAgente(luna)).toEqual([]);
    expect(leerRecuerdosAgente(sol)).toEqual([]);
  });

  it("una IA que no contesta se corta al pasar el tiempo de espera", async () => {
    vi.useFakeTimers();
    const e = entorno();
    const pendiente = ejecutarSueno(nuevo([luna]), { generar: () => new Promise(() => undefined), ...e }, undefined, 1000);
    await vi.advanceTimersByTimeAsync(1100);
    const fin = await pendiente;
    expect(fin).toMatchObject({ estado: "sin-ia", motivo: "La IA tardó demasiado en responder." });
  });
});

describe("cancelar", () => {
  it("antes de empezar no llama a la IA", async () => {
    const e = entorno();
    const ia = vi.fn(iaQueResponde());
    const ctl = new AbortController();
    ctl.abort();
    const fin = await ejecutarSueno(nuevo([luna, sol]), { generar: ia, ...e }, ctl.signal);
    expect(fin.estado).toBe("cancelado");
    expect(ia).not.toHaveBeenCalled();
  });

  it("corta incluso una llamada en vuelo, y lo cancelado no deja recuerdos ni mueve rasgos", async () => {
    const e = entorno();
    const ctl = new AbortController();
    let n = 0;
    const ia: GeneradorIA = (p) => {
      n += 1;
      if (n === 1) return Promise.resolve({ ok: true, texto: "Primer turno", gratis: true });
      return new Promise((resolver) => p.signal.addEventListener("abort", () => resolver({ ok: false, motivo: "Cancelado." })));
    };
    const corre = ejecutarSueno(nuevo([luna, sol]), { generar: ia, ...e }, ctl.signal);
    await new Promise((r) => setTimeout(r, 20));
    ctl.abort();
    const fin = await corre;
    expect(fin.estado).toBe("cancelado");
    expect(fin.turnos).toHaveLength(1);
    expect(fin.consolidacion).toBeUndefined();
    expect(leerRecuerdosAgente(luna)).toEqual([]);
    expect(leerConfigAgente(luna).desarrollo.historial).toEqual([]);
  });

  it("aunque el generador ignore la cancelación, el ejecutor no se queda esperando", async () => {
    const e = entorno();
    const ctl = new AbortController();
    const corre = ejecutarSueno(nuevo([luna]), { generar: () => new Promise(() => undefined), ...e }, ctl.signal);
    await new Promise((r) => setTimeout(r, 10));
    ctl.abort();
    expect((await corre).estado).toBe("cancelado");
  });
});

describe("el tope de llamadas de la ficha", () => {
  it("con un tope de 1 por hora el sueño individual (tres turnos) se para tras el primero y lo dice", async () => {
    const e = entorno();
    const c = configPorDefecto(luna);
    guardarConfigAgente(luna, { ...c, motores: { ...c.motores, topePorHora: 1 } }, T0);
    const ia = vi.fn(iaQueResponde());
    const fin = await ejecutarSueno(nuevo([luna]), { generar: ia, ...e });
    expect(ia).toHaveBeenCalledTimes(1);
    expect(fin.estado).toBe("interrumpido");
    expect(fin.turnos).toHaveLength(1);
    expect(fin.motivo).toMatch(/Luna llegó a su tope de 1 llamadas por hora/);
    expect(leerRecuerdosAgente(luna)).toEqual([]);
  });

  it("las llamadas ya hechas esta hora (en otros sueños) también cuentan", async () => {
    const e = entorno();
    const ya: UsoSuenos = { ...usoVacio(), llamadas: { [luna.id]: [T0 - 5000, T0 - 4000] } };
    const c = configPorDefecto(luna);
    guardarConfigAgente(luna, { ...c, motores: { ...c.motores, topePorHora: 2 } }, T0);
    const ia = vi.fn(iaQueResponde());
    const fin = await ejecutarSueno(nuevo([luna]), { generar: ia, ...e, leerUso: () => ya });
    expect(ia).not.toHaveBeenCalled();
    expect(fin.estado).toBe("interrumpido");
  });
});

describe("robustez", () => {
  it("quien escucha el avance no puede romper el sueño", async () => {
    const e = entorno();
    const fin = await ejecutarSueno(nuevo([luna]), { generar: iaQueResponde(), ...e, alAvanzar: () => { throw new Error("oyente roto"); } });
    expect(fin.estado).toBe("completo");
  });

  it("si guardar el recuerdo falla, se dice en los avisos y el sueño sigue completo", async () => {
    const e = entorno();
    const fin = await ejecutarSueno(nuevo([luna]), {
      generar: iaQueResponde(),
      ...e,
      recordar: () => ({ ok: false, motivo: "cuota llena" }),
      experiencia: () => { throw new Error("disco"); },
    });
    expect(fin.estado).toBe("completo");
    expect(fin.consolidacion!.recuerdos).toBe(0);
    expect(fin.consolidacion!.avisos.join(" ")).toMatch(/cuota llena/);
    expect(fin.consolidacion!.avisos.join(" ")).toMatch(/experiencia/);
  });
});
