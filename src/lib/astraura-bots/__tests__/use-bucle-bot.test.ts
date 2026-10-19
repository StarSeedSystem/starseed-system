import { describe, it, expect, beforeEach } from "vitest";
import { ControlBucle } from "../adaptadores/use-bucle-bot";
import { bucleInicial, avanzar } from "../bucle";
import { validarAccion, decidirAccion, TIPOS_ACCION } from "../acciones";
import { decidirSentido } from "../permisos";
import { NIVEL_POR_DEFECTO } from "../permisos";
import type { Bot } from "../tipos";
import type { AccionBot } from "../acciones";
import type { Sentido } from "../tipos";
import type { Decision } from "../acciones";
import type { NivelBot } from "../acciones";
import type { RolBot } from "../tipos";
import type { EstadoBucle } from "../bucle";

// Mock bot
const mockBot: Bot = {
  id: "bot1",
  nombre: "Test Bot",
  dueno: { tipo: "perfil", id: "perfil1", cuentaId: "cuenta1" },
  origen: "astraura",
  gobierno: "jerarquico",
  personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
  cuerpo: { forma: "orbe", tono: 0, escala: 1 },
  sentidosHabilitados: ["pantalla"],
  activo: true,
};

// Mock dependencies
const mockDep = {
  validarAccion: (bruto: unknown) => {
    // For simplicity, we'll assume a valid action if it's an object with tipo and args and the tipo is valid
    if (typeof bruto === "object" && bruto !== null && "tipo" in bruto && "args" in bruto) {
      const tipo = bruto.tipo as string;
      if (TIPOS_ACCION.includes(tipo as TipoAccion)) {
        return { accion: bruto as AccionBot, problemas: [] };
      }
    }
    return { accion: null, problemas: ["Invalid action"] };
  },
  decidirAccion: (p: { bot: Bot; accion: AccionBot; rol: RolBot; nivel: NivelBot }) => {
    // Always permit the action for testing
    return { permitido: true, requiere: "nada", motivo: "Permitted for test", indicador: false };
  },
  decidirSentido: (p: { bot: Bot; sentido: Sentido; cuentaId: string; sesion: string; medio: string; consentimientos: any[]; ahora: number }) => {
    // Always permit the sense for testing
    return { permitido: true, requiere: "nada", motivo: "Permitted for test", indicador: true };
  },
  ahora: () => 1000,
};

describe("ControlBucle", () => {
  let control: ControlBucle;

  beforeEach(() => {
    control = new ControlBucle(mockBot, mockDep);
  });

  it("initial state is reposo", () => {
    expect(control.estado.fase).toBe("reposo");
  });

  it("proponiendo una acción válida lleva a estado actuando", () => {
    const accion: AccionBot = { tipo: "navegar", args: { ruta: "/home" } };
    control.propos(accion, NIVEL_POR_DEFECTO, "dueno");
    expect(control.estado.fase).toBe("actuando");
    expect(control.estado.pendiente).toBeDefined();
  });

  it("proponiendo una acción inválida lleva a estado rechazado", () => {
    const accionInvalida = { tipo: "accion-invalida", args: {} };
    control.propos(accionInvalida, NIVEL_POR_DEFECTO, "dueno");
    expect(control.estado.fase).toBe("rechazado");
  });

  it("confirmar una propuesta esperando pasa a actuando", () => {
    // First, propose an action that requires confirmation (we need to mock decidirAccion to require confirmation)
    // We'll override the decidirAccion mock for this test
    const originalDecidirAccion = mockDep.decidirAccion;
    mockDep.decidirAccion = () => ({ permitido: false, requiere: "confirmacion", motivo: "Requires confirmation", indicador: false });
    try {
      // Create a new control with the updated mock
      const controlLocal = new ControlBucle(mockBot, mockDep);
      const accion: AccionBot = { tipo: "navegar", args: { ruta: "/home" } };
      controlLocal.propos(accion, NIVEL_POR_DEFECTO, "dueno");
      expect(controlLocal.estado.fase).toBe("esperando");
      controlLocal.confirmar("user1");
      expect(controlLocal.estado.fase).toBe("actuando");
    } finally {
      mockDep.decidirAccion = originalDecidirAccion;
    }
  });

  it("rechazar una propuesta esperando pasa a rechazado", () => {
    const originalDecidirAccion = mockDep.decidirAccion;
    mockDep.decidirAccion = () => ({ permitido: false, requiere: "confirmacion", motivo: "Requires confirmation", indicador: false });
    try {
      // Create a new control with the updated mock
      const controlLocal = new ControlBucle(mockBot, mockDep);
      const accion: AccionBot = { tipo: "navegar", args: { ruta: "/home" } };
      controlLocal.propos(accion, NIVEL_POR_DEFECTO, "dueno");
      expect(controlLocal.estado.fase).toBe("esperando");
      controlLocal.rechazar("user1");
      expect(controlLocal.estado.fase).toBe("rechazado");
      expect(controlLocal.estado.pendiente).toBeUndefined();
    } finally {
      mockDep.decidirAccion = originalDecidirAccion;
    }
  });

  it("deshacer después de aplicar una acción vuelve a estado hecho o reposo", () => {
    // We need to simulate an applied action. We'll propose, confirm, and then apply by sending an aplicada event.
    // We'll create a new control for this test.
    const controlLocal = new ControlBucle(mockBot, mockDep);
    const accion: AccionBot = { tipo: "navegar", args: { ruta: "/home" } };
    controlLocal.propos(accion, NIVEL_POR_DEFECTO, "dueno");
    controlLocal.confirmar("user1");
    // Now simulate the aplicada event by advancing the state
    const evento: any = { tipo: "aplicada", previo: {}, at: 2000 };
    const estadoAfterAplicada = avanzar(controlLocal.estado, evento);
    controlLocal.setEstadoForTesting(estadoAfterAplicada);
    expect(controlLocal.estado.fase).toBe("hecho");
    expect(controlLocal.estado.ultimaAplicada).toBeDefined();
    // Now deshacer
    controlLocal.deshacer("user1");
    expect(controlLocal.estado.fase).toBe("reposo"); // according to bucle, deshacer goes to reposoO which is reposo if no sentidos
    expect(controlLocal.estado.ultimaAplicada).toBeUndefined();
  });

  it("encender sentido activa el sentido y lo agrega a sentidosActivos", () => {
    const sentido: Sentido = "pantalla";
    control.encenderSentido(sentido);
    expect(control.estado.sentidosActivos).toContain(sentido);
    expect(control.estado.fase).toBe("observando"); // since we started from reposo
  });

  it("apagar sentido desactiva el sentido y lo quita de sentidosActivos", () => {
    const sentido: Sentido = "pantalla";
    control.encenderSentido(sentido);
    expect(control.estado.sentidosActivos).toContain(sentido);
    control.apagarSentido(sentido);
    expect(control.estado.sentidosActivos).not.toContain(sentido);
    expect(control.estado.fase).toBe("reposo");
  });

  it("pausar apaga todos los sentidos y pone el estado en reposo", () => {
    const sentido1: Sentido = "pantalla";
    const sentido2: Sentido = "red";
    control.encenderSentido(sentido1);
    control.encenderSentido(sentido2);
    expect(control.estado.sentidosActivos).toContain(sentido1);
    control.encenderSentido(sentido2);
    expect(control.estado.sentidosActivos).toContain(sentido2);
    control.pausar("user1");
    expect(control.estado.sentidosActivos).toHaveLength(0);
    expect(control.estado.fase).toBe("reposo");
  });

  it("el registro se mantiene y se recorta a MAX_REGISTRO", () => {
    // We'll add more than MAX_REGISTRO events and check that the registro is trimmed
    const MAX_REGISTRO = 500; // from bucle.ts
    for (let i = 0; i < MAX_REGISTRO + 10; i++) {
      const sentido: Sentido = "pantalla";
      control.encenderSentido(sentido);
      control.apagarSentido(sentido);
    }
    expect(control.estado.registro.length).toBe(MAX_REGISTRO);
  });

  it("sin sesión, el puente de sentidos no lanza (simulado)", () => {
    // We'll test that the control doesn't throw when calling encenderSentido without a proper session
    // In our mock, we don't use the session in decidirSentido, so it won't throw.
    // We'll just ensure no error.
    expect(() => {
      control.encenderSentido("pantalla");
    }).not.toThrow();
  });
});