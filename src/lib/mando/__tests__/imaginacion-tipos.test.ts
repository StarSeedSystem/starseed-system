import { describe, expect, it } from "vitest";
import {
  AJUSTES_POR_DEFECTO, ESTADOS_DECIDIBLES, NOMBRE_ESTADO, NOMBRE_FUENTE, ambitoDeLaUrl, decidibles, esAmbito, esDecidible,
  filasMedidor, filtrarPorAmbito, interpretarPeticion, leerAmbito, normalizarAmbito, normalizarImportancia, normalizarReferencias,
  normalizarReimaginacion, reimaginacionesLibres, resumenPastilla, validarAjustes, vetoDecision,
  type PropuestaImaginacion,
} from "../imaginacion-tipos";

const HOY = new Date(2026, 9, 22, 12, 0, 0);
const AYER = new Date(2026, 9, 21, 12).toISOString();
const prop = (o: Partial<PropuestaImaginacion>): PropuestaImaginacion => ({
  id: "p", fuente: "diaria", titulo: "t", cuerpo: "", archivos: [], utilidad: 0.7,
  importancia: "media", estado: "nueva", motivo: "", t: HOY.toISOString(), ...o,
});

describe("validarAjustes", () => {
  it("devuelve los defectos con basura y no los muta", () => {
    expect(validarAjustes(null)).toEqual(AJUSTES_POR_DEFECTO);
    validarAjustes({ rango: { max: 3 } }).fuentes.diaria = false;
    expect(AJUSTES_POR_DEFECTO.fuentes.diaria).toBe(true);
  });
  it("acota el rango y mantiene min <= max", () => {
    expect(validarAjustes({ rango: { min: 8, max: 3 } }).rango).toEqual({ min: 3, max: 3 });
    expect(validarAjustes({ rango: { min: -5, max: 99 } }).rango).toEqual({ min: 0, max: 10 });
    expect(validarAjustes({ rango: { min: true, max: 2.5 } }).rango).toEqual({ min: 0, max: 10 });
  });
  it("valida franjas: descarta las malas, admite lista vacía y ordena días", () => {
    const f = validarAjustes({ horario: { franjas: [{ dias: [3, 1, 1, 9], desde: "22:00", hasta: "02:00" }, { dias: [1], desde: "25:00", hasta: "02:00" }, { dias: [1], desde: "02:00", hasta: "02:00" }] } });
    expect(f.horario.franjas).toEqual([{ dias: [1, 3], desde: "22:00", hasta: "02:00" }]);
    expect(validarAjustes({ horario: { franjas: [] } }).horario.franjas).toEqual([]);
    expect(validarAjustes({ horario: { franjas: [{ dias: [], desde: "01:00", hasta: "02:00" }] } }).horario.franjas).toEqual(AJUSTES_POR_DEFECTO.horario.franjas);
  });
  it("modo, fuentes, automático y profunda", () => {
    const a = validarAjustes({ automatico: false, fuentes: { astraura: false, x: false }, horario: { modo: "franjas", repartir: false }, profunda: { cada_dias: 999 } });
    expect(a).toMatchObject({ automatico: false, fuentes: { astraura: false, diaria: true, agentes: true }, horario: { modo: "franjas", repartir: false }, profunda: { cada_dias: 365 } });
    expect(validarAjustes({ horario: { modo: "otro" } }).horario.modo).toBe("inteligente");
  });
  // IMG1024B: el umbral se acota como en Python (autodesarrollo_logica.UMBRAL_MINIMO): [0,6; 1] y con dos decimales.
  it("auto: apagado por defecto, umbral 0,6–1 (como Python) y máximo de reimaginaciones 0–10", () => {
    expect(AJUSTES_POR_DEFECTO.auto).toEqual({ aprobar: false, reimaginar: false, umbral: 0.75, max_reimaginaciones: 2 });
    expect(validarAjustes({ auto: { aprobar: true, reimaginar: "sí", umbral: 1.7, max_reimaginaciones: 40 } }).auto)
      .toEqual({ aprobar: true, reimaginar: false, umbral: 1, max_reimaginaciones: 10 });
    expect(validarAjustes({ auto: { umbral: Number.NaN, max_reimaginaciones: 1.5 } }).auto).toEqual(AJUSTES_POR_DEFECTO.auto);
    expect(validarAjustes({ auto: { umbral: -2, max_reimaginaciones: 0 } }).auto).toMatchObject({ umbral: 0.6, max_reimaginaciones: 0 });
    expect(validarAjustes({ auto: { umbral: 0.5 } }).auto.umbral).toBe(0.6);
    expect(validarAjustes({ auto: { umbral: 0.8349 } }).auto.umbral).toBe(0.83);
  });
});

