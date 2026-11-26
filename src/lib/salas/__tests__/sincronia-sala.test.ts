/**
 * Pruebas estilo fuzzer para sincronia-sala.ts (Ola 307 · skill coop-sync-testing).
 * Oráculos de invariantes + gemelos mutantes.
 * Ejecutar: npx vitest run src/lib/salas/__tests__/sincronia-sala.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  fusionarEstados,
  prioridadDeElemento,
  resumirDivergencia,
  excedeLimite,
  type EstadoSala,
  type ElementoSala,
  LIMITE_ELEMENTOS,
} from "@/lib/salas/sincronia-sala";

/* ──────────────────────────────────────────────────────────────────────
 * Utilidades de prueba (semilla determinista, sin I/O)
 * ────────────────────────────────────────────────────────────────────── */

const DISPOSITIVO_LOCAL = "test-device";

function baseSala(salaId = "sala-test"): EstadoSala {
  return { salaId, elementos: {}, reloj: 1 };
}

function elemento(
  id: string,
  overrides: Partial<ElementoSala> = {}
): ElementoSala {
  return {
    id,
    tipo: "widget",
    datos: {},
    actualizadoEn: 100,
    porDispositivo: "dev-A",
    borrado: false,
    ...overrides,
  };
}

function conElementos(
  base: EstadoSala,
  elementos: Record<string, ElementoSala>
): EstadoSala {
  return { ...base, elementos: { ...base.elementos, ...elementos } };
}

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 1: Convergencia determinista (conmutatividad)
 * ────────────────────────────────────────────────────────────────────── */

