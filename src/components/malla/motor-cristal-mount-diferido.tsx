'use client';
// Carga diferida del motor de la retícula en el layout raíz: su JS no entra en el
// primer pintado, igual que los demás motores pesados de la malla.
import dynamic from 'next/dynamic';

export const MotorCristalMountDiferido = dynamic(
  () => import('./motor-cristal-mount').then((m) => m.MotorCristalMount),
  { ssr: false },
);