describe("referencias, ámbitos y reimaginación", () => {
  it("normalizarReferencias: solo https, sin credenciales, sin repetir, ≤ 20 y título ≤ 200 (o el dominio)", () => {
    const r = normalizarReferencias([
      { titulo: "Dribbble", url: "https://dribbble.com/shots/1" }, { url: "http://inseguro.com" }, "javascript:alert(1)",
      { titulo: "ftp", url: "ftp://x.org" }, "https://www.behance.net/galeria", { url: "https://user:clave@x.com/" },
      { titulo: "repetida", url: "https://dribbble.com/shots/1" }, { titulo: "x".repeat(500), url: "https://a.dev" }, 42, null,
    ]);
    expect(r).toEqual([
      { titulo: "Dribbble", url: "https://dribbble.com/shots/1" },
      { titulo: "www.behance.net", url: "https://www.behance.net/galeria" },
      { titulo: "x".repeat(200), url: "https://a.dev/" },
    ]);
    expect(normalizarReferencias(Array.from({ length: 30 }, (_, i) => `https://r${i}.org`))).toHaveLength(20);
    expect(normalizarReferencias("https://sola.org")).toEqual([]);
  });
  it("ámbitos: válidos, por defecto metagenesis y «todos» en la consulta", () => {
    expect(["metagenesis", "personal", "grupo:abc-1", "pagina:p_2"].every(esAmbito)).toBe(true);
    expect(["grupo:", "pagina:a/b", "otro", 3].some(esAmbito)).toBe(false);
    expect(normalizarAmbito("grupo:x")).toBe("grupo:x");
    expect(normalizarAmbito(undefined)).toBe("metagenesis");
    expect([leerAmbito(null), leerAmbito(""), leerAmbito("todos"), leerAmbito("personal"), leerAmbito("raro")]).toEqual(["todos", "todos", "todos", "personal", null]);
  });
  it("filtrarPorAmbito: una propuesta vieja sin ámbito es de MetaGenesis", () => {
    const ps = [prop({ id: "vieja" }), prop({ id: "g", ambito: "grupo:x" }), prop({ id: "m", ambito: "metagenesis" })];
    expect(filtrarPorAmbito(ps, "metagenesis").map((p) => p.id)).toEqual(["vieja", "m"]);
    expect(filtrarPorAmbito(ps, "grupo:x").map((p) => p.id)).toEqual(["g"]);
    expect(filtrarPorAmbito(ps, "todos")).toHaveLength(3);
    expect(filtrarPorAmbito(ps)).not.toBe(ps);
  });
  it("decidibles: incluye nueva y descartada; no lo reimaginando, reimaginado ni decidido", () => {
    expect([...ESTADOS_DECIDIBLES].sort()).toEqual(["descartada", "esperando-aprobacion", "nueva", "pospuesta", "pregunta"]);
    const ps = (["nueva", "descartada", "pregunta", "reimaginando", "reimaginada", "aprobada", "hecha"] as const).map((estado) => prop({ id: estado, estado }));
    expect(decidibles(ps).map((p) => p.id)).toEqual(["nueva", "descartada", "pregunta"]);
  });
  it("normalizarReimaginacion acota notas y referencias; por defecto la pidió Alex", () => {
    expect(normalizarReimaginacion("x")).toBeUndefined();
    expect(normalizarReimaginacion({ notas: "n".repeat(3000), referencias: ["http://no", "https://si.org"], pedida: "2026-10-24T10:00:00Z" }))
      .toEqual({ notas: "n".repeat(2000), referencias: [{ titulo: "si.org", url: "https://si.org/" }], pedida: "2026-10-24T10:00:00Z", por: "alex" });
  });
});

