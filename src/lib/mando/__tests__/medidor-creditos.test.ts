import { describe, it, expect } from "vitest";
import { detalleDeMedidor, medidoresVisibles, configuracionPorDefecto } from "@/lib/mando/medidores";

const ejemplo = {
  version: 1,
  t: "2026-10-06T18:05:00-06:00",
  medidores: {
    claude: {
      id: "claude",
      proveedor: "anthropic",
      nombre: "Claude · plan",
      tipo: "plan",
      plan: "suscripción",
      ventanas: [
        { id: "sesion", etiqueta: "Sesión (5 h)", usado_pct: 23, reinicia: "2026-10-06T18:10:00-06:00" },
        { id: "semana", etiqueta: "Semana (todos los modelos)", usado_pct: 41, reinicia: "2026-10-10T04:00:00-06:00" },
      ],
      saldo: null,
      extras: {},
      fuente: "terminal: claude -p /usage",
      leido: "2026-10-06T18:05:00-06:00",
      ok: true,
      obsoleto: false,
      error: null,
      enlace: "https://claude.ai/settings/usage",
    },
    codex: {
      id: "codex",
      proveedor: "openai",
      nombre: "ChatGPT · Codex",
      tipo: "plan",
      plan: "plus",
      ventanas: [
        { id: "5h", etiqueta: "5 horas", usado_pct: 0, reinicia: "2026-10-06T22:58:40-06:00" },
        { id: "semana", etiqueta: "Semana", usado_pct: 100, reinicia: "2026-10-09T22:12:51-06:00" },
      ],
      saldo: { valor: 0, unidad: "créditos" },
      extras: { bloqueado: "rate_limit_reached", uso_normal: false, reinicios_gratis: 1, reinicio_gratis_vence: "2026-10-29T12:10:00-06:00" },
      fuente: "terminal: codex app-server",
      leido: "2026-10-06T18:05:00-06:00",
      ok: true,
      obsoleto: false,
      error: null,
      enlace: "https://chatgpt.com/codex/settings/usage",
    },
  },
};

describe("medidor creditos", () => {
  it("devuelve 2 filas en orden claude, codex con estados ok y peligro", () => {
    const ahora = Date.parse("2026-10-06T18:05:00-06:00");
    const detalle = detalleDeMedidor("creditos", { creditosPago: ejemplo }, ahora);
    expect(detalle.clave).toBe("creditos");
    expect(detalle.titulo).toBe("Créditos de pago");
    expect(detalle.filas).toHaveLength(2);
    expect(detalle.filas[0].id).toBe("claude");
    expect(detalle.filas[0].estado).toBe("ok");
    expect(detalle.filas[1].id).toBe("codex");
    expect(detalle.filas[1].estado).toBe("peligro");
  });

  it("con null devuelve vacio", () => {
    const detalle = detalleDeMedidor("creditos", { creditosPago: null });
    expect(detalle.vacio).toBe("Sin lecturas todavía: el servicio com.starseed.medidores lee Claude y Codex por terminal cada 10 min.");
    expect(detalle.filas).toHaveLength(0);
  });

  it("medidoresVisibles incluye creditos detrás de credito-claude", () => {
    const visibles = medidoresVisibles(configuracionPorDefecto());
    const idxClaude = visibles.indexOf("credito-claude");
    const idxCreditos = visibles.indexOf("creditos");
    expect(idxClaude).toBeGreaterThan(-1);
    expect(idxCreditos).toBe(idxClaude + 1);
  });

  it("una fila por ventana: etiqueta de la ventana y valor con usado, queda y reinicia", () => {
    const ahora = Date.parse("2026-10-06T18:05:00-06:00");
    const detalle = detalleDeMedidor("creditos", { creditosPago: ejemplo }, ahora);
    const claude = detalle.filas[0];
    const sesion = claude.ficha.find((f) => f.etiqueta === "Sesión (5 h)");
    const semana = claude.ficha.find((f) => f.etiqueta === "Semana (todos los modelos)");
    expect(sesion?.valor.startsWith("23 % usado · queda 77 % · reinicia ")).toBe(true);
    expect(semana?.valor.startsWith("41 % usado · queda 59 % · reinicia ")).toBe(true);
    expect(claude.ficha.filter((f) => f.etiqueta === "Usado")).toHaveLength(0);
  });

  it("ventana pasada dice «se reinició» y cuenta 0 % usado", () => {
    const ahora = Date.parse("2026-10-06T18:15:00-06:00");
    const detalle = detalleDeMedidor("creditos", { creditosPago: ejemplo }, ahora);
    const sesion = detalle.filas[0].ficha.find((f) => f.etiqueta === "Sesión (5 h)");
    expect(sesion?.valor).toBe("0 % usado · queda 100 % · se reinició");
  });

  it("porque usa el resumen y los extras, sin « · » colgando", () => {
    const ahora = Date.parse("2026-10-06T18:05:00-06:00");
    const detalle = detalleDeMedidor("creditos", { creditosPago: ejemplo }, ahora);
    const claude = detalle.filas[0];
    expect(claude.porque.endsWith(" ·")).toBe(false);
    expect(claude.porque.startsWith("41 % semana · reinicia ")).toBe(true);
    const codex = detalle.filas[1];
    expect(codex.porque).toContain("1 reinicio gratis hasta el 29 oct");
    expect(codex.porque).toContain("bloqueado: rate_limit_reached");
  });

  it("el resumen del panel nombra el peor medidor y SU ventana más usada", () => {
    const ahora = Date.parse("2026-10-06T18:05:00-06:00");
    const detalle = detalleDeMedidor("creditos", { creditosPago: ejemplo }, ahora);
    expect(detalle.resumen).toBe("2 créditos · peor: ChatGPT · Codex, Semana al 100 %");
  });

  it("el saldo sale con 2 decimales y separador español", () => {
    const ahora = Date.parse("2026-10-06T18:05:00-06:00");
    const detalle = detalleDeMedidor("creditos", { creditosPago: ejemplo }, ahora);
    const codex = detalle.filas[1];
    expect(codex.ficha.find((f) => f.etiqueta === "Saldo")?.valor).toBe("0,00 créditos");
    const conSaldo = { ...ejemplo, medidores: { ...ejemplo.medidores, extra: {
      id: "extra", proveedor: "banco", nombre: "Banco", tipo: "saldo", ventanas: [],
      saldo: { valor: 7.5, unidad: "USD" }, ok: true,
    } } };
    const d2 = detalleDeMedidor("creditos", { creditosPago: conSaldo }, ahora);
    expect(d2.filas[2].ficha.find((f) => f.etiqueta === "Saldo")?.valor).toBe("7,50 USD");
  });
});
