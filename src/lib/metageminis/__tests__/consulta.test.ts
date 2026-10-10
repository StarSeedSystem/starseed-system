import { describe, expect, it } from "vitest";
import { DIRECTORIO, type SitioDirectorio } from "../directorio";
import {
  ETIQUETA_AGENTES,
  ETIQUETA_CATEGORIA,
  ETIQUETA_ESTADO,
  filtrarDirectorio,
  ordenarDirectorio,
  proximosVencimientos,
  puedeEnviarElAgente,
  puedeRedactar,
  quienActua,
  resumirDirectorio,
  sitioPorId,
} from "../consulta";

function ficha(extra: Partial<SitioDirectorio>): SitioDirectorio {
  return {
    id: "x",
    nombre: "Sitio X",
    url: "https://x.example",
    categoria: "fondo",
    que_es: "Algo",
    utilidad: "Otra cosa",
    acceso: "web",
    api_o_formulario: "",
    agentes: "api-oficial-con-aviso",
    reglas: "",
    ia_en_texto: "permitida",
    coste: "gratis",
    coste_nota: "",
    prioridad: 2,
    estado: "continuo",
    vence: null,
    pasos_alex: "Nada",
    ramas: ["fondos"],
    verificacion: "pagina-leida",
    verificado: "2026-10-10",
    fuente: "https://x.example",
    ...extra,
  };
}

describe("reglas derivadas", () => {
  it("un sitio hecho para agentes o con API oficial admite al agente; el resto, no", () => {
    expect(puedeEnviarElAgente(ficha({ agentes: "diseñado-para-agentes" }))).toBe(true);
    expect(puedeEnviarElAgente(ficha({ agentes: "api-oficial-con-aviso" }))).toBe(true);
    expect(puedeEnviarElAgente(ficha({ agentes: "por-comunidad" }))).toBe(false);
    expect(puedeEnviarElAgente(ficha({ agentes: "solo-humano" }))).toBe(false);
    expect(puedeEnviarElAgente(ficha({ agentes: "prohibido" }))).toBe(false);
  });

  it("nada se envía solo a un sitio por revisar, cerrado, que no encaja o que no acepta IA", () => {
    expect(puedeEnviarElAgente(ficha({ estado: "revisar" }))).toBe(false);
    expect(puedeEnviarElAgente(ficha({ verificacion: "referencia-secundaria" }))).toBe(false);
    expect(puedeEnviarElAgente(ficha({ verificacion: "busqueda" }))).toBe(false);
    expect(puedeEnviarElAgente(ficha({ estado: "cerrado" }))).toBe(false);
    expect(puedeEnviarElAgente(ficha({ estado: "no-encaja" }))).toBe(false);
    expect(puedeEnviarElAgente(ficha({ ia_en_texto: "no-aceptada" }))).toBe(false);
  });

  it("redactar: no si prohíbe agentes, solo lectura, sin normas leídas o sin IA; sí si lo envía una persona", () => {
    expect(puedeRedactar(ficha({ agentes: "solo-humano" }))).toBe(true);
    expect(puedeRedactar(ficha({ agentes: "prohibido" }))).toBe(false);
    expect(puedeRedactar(ficha({ agentes: "solo-lectura" }))).toBe(false);
    expect(puedeRedactar(ficha({ agentes: "sin-verificar" }))).toBe(false);
    expect(puedeRedactar(ficha({ ia_en_texto: "no-aceptada" }))).toBe(false);
  });

  it("quién actúa", () => {
    expect(quienActua(ficha({ agentes: "api-oficial-con-aviso" }))).toBe("agente");
    expect(quienActua(ficha({ agentes: "solo-humano" }))).toBe("alex");
    expect(quienActua(ficha({ agentes: "solo-lectura" }))).toBe("solo-lee");
    expect(quienActua(ficha({ agentes: "prohibido" }))).toBe("solo-lee");
    expect(quienActua(ficha({ agentes: "solo-humano", ia_en_texto: "no-aceptada" }))).toBe("alex");
  });
});

describe("filtros y orden", () => {
  it("sin filtros devuelve todo el directorio, ordenado por prioridad", () => {
    const todos = filtrarDirectorio();
    expect(todos).toHaveLength(DIRECTORIO.length);
    for (let i = 1; i < todos.length; i++) expect(todos[i - 1].prioridad).toBeLessThanOrEqual(todos[i].prioridad);
  });

  it("busca por texto sin distinguir tildes ni mayúsculas", () => {
    const r = filtrarDirectorio({ texto: "INVERSION" });
    expect(r.length).toBeGreaterThan(0);
    expect(filtrarDirectorio({ texto: "zzzz-nada" })).toEqual([]);
  });

  it("filtra por categoría, estado, prioridad máxima y rama", () => {
    expect(filtrarDirectorio({ categoria: "red-agentes" }).every((s) => s.categoria === "red-agentes")).toBe(true);
    expect(filtrarDirectorio({ estado: "abierto" }).every((s) => s.estado === "abierto")).toBe(true);
    expect(filtrarDirectorio({ prioridadMax: 1 }).every((s) => s.prioridad === 1)).toBe(true);
    expect(filtrarDirectorio({ rama: "estudio" }).every((s) => s.ramas.includes("estudio"))).toBe(true);
    expect(filtrarDirectorio({ categoria: "todas", estado: "todos", rama: "todas" })).toHaveLength(DIRECTORIO.length);
  });

  it("«solo donde el agente puede enviar» deja únicamente sitios que lo permiten", () => {
    const r = filtrarDirectorio({ soloAgente: true });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every(puedeEnviarElAgente)).toBe(true);
  });

  it("ordena por prioridad, luego por fecha límite y luego por nombre", () => {
    const a = ficha({ id: "a", nombre: "B", prioridad: 2, vence: "2026-12-01" });
    const b = ficha({ id: "b", nombre: "A", prioridad: 2, vence: "2026-11-01" });
    const c = ficha({ id: "c", nombre: "C", prioridad: 1 });
    const d = ficha({ id: "d", nombre: "A", prioridad: 2, vence: null });
    expect(ordenarDirectorio([a, b, c, d]).map((s) => s.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("sitioPorId encuentra y devuelve undefined si no existe", () => {
    expect(sitioPorId("bluesky")?.nombre).toMatch(/Bluesky/);
    expect(sitioPorId("no-existe")).toBeUndefined();
  });
});

describe("vencimientos y resumen", () => {
  it("avisa de los plazos próximos y de los vencidos, sin contar sitios cerrados", () => {
    const base = [
      ficha({ id: "pronto", vence: "2026-10-15" }),
      ficha({ id: "lejos", vence: "2027-06-01" }),
      ficha({ id: "vencido", vence: "2026-10-01" }),
      ficha({ id: "cerrado", vence: "2026-10-12", estado: "cerrado" }),
      ficha({ id: "sin" }),
    ];
    const r = proximosVencimientos(new Date("2026-10-10T12:00:00Z"), 30, base);
    expect(r.map((x) => [x.sitio.id, x.diasRestantes])).toEqual([["vencido", -9], ["pronto", 5]]);
  });

  it("el resumen cuadra con el directorio", () => {
    const r = resumirDirectorio();
    expect(r.total).toBe(DIRECTORIO.length);
    expect(Object.values(r.porCategoria).reduce((a, b) => a + (b ?? 0), 0)).toBe(r.total);
    expect(Object.values(r.porEstado).reduce((a, b) => a + (b ?? 0), 0)).toBe(r.total);
    expect(r.puedeEnviarElAgente + r.soloAlex + r.soloLectura).toBe(r.total);
  });

  it("toda categoría, estado y regla usada tiene etiqueta en español", () => {
    for (const s of DIRECTORIO) {
      expect(ETIQUETA_CATEGORIA[s.categoria], s.id).toBeTruthy();
      expect(ETIQUETA_ESTADO[s.estado], s.id).toBeTruthy();
      expect(ETIQUETA_AGENTES[s.agentes], s.id).toBeTruthy();
    }
  });
});
