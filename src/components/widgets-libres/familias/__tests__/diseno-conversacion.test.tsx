import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DisenoConversacion } from '../src/components/widgets-libres/familias/diseno-conversacion';

describe('DisenoConversacion', () => {
  it('muestra mensaje cuando el hilo está vacío', () => {
    const { getByText } = render(
      <DisenoConversacion 
        hilo={[]} 
        preguntar={() => {}} 
        estado="En calma" 
      />
    );
    expect(getByText(/Aún no habéis hablado/i)).toBeDefined();
  });

  it('muestra hasta 3 turnos del hilo', () => {
    const hilo = [
      { emisor: 'usuario', texto: 'Hola', ts: Date.now() },
      { emisor: 'astraura', texto: '¿Cómo estás?', ts: Date.now() }
    ];
    const { getByText } = render(
      <DisenoConversacion 
        hilo={hilo} 
        preguntar={() => {}} 
        estado="Escuchando" 
      />
    );
    expect(getByText('Hola')).toBeDefined();
    expect(getByText('¿Cómo estás?')).toBeDefined();
    expect(getByText('Tú')).toBeDefined();
    expect(getByText('Astraura')).toBeDefined();
  });
});
