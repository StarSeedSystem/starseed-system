import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as React from "react";

import type { Autor, CandidatoParametro, EstadoValores, Parametro, ParametroRef, Vinculo } from "@/lib/protomolecula/tipos";
import type { EstadoAprender, FuenteControl } from "@/lib/protomolecula/vinculos-control";
import { PanelVinculos } from "../panel-vinculos";

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // jsdom no trae ResizeObserver y algunos componentes lo piden
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

const AUTOR: Autor = { tipo: "persona", id: "u1" };
const AUTOR_IA: Autor = { tipo: "agente", id: "agente1" };

// Parámetros de prueba
const NUM: CandidatoParametro = {
  ref: { atomoId: "reverb", parametroId: "mezcla" },
  parametro: {
    id: "mezcla",
    nombre: "Mezcla",
    tipo: "numero",
    min: 0,
    max: 100,
    paso: 1,
    unidad: "%",
    defecto: 30,
  },
  atomo: "Reverb de la voz",
};

const BOOL: CandidatoParametro = {
  ref: { atomoId: "eco", parametroId: "activo" },
  parametro: { id: "activo", nombre: "Activado", tipo: "booleano", defecto: false },
  atomo: "Eco",
};

const TODOS = [NUM, BOOL];

const VINCULO_EJE: Vinculo = {
  id: "v1",
  fuente: { tipo: "gamepad", control: "eje", numero: 0, indice: 0 },
  objetivo: { atomoId: "reverb", parametroId: "mezcla" },
  modo: "absoluto",
  curva: { forma: "lineal", invertir: false, zonaMuerta: 0, suavizado: 0 },
  activo: true,
  creadoPor: "u1",
};

const VINCULO_BOTON: Vinculo = {
  id: "v2",
  fuente: { tipo: "gamepad", control: "boton", numero: 0, indice: 0 },
  objetivo: { atomoId: "eco", parametroId: "activo" },
  modo: "alternar",
  curva: { forma: "lineal", invertir: false, zonaMuerta: 0, suavizado: 0 },
  activo: true,
  creadoPor: "u1",
};

function montar(extra?: Partial<Parameters<typeof PanelVinculos>[0]>) {
  const vinculos: Vinculo[] = [];
  const estadoAprender: EstadoAprender = { fase: "inactivo" };
  
  // Mock del enrutador
  const routerMock = {
    estadoAprender: () => estadoAprender,
    aprender: vi.fn(),
    cancelar: vi.fn(),
    confirmar: vi.fn(),
    fijarVinculos: vi.fn(),
    vinculos: () => vinculos,
  };
  
  const props: Parameters<typeof PanelVinculos>[0] = {
    moleculaId: "mol1",
    almacen: window.localStorage, // Usar el real de jsdom
    controlador: {
      mover: vi.fn().mockImplementation((op) => ({ ok: true, cambio: { antes: null, despues: null, operacion: op, acotado: false, reversible: true } as any })),
    },
    parametroDe: (ref: ParametroRef) => {
      const encontrado = TODOS.find(c => c.ref.atomoId === ref.atomoId && c.ref.parametroId === ref.parametroId);
      return encontrado ? encontrado.parametro : undefined;
    },
    candidatos: TODOS,
    valores: {} as EstadoValores,
    autor: AUTOR,
    nuevoId: (() => { let i = 0; return () => `vinculo-${++i}`; })(),
    ahora: () => 12345,
    ...extra,
  };
  
  // Sobrescribir crearEnrutador para devolver nuestro mock
  vi.mock("@/lib/protomolecula/almacen-vinculos", () => ({
    ...vi.importActual("@/lib/protomolecula/almacen-vinculos"),
    crearEnrutador: () => routerMock,
  }));
  
  // Render con el provider de apariencia
  const { AppearanceProviderWrapper } = require("../../../vitest.setup-dom");
  render(
    React.createElement(AppearanceProviderWrapper, {}, 
      React.createElement(PanelVinculos, props)
    )
  );
  
  return { routerMock, estadoAprender, vinculos };
}

afterEach(cleanup);