describe("vetoDecision y reimaginacionesLibres", () => {
  const encendida = validarAjustes({ auto: { aprobar: true, reimaginar: true, umbral: 0.6, max_reimaginaciones: 2 } });
  it("Alex decide todo lo decidible y nada de lo demás", () => {
    expect(vetoDecision(prop({ estado: "descartada", importancia: "crítica" }), "integrar", "alex", AJUSTES_POR_DEFECTO)).toBeNull();
    expect(vetoDecision(prop({ estado: "reimaginando" }), "rechazar", "alex", AJUSTES_POR_DEFECTO)).toContain("no espera tu decisión");
  });
  it("la automática nunca integra alta ni crítica, ni con el interruptor encendido", () => {
    for (const importancia of ["alta", "crítica"] as const) {
      expect(vetoDecision(prop({ estado: "esperando-aprobacion", importancia, utilidad: 1 }), "integrar", "automatica", encendida)).toContain("nunca la integra");
    }
    expect(vetoDecision(prop({ estado: "esperando-aprobacion", importancia: "baja", utilidad: 0.9 }), "integrar", "automatica", encendida)).toBeNull();
    expect(vetoDecision(prop({ utilidad: 0.5 }), "integrar", "automatica", encendida)).toContain("umbral");
    expect(vetoDecision(prop({ utilidad: 0.9 }), "integrar", "automatica", AJUSTES_POR_DEFECTO)).toContain("apagada");
  });
  it("la automática reimagina solo con reimaginaciones libres y nunca rechaza ni pospone", () => {
    expect(reimaginacionesLibres(prop({}), encendida)).toBe(2);
    expect(reimaginacionesLibres(prop({ version: 3 }), encendida)).toBe(0);
    expect(vetoDecision(prop({ version: 2 }), "reimaginar", "automatica", encendida)).toBeNull();
    expect(vetoDecision(prop({ version: 3 }), "reimaginar", "automatica", encendida)).toContain("Sin reimaginaciones libres");
    expect(vetoDecision(prop({}), "reimaginar", "automatica", AJUSTES_POR_DEFECTO)).toContain("apagada");
    expect(vetoDecision(prop({}), "rechazar", "automatica", encendida)).toContain("no rechaza");
  });
});

describe("resumenPastilla", () => {
  it("«N por decidir · R reimaginando · I integradas hoy»", () => {
    const r = resumenPastilla([
      prop({ id: "a", estado: "esperando-aprobacion" }), prop({ id: "b", estado: "pregunta", importancia: "baja" }),
      prop({ id: "c", estado: "autodesarrollo" }), prop({ id: "d", estado: "autodesarrollo", t: AYER }),
      prop({ id: "e", estado: "aprobada", t: AYER, decidida: HOY.toISOString() }), prop({ id: "f", estado: "hecha", t: AYER }),
      prop({ id: "g", estado: "reimaginando" }), prop({ id: "h", estado: "reimaginada" }),
    ], HOY);
    expect(r).toEqual({ texto: "2 por decidir · 1 reimaginando · 2 integradas hoy", tono: "atencion", porDecidir: 2, reimaginando: 1, integradasHoy: 2 });
  });
  it("tono aviso con alta/crítica y ok sin nada", () => {
    expect(resumenPastilla([prop({ estado: "esperando-aprobacion", importancia: "crítica" })], HOY).tono).toBe("aviso");
    expect(resumenPastilla([prop({ estado: "pregunta", importancia: "alta" })], HOY).tono).toBe("aviso");
    expect(resumenPastilla([], HOY)).toMatchObject({ tono: "ok", texto: "0 por decidir · 0 reimaginando · 0 integradas hoy" });
    expect(resumenPastilla([prop({ estado: "reimaginando", importancia: "crítica" })], HOY).tono).toBe("ok");
  });
  it("ignora fechas ilegibles", () => {
    expect(resumenPastilla([prop({ estado: "autodesarrollo", t: "no-fecha" })], HOY).integradasHoy).toBe(0);
  });
});

