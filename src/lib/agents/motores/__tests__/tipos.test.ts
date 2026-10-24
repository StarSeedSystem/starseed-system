import { describe, it, expect } from 'vitest';
import { elegirMotor, listarMotores, obtenerInfoMotor } from '../tipos';

describe('Motores de agentes', () => {
  it('nativo por defecto', () => {
    expect(elegirMotor({}, {})).toBe('nativo');
    expect(elegirMotor()).toBe('nativo');
  });

  it('LangGraph si hay ejecución larga con reanudación', () => {
    expect(elegirMotor({}, { reanudacion: true })).toBe('langgraph');
    expect(elegirMotor({}, { largoPlazo: true })).toBe('langgraph');
    expect(elegirMotor({ necesitaReanudacion: true })).toBe('langgraph');
  });

  it('Pydantic AI si la salida debe validar un esquema', () => {
    expect(elegirMotor({}, { salidaTipada: true })).toBe('pydantic-ai');
    expect(elegirMotor({}, { esquema: true })).toBe('pydantic-ai');
    expect(elegirMotor({ necesitaSalidaTipada: true })).toBe('pydantic-ai');
    expect(elegirMotor({ esquemaSalida: true })).toBe('pydantic-ai');
  });

  it('OpenAI Agents si hay traspasos entre roles', () => {
    expect(elegirMotor({}, { traspasos: true })).toBe('openai-agents');
    expect(elegirMotor({ necesitaTraspasos: true })).toBe('openai-agents');
  });

  it('Agno si es un equipo con memoria compartida', () => {
    expect(elegirMotor({}, { equipo: true })).toBe('agno');
    expect(elegirMotor({ necesitaEquipo: true })).toBe('agno');
  });

  it('Mastra si corre en la neurona en TS y es equipo', () => {
    expect(elegirMotor({}, { equipo: true, traspasos: false })).toBe('agno');
  });

  it('listarMotores incluye todos los motores', () => {
    const motores = listarMotores();
    const ids = motores.map((m) => m.id);
    expect(ids).toContain('nativo');
    expect(ids).toContain('mastra');
    expect(ids).toContain('langgraph');
    expect(ids).toContain('pydantic-ai');
    expect(ids).toContain('openai-agents');
    expect(ids).toContain('agno');
  });

  it('obtenerInfoMotor devuelve info completa', () => {
    const info = obtenerInfoMotor('langgraph');
    expect(info.id).toBe('langgraph');
    expect(info.lenguaje).toBe('ts');
    expect(info.dondeCorre).toContain('neurona-node');
    expect(info.aporta).toContain('flujos-con-estado');
  });
});
