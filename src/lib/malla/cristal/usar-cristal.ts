// Malla cristalina SiO₂ amorfa: hook para usar el motor
import { useSyncExternalStore, useEffect } from 'react';
import { crearMotorCristal } from './motor';
import type { NeuronaReticula, SenalMedida, Tesela, Reticula, Cristal, EstadoVitreo } from './tipos';

// Type for the motor returned by crearMotorCristal
type Motor = ReturnType<typeof crearMotorCristal>;
// Type for the estado returned by motor.estado()
type EstadoMotor = ReturnType<Motor['estado']>;

export function useCristal(motor: Motor) {
  const estado = useSyncExternalStore(
    motor.suscribir,
    () => motor.estado(),
    () => motor.estado() // initial state (same as selector for simplicity)
  );

  // Optional: reset the motor when the motor reference changes? Not needed if motor is stable.
  return estado;
}