const GB = 1024 * 1024 * 1024;

export type Ambito = 'privado' | 'grupo' | 'comunidad' | 'publico';

export type EntradaCuota = {
  cuotaMb: number;
  libreMb: number;
  usadoMb?: number;
  reservaMb: number;
  ambito: Ambito;
  consentimiento?: boolean;
};

export function cuotaEfectiva(entrada: EntradaCuota): number {
  const { cuotaMb, libreMb, reservaMb } = entrada;
  const prestaMb = Math.max(0, libreMb - reservaMb);
  return Math.max(0, Math.min(prestaMb, cuotaMb));
}

export function puedeAceptar(entrada: EntradaCuota): boolean {
  return motivoRechazo(entrada) === null;
}

export function motivoRechazo(entrada: EntradaCuota): string | null {
  if (entrada.cuotaMb <= 0) return 'sin-cuota';
  if (entrada.consentimiento === false) return 'ambito-agotado';

  const cuotaMB = entrada.cuotaMb;
  const libreMB = entrada.libreMb;
  const usadoMB = entrada.usadoMb ?? 0;
  const reservaMB = entrada.reservaMb;
  const prestaMB = Math.max(0, libreMB - reservaMB);

  if (usadoMB > cuotaMB) return 'cuota-superada';
  if (prestaMB <= 0) return 'reserva-imposible';

  return null;
}