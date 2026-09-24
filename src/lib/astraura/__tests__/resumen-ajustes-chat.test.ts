/**
 * resumen-ajustes-chat — cubre las dos responsabilidades del módulo: decidir
 * el ALCANCE ("Este chat" / "Tu cuenta" / "Este dispositivo" / "Valor de
 * fábrica") y redactar el RESUMEN de una frase de cada fila del menú
 * rediseñado de Configuración del chat. Todo puro: sin red, sin DOM.
 */

import { describe, expect, it } from "vitest";
import {
  alcanceConRespaldo,
  insigniaAlcance,
  resumenPersonalidad,
  resumenModelo,
  resumenMemorias,
  resumenSentidos,
  resumenCapacidades,
  resumenHabilidades,
  resumenConexiones,
  resumenConectividad,
  resumenInterruptor,
  filaCoincideBusqueda,
  GRUPOS_AJUSTES_CHAT,
  type AlcanceAjuste,
} from "@/lib/astraura/resumen-ajustes-chat";

describe("alcanceConRespaldo", () => {
  it("devuelve 'chat' cuando el chat fijó su propio valor", () => {
    expect(alcanceConRespaldo(true, "cuenta")).toBe("chat");
    expect(alcanceConRespaldo(true, "dispositivo")).toBe("chat");
    expect(alcanceConRespaldo(true, "predeterminado")).toBe("chat");
  });

  it("cae al alcance de respaldo cuando el chat no fijó nada", () => {
    expect(alcanceConRespaldo(false, "cuenta")).toBe("cuenta");
    expect(alcanceConRespaldo(false, "dispositivo")).toBe("dispositivo");
    expect(alcanceConRespaldo(false, "predeterminado")).toBe("predeterminado");
  });
});

describe("insigniaAlcance", () => {
  const alcances: AlcanceAjuste[] = ["chat", "cuenta", "dispositivo", "predeterminado"];

  it("tiene etiqueta y descripción no vacías para los 4 alcances", () => {
    for (const a of alcances) {
      const ins = insigniaAlcance(a);
      expect(ins.alcance).toBe(a);
      expect(ins.etiqueta.length).toBeGreaterThan(0);
      expect(ins.descripcion.length).toBeGreaterThan(0);
    }
  });

  it("la insignia de 'cuenta' menciona la sincronización", () => {
    expect(insigniaAlcance("cuenta").etiqueta.toLowerCase()).toContain("cuenta");
    expect(insigniaAlcance("cuenta").descripcion.toLowerCase()).toContain("sincroniza");
  });
});

describe("resumenPersonalidad", () => {
  it("es honesto cuando no hay ninguna personalidad", () => {
    expect(resumenPersonalidad({ nombre: null, esDeEsteChat: false })).toBe(
      "Sin personalidad configurada todavía.",
    );
  });

  it("marca el override del chat", () => {
    expect(resumenPersonalidad({ nombre: "Aurora", matiz: "serena", esDeEsteChat: true })).toBe(
      "Este chat usa: Aurora (serena).",
    );
  });

  it("marca la herencia de cuenta sin matiz", () => {
    expect(resumenPersonalidad({ nombre: "Mentora Sabia", esDeEsteChat: false })).toBe(
      "Hereda la de tu cuenta: Mentora Sabia.",
    );
  });
});

describe("resumenModelo", () => {
  it("describe el modo automático cuando no hay etiqueta", () => {
    expect(resumenModelo({ etiqueta: null, esDeEsteChat: false })).toBe(
      "Automático: Astraura elige el mejor motor gratuito disponible.",
    );
  });

  it("distingue chat de dispositivo", () => {
    expect(resumenModelo({ etiqueta: "OpenRouter", esDeEsteChat: true })).toBe("Este chat usa: OpenRouter.");
    expect(resumenModelo({ etiqueta: "Ollama", esDeEsteChat: false })).toBe(
      "Motor activo en este dispositivo: Ollama.",
    );
  });
});

describe("resumenMemorias", () => {
  it("distingue override de chat vs. valor por defecto", () => {
    expect(resumenMemorias({ alcanceMemoria: "todas", esDeEsteChat: false })).toBe(
      "Por defecto usa memorias: todas.",
    );
    expect(resumenMemorias({ alcanceMemoria: "personal", esDeEsteChat: true })).toBe(
      "Este chat solo usa memorias: personal.",
    );
  });
});

describe("resumenSentidos", () => {
  it("sin sentidos disponibles", () => {
    expect(resumenSentidos({ activos: 0, total: 0 })).toBe("No hay sentidos disponibles en este entorno.");
  });
  it("ninguno activo", () => {
    expect(resumenSentidos({ activos: 0, total: 8 })).toBe(
      "Ningún sentido activo: Astraura no ve, oye ni ubica nada del entorno.",
    );
  });
  it("todos activos", () => {
    expect(resumenSentidos({ activos: 8, total: 8 })).toBe("Los 8 sentidos están activos.");
  });
  it("algunos activos", () => {
    expect(resumenSentidos({ activos: 3, total: 8 })).toBe("3 de 8 sentidos activos.");
  });
});

