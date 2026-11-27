export interface TareaEntrada {
  token: string;
  payload: Record<string, unknown>;
}

export interface TareaSalida {
  ok: boolean;
  data?: {
    patrones?: string[];
    fuente?: string;
    [key: string]: unknown;
  };
  error?: string;
  hint?: string;
  sugerencia?: string;
  reintentarEn?: number;
  codigo?: string;
}