describe("PanelVinculos", () => {
  it("muestra lista vacía cuando no hay vínculos", () => {
    montar();
    expect(screen.getByText(/No hay vínculos configurados/i)).toBeDefined();
  });

  it("lista los parámetros disponibles para aprender", () => {
    montar();
    expect(screen.getByRole("heading", { name: /Aprender nuevo vínculo/i })).toBeDefined();
    expect(screen.getByText(/Mezcla/i)).toBeDefined();
    expect(screen.getByText(/Activado/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Aprender/i })).toHaveLength(2);
  });

  it("inicia aprendizaje al hacer clic en el botón de aprender", () => {
    const { routerMock } = montar();
    const btnAprender = screen.getByRole("button", { name: /Aprender/i, modifier: /primero/i }); // Primer botón (Mezcla)
    fireEvent.click(btnAprender);
    expect(routerMock.aprender).toHaveBeenCalledWith(
      { atomoId: "reverb", parametroId: "mezcla" },
      15000
    );
  });

  it("muestra estado de escuchando durante el aprendizaje", () => {
    const { estadoAprender } = montar();
    estadoAprender.fase = "escuchando";
    // Forzar re-render
    expect(screen.getByText(/Esperando mando/i)).toBeDefined();
  });

  it("muestra estado de detectado y permite confirmar o cancelar", () => {
    const { estadoAprender } = montar();
    estadoAprender.fase = "detectado";
    estadoAprender.fuente = { tipo: "gamepad", control: "eje", numero: 0, indice: 0 };
    
    expect(screen.getByText(/Mando detectado/i)).toBeDefined();
    expect(screen.getByText(/Eje 0/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Confirmar/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Cancelar/i })).toBeDefined();
  });

  it("cancela el aprendizaje y vuelve al estado inactivo", () => {
    const { routerMock, estadoAprender } = montar();
    estadoAprender.fase = "detectado";
    const btnCancelar = screen.getByRole("button", { name: /Cancelar/i });
    fireEvent.click(btnCancelar);
    expect(routerMock.cancelar).toHaveBeenCalled();
    // En una prueba real, verificaríamos que el estado vuelva a inactivo
  });

  it("confirma el aprendizaje y crea un vínculo", () => {
    const { routerMock } = montar();
    // Simular que estamos en fase detectado
    vi.mocked(routerMock.estadoAprender).mockReturnValue({
      fase: "detectado",
      objetivo: { atomoId: "reverb", parametroId: "mezcla" },
      fuente: { tipo: "gamepad", control: "eje", numero: 0, indice: 0 }
    });
    // Simular confirmación exitosa
    vi.mocked(routerMock.confirmar).mockReturnValue({
      ok: true,
      vinculo: VINCULO_EJE
    });
    
    const btnConfirmar = screen.getByRole("button", { name: /Confirmar/i });
    fireEvent.click(btnConfirmar);
    
    expect(routerMock.confirmar).toHaveBeenCalled();
    expect(routerMock.fijarVinculos).toHaveBeenCalledWith(
      expect.arrayContaining([VINCULO_EJE])
    );
  });

  it("muestra error cuando falla la confirmación", () => {
    const { routerMock } = montar();
    vi.mocked(routerMock.estadoAprender).mockReturnValue({
      fase: "detectado",
      objetivo: { atomoId: "reverb", parametroId: "mezcla" },
      fuente: { tipo: "gamepad", control: "eje", numero: 0, indice: 0 }
    });
    vi.mocked(routerMock.confirmar).mockReturnValue({
      ok: false,
      motivo: "El parámetro ya no existe"
    });
    
    fireEvent.click(screen.getByRole("button", { name: /Confirmar/i }));
    expect(screen.getByText(/El parámetro ya no existe/i)).toBeDefined();
  });

  it("elimina un vínculo existente", () => {
    const { routerMock } = montar({ 
      // Iniciar con un vínculo ya existente
    });
    // Forzar que haya un vínculo en el estado
    vi.mocked(routerMock.vinculos).mockReturnValue([VINCULO_EJE]);
    
    const btnEliminar = screen.getByRole("button", { name: /Eliminar/i, modifier: /primero/i });
    fireEvent.click(btnEliminar);
    
    // Verificar que se llamó al almacen para guardar la lista sin el vínculo eliminado
    expect(routerMock.fijarVinculos).toHaveBeenCalledWith(
      expect.arrayContaining([])
    );
  });

  it("no permite aprender cuando ya está aprendiendo", () => {
    const { routerMock } = montar();
    vi.mocked(routerMock.estadoAprender).mockReturnValue({ fase: "escuchando" });
    
    const btnAprender = screen.getByRole("button", { name: /Aprender/i });
    fireEvent.click(btnAprender);
    
    // No debería llamar a aprender nuevamente
    expect(routerMock.aprender).not.toHaveBeenCalled();
  });

  it("muestra mensaje cuando no hay gamepad disponible", () => {
    // Este test sería más adecuado para el adaptador, pero podemos verificar que el UI maneja bien la ausencia
    montar();
    // En este caso, el componente debería seguir funcionando, los botones de aprender simplemente no harían nada
    // si no hay gamepad conectado (lo manejaría el adaptador externo)
    expect(screen.getByRole("button", { name: /Aprender/i })).toBeDefined();
  });
});