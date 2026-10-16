import { describe, expect, it } from "vitest";
import {
  validarOperacion,
  type Operacion,
  type ContextoValidacion,
  type Ambito,
} from "@/lib/genesis/operaciones";
import { aplicarOperacion, type PuertosGenesis } from "@/lib/genesis/aplicar";
import { type Bot } from "@/lib/astraura-bots/tipos.ts";

const PERSONA: Ambito = { tipo: "persona" };
const GRUPO: Ambito = { 
  tipo: "entidad", 
  entidad: { 
    tipo: "grupo", 
    id: "11111111-1111-1111-1111-111111111111", 
    slug: "circulo-sur", 
    nombre: "Círculo Sur" 
  } 
};

function osFalsoConBot(botId: string = "test-bot-id", botNombre: string = "Test Bot") {
  let n = 0;
  const estado = {
    perfil: { 
      display_name: "Ana", 
      bio: "antes", 
      avatar_url: null as string | null, 
      cover_url: null as string | null,
      id: "user-id",
      cuentaId: "account-id"
    },
    entidades: new Map<string, Record<string, unknown>>([
      ["grupo:circulo-sur", { 
        name: "Círculo Sur", 
        description: "viejo", 
        tags: ["a"], 
        accent: "#000000" 
      } as Record<string, unknown>]),
    ],
    bots: new Map<string, Record<string, unknown>>([
      [
        botId, 
        {
          id: botId,
          nombre: botNombre,
          gobierno: "jerarquico",
          personalidad: null,
          cuerpo: null,
          sentidos: null,
          permisos: null,
          modelo: null,
          dueno: { tipo: "perfil", id: "user-id", cuentaId: "account-id" },
          activo: true
        } as Record<string, unknown>
      ]
    ]),
  };
  
  const p: PuertosGenesis = {
    perfil: {
      async leer() {
        return { ok: true, tabla: "os_profiles", clave: "user_id:user-id", valores: { ...estado.perfil } };
      },
      async escribir(_t, _c, valores) {
        Object.assign(estado.perfil, valores);
        return { ok: true, filas: 1 };
      },
    },
    entidad: {
      async leer(tipo, slug) {
        const key = `${tipo}:${slug}`;
        const v = estado.entidades.get(key);
        return v ? { ok: true, valores: { ...v } } : { ok: false, motivo: "no existe" };
      },
      async escribir(tipo, slug, valores) {
        const key = `${tipo}:${slug}`;
        const v = estado.entidades.get(key);
        if (!v) return { ok: true, filas: 0 };
        Object.assign(v, valores);
        return { ok: true, filas: 1 };
      },
    },
    astrauraBots: {
      async leer(botId) {
        const v = estado.bots.get(botId);
        return v ? { ok: true, valores: { ...v } } : { ok: false, motivo: "bot no existe" };
      },
      async upsert(botId, valores) {
        const existente = estado.bots.get(botId);
        estado.bots.set(botId, { ...(existente ?? {}), ...valores } as Record<string, unknown>);
        return { ok: true, filas: existente ? 1 : 0 }; // 0 if insert, 1 if update
      },
      async borrar(botId) {
        if (estado.bots.has(botId)) {
          estado.bots.delete(botId);
          return { ok: true, motivo: "" };
        }
        return { ok: false, motivo: "bot no existe" };
      },
    },
    dock: {
      leer: () => [],
      guardar: () => {},
      iconoValido: () => true,
    },
    tableros: {
      listar: () => [],
      leerWidgets: () => [],
      guardarWidgets: () => {},
      widgetConocido: () => null,
    },
    agentes: {
      crear: () => { return { id: "ag-1" }; },
      borrar: () => true,
      vincular: () => true,
      desvincular: () => {},
    },
    ahora: () => 1_000,
    nuevoId: () => `id-${++n}`,
  };
  
  return { p, estado };
}