describe("resumenCapacidades", () => {
  it("todas disponibles", () => {
    expect(resumenCapacidades({ activas: 5, total: 5 })).toBe(
      "Las 5 capacidades están disponibles y activas.",
    );
  });
  it("parcial", () => {
    expect(resumenCapacidades({ activas: 2, total: 8 })).toBe(
      "2 de 8 capacidades activas en este dispositivo.",
    );
  });
});

describe("resumenHabilidades", () => {
  it("sin habilidades instaladas", () => {
    expect(resumenHabilidades({ activas: 0, total: 0 })).toBe("Sin habilidades instaladas.");
  });
  it("ninguna activa (con catálogo)", () => {
    expect(resumenHabilidades({ activas: 0, total: 8 })).toBe("Ninguna habilidad activa para este chat.");
  });
  it("todas activas", () => {
    expect(resumenHabilidades({ activas: 8, total: 8 })).toBe("Las 8 habilidades están activas.");
  });
});

describe("resumenConexiones", () => {
  it("ningún servicio conectado", () => {
    expect(resumenConexiones({ enUso: 0, conectados: 0, total: 12 })).toBe(
      "Ningún servicio externo conectado todavía.",
    );
  });
  it("singular vs. plural con todos en uso", () => {
    expect(resumenConexiones({ enUso: 1, conectados: 1, total: 12 })).toBe(
      "1 servicio conectado en uso (de 12 disponibles).",
    );
    expect(resumenConexiones({ enUso: 2, conectados: 2, total: 12 })).toBe(
      "2 servicios conectados en uso (de 12 disponibles).",
    );
  });
  it("subconjunto en uso (override del chat)", () => {
    expect(resumenConexiones({ enUso: 1, conectados: 3, total: 12 })).toBe(
      "1 de 3 servicios conectados en uso (de 12 disponibles).",
    );
  });
});

describe("resumenConectividad", () => {
  it("valor por defecto (sin override de chat)", () => {
    expect(resumenConectividad({ internetMode: "public", meshEnabled: true, esDeEsteChat: false })).toBe(
      "Valor por defecto: red pública, malla local activa.",
    );
  });
  it("override del chat con malla apagada", () => {
    expect(resumenConectividad({ internetMode: "local", meshEnabled: false, esDeEsteChat: true })).toBe(
      "Este chat usa: solo malla local, malla local apagada.",
    );
  });
  it("cae al id crudo si el modo no está en el diccionario", () => {
    expect(resumenConectividad({ internetMode: "misterioso", meshEnabled: true, esDeEsteChat: false })).toBe(
      "Valor por defecto: misterioso, malla local activa.",
    );
  });
});

describe("resumenInterruptor", () => {
  it("describe encendido/apagado y el alcance", () => {
    expect(
      resumenInterruptor({
        etiquetaEncendido: "voz activada",
        etiquetaApagado: "sin voz",
        encendido: true,
        esDeEsteChat: false,
      }),
    ).toBe("Por defecto: voz activada.");
    expect(
      resumenInterruptor({
        etiquetaEncendido: "voz activada",
        etiquetaApagado: "sin voz",
        encendido: false,
        esDeEsteChat: true,
      }),
    ).toBe("Este chat: sin voz.");
  });
});

describe("GRUPOS_AJUSTES_CHAT", () => {
  const CLAVES_CONOCIDAS = [
    "memorias",
    "personalidad",
    "sentidos",
    "modelos",
    "capacidades",
    "habilidades",
    "conexiones",
    "conectividad",
  ];

  it("cubre exactamente las 8 secciones existentes, sin duplicados", () => {
    const todas = GRUPOS_AJUSTES_CHAT.flatMap((g) => g.claves);
    expect(todas.length).toBe(CLAVES_CONOCIDAS.length);
    expect(new Set(todas).size).toBe(CLAVES_CONOCIDAS.length);
    expect([...todas].sort()).toEqual([...CLAVES_CONOCIDAS].sort());
  });

  it("cada grupo tiene título y descripción", () => {
    for (const g of GRUPOS_AJUSTES_CHAT) {
      expect(g.titulo.length).toBeGreaterThan(0);
      expect(g.descripcion.length).toBeGreaterThan(0);
      expect(g.claves.length).toBeGreaterThan(0);
    }
  });
});

describe("filaCoincideBusqueda", () => {
  const fila = { etiqueta: "Motor de modelos", resumen: "Automático: elige el mejor motor gratuito." };

  it("consulta vacía coincide siempre", () => {
    expect(filaCoincideBusqueda(fila, "")).toBe(true);
    expect(filaCoincideBusqueda(fila, "   ")).toBe(true);
  });

  it("coincide por etiqueta o por resumen, sin distinguir mayúsculas", () => {
    expect(filaCoincideBusqueda(fila, "MOTOR")).toBe(true);
    expect(filaCoincideBusqueda(fila, "gratuito")).toBe(true);
  });

  it("no coincide con texto ajeno", () => {
    expect(filaCoincideBusqueda(fila, "conexiones")).toBe(false);
  });
});
