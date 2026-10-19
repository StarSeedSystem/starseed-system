export type ReferenciaConector = {
  id: string;
  nombre: string;
  tipo: string;
  url: string;
  requiere: string;
  coste: 'gratis' | 'pago' | 'creditos';
  limites: string;
  avisos: string;
};

export const referenciasConectores: ReferenciaConector[] = [];

export function estadoConector(id: string, conectados: string[]): boolean {
  return conectados.includes(id);
}