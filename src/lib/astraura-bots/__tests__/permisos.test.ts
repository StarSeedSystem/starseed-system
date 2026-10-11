import { describe, expect, it } from "vitest";
import type { AccionBot } from "../acciones";
import {
  VIGENCIA_MAX_INVITADO_MS, actorDeBot, consentimientoVigente, decidirAccion, decidirConfiguracion,
  decidirSentido, memoriaVisible, puedeEscribirMemoria, puedeLeerMemoria, type PeticionSentido,
} from "../permisos";
import { SENTIDOS, type Bot, type ConsentimientoSentido, type Sentido } from "../tipos";

const AHORA = 1_800_000_000_000;
const bot = (o: Partial<Bot> = {}): Bot => ({
  id: "b1", nombre: "Astraura", origen: "astraura", gobierno: "jerarquico", activo: true,
  dueno: { tipo: "perfil", id: "perfil-1", cuentaId: "cuenta-A" },
  personalidad: { calidez: 0.7, energia: 0.5, formalidad: 0.4, curiosidad: 0.6, humor: 0.4, concision: 0.5 },
  cuerpo: { forma: "orbe", tono: 200, escala: 1 },
  sentidosHabilitados: [...SENTIDOS],
  ...o,
});
const grupo = (o: Partial<Bot> = {}) => bot({ id: "bg", dueno: { tipo: "grupo", id: "grupo-1", cuentaId: "cuenta-A" }, ...o });
const externo = (o: Partial<Bot> = {}) => bot({ id: "bx", nombre: "Grok", origen: "externo", ...o });
const cons = (sentido: Sentido, o: Partial<ConsentimientoSentido> = {}): ConsentimientoSentido =>
  ({ botId: "b1", sentido, cuentaId: "cuenta-A", vence: null, ...o });
const pet = (o: Partial<PeticionSentido>): PeticionSentido => ({
  bot: bot(), sentido: "pantalla", cuentaId: "cuenta-A", sesion: "privada", medio: "web",
  consentimientos: [], ahora: AHORA, ...o,
});
const acc = (tipo: AccionBot["tipo"], args: AccionBot["args"] = {}): AccionBot => ({ tipo, args });

describe("decidirSentido", () => {
  it("sin consentimiento pide permiso; con él permite y enciende el indicador", () => {
    expect(decidirSentido(pet({})).requiere).toBe("consentimiento");
    const d = decidirSentido(pet({ consentimientos: [cons("pantalla")] }));
    expect(d.permitido && d.indicador).toBe(true);
  });
  it("un consentimiento caducado no vale", () => {
    expect(decidirSentido(pet({ consentimientos: [cons("pantalla", { vence: AHORA - 1 })] })).permitido).toBe(false);
    expect(consentimientoVigente([cons("pantalla", { vence: AHORA + 1 })], "b1", "pantalla", "cuenta-A", AHORA)).not.toBeNull();
  });
  it("lo no habilitado por el dueño y el bot en pausa se rechazan antes de mirar consentimientos", () => {
    expect(decidirSentido(pet({ bot: bot({ sentidosHabilitados: ["red"] }), consentimientos: [cons("pantalla")] })).requiere).toBe("configuracion");
    expect(decidirSentido(pet({ bot: bot({ activo: false }), consentimientos: [cons("pantalla")] })).permitido).toBe(false);
  });
  it("la terminal solo en la app nativa y nunca para un bot de grupo", () => {
    expect(decidirSentido(pet({ sentido: "terminal", consentimientos: [cons("terminal")] })).requiere).toBe("nunca");
    expect(decidirSentido(pet({ sentido: "terminal", medio: "nativo", consentimientos: [cons("terminal")] })).permitido).toBe(true);
    expect(decidirSentido(pet({ bot: grupo(), sentido: "terminal", medio: "nativo", consentimientos: [cons("terminal", { botId: "bg" })] })).requiere).toBe("nunca");
  });
  it("un invitado nunca recibe cámara ni micrófono, aunque haya consentimiento", () => {
    for (const s of ["camara", "microfono", "archivos", "correo"] as Sentido[]) {
      expect(decidirSentido(pet({ bot: externo(), sentido: s, consentimientos: [cons(s, { botId: "bx" })] })).requiere).toBe("nunca");
    }
  });
  it("a un invitado se le da permiso por una hora como mucho", () => {
    const largo = cons("pantalla", { botId: "bx", vence: null });
    expect(decidirSentido(pet({ bot: externo(), consentimientos: [largo] })).permitido).toBe(false);
    const corto = cons("pantalla", { botId: "bx", vence: AHORA + VIGENCIA_MAX_INVITADO_MS });
    expect(decidirSentido(pet({ bot: externo(), consentimientos: [corto] })).permitido).toBe(true);
  });
  it("en un grupo cada persona consiente por sí misma: el admin no consiente por otro", () => {
    const delAdmin = cons("camara", { botId: "bg", cuentaId: "cuenta-admin" });
    expect(decidirSentido(pet({ bot: grupo(), sentido: "camara", cuentaId: "cuenta-B", consentimientos: [delAdmin] })).permitido).toBe(false);
  });
  it("en sesión pública todo sentido salvo la red pide permiso expreso", () => {
    expect(decidirSentido(pet({ sesion: "publica", consentimientos: [cons("pantalla")] })).requiere).toBe("expreso");
    expect(decidirSentido(pet({ sesion: "publica", consentimientos: [cons("pantalla", { expreso: true })] })).permitido).toBe(true);
    expect(decidirSentido(pet({ sesion: "publica", sentido: "red", consentimientos: [cons("red")] })).permitido).toBe(true);
  });
});

describe("decidirAccion", () => {
  it("por defecto el bot propone y la persona confirma; en «aplicar» actúa solo lo de riesgo bajo/medio", () => {
    expect(decidirAccion({ bot: bot(), accion: acc("navegar"), rol: "dueno", nivel: "proponer" }).requiere).toBe("confirmacion");
    expect(decidirAccion({ bot: bot(), accion: acc("navegar"), rol: "dueno", nivel: "aplicar" }).permitido).toBe(true);
    expect(decidirAccion({ bot: bot(), accion: acc("mensaje.enviar"), rol: "dueno", nivel: "aplicar" }).requiere).toBe("confirmacion");
  });
  it("nivel «nada» solo conversa", () => {
    expect(decidirAccion({ bot: bot(), accion: acc("navegar"), rol: "dueno", nivel: "nada" }).permitido).toBe(false);
  });
  it("un invitado no ejecuta en una computadora ni envía mensajes; propone lo demás", () => {
    expect(decidirAccion({ bot: externo(), accion: acc("computadora.ejecutar"), rol: "dueno", nivel: "aplicar" }).requiere).toBe("nunca");
    expect(decidirAccion({ bot: externo(), accion: acc("mensaje.enviar"), rol: "dueno", nivel: "aplicar" }).requiere).toBe("nunca");
    expect(decidirAccion({ bot: externo(), accion: acc("navegar"), rol: "dueno", nivel: "aplicar" }).requiere).toBe("confirmacion");
  });
  it("en un grupo democrático lo común se vota, salvo lo que el grupo delegó", () => {
    const g = grupo({ gobierno: "democratico" });
    expect(decidirAccion({ bot: g, accion: acc("widget.mover"), rol: "admin", nivel: "aplicar" }).requiere).toBe("votacion");
    expect(decidirAccion({ bot: g, accion: acc("widget.mover"), rol: "miembro", nivel: "aplicar", delegado: "bajo" }).permitido).toBe(true);
    expect(decidirAccion({ bot: g, accion: acc("widget.quitar"), rol: "miembro", nivel: "aplicar", delegado: "bajo" }).requiere).toBe("votacion");
  });
  it("en un grupo jerárquico lo aprueba quien administra; observadores no cambian lo compartido", () => {
    const g = grupo();
    expect(decidirAccion({ bot: g, accion: acc("dashboard.editar"), rol: "miembro", nivel: "aplicar" }).requiere).toBe("confirmacion");
    expect(decidirAccion({ bot: g, accion: acc("dashboard.editar"), rol: "admin", nivel: "aplicar" }).permitido).toBe(true);
    expect(decidirAccion({ bot: g, accion: acc("dashboard.editar"), rol: "observador", nivel: "aplicar" }).requiere).toBe("nunca");
  });
  it("proponer código es solo un candidato: se permite sin ejecutar nada", () => {
    expect(decidirAccion({ bot: bot(), accion: acc("codigo.proponer"), rol: "dueno", nivel: "aplicar" }).permitido).toBe(true);
  });
});

describe("memoria", () => {
  it("invitados y bots de grupo nunca leen memoria personal", () => {
    expect(memoriaVisible(externo())).toEqual(["publica"]);
    expect(memoriaVisible(grupo())).toEqual(["grupo", "publica"]);
    expect(puedeLeerMemoria(grupo(), "personal", "cuenta-A")).toBe(false);
    expect(puedeLeerMemoria(externo(), "perfil", "cuenta-A")).toBe(false);
  });
  it("un bot personal lee lo personal solo de SU cuenta", () => {
    expect(puedeLeerMemoria(bot(), "personal", "cuenta-A")).toBe(true);
    expect(puedeLeerMemoria(bot(), "personal", "cuenta-B")).toBe(false);
  });
  it("escritura: el bot de grupo escribe en su grupo, el invitado solo en lo público", () => {
    expect(actorDeBot(grupo())).toEqual({ tipo: "agente-grupo", grupoId: "grupo-1" });
    expect(puedeEscribirMemoria(grupo(), "grupo")).toBe(true);
    expect(puedeEscribirMemoria(grupo(), "personal")).toBe(false);
    expect(puedeEscribirMemoria(externo(), "perfil")).toBe(false);
  });
});

describe("decidirConfiguracion", () => {
  it("un bot personal solo lo configura su dueño", () => {
    expect(decidirConfiguracion(bot(), "dueno", "personalidad").permitido).toBe(true);
    expect(decidirConfiguracion(bot(), "admin", "personalidad").permitido).toBe(false);
  });
  it("democrático: se vota; cualquier miembro puede pedir la pausa (salida siempre)", () => {
    const g = grupo({ gobierno: "democratico" });
    expect(decidirConfiguracion(g, "dueno", "sentidos").requiere).toBe("votacion");
    expect(decidirConfiguracion(g, "miembro", "pausar").requiere).toBe("confirmacion");
    expect(decidirConfiguracion(g, "admin", "pausar").permitido).toBe(true);
  });
  it("jerárquico: administra el admin; borrar exige confirmación", () => {
    expect(decidirConfiguracion(grupo(), "admin", "modelo").permitido).toBe(true);
    expect(decidirConfiguracion(grupo(), "admin", "borrar").requiere).toBe("confirmacion");
    expect(decidirConfiguracion(grupo(), "observador", "modelo").requiere).toBe("nunca");
  });
});