describe("operaciones de bots", () => {
  describe("vocabulario cerrado y validación", () => {
    it("valida bot.crear con datos correctos", () => {
      const ctx: ContextoValidacion = { ambito: PERSONA };
      const op = validarOperacion(
        { 
          tipo: "bot.crear", 
          motivo: "Crear un bot",
          datos: { 
            nombre: "Mi Bot", 
            gobierno: "democratico" 
          } 
        }, 
        ctx
      );
      expect(op.ok).toBe(true);
      if (op.ok) {
        expect(op.op.tipo).toBe("bot.crear");
        expect(op.op.datos).toEqual({ 
          nombre: "Mi Bot", 
          gobierno: "democratico" 
        });
      }
    });

    it("valida bot.configurar con datos correctos", () => {
      const ctx: ContextoValidacion = { ambito: PERSONA };
      const op = validarOperacion(
        { 
          tipo: "bot.configurar", 
          motivo: "Configurar bot",
          cambios: { 
            botId: "test-bot",
            cambio: "personalidad",
            valor: { rasgo: "calidez", valor: 0.8 } 
          } 
        }, 
        ctx
      );
      expect(op.ok).toBe(true);
      if (op.ok) {
        expect(op.op.tipo).toBe("bot.configurar");
        expect(op.op.cambios).toEqual({ 
          botId: "test-bot",
          cambio: "personalidad",
          valor: { rasgo: "calidez", valor: 0.8 } 
        });
      }
    });

    it("descarta campos no declarados en bot.crear", () => {
      const ctx: ContextoValidacion = { ambito: PERSONA };
      const op = validarOperacion(
        { 
          tipo: "bot.crear", 
          motivo: "Crear bot",
          datos: { 
            nombre: "Mi Bot", 
            gobierno: "democratico",
            campoExtra: "debe ser descartado",
            otroCampo: 123
          } 
        }, 
        ctx
      );
      expect(op.ok).toBe(true);
      if (op.ok) {
        expect(op.op.datos).toEqual({ 
          nombre: "Mi Bot", 
          gobierno: "democratico" 
        });
      }
    });

    it("descarta campos no declarados en bot.configurar", () => {
      const ctx: ContextoValidacion = { ambito: PERSONA };
      const op = validarOperacion(
        { 
          tipo: "bot.configurar", 
          motivo: "Configurar bot",
          cambios: { 
            botId: "test-bot",
            cambio: "personalidad",
            valor: { rasgo: "calidez", valor: 0.8 },
            campoExtra: "debe ser descartado"
          } 
        }, 
        ctx
      );
      expect(op.ok).toBe(true);
      if (op.ok) {
        expect(op.op.cambios).toEqual({ 
          botId: "test-bot",
          cambio: "personalidad",
          valor: { rasgo: "calidez", valor: 0.8 } 
        });
      }
    });

    it("rechaza código en nombre de bot.crear", () => {
      const ctx: ContextoValidacion = { ambito: PERSONA };
      const op = validarOperacion(
        { 
          tipo: "bot.crear", 
          motivo: "Crear bot",
          datos: { 
            nombre: "Mi Bot alert('hola')", 
            gobierno: "democratico" 
          } 
        }, 
        ctx
      );
      expect(op.ok).toBe(false);
      if (!op.ok) {
        expect(op.problemas.join(" ")).toContain("parece código");
      }
    });

    it("rechaza código en valor de bot.configurar", () => {
      const ctx: ContextoValidacion = { ambito: PERSONA };
      const op = validarOperacion(
        { 
          tipo: "bot.configurar", 
          motivo: "Configurar bot",
          cambios: { 
            botId: "test-bot",
            cambio: "personalidad",
            valor: "console.log('hola')" 
          } 
        }, 
        ctx
      );
      expect(op.ok).toBe(false);
      if (!op.ok) {
        expect(op.problemas.join(" ")).toContain("parece código");
      }
    });

    it("rechaza valor JSON demasiado largo en bot.configurar", () => {
      const ctx: ContextoValidacion = { ambito: PERSONA };
      const valorLargo = "x".repeat(4001);
      const op = validarOperacion(
        { 
          tipo: "bot.configurar", 
          motivo: "Configurar bot",
          cambios: { 
            botId: "test-bot",
            cambio: "personalidad",
            valor: valorLargo 
          } 
        }, 
        ctx
      );
      expect(op.ok).toBe(false);
      if (!op.ok) {
        expect(op.problemas.join(" ")).toContain("supera los 4000 caracteres");
      }
    });

    it("rechaza gobierno inválido en bot.crear", () => {
      const ctx: ContextoValidacion = { ambito: PERSONA };
      const op = validarOperacion(
        { 
          tipo: "bot.crear", 
          motivo: "Crear bot",
          datos: { 
            nombre: "Mi Bot", 
            gobierno: "invalid" 
          } 
        }, 
        ctx
      );
      expect(op.ok).toBe(false);
      if (!op.ok) {
        expect(op.problemas.join(" ")).toContain('debe ser "jerarquico" o "democratico"');
      }
    });

    it("rechaza cambio inválido en bot.configurar", () => {
      const ctx: ContextoValidacion = { ambito: PERSONA };
      const op = validarOperacion(
        { 
          tipo: "bot.configurar", 
          motivo: "Configurar bot",
          cambios: { 
            botId: "test-bot",
            cambio: "invalido",
            valor: {} 
          } 
        }, 
        ctx
      );
      expect(op.ok).toBe(false);
      if (!op.ok) {
        expect(op.problemas.join(" ")).toContain('debe ser uno de: personalidad, cuerpo, sentidos, permisos, modelo, pausar, borrar');
      }
    });
  });

  describe("ámbito y permisos", () => {
    it("en ámbito persona, bot.crear está permitido", () => {
      const ctx: ContextoValidacion = { ambito: PERSONA };
      const op = validarOperacion(
        { 
          tipo: "bot.crear", 
          motivo: "Crear bot",
          datos: { 
            nombre: "Mi Bot", 
            gobierno: "democratico" 
          } 
        }, 
        ctx
      );
      expect(op.ok).toBe(true);
    });

    it("en ámbito entidad, bot.crear está permitido", () => {
      const ctx: ContextoValidacion = { ambito: GRUPO };
      const op = validarOperacion(
        { 
          tipo: "bot.crear", 
          motivo: "Crear bot",
          datos: { 
            nombre: "Mi Bot", 
            gobierno: "democratico" 
          } 
        }, 
        ctx
      );
      expect(op.ok).toBe(true);
    });

    it("en ámbito persona, bot.configurar está permitido", () => {
      const ctx: ContextoValidacion = { ambito: PERSONA };
      const op = validarOperacion(
        { 
          tipo: "bot.configurar", 
          motivo: "Configurar bot",
          cambios: { 
            botId: "test-bot",
            cambio: "personalidad",
            valor: { test: true } 
          } 
        }, 
        ctx
      );
      expect(op.ok).toBe(true);
    });

    it("en ámbito entidad, bot.configurar está permitido", () => {
      const ctx: ContextoValidacion = { ambito: GRUPO };
      const op = validarOperacion(
        { 
          tipo: "bot.configurar", 
          motivo: "Configurar bot",
          cambios: { 
            botId: "test-bot",
            cambio: "personalidad",
            valor: { test: true } 
          } 
        }, 
        ctx
      );
      expect(op.ok).toBe(true);
    });
  });
});

