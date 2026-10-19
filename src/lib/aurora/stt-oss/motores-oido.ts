/**
 * StarSeed OS — Registro y elector de motores de oído. Módulo PURO (sin DOM ni fetch).
 * Contrato: architecture/voz-fusionada-astraura.md (§1, §3).
 */
export type MotorOidoId = 'phonon-2'|'parakeet-v3'|'vibeasr-158'|'whisper-web'|'navegador'|'malla'|'voicestudio'|'moonshine';
export interface MotorOido { id: MotorOidoId; idiomas: string[]; tipo: 'navegador'|'local'|'endpoint'|'malla'; flujo: boolean; licencia: string; atribucion?: boolean; tamanoMB?: number; }
export const MOTORES_OIDO: MotorOido[] = [
  { id: 'phonon-2', idiomas: ['en','es'], tipo: 'endpoint', flujo: true, licencia: 'CC-BY-4.0', atribucion: true, tamanoMB: 164 },
  { id: 'parakeet-v3', idiomas: ['*'], tipo: 'local', flujo: false, licencia: 'CC-BY-4.0', atribucion: true },
  { id: 'vibeasr-158', idiomas: ['*'], tipo: 'local', flujo: true, licencia: '', atribucion: false },
  { id: 'whisper-web', idiomas: ['es','en','ca','fr','de','pt','it'], tipo: 'endpoint', flujo: false, licencia: 'MIT', atribucion: false },
  { id: 'navegador', idiomas: ['*'], tipo: 'navegador', flujo: true, licencia: 'sistema', atribucion: false },
  { id: 'malla', idiomas: ['*'], tipo: 'malla', flujo: false, licencia: '', atribucion: false },
  { id: 'voicestudio', idiomas: ['*'], tipo: 'endpoint', flujo: true, licencia: 'AGPL-3.0-only', atribucion: true },
  { id: 'moonshine', idiomas: ['en','es'], tipo: 'local', flujo: true, licencia: 'MIT', atribucion: false, tamanoMB: 60 },
];
export interface OpcionesEleccionOido { idioma: string; disponibles: MotorOidoId[]; medidas?: Record<string, number>; fase: 'parcial'|'final'; preferido?: MotorOidoId; }
export interface ResultadoOido { motor: string; motivo: string; }
function cubreIdioma(m: MotorOido, lang: string): boolean { return m.idiomas.includes('*') || (m.id === 'phonon-2' && lang === 'es') || m.idiomas.includes(lang); }
function candidatos(orden: string[]): MotorOido[] { return orden.map(id => MOTORES_OIDO.find(x => x.id === id)).filter((x): x is MotorOido => !!x); }
export function elegirOido(opciones: OpcionesEleccionOido): ResultadoOido {
  const { idioma, disponibles, medidas = {}, fase, preferido } = opciones;
  if (preferido) {
    const m = MOTORES_OIDO.find(x => x.id === preferido && disponibles.includes(x.id) && cubreIdioma(x, idioma));
    if (m) return { motor: m.id, motivo: `motor preferido (${m.id}) disponible para ${idioma}` };
  }
  const candidatosFiltrados = MOTORES_OIDO.filter(m => disponibles.includes(m.id) && cubreIdioma(m, idioma));
  if (fase === 'parcial') {
    const conFlujo = candidatosFiltrados.filter(c => c.flujo).sort((a, b) => (medidas[a.id] ?? Infinity) - (medidas[b.id] ?? Infinity));
    if (conFlujo[0]) return { motor: conFlujo[0].id, motivo: `fase parcial: menor latencia medida (${conFlujo[0].id}, flujo=${conFlujo[0].flujo})` };
  }
  const orden = idioma === 'en' ? ['phonon-2','parakeet-v3','vibeasr-158','whisper-web','navegador','malla'] : ['parakeet-v3','vibeasr-158','phonon-2','whisper-web','navegador','malla'];
  for (const id of orden) {
    const m = candidatosFiltrados.find(c => c.id === id);
    if (m) return { motor: m.id, motivo: idioma === 'en' ? `inglés: ${m.id} por defecto` : `fase final: mayor precisión para ${idioma} (${m.id})` };
  }
  return { motor: 'navegador', motivo: 'sin ningún motor disponible; suelo (navegador)' };
}