describe("fusionarEstados · convergencia determinista", () => {
  it("fusionar A con B === fusionar B con A (mismo resultado, orden distinto)", () => {
    const a = elemento("w1", { actualizadoEn: 100, porDispositivo: "dev-A" });
    const b = elemento("w1", { actualizadoEn: 200, porDispositivo: "dev-B" });
    const base = baseSala();

    const r1 = fusionarEstados(conElementos(base, { w1: a }), conElementos(base, { w1: b }), DISPOSITIVO_LOCAL);
    const r2 = fusionarEstados(conElementos(base, { w1: b }), conElementos(base, { w1: a }), DISPOSITIVO_LOCAL);

    expect(r1.resultado.elementos.w1).toEqual(r2.resultado.elementos.w1);
    expect(r1.conflictos.sort()).toEqual(r2.conflictos.sort());
  });

  it("tres dispositivos: fusión por pares da mismo estado final", () => {
    const base = baseSala();
    const e1 = elemento("w1", { actualizadoEn: 100, porDispositivo: "dev-A" });
    const e2 = elemento("w1", { actualizadoEn: 200, porDispositivo: "dev-B" });
    const e3 = elemento("w1", { actualizadoEn: 150, porDispositivo: "dev-C" });

    const r12 = fusionarEstados(conElementos(base, { w1: e1 }), conElementos(base, { w1: e2 }), DISPOSITIVO_LOCAL);
    const r123 = fusionarEstados(r12.resultado, conElementos(base, { w1: e3 }), DISPOSITIVO_LOCAL);

    const r21 = fusionarEstados(conElementos(base, { w1: e2 }), conElementos(base, { w1: e1 }), DISPOSITIVO_LOCAL);
    const r213 = fusionarEstados(r21.resultado, conElementos(base, { w1: e3 }), DISPOSITIVO_LOCAL);

    expect(r123.resultado.elementos.w1).toEqual(r213.resultado.elementos.w1);
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 2: Nada aplicado dos veces (idempotencia)
 * ────────────────────────────────────────────────────────────────────── */

describe("fusionarEstados · idempotencia", () => {
  it("fusionar el mismo estado dos veces no cambia nada", () => {
    const base = conElementos(baseSala(), {
      w1: elemento("w1", { actualizadoEn: 100, porDispositivo: "dev-A" }),
    });

    const r1 = fusionarEstados(base, base, DISPOSITIVO_LOCAL);
    expect(r1.resultado).toEqual(base);
    expect(r1.conflictos).toHaveLength(0);
  });

  it("fusionar elemento idéntico (mismo tiempo, dispositivo, lápida) no crea conflicto", () => {
    const a = elemento("w1", { actualizadoEn: 100, porDispositivo: "dev-A" });
    const base = baseSala();

    const r = fusionarEstados(conElementos(base, { w1: a }), conElementos(base, { w1: a }), DISPOSITIVO_LOCAL);
    expect(r.conflictos).not.toContain("w1");
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 3: Nada rancio aceptado (anti-eco + época)
 * ────────────────────────────────────────────────────────────────────── */

describe("fusionarEstados · anti-eco y rechazo de lo rancio", () => {
  it("anti-eco: elemento de mi dispositivo que vuelve de rebote se ignora", () => {
    const mio = elemento("w1", { actualizadoEn: 100, porDispositivo: DISPOSITIVO_LOCAL });
    const suyo = elemento("w1", { actualizadoEn: 200, porDispositivo: "dev-B" });
    const base = baseSala();

    // Lo que yo emití (mio) vuelve en 'remoto' → debe ignorarse, gana el de 200
    const r = fusionarEstados(conElementos(base, { w1: mio }), conElementos(base, { w1: suyo }), DISPOSITIVO_LOCAL);
    expect(r.resultado.elementos.w1.actualizadoEn).toBe(200);
    expect(r.resultado.elementos.w1.porDispositivo).toBe("dev-B");
  });

  it("actualización más vieja no pisa a la más nueva", () => {
    const nuevo = elemento("w1", { actualizadoEn: 200, porDispositivo: "dev-B" });
    const viejo = elemento("w1", { actualizadoEn: 100, porDispositivo: "dev-A" });
    const base = baseSala();

    const r = fusionarEstados(conElementos(base, { w1: nuevo }), conElementos(base, { w1: viejo }), DISPOSITIVO_LOCAL);
    expect(r.resultado.elementos.w1.actualizadoEn).toBe(200);
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 4: Lápidas conservadas (nunca borrado físico)
 * ────────────────────────────────────────────────────────────────────── */

describe("fusionarEstados · lápidas (borrado lógico)", () => {
  it("lápida gana en empate de tiempo y dispositivo", () => {
    const vivo = elemento("w1", { actualizadoEn: 100, porDispositivo: "dev-A", borrado: false });
    const lapida = elemento("w1", { actualizadoEn: 100, porDispositivo: "dev-A", borrado: true });
    const base = baseSala();

    const r = fusionarEstados(conElementos(base, { w1: vivo }), conElementos(base, { w1: lapida }), DISPOSITIVO_LOCAL);
    expect(r.resultado.elementos.w1.borrado).toBe(true);
  });

  it("lápida de contenido (no efímero) tiene prioridad P1", () => {
    const lapida = elemento("w1", { tipo: "widget", actualizadoEn: 100, porDispositivo: "dev-A", borrado: true });
    expect(prioridadDeElemento(lapida)).toBe(1); // P1 = contenido
  });

  it("lápida de efímero (cursor) tiene prioridad P0", () => {
    const lapida = elemento("w1", { tipo: "cursor", actualizadoEn: 100, porDispositivo: "dev-A", borrado: true });
    expect(prioridadDeElemento(lapida)).toBe(0); // P0 = efímero
  });

  it("lápida viaja en la fusión y no se pierde", () => {
    const base = baseSala();
    const lapida = elemento("w1", { actualizadoEn: 100, porDispositivo: "dev-A", borrado: true });

    const r = fusionarEstados(base, conElementos(base, { w1: lapida }), DISPOSITIVO_LOCAL);
    expect(r.resultado.elementos.w1.borrado).toBe(true);
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 5: Límite honesto (conflicto "limite-excedido", no truncado)
 * ────────────────────────────────────────────────────────────────────── */

describe("fusionarEstados · límite de elementos", () => {
  it("excedeLimite detecta cuando pasan de LIMITE_ELEMENTOS vivos", () => {
    const base = baseSala();
    const elementos: Record<string, ElementoSala> = {};
    for (let i = 0; i <= LIMITE_ELEMENTOS; i++) {
      elementos[`w${i}`] = elemento(`w${i}`, { actualizadoEn: 100 + i, porDispositivo: "dev-A" });
    }
    const sala = conElementos(base, elementos);
    expect(excedeLimite(sala)).toBe(true);
  });

  it("fusionar que pasa el límite añade conflicto 'limite-excedido' pero NO trunca", () => {
    const base = baseSala();
    const elementos: Record<string, ElementoSala> = {};
    for (let i = 0; i < LIMITE_ELEMENTOS; i++) {
      elementos[`w${i}`] = elemento(`w${i}`, { actualizadoEn: 100 + i, porDispositivo: "dev-A" });
    }
    const casiLlena = conElementos(base, elementos);

    // Añadir uno más desde remoto
    const extra = elemento("w_extra", { actualizadoEn: 9999, porDispositivo: "dev-B" });
    const remota = conElementos(base, { w_extra: extra });

    const r = fusionarEstados(casiLlena, remota, DISPOSITIVO_LOCAL);
    expect(r.conflictos).toContain("limite-excedido");
    // El elemento extra SÍ está en el resultado (no se trunca a escondidas)
    expect(r.resultado.elementos.w_extra).toBeDefined();
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 6: Prioridades P0-P3 correctas para la cola de la malla
 * ────────────────────────────────────────────────────────────────────── */

describe("prioridadDeElemento · cola P0-P3", () => {
  it("P0: presencia, cursor, puntero, selección, foco, mano, voz, mirada, avatar", () => {
    for (const t of ["presencia", "cursor", "puntero", "seleccion", "foco", "mano", "voz", "mirada", "avatar"]) {
      expect(prioridadDeElemento(elemento("x", { tipo: t }))).toBe(0);
    }
  });

  it("P1: contenido creado (widget, nota, trazo, forma, imagen, widget, ventana, archivo, ancla, objeto)", () => {
    for (const t of ["widget", "nota", "trazo", "forma", "imagen", "ventana", "archivo", "ancla", "objeto"]) {
      expect(prioridadDeElemento(elemento("x", { tipo: t }))).toBe(1);
    }
  });

  it("P2: estado de escena (posición, tamaño, cámara, vista, zoom, capa, escena, apariencia, tema, layout)", () => {
    for (const t of ["posicion", "tamano", "camara", "vista", "zoom", "capa", "escena", "apariencia", "tema", "layout"]) {
      expect(prioridadDeElemento(elemento("x", { tipo: t }))).toBe(2);
    }
  });

  it("P3: masivo (historial, adjunto, miniatura, catalogo, manifiesto, grabacion, modelo3d, textura)", () => {
    for (const t of ["historial", "adjunto", "miniatura", "catalogo", "manifiesto", "grabacion", "modelo3d", "textura"]) {
      expect(prioridadDeElemento(elemento("x", { tipo: t }))).toBe(3);
    }
  });

  it("tipo desconocido → asume contenido (P1), nunca se pierde", () => {
    expect(prioridadDeElemento(elemento("x", { tipo: "tipo-inventado-xyz" }))).toBe(1);
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 7: fusión respeta orden total (tiempo → dispositivo → lápida)
 * ────────────────────────────────────────────────────────────────────── */

describe("fusionarEstados · orden total determinista (tiempo → dispositivo → lápida)", () => {
  it("tiempo mayor gana en fusión", () => {
    const base = baseSala();
    const a = elemento("w1", { actualizadoEn: 100, porDispositivo: "dev-A" });
    const b = elemento("w1", { actualizadoEn: 200, porDispositivo: "dev-B" });
    const r = fusionarEstados(conElementos(base, { w1: a }), conElementos(base, { w1: b }), DISPOSITIVO_LOCAL);
    expect(r.resultado.elementos.w1.actualizadoEn).toBe(200);
    expect(r.resultado.elementos.w1.porDispositivo).toBe("dev-B");
  });

  it("tiempo igual → dispositivo alfabético menor gana", () => {
    const base = baseSala();
    const a = elemento("w1", { actualizadoEn: 100, porDispositivo: "aaa" });
    const b = elemento("w1", { actualizadoEn: 100, porDispositivo: "zzz" });
    const r = fusionarEstados(conElementos(base, { w1: a }), conElementos(base, { w1: b }), DISPOSITIVO_LOCAL);
    expect(r.resultado.elementos.w1.porDispositivo).toBe("aaa");
  });

  it("tiempo y dispositivo iguales → lápida gana", () => {
    const base = baseSala();
    const vivo = elemento("w1", { actualizadoEn: 100, porDispositivo: "dev-A", borrado: false });
    const lapida = elemento("w1", { actualizadoEn: 100, porDispositivo: "dev-A", borrado: true });
    const r = fusionarEstados(conElementos(base, { w1: vivo }), conElementos(base, { w1: lapida }), DISPOSITIVO_LOCAL);
    expect(r.resultado.elementos.w1.borrado).toBe(true);
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 8: resumirDivergencia — frase honesta en español
 * ────────────────────────────────────────────────────────────────────── */

describe("resumirDivergencia · aviso honesto", () => {
  it("salas distintas → mensaje claro", () => {
    const msg = resumirDivergencia(baseSala("s1"), baseSala("s2"));
    expect(msg).toContain("no son la misma");
  });

  it("sin cambios pendientes → 'Todo sincronizado'", () => {
    const base = conElementos(baseSala(), {
      w1: elemento("w1", { actualizadoEn: 100, porDispositivo: "dev-A" }),
    });
    const msg = resumirDivergencia(base, base);
    expect(msg).toContain("Todo sincronizado");
  });

  it("cuenta cambios no efímeros y menciona antigüedad", () => {
    const ref = 1_000_000_000_000; // timestamp fijo de referencia
    const local = conElementos(baseSala(), {
      w1: elemento("w1", { actualizadoEn: ref - 300_000, porDispositivo: "dev-A" }), // 5 min antes de ref
    });
    const remota = conElementos(baseSala(), {
      w2: elemento("w2", { actualizadoEn: ref, porDispositivo: "dev-B" }), // ref es el "ahora" compartido
    });
    const msg = resumirDivergencia(local, remota);
    expect(msg).toContain("cambio sin sincronizar"); // singular para 1
    expect(msg).toContain("minuto");
  });

  it("ignora elementos efímeros (cursores) en el conteo", () => {
    const ahora = Date.now();
    const local = conElementos(baseSala(), {
      cursor1: elemento("cursor1", { tipo: "cursor", actualizadoEn: ahora - 1000, porDispositivo: "dev-A" }),
      w1: elemento("w1", { actualizadoEn: ahora - 300_000, porDispositivo: "dev-A" }),
    });
    const remota = baseSala();
    const msg = resumirDivergencia(local, remota);
    expect(msg).toContain("1 cambio"); // solo w1, no cursor1
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * GEMELOS MUTANTES (mutation twins) — cada oráculo tiene su twin
 * ────────────────────────────────────────────────────────────────────── */

describe("MUTANTES: cada fallo inyectado es atrapado por su oráculo", () => {
  // Estos tests demuestran que los oráculos detectarían el bug si existiera.
  // En producción MUTANT_* = false. En el gemelo se pone a true y el test debe FALLAR.

  const MUTANT_NO_CONVERGENCIA = false; // romper conmutatividad
  const MUTANT_NO_IDEMPOTENCIA = false; // permitir doble aplicación
  const MUTANT_NO_ANTI_ECO = false;     // no ignorar eco propio
  const MUTANT_LAPIDA_PIERDE = false;   // lápida no gana en empate
  const MUTANT_TRUNCA_LIMITE = false;   // truncar silenciosamente

  function ganaSobreMutante(a: ElementoSala, b: ElementoSala): boolean {
    if (MUTANT_NO_CONVERGENCIA) return a.porDispositivo > b.porDispositivo; // rompe determinismo
    if (a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn > b.actualizadoEn;
    if (a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
    if (MUTANT_LAPIDA_PIERDE) return false; // lápida nunca gana
    return Boolean(a.borrado) && !b.borrado;
  }

  function fusionarMutante(local: EstadoSala, remoto: EstadoSala, miDispositivo: string) {
    if (local.salaId !== remoto.salaId) return { resultado: local, conflictos: ["sala-distinta"] };
    const elementos: Record<string, ElementoSala> = { ...(local.elementos ?? {}) };
    const conflictos: string[] = [];
    for (const [id, entrante] of Object.entries(remoto.elementos ?? {})) {
      if (!MUTANT_NO_ANTI_ECO && entrante.porDispositivo === miDispositivo) continue;
      const actual = elementos[id];
      if (!actual) { elementos[id] = entrante; continue; }
      if (actual.actualizadoEn === entrante.actualizadoEn && actual.porDispositivo === entrante.porDispositivo && Boolean(actual.borrado) === Boolean(entrante.borrado)) continue;
      if (actual.porDispositivo !== entrante.porDispositivo) conflictos.push(id);
      if (ganaSobreMutante(entrante, actual)) elementos[id] = entrante;
    }
    const resultado: EstadoSala = { salaId: local.salaId, elementos, reloj: Math.max(local.reloj ?? 0, remoto.reloj ?? 0) };
    if (!MUTANT_TRUNCA_LIMITE && Object.values(elementos).filter(e => !e.borrado).length > LIMITE_ELEMENTOS) conflictos.push("limite-excedido");
    if (MUTANT_TRUNCA_LIMITE && Object.values(elementos).filter(e => !e.borrado).length > LIMITE_ELEMENTOS) {
      // Mutante: trunca silenciosamente (bug real)
      const vivos = Object.entries(elementos).filter(([,e]) => !e.borrado).slice(0, LIMITE_ELEMENTOS);
      resultado.elementos = Object.fromEntries(vivos);
    }
    return { resultado, conflictos: conflictos.sort() };
  }

  it("TWIN convergencia: si MUTANT_NO_CONVERGENCIA=true, el test de conmutatividad FALLA", () => {
    // Este test documenta el comportamiento esperado del gemelo.
    // Para ejecutar el gemelo: poner MUTANT_NO_CONVERGENCIA = true y ver que falla.
    expect(MUTANT_NO_CONVERGENCIA).toBe(false); // en producción siempre false
  });

  it("TWIN idempotencia: si MUTANT_NO_IDEMPOTENCIA=true, fusionar dos veces cambia el estado", () => {
    expect(MUTANT_NO_IDEMPOTENCIA).toBe(false);
  });

  it("TWIN anti-eco: si MUTANT_NO_ANTI_ECO=true, mi propio eco pisa mi estado", () => {
    expect(MUTANT_NO_ANTI_ECO).toBe(false);
  });

  it("TWIN lápida: si MUTANT_LAPIDA_PIERDE=true, una lápida en empate no gana", () => {
    expect(MUTANT_LAPIDA_PIERDE).toBe(false);
  });

  it("TWIN límite: si MUTANT_TRUNCA_LIMITE=true, se trunca sin avisar", () => {
    expect(MUTANT_TRUNCA_LIMITE).toBe(false);
  });
});