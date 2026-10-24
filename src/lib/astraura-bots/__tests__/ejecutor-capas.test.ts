import { describe, expect, it, vi } from "vitest";
import { deshacer, validarAccion, type AccionBot } from "../acciones";
import { apilar, MAX_CAPAS_POR_BOT, type CapaActiva } from "../capa-pantalla";
import { EVENTO_CAPA_BOT, prepararCapa } from "../adaptadores/ejecutor-acciones";

// Vecinos pesados del ejecutor, silenciados: aquí solo se prueban partes puras.
vi.mock("@/lib/aurora/actions", () => ({ AURORA_ACTIONS: [] as never[] }));
vi.mock("../adaptadores/computadora-cliente", () => ({
  ejecutar: () => Promise.resolve({ ok: false, motivo: "" }),
}));
vi.mock("../adaptadores/acciones-creacion", () => ({
  registrarEnEjecutor: (m: Map<unknown, unknown>) => m,
}));

const SPEC = {
  version: 1, superficie: "os:capa-bot", titulo: "Resumen",
  bloques: [{ tipo: "texto", id: "t1", props: { contenido: "Tres tareas abiertas" } }],
};
const problemasDe = (r: ReturnType<typeof prepararCapa>): string[] => ("problemas" in r ? r.problemas : []);

describe("prepararCapa · lo que llega del ejecutor se normaliza y se anota", () => {
  it("la capa valida y sale anotada con id, bot y el previo del deshacer", () => {
    const r = prepararCapa({ forma: "nota", texto: "Te queda una votación abierta" }, "capa-1", "bot:cafe-personal", "cafe-personal");
    expect(r).toEqual({
      capa: { forma: "nota", texto: "Te queda una votación abierta", id: "capa-1", botId: "bot:cafe-personal", nombreBot: "cafe-personal" },
      previo: { idEnviado: "capa-1" },
    });
  });
  it("el widget conserva su UiSpec depurada", () => {
    const r = prepararCapa({ forma: "widget", uiSpec: SPEC }, "capa-2", "bot:a", "a");
    expect("problemas" in r).toBe(false);
    if ("problemas" in r) return;
    expect(r.capa.uiSpec?.titulo).toBe("Resumen");
    expect(r.capa.forma).toBe("widget");
  });
  it("lo inválido NO se apila: vuelve con los problemas, sin capa ni previo", () => {
    expect(problemasDe(prepararCapa({ forma: "ventana-emergente" }, "c3", "bot:a", "a"))[0]).toMatch(/Forma desconocida/);
    expect(problemasDe(prepararCapa({ forma: "resaltar" }, "c4", "bot:a", "a"))[0]).toMatch(/necesita un objetivo/);
    const r = prepararCapa({ forma: "nota", texto: "  " }, "c5", "bot:a", "a");
    expect(problemasDe(r)).not.toHaveLength(0);
    expect("capa" in r).toBe(false);
  });
  it("el aviso del panel lleva su nombre fijo, sin claves", () => {
    expect(EVENTO_CAPA_BOT).toBe("starseed:astraura-bot-capa");
  });
});

describe("apilar en el panel · nunca más de 8 por bot", () => {
  it("la novena del mismo bot retira la más vieja y no toca a los demás", () => {
    let panel: readonly CapaActiva[] = [];
    for (let i = 1; i <= MAX_CAPAS_POR_BOT + 1; i++) {
      const r = prepararCapa({ forma: "nota", texto: `Parcial ${i}` }, `p${i}`, "bot:cafe-personal", "cafe-personal");
      if ("problemas" in r) throw new Error(r.problemas.join(" "));
      panel = apilar(panel, r.capa);
    }
    const otra = prepararCapa({ forma: "nota", texto: "De otro bot" }, "p-ajena", "otro-bot", "otro-bot");
    if ("problemas" in otra) throw new Error(otra.problemas.join(" "));
    panel = apilar(panel, otra.capa);
    const delCafe = panel.filter((c) => c.botId === "bot:cafe-personal").map((c) => c.id);
    expect(delCafe).toHaveLength(MAX_CAPAS_POR_BOT);
    expect(delCafe[0]).toBe("p2");
    expect(panel.some((c) => c.id === "p-ajena")).toBe(true);
  });
});

describe("deshacer · retirar la capa, no reimprimir", () => {
  it("deshacer devuelve {retirar: id} con el previo que preparó el ejecutor", () => {
    const accion = validarAccion({ tipo: "capa-pantalla", args: { forma: "nota", texto: "Recuerda apagar el ventilador" } });
    expect(accion.accion).not.toBeNull();
    if (!accion.accion) return;
    const a: AccionBot = accion.accion;
    const previo = { idEnviado: "capa-1" };
    expect(deshacer(a, previo)).toEqual({ retirar: "capa-1" });
  });
  it("sin el id de capa no hay cómo retirar: se dice, no se improvisa", () => {
    const accion = validarAccion({ tipo: "capa-pantalla", args: { forma: "resaltar", objetivo: "boton-publicar" } });
    if (!accion.accion) throw new Error(accion.problemas.join(" "));
    const r = deshacer(accion.accion, {});
    expect(r).toEqual({ irreversible: "No consta qué se envió." });
  });
});

