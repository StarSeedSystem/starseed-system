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

  it("(1) una fila de ficha por ventana, con la etiqueta de la ventana y el reinicio legible", () => {
    const ahora = Date.parse("2026-10-06T18:05:00-06:00");
    const detalle = detalleDeMedidor("creditos", { creditosPago: ejemplo }, ahora);
    const claude = detalle.filas[0];
    const etiquetas = (claude.ficha ?? []).map((f) => f.etiqueta);
    expect(etiquetas).toContain("Sesión (5 h)");
    expect(etiquetas).toContain("Semana (todos los modelos)");
    expect(etiquetas).not.toContain("Usado");
    const sesion = (claude.ficha ?? []).find((f) => f.etiqueta === "Sesión (5 h)");
    const esperada = new Intl.DateTimeFormat("es", { weekday: "short", hour: "numeric", minute: "2-digit" })
      .format(Date.parse("2026-10-06T18:10:00-06:00"));
    expect(sesion?.valor).toBe(`23 % usado · queda 77 % · reinicia ${esperada}`);
  });

  it("(1b) ventana reiniciada dice «se reinició»; sin fecha, sin «reinicia»", () => {
    const pasada = {
      ...ejemplo,
      medidores: {
        claude: {
          ...ejemplo.medidores.claude,
          ventanas: [
            { id: "sesion", etiqueta: "Sesión (5 h)", usado_pct: 80, reinicia: "2026-10-06T17:00:00-06:00" },
            { id: "rara", etiqueta: "Rara", usado_pct: 10, reinicia: "" },
          ],
        },
      },
    };
    const ahora = Date.parse("2026-10-06T18:05:00-06:00");
    const detalle = detalleDeMedidor("creditos", { creditosPago: pasada }, ahora);
    const ficha = detalle.filas[0].ficha ?? [];
    expect(ficha.find((f) => f.etiqueta === "Sesión (5 h)")?.valor).toBe("0 % usado · queda 100 % · se reinició");
    expect(ficha.find((f) => f.etiqueta === "Rara")?.valor).toBe("10 % usado · queda 90 %");
  });

  it("(2) el porque usa el resumen del estado más los extras, sin « · » colgando", () => {
    const ahora = Date.parse("2026-10-06T18:05:00-06:00");
    const detalle = detalleDeMedidor("creditos", { creditosPago: ejemplo }, ahora);
    const claude = detalle.filas[0];
    // Claude no tiene extras: nada de separador al final.
    const f = Date.parse("2026-10-10T04:00:00-06:00");
    const dia = new Intl.DateTimeFormat("es", { weekday: "short" }).format(f);
    const hora = new Intl.DateTimeFormat("es", { hour: "numeric", minute: "2-digit", hour12: false }).format(f);
    expect(claude.porque).toBe(`41 % semana · reinicia ${dia} ${hora}`);
    expect(claude.porque).not.toMatch(/ ·\s*$/);
    const codex = detalle.filas[1];
    expect(codex.porque).toContain("100 % semana");
    expect(codex.porque).toContain("1 reinicio gratis hasta el 29 oct");
    expect(codex.porque).toContain("bloqueado: rate_limit_reached");
    expect(codex.porque).toContain("uso normal cortado");
  });

  it("(3) el resumen del panel dice el medidor con peor tono y SU ventana más usada", () => {
    const ahora = Date.parse("2026-10-06T18:05:00-06:00");
    const detalle = detalleDeMedidor("creditos", { creditosPago: ejemplo }, ahora);
    expect(detalle.resumen).toBe("2 créditos · peor: ChatGPT · Codex, Semana al 100 %");
  });

  it("(4) el saldo lleva 2 decimales y separador español", () => {
    const conSaldo = {
      ...ejemplo,
      medidores: {
        claude: { ...ejemplo.medidores.claude, saldo: { valor: 7.5, unidad: "USD" } },
      },
    };
    const ahora = Date.parse("2026-10-06T18:05:00-06:00");
    const detalle = detalleDeMedidor("creditos", { creditosPago: conSaldo }, ahora);
    const saldo = (detalle.filas[0].ficha ?? []).find((f) => f.etiqueta === "Saldo");
    expect(saldo?.valor).toBe("7,50 USD");
  });

  it("medidoresVisibles incluye creditos detrás de credito-claude", () => {
    const visibles = medidoresVisibles(configuracionPorDefecto());
    const idxClaude = visibles.indexOf("credito-claude");
    const idxCreditos = visibles.indexOf("creditos");
    expect(idxClaude).toBeGreaterThan(-1);
    expect(idxCreditos).toBe(idxClaude + 1);
  });
});