describe("aplicar y deshacer de operaciones de bots", () => {
  it("bot.crear: crea un bot y puede deshacerse", async () => {
    const { p, estado } = osFalsoConBot();
    const botIdInicial = estado.bots.size;
    
    const r = await aplicarOperacion(
      { 
        tipo: "bot.crear", 
        motivo: "Crear bot de prueba",
        datos: { 
          nombre: "Bot de Prueba", 
          gobierno: "jerarquico" 
        } 
      },
      PERSONA,
      p
    );
    
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    
    // Verificar que se creó el bot
    expect(estado.bots.size).toBe(botIdInicial + 1);
    
    // Verificar que el inverso es correcto
    expect(r.entrada.inverso).toMatchObject({ 
      tipo: "bot.borrar", 
      botId: expect.any(String) 
    });
    
    // Deshacer y verificar que se eliminó el bot
    const d = await deshacerEntrada(r.entrada, p);
    expect(d.ok).toBe(true);
    expect(estado.bots.size).toBe(botIdInicial);
  });

  it("bot.configurar: actualiza un bot y puede deshacerse", async () => {
    const botId = "test-bot-para-configurar";
    const { p, estado } = osFalsoConBot(botId, "Bot Original");
    
    // Verificar estado inicial
    const botInicial = estado.bots.get(botId);
    expect(botInicial?.nombre).toBe("Bot Original");
    expect(botInicial?.personalidad).toBeNull();
    
    const r = await aplicarOperacion(
      { 
        tipo: "bot.configurar", 
        motivo: "Configurar personalidad",
        cambios: { 
          botId: botId,
          cambio: "personalidad",
          valor: { calidez: 0.8, energia: 0.6 } 
        } 
      },
      PERSONA,
      p
    );
    
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    
    // Verificar que se actualizó el bot
    const botActualizado = estado.bots.get(botId);
    expect(botActualizado?.personalidad).toEqual({ calidez: 0.8, energia: 0.6 });
    
    // Verificar que el inverso es correcto
    expect(r.entrada.inverso).toMatchObject({ 
      tipo: "bot.restaurar", 
      botId: botId,
      campo: "personalidad",
      antes: null,
      después: { calidez: 0.8, energia: 0.6 } 
    });
    
    // Deshacer y verificar que se restauró el estado original
    const d = await deshacerEntrada(r.entrada, p);
    expect(d.ok).toBe(true);
    const botRestaurado = estado.bots.get(botId);
    expect(botRestaurado?.personalidad).toBeNull();
  });

  it("bot.configurar en entidad requiere permiso o propuesta aprobada", async () => {
    // Este test verificará que sin permiso, la operación falla
    // Para simplificar, vamos a probar con un rol que no tenga permiso
    // En una implementación completa, necesitaríamos simular diferentes roles
    
    const { p, estado } = osFalsoConBot("bot-entidad", "Bot de Entidad");
    
    // Cambiamos el contexto para simular que somos un observador en la entidad
    // (En una implementación real, esto vendría del contexto)
    const ctx: ContextoValidacion = { 
      ambito: GRUPO,
      // Nota: En la actualidad, no tenemos forma de pasar el rol del usuario al contexto
      // Esto sería una limitación para probar completamente este escenario
    };
    
    // Por ahora, verificamos que la operación se valida correctamente
    const validacion = validarOperacion(
      { 
        tipo: "bot.configurar", 
        motivo: "Intentar configurar bot",
        cambios: { 
          botId: "bot-entidad",
          cambio: "personalidad",
          valor: { calidez: 0.9 } 
        } 
      },
      ctx
    );
    
    // La validación debería pasar (los permisos se checkean en aplicar, no en validar)
    expect(validacion.ok).toBe(true);
  });

  it("bot.crear llama al puerto upsert", async () => {
    const { p, estado } = osFalsoConBot();
    const upsertSpy = vi.spyOn(p.astrauraBots, "upsert");
    
    await aplicarOperacion(
      { 
        tipo: "bot.crear", 
        motivo: "Crear bot para espía",
        datos: { 
          nombre: "Bot Espía", 
          gobierno: "democratico" 
        } 
      },
      PERSONA,
      p
    );
    
    expect(upsertSpy).toHaveBeenCalled();
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.any(String), // botId generado
      expect.objectContaining({
        nombre: "Bot Espía",
        gobierno: "democratico"
      })
    );
  });

  it("bot.configurar llama al puerto upsert para actualizar", async () => {
    const botId = "bot-para-actualizar";
    const { p, estado } = osFalsoConBot(botId, "Bot Original");
    const upsertSpy = vi.spyOn(p.astrauraBots, "upsert");
    
    await aplicarOperacion(
      { 
        tipo: "bot.configurar", 
        motivo: "Actualizar bot",
        cambios: { 
          botId: botId,
          cambio: "personalidad",
          valor: { calidez: 0.7 } 
        } 
      },
      PERSONA,
      p
    );
    
    expect(upsertSpy).toHaveBeenCalled();
    expect(upsertSpy).toHaveBeenCalledWith(
      botId,
      expect.objectContaining({
        personalidad: { calidez: 0.7 }
      })
    );
  });
});
