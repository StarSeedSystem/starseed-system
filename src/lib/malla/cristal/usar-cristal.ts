// Malla cristalina SiO₂ amorfa: hook para usar el motor
import { useState, useEffect } from 'react';
import { crearMotorCristal } from './motor';
import type { NeuronaReticula, SenalMedida, Tesela, Reticula, Cristal, EstadoVitreo } from './tipos';

// Type for the motor returned by crearMotorCristal
type Motor = ReturnType<typeof crearMotorCristal>;
// Type for the estado returned by motor.estado()
type EstadoMotor = ReturnType<Motor['estado']>;

export function useCristal(motor: Motor) {
  const [estado, setEstado] = useState<EstadoMotor | null>(null);

  useEffect(() => {
    // Set initial state
    setEstado(motor.estado());

    const suscripcion = motor.suscribir(() => {
      setEstado(motor.estado());
    });

    return suscripcion;
  }, [motor]);

  // If estado is null, we return the initial state (though the effect should have run)
  return estado ?? motor.estado();
}