type Ambito = 'privado' | 'grupo' | 'comunidad' | 'publico';

export type Contenido = {
  tipo: 'pieza' | 'archivo';
  tamano: number;
  nombre?: string;
};

export type EntradaPublicable = {
  ambito: Ambito;
  tieneConsentimiento: boolean;
  raiz: string;
  firmaValida: boolean;
  contenido: Contenido;
};

export type MotivoNo = 
  | 'ámbito-no-publico'
  | 'sin-consentimiento'
  | 'sin-raíz'
  | 'firma-no-válida'
  | 'especificación prohibida';

const NOMBRES_PROHIBIDOS = [
  '.env',
  '.env.local',
  '.env.backup',
  '.git',
  'key.pem',
  'key.asc',
  'cert.crt',
  'cert.pem',
  'starseed_memory_root'
];

const EXTENSIONES_PROHIBIDAS = ['.pem', '.key', '.asc'];

function esEspecificacionProhibida(contenido: Contenido): boolean {
  const nombre = contenido.nombre ?? '';
  if (NOMBRES_PROHIBIDOS.some(p => nombre === p || nombre.includes('/' + p + '/'))) return true;
  if (EXTENSIONES_PROHIBIDAS.some(ext => nombre.endsWith(ext))) return true;
  return false;
}

export function esPublicable(entrada: EntradaPublicable): boolean {
  return motivoNoPublicable(entrada) === null;
}

export function motivoNoPublicable(entrada: EntradaPublicable): MotivoNo | null {
  if (entrada.ambito !== 'publico') return 'ámbito-no-publico';
  if (!entrada.tieneConsentimiento) return 'sin-consentimiento';
  if (!entrada.raiz || entrada.raiz.length !== 64) return 'sin-raíz';
  if (!entrada.firmaValida) return 'firma-no-válida';
  if (esEspecificacionProhibida(entrada.contenido)) return 'especificación prohibida';

  return null;
}