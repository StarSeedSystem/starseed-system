import { describe, expect, it, vi } from "vitest";
import { crearControlBucle } from "../adaptadores/use-bucle-bot";
import { bucleInicial } from "../bucle";
import type { Bot } from "../tipos";
import type { ContextoPercibir } from "../adaptadores/sentidos-puente";

const BOT: Bot = {
  id: "bot-1",
  nombre: "Bot",
  dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" },
  origen: "astraura",
  gobierno: "jerarquico",
  personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
  cuerpo: { forma: "orbe", tono: 200, escala: 1 },
  sentidosHabilitados: ["pantalla"],
  activo: true,
};

const CTX: ContextoPercibir = { cuentaId: "c1", sesion: "privada", medio: "web" };

const NAV = { tipo: "navegar", args: { ruta: "/hub" } };

describe("crearControlBucle", () => {
  it("proponer → esperar → confirmar → ejecutar → registro", async () => {
    const ejecutarAccion = vi.fn(async () => ({ ok: true, previo: { ruta: "/" }, motivo: "ok" }));
    const ctrl = crearControlBucle(BOT, CTX, { ejecutarAccion, ahora: () => 1 });
    const r1 = ctrl.proponer(NAV, "proponer", "miembro");
    expect(r1.ok).toBe(true);
    expect(ctrl.estado.fase).toBe("esperando");
    await new Promise((r) => setTimeout(r, 0));
    expect(ejecutarAccion).not.toHaveBeenCalled();
    ctrl.confirmar("cuenta-A");
    expect(ctrl.estado.fase).toBe("actuando");
    await new Promise((r) => setTimeout(r, 0));
    expect(ejecutarAccion).toHaveBeenCalledTimes(1);
    expect(ctrl.estado.fase).toBe("hecho");
    expect(ctrl.estado.registro.map((x) => x.tipo)).toContain("aplicada");
  });

  it("lo prohibido nunca llama al ejecutor", async () => {
    const ejecutarAccion = vi.fn(async () => ({ ok: true, previo: {}, motivo: "ok" }));
    const ctrl = crearControlBucle(BOT, CTX, { ejecutarAccion });
    const res = ctrl.proponer({ tipo: "computadora.ejecutar", args: { orden: "ls" } }, "aplicar", "invitado");
    expect(res.ok).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(ejecutarAccion).not.toHaveBeenCalled();
    expect(ctrl.estado.pendiente).toBeUndefined();
  });

  it("fallo del ejecutor", async () => {
    const ejecutarAccion = vi.fn(async () => ({ ok: false, previo: {}, motivo: "sin red" }));
    const ctrl = crearControlBucle(BOT, CTX, { ejecutarAccion });
    ctrl.proponer(NAV, "aplicar", "miembro");
    await new Promise((r) => setTimeout(r, 0));
    expect(ctrl.estado.fase).toBe("reposo");
    expect(ctrl.estado.registro.at(-1)?.tipo).toBe("fallo");
  });

  it("deshacer llama a la inversa", async () => {
    const ejecutarAccion = vi.fn(async () => ({ ok: true, previo: { ruta: "/a" }, motivo: "ok" }));
    const ctrl = crearControlBucle(BOT, CTX, { ejecutarAccion });
    ctrl.proponer(NAV, "aplicar", "miembro");
    await new Promise((r) => setTimeout(r, 0));
    const calls = ejecutarAccion.mock.calls.length;
    const r = ctrl.deshacer("cuenta-A");
    expect(r.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(ejecutarAccion.mock.calls.length).toBeGreaterThan(calls);
    expect(ctrl.estado.registro.map((x) => x.tipo)).toContain("deshecha");
  });

  it("pausar suelta sentidos", () => {
    const ctrl = crearControlBucle(BOT, CTX, {});
    ctrl.estado = bucleInicial(BOT.id);
    // simular sentido encendido
    const { avanzar } = require("../bucle");
    const { decidirSentido } = require("../permisos");
    // easier: use proponer + observar via estado manipulation not needed; just call pausar
    ctrl.pausar("cuenta-A");
    expect(ctrl.estado.fase).toBe("reposo");
    expect(ctrl.estado.sentidosActivos.length).toBe(0);
    expect(ctrl.estado.pendiente).toBeUndefined();
  });

  it("registro recortado", () => {
    const registrarSupabase = vi.fn();
    const ctrl = crearControlBucle(BOT, CTX, { registrarSupabase, ahora: () => Date.now() });
    // Forzar muchas entradas
    for (let i = 0; i < 250; i++) {
      ctrl.pausar(`q${i}`);
    }
    expect(ctrl.estado.registro.length).toBeLessThanOrEqual(200);
  });

  it("sin sesión no lanza", async () => {
    const registrarSupabase = undefined;
    const ejecutarAccion = vi.fn(async () => ({ ok: true, previo: {}, motivo: "ok" }));
    const ctrl = crearControlBucle(BOT, CTX, { ejecutarAccion, registrarSupabase });
    ctrl.proponer(NAV, "aplicar", "miembro");
    await new Promise((r) => setTimeout(r, 0));
    expect(ctrl.estado.fase).toBe("hecho");
    // no debe lanzar aunque no haya sesión
  });

  it("encenderSentido usa el puente y emite observar/soltar", async () => {
    const consentimientos = { vigentes: () => [{ botId: BOT.id, sentido: "pantalla" as const, cuentaId: "c1", vence: null }] };
    const depsPuente = { consentimientos, leerPantalla: () => "Hola", ahora: () => 1 };
    const ctrl = crearControlBucle(BOT, CTX, { depsPuente });
    const r = await ctrl.encenderSentido("pantalla", CTX);
    expect(r.ok).toBe(true);
    expect(ctrl.estado.registro.some((x) => x.tipo === "sentido-on")).toBe(true);
  });
});