describe("filasMedidor", () => {
  it("ordena: espera a Alex, luego lo demás decidible, y dentro por importancia y utilidad", () => {
    const f = filasMedidor([
      prop({ id: "hecha", estado: "hecha", importancia: "crítica" }),
      prop({ id: "baja", estado: "esperando-aprobacion", importancia: "baja", utilidad: 0.9 }),
      prop({ id: "crit", estado: "pregunta", importancia: "crítica", utilidad: 0.6 }),
      prop({ id: "media2", estado: "esperando-aprobacion", importancia: "media", utilidad: 0.9 }),
      prop({ id: "media1", estado: "esperando-aprobacion", importancia: "media", utilidad: 0.6 }),
      prop({ id: "desc", estado: "descartada", importancia: "baja" }),
    ]);
    expect(f.map((x) => x.id)).toEqual(["crit", "media2", "media1", "baja", "desc", "hecha"]);
  });
  it("acciones según estado, campos nuevos con su defecto y nombre legible de la fuente", () => {
    const filas = filasMedidor([
      prop({ id: "1", estado: "esperando-aprobacion", fuente: "astraura" }),
      prop({ id: "2", estado: "pospuesta" }), prop({ id: "3", estado: "hecha", tarea: "T1" }),
      prop({ id: "4", estado: "nueva", fuente: "agentes", agente: "referencias-diseno", tipo: "diseno", ambito: "grupo:g", version: 2, referencias: [{ titulo: "r", url: "https://r.org/" }] }),
      prop({ id: "5", estado: "reimaginando" }),
    ]);
    expect(filas.map((f) => f.id)).toEqual(["1", "2", "4", "3", "5"]);
    const [a, b, c, d, e] = ["1", "2", "3", "4", "5"].map((id) => filas.find((f) => f.id === id)!);
    expect(a.acciones).toEqual(["integrar", "reimaginar", "rechazar", "posponer", "ver-origen"]);
    expect(a).toMatchObject({ fuente: "Procesos imaginativos de Astraura", tipo: "codigo", ambito: "metagenesis", version: 1, referencias: [], decidible: true });
    expect(b.acciones).toContain("integrar");
    expect(c).toMatchObject({ acciones: ["ver-origen"], tarea: "T1", esperaAlex: false, decidible: false });
    expect(d).toMatchObject({ fuente: "Agentes imaginativos", agente: "referencias-diseno", tipo: "diseno", ambito: "grupo:g", version: 2, decidible: true, esperaAlex: false });
    expect(e.acciones).toEqual(["ver-origen"]);
    expect(NOMBRE_FUENTE.directores).toBe("Directores");
  });
});

describe("interpretarPeticion", () => {
  it("«aprobar» es «integrar» y exige id; la automática solo si se dice", () => {
    expect(interpretarPeticion({ accion: "aprobar", id: " x " })).toEqual({ accion: "integrar", id: "x", por: "alex" });
    expect(interpretarPeticion({ accion: "integrar", id: "x", por: "automatica" })).toMatchObject({ por: "automatica" });
    expect(interpretarPeticion({ accion: "integrar" })).toEqual({ error: "Falta el id de la propuesta." });
    expect(interpretarPeticion([])).toEqual({ error: "Cuerpo JSON inválido." });
    expect(interpretarPeticion({ accion: "borrar", id: "x" })).toMatchObject({ error: expect.stringContaining("Acción desconocida") });
  });
  it("reimaginar sin notas ni referencias https válidas → error", () => {
    expect(interpretarPeticion({ accion: "reimaginar", id: "x", notas: "  " })).toMatchObject({ error: expect.stringContaining("reimaginar") });
    expect(interpretarPeticion({ accion: "reimaginar", id: "x", referencias: ["http://no.org"] })).toHaveProperty("error");
    expect(interpretarPeticion({ accion: "reimaginar", id: "x", referencias: ["https://si.org"] })).toMatchObject({ accion: "reimaginar", notas: "" });
  });
  it("posponer valida las horas", () => {
    expect(interpretarPeticion({ accion: "posponer", id: "x", horas: "48" })).toEqual({ accion: "posponer", id: "x", horas: 48 });
    expect(interpretarPeticion({ accion: "posponer", id: "x", horas: 0 })).toHaveProperty("error");
  });
  it("lote: ids o «pendientes», hacer válido, ámbito válido", () => {
    expect(interpretarPeticion({ accion: "lote", ids: "pendientes", hacer: "aprobar", ambito: "grupo:g" }))
      .toMatchObject({ accion: "lote", ids: "pendientes", hacer: "integrar", ambito: "grupo:g", por: "alex" });
    expect(interpretarPeticion({ accion: "lote", ids: ["a", " a", "b", ""], hacer: "rechazar" })).toMatchObject({ ids: ["a", "b"], ambito: "todos" });
    expect(interpretarPeticion({ accion: "lote", ids: [], hacer: "rechazar" })).toHaveProperty("error");
    expect(interpretarPeticion({ accion: "lote", ids: [1], hacer: "rechazar" })).toHaveProperty("error");
    expect(interpretarPeticion({ accion: "lote", ids: "pendientes", hacer: "posponer" })).toHaveProperty("error");
    expect(interpretarPeticion({ accion: "lote", ids: "pendientes", hacer: "rechazar", ambito: "raro" })).toHaveProperty("error");
    expect(interpretarPeticion({ accion: "lote", ids: "pendientes", hacer: "reimaginar" })).toHaveProperty("error");
    expect(interpretarPeticion({ accion: "lote", ids: Array.from({ length: 501 }, (_, i) => `p${i}`), hacer: "rechazar" })).toHaveProperty("error");
  });
});

