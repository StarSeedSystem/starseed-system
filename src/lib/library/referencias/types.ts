export interface ReferenciaEntrada {
  id: string;
  nombre: string;
  url: string;
  tema: string;
  subtema: string | null;
  que_es: string;
  tipo: string;
  acceso: string;
  clase_uso: string;
  condiciones: string;
  canales: string[];
  prohibido: string[];
  actualizacion: Array<{
    tipo: string;
    ref: string;
    nota?: string;
    url?: string;
  }>;
  integracion: Array<{
    tipo: string;
    url?: string;
    ref?: string;
    licencia?: string;
    nombre?: string;
    requiere?: string;
  }>;
  terminos: string | null;
  og_imagen: string | null;
  verificado: string;
  sin_verificar: string[];
}