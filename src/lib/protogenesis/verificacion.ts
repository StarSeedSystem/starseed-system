/**
 * ProtoGenesis · verificación de cada criterio por alguien distinto del autor (PG1013C)
 * Módulo puro: sin node:, sin Supabase, sin window.
 * Contratación: architecture/protogenesis.md §2 y architecture/protomolecula.md §3·7·8.
 */

import type { Paso } from "./encargo";
import { LIMITES } from './encargo';

export interface Resultado {
  formato: string;
  duracionS?: number;
  bytes?: number;
  texto?: string;
  capas?: string[];
}

export interface VerificadorInfo {
  id: string;
  tipo: 'pruebas' | 'bot' | 'persona';
}

export function verificarPaso(
  paso: Paso,
  r: Resultado,
  quien: VerificadorInfo,
  autorId: string,
  manuales?: Record<number, boolean>
): { ok: boolean; pendientes: string[]; fallos: string[] } {
  if (quien.id === autorId) {
    return { ok: false, pendientes: [], fallos: ['el autor no puede verificarse a sí mismo'] };
  }

  const pendientes: string[] = [];
  const fallos: string[] = [];

  const secretos = ['sk-', 'gsk_', 'Bearer ', 'ghp_', 'AKIA'];
  const rutasAbsolutas = ['/Users/', '/home/', 'C:\\'];

  for (const [i, criterio] of paso.criterios.entries()) {
    let satisfecho = false;
    let esPersona = false;

    switch (criterio.tipo) {
      case 'formato':
        if (typeof r.formato === 'string' && typeof criterio.valor === 'string') {
          satisfecho = r.formato.trim().toLowerCase() === criterio.valor.trim().toLowerCase();
        }
        break;

      case 'duracion-max':
        if (typeof r.duracionS === 'number' && typeof criterio.valor === 'number') {
          satisfecho = r.duracionS <= criterio.valor;
        }
        break;

      case 'tamano-max':
        if (typeof r.bytes === 'number' && typeof criterio.valor === 'number') {
          satisfecho = r.bytes <= criterio.valor;
        }
        break;

      case 'sin-secretos':
        satisfecho = true;
        if (typeof r.formato === 'string') {
          for (const secreto of secretos) {
            if (r.formato.includes(secreto)) {
              satisfecho = false;
              break;
            }
          }
        }
        if (satisfecho && typeof r.texto === 'string') {
          for (const secreto of secretos) {
            if (r.texto.includes(secreto)) {
              satisfecho = false;
              break;
            }
          }
        }
        if (satisfecho && Array.isArray(r.capas)) {
          for (const capa of r.capas) {
            if (typeof capa === 'string') {
              for (const secreto of secretos) {
                if (capa.includes(secreto)) {
                  satisfecho = false;
                  break;
                }
              }
              if (!satisfecho) break;
            }
          }
        }
        if (satisfecho) {
          const checkRuta = (s: string) => {
            for (const ruta of rutasAbsolutas) {
              if (s.includes(ruta)) return false;
            }
            return true;
          };
          if (typeof r.formato === 'string' && !checkRuta(r.formato)) satisfecho = false;
          if (satisfecho && typeof r.texto === 'string' && !checkRuta(r.texto)) satisfecho = false;
          if (satisfecho && Array.isArray(r.capas)) {
            for (const capa of r.capas) {
              if (typeof capa === 'string' && !checkRuta(capa)) {
                satisfecho = false;
                break;
              }
            }
          }
        }
        break;

      case 'capas-presentes':
        if (typeof criterio.valor === 'string' && Array.isArray(r.capas)) {
          const capasRequeridas = criterio.valor.split(',').map(s => s.trim()).filter(s => s.length > 0);
          satisfecho = capasRequeridas.every(capaReq =>
            r.capas.some(capa => typeof capa === 'string' && capa === capaReq)
          );
        }
        break;

      case 'persona':
        esPersona = true;
        if (manuales && manuales[i] === true) {
          satisfecho = true;
        } else {
          pendientes.push(`criterio ${i} (persona) awaiting manual verification`);
        }
        break;

      default:
        fallos.push(`tipo de criterio desconocido: ${criterio.tipo}`);
        continue;
    }

    if (!esPersona && !satisfecho) {
      fallos.push(`criterio ${i} (${criterio.tipo}) no satisfeito`);
    }
  }

  const ok = pendientes.length === 0 && fallos.length === 0;
  return { ok, pendientes, fallos };
}

export function siguienteIntento(intentos: number): 'reintentar' | 'necesita-mano' {
  return intentos < LIMITES.intentos ? 'reintentar' : 'necesita-mano';
}