describe("lo que escribe el director (IMG1024C) leído en TS", () => {
  it("«encargada» es un estado conocido, no decidible, y cuenta como integrada hoy", () => {
    expect(NOMBRE_ESTADO.encargada).toBe("Encargada a la flota");
    expect(esDecidible("encargada")).toBe(false);
    expect(resumenPastilla([prop({ estado: "encargada", tarea: "IMG-1" })], HOY).integradasHoy).toBe(1);
    expect(filasMedidor([prop({ estado: "encargada" })])[0]).toMatchObject({ decidible: false, acciones: ["ver-origen"] });
  });
  it("«critica» sin acento (o en mayúsculas) es «crítica»; lo desconocido, «media»", () => {
    expect(normalizarImportancia("critica")).toBe("crítica");
    expect(normalizarImportancia(" Crítica ")).toBe("crítica");
    expect(normalizarImportancia("CRITICA")).toBe("crítica");
    expect(normalizarImportancia("alta")).toBe("alta");
    expect(normalizarImportancia("urgente")).toBe("media");
    expect(normalizarImportancia(undefined)).toBe("media");
  });
  it("normalizarReimaginacion conserva el rastro del director, acotado y sin rutas absolutas", () => {
    const r = normalizarReimaginacion({
      notas: "n", referencias: [], pedida: "2026-10-24T20:00:00", por: "automatica", antes: "pregunta",
      tarea: "RIM-x-v2", salida: "starseed_memory_root/imaginacion/agentes/reimaginada-x-v1.json", cola: "cola-suenos-reimaginar-2026-10-24.json",
      encolada: "2026-10-24T20:05:00", recibida: "2026-10-24T21:00:00", version_nueva: "agentes:x-v2", devuelta: "2026-10-24T22:00:00",
    });
    expect(r).toEqual({
      notas: "n", referencias: [], pedida: "2026-10-24T20:00:00", por: "automatica", antes: "pregunta",
      tarea: "RIM-x-v2", salida: "starseed_memory_root/imaginacion/agentes/reimaginada-x-v1.json", cola: "cola-suenos-reimaginar-2026-10-24.json",
      encolada: "2026-10-24T20:05:00", recibida: "2026-10-24T21:00:00", version_nueva: "agentes:x-v2", devuelta: "2026-10-24T22:00:00",
    });
    const malo = normalizarReimaginacion({ antes: "inventado", salida: "/Users/alex/x.json", cola: "../fuera.json", tarea: 3 });
    expect(malo).toEqual({ notas: "", referencias: [], pedida: "", por: "alex" });
  });
  it("ambitoDeLaUrl: sin ámbito, «todos» o uno ajeno al contrato → MetaGenesis", () => {
    expect(ambitoDeLaUrl("")).toBe("metagenesis");
    expect(ambitoDeLaUrl("?ambito=todos")).toBe("metagenesis");
    expect(ambitoDeLaUrl("?ambito=local")).toBe("metagenesis");
    expect(ambitoDeLaUrl("?nivel=meta&ambito=grupo%3Ag1")).toBe("grupo:g1");
    expect(ambitoDeLaUrl("?ambito=personal")).toBe("personal");
  });
});
