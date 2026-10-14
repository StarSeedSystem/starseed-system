import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MedioComputadora,
  PermisosComputadora,
  PERMISOS_COMPUTADORA_DEFECTO,
  elegirComputadora,
  permisoParaOrden,
} from "../computadora";
import { estadoComputadora, encender, apagar, ejecutar } from "../adaptadores/computadora-cliente";
import type { Bot } from "../tipos";

// Mock fetch for client tests
vi.mock("../../../utils/supabase/client", () => ({
  createClient: vi.fn(),
}));
// We'll mock fetch globally using vi.spyOn or by replacing global.fetch

describe("computadora.ts (puro)", () => {
  describe("PERMISOS_COMPUTADORA_DEFECTO", () => {
    it("defecto apagado", () => {
      expect(PERMISOS_COMPUTADORA_DEFECTO.navegador).toBe(false);
      expect(PERMISOS_COMPUTADORA_DEFECTO.archivos).toBe(false);
      expect(PERMISOS_COMPUTADORA_DEFECTO.terminal).toBe(false);
      expect(PERMISOS_COMPUTADORA_DEFECTO.red).toBe("lista");
    });
  });

  describe("elegirComputadora", () => {
    const botNoInvitado: Bot = {
      id: "bot1",
      nombre: "Bot 1",
      dueno: { tipo: "perfil", id: "perfil1", cuentaId: "cuenta1" },
      origen: "astraura",
      gobierno: "jerarquico",
      personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
      cuerpo: { forma: "orbe", tono: 0, escala: 1 },
      sentidosHabilitados: [],
      activo: true,
    };

    const botInvitado: Bot = {
      ...botNoInvitado,
      origen: "ag-ui", // invitado
    };

    it("invitado nunca tiene computadora", () => {
      const resultado = elegirComputadora(botInvitado, [], { interactivo: false });
      expect(resultado).toEqual({ motivo: "Un invitado nunca tiene computadora." });
    });

    it("orden de medios: a1 primero", () => {
      const disponibles = [
        { medio: "neurona", libre: true, interactivo: true },
        { medio: "a1", libre: true, interactivo: true },
      ];
      const resultado = elegirComputadora(botNoInvitado, disponibles, { interactivo: false });
      expect(resultado).toEqual({ medio: "a1" });
    });

    it("orden de medios: neurona segundo", () => {
      const disponibles = [
        { medio: "actions", libre: true, interactivo: false },
        { medio: "neurona", libre: true, interactivo: true },
      ];
      const resultado = elegirComputadora(botNoInvitado, disponibles, { interactivo: false });
      expect(resultado).toEqual({ medio: "neurona" });
    });

    it("orden de medios: actions tercero", () => {
      const disponibles = [
        { medio: "actions", libre: true, interactivo: false },
      ];
      const resultado = elegirComputadora(botNoInvitado, disponibles, { interactivo: false });
      expect(resultado).toEqual({ medio: "actions" });
    });

    it("actions nunca para trabajo interactivo", () => {
      const disponibles = [
        { medio: "actions", libre: true, interactivo: true },
        { medio: "neurona", libre: true, interactivo: true },
      ];
      const resultado = elegirComputadora(botNoInvitado, disponibles, { interactivo: true });
      expect(resultado).toEqual({ medio: "neurona" });
    });

    it("no hay medio disponible", () => {
      const disponibles = [
        { medio: "a1", libre: false, interactivo: true },
        { medio: "neurona", libre: false, interactivo: true },
        { medio: "actions", libre: true, interactivo: false }, // but necesita.interactivo=true, so not valid
      ];
      const resultado = elegirComputadora(botNoInvitado, disponibles, { interactivo: true });
      expect(resultado).toEqual({ motivo: "No hay medio de computadora disponible que satisfaga las condiciones." });
    });
  });

  describe("permisoParaOrden", () => {
    const permisosBase: PermisosComputadora = {
      navegador: true,
      archivos: true,
      terminal: true,
      red: "lista",
    };

    it.each([
      ["docker run hello-world", "Orden prohibida por motivos de seguridad."],
      ["sudo ls", "Orden prohibida por motivos de seguridad."],
      ["ssh user@host", "Orden prohibida por motivos de seguridad."],
      ["cat /proc/version", "Orden prohibida por motivos de seguridad."],
      ["cat .env", "Orden prohibida por motivos de seguridad."],
    ])("órdenes prohibidas: %s", (orden, mensajeEsperado) => {
      const resultado = permisoParaOrden(permisosBase, orden);
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toBe(mensajeEsperado);
    });

    it("requiere permiso de terminal para órdenes no vacías", () => {
      const permisos = { ...permisosBase, terminal: false };
      const resultado = permisoParaOrden(permisos, "ls");
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toBe("Se requiere permiso de terminal para ejecutar órdenes.");
    });

    it("permite orden vacía sin terminal", () => {
      const permisos = { ...permisosBase, terminal: false };
      const resultado = permisoParaOrden(permisos, "");
      expect(resultado.ok).toBe(true);
    });

    it.each([
      ["curl https://example.com", "Se requiere permiso de red para esta orden."],
      ["wget https://example.com", "Se requiere permiso de red para esta orden."],
      ["git clone https://github.com/user/repo.git", "Se requiere permiso de red para esta orden."],
    ])("red nada bloquea comandos de red: %s", (orden, mensajeEsperado) => {
      const permisos = { ...permisosBase, red: "nada" };
      const resultado = permisoParaOrden(permisos, orden);
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toBe(mensajeEsperado);
    });

    it("permite comandos de red cuando red no es nada", () => {
      const permisos = { ...permisosBase, red: "lista" };
      const resultado = permisoParaOrden(permisos, "curl https://example.com");
      expect(resultado.ok).toBe(true);
    });

    it("permite orden interna de terminal", () => {
      const resultado = permisoParaOrden(permisosBase, "echo hola");
      expect(resultado.ok).toBe(true);
    });
  });
});

describe("computadora-cliente.ts (cliente)", () => {
  const botId = "bot-test";

  beforeEach(() => {
    // Reset mocks
    vi.restoreAllMocks();
  });

  it("cliente honesto ante 404 en ejecutar", async () => {
    const fetchMock = vi.spyOn(global, "fetch");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    } as Response);

    const resultado = await ejecutar(botId, "ls");
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe(
      "próximamente: falta la computadora del bot (BOT1011L, visto bueno de Alex)"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/bots/computadora/${botId}/ejecutar`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ orden: "ls" }),
      })
    );
  });

  // We can add more tests for the other client functions if needed, but the task only specifies the 404 for ejecutar.
  // However, to reach 8 tests, we already have more than 8 in the pure module tests.
  // Let's count: we have 1 (defecto) + 5 (elegirComputadora) + 7 (permisoParaOrden) = 13 tests in the pure module.
  // So we are covered.
});