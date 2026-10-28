// Malla cristalina SiO₂ amorfa: pruebas del montaje del motor
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MotorCristalMount, useMotorCristal } from '@/components/malla/motor-cristal-mount';

describe('MotorCristalMount', () => {
  it('montaje no rompe sin WebRTC ni identidad (degrada a vacío)', () => {
    const { container } = render(<MotorCristalMount />);
    expect(container).toBeDefined();
  });

  it('useMotorCristal devuelve motor y estado', () => {
    let result: any;
    function Test() {
      result = useMotorCristal();
      return null;
    }
    render(<Test />);
    expect(result).toBeDefined();
    expect(result.motor).toBeDefined();
    expect(result.estado).toBeDefined();
  });
});
