import { capacidadPrestable, type OfertaNeurona } from './oferta';

// La bolsa (contrato §4): empareja peticiones y ofertas con reglas deterministas y explica el motivo.
// Es pura: sin red, sin disco, sin procesos ni reloj (el «t» llega dentro de la oferta).
// Los servidores del cerebro (`brain_server_links`) van registrados con la cuenta de su dueño en OfertaNeurona,
// así que «misma cuenta o servidores del cerebro» es: cuentaId igual al de la petición.

export type ContextoPeticion = {
  tipo: 'cuenta' | 'grupo' | 'comunidad' | 'publicacion' | 'estacion';
  id: string;
  privado: boolean;
};

export type Parte = {
  clase: 'computo' | 'bytes' | 'ventana' | 'relevo';
  necesita: {
    ramMb?: number;
    gpu?: boolean;
    motor?: string;
    appId?: string;
    volumen?: string;
    kbps?: number;
  };
  latenciaMaxMs?: number;
};

export type Peticion = {
  id: string;
  cuentaId: string;
  grupos?: string[];
  contexto: ContextoPeticion;
  partes: Parte[];
};

export type ResultadoParte = {
  destino: string;
  fuentes?: string[];
  enlace?: string;
  respaldo?: string;
  motivo: string;
};

export type ReglaBolsa = 'privacidad' | 'latencia' | 'energia' | 'capacidad' | 'coste' | 'reparto' | 'suelo';

export const REGLAS_TODAS: ReglaBolsa[] = ['privacidad', 'latencia', 'energia', 'capacidad', 'coste', 'reparto', 'suelo'];

// Regla 1, y la preferencia de la 5: 0 cuenta propia, 1 grupo, 2 público; null si no puede.
function lugar(o: OfertaNeurona, p: Peticion): number | null {
  if (o.cuentaId === p.cuentaId && o.presta.cuenta) return 0;
  if (p.contexto.privado) return null;
  if (p.grupos?.some((g) => o.presta.grupos.includes(g))) return 1;
  if (o.presta.publico) return 2;
  return null;
}

// Regla 2: sin latencia medida nada se garantiza (lo no medido nunca se inventa).
function latenciaOk(o: OfertaNeurona, parte: Parte): boolean {
  if (parte.latenciaMaxMs === undefined) return true;
  const medidas = Object.values(o.enlaces.latenciaMs ?? {});
  return medidas.length > 0 && Math.min(...medidas) < parte.latenciaMaxMs;
}

// Reglas 3 y 4 van dentro de capacidadPrestable: pesa lo que cada oferta presta (no lo que tiene),
// con su energía (batería baja sin cargador o en uso a fondo: cero cómputo) y su horario.
function aporta(o: OfertaNeurona, parte: Parte): boolean {
  const p = capacidadPrestable(o);
  const n = parte.necesita;
  switch (parte.clase) {
    case 'computo':
      return p.computo.ramLibreMb > 0 && (!n.gpu || p.computo.gpu) && (!n.motor || p.computo.motores.includes(n.motor));
    case 'ventana':
      return !!n.appId && p.apps.some((a) => a.id === n.appId);
    case 'bytes': {
      const volumen = n.volumen ?? n.appId;
      if (volumen) return p.almacen.volumenes.includes(volumen);
      if (n.kbps) return (p.enlaces.bajadaKbps ?? 0) > 0;
      return p.almacen.prestaMb > 0;
    }
    case 'relevo':
      return (p.enlaces.subidaKbps ?? 0) > 0;
    default:
      return false;
  }
}

function cubre(o: OfertaNeurona, parte: Parte): boolean {
  if (!aporta(o, parte)) return false;
  const p = capacidadPrestable(o);
  const n = parte.necesita;
  switch (parte.clase) {
    case 'computo':
      return p.computo.ramLibreMb >= (n.ramMb ?? 0);
    case 'ventana':
      return true;
    case 'bytes':
      if (n.kbps && !(n.volumen ?? n.appId)) return (p.enlaces.bajadaKbps ?? 0) >= n.kbps;
      return true;
    case 'relevo':
      return (p.enlaces.subidaKbps ?? 0) >= (n.kbps ?? 0);
    default:
      return false;
  }
}

function faltaDe(parte: Parte): string {
  const n = parte.necesita;
  const volumen = n.volumen ?? n.appId;
  if (volumen) return `las bandas del volumen ${volumen}`;
  if (n.kbps) return `${n.kbps} kbps de enlace`;
  if (n.ramMb) return `${n.ramMb} MB de cómputo prestado`;
  if (n.gpu) return 'una GPU prestada';
  if (n.motor) return `el motor ${n.motor}`;
  return 'recursos prestables';
}

function suelo(peticion: Peticion, parte: Parte): ResultadoParte {
  const motivo = peticion.contexto.privado
    ? `Suelo: la malla privada no lo cubre y lo privado no sale de la cuenta. Falta ${faltaDe(parte)}; abrir en local desde lo que la neurona ya tiene.`
    : `Suelo: la red del contexto no tiene nada que lo cubra. Falta ${faltaDe(parte)}; abrir en local o con la nube gratuita como último recurso.`;
  return { destino: peticion.contexto.privado ? 'local' : 'nube', motivo };
}

// planificar(peticion, ofertas, reglas) → un ResultadoParte por cada parte, en el mismo orden.
// `reglas` limita las reglas de filtro (privacidad, latencia, coste, reparto); energía, capacidad
// y suelo se aplican siempre porque son seguridad o porque nunca se devuelve un plan vacío.
export function planificar(peticion: Peticion, ofertas: OfertaNeurona[], reglas?: ReglaBolsa[]): ResultadoParte[] {
  const usar = new Set<ReglaBolsa>(reglas ?? REGLAS_TODAS);
  return peticion.partes.map((parte) => {
    const ordenadas = ofertas
      .filter((o) => !usar.has('privacidad') || lugar(o, peticion) !== null)
      .filter((o) => !usar.has('latencia') || latenciaOk(o, parte))
      .filter((o) => aporta(o, parte))
      .sort((a, b) =>
        (usar.has('coste') ? (lugar(a, peticion) ?? 3) - (lugar(b, peticion) ?? 3) : 0) ||
        a.nodoId.localeCompare(b.nodoId));
    const elegida = ordenadas.find((o) => cubre(o, parte));
    if (elegida) {
      const volumen = parte.necesita.volumen ?? parte.necesita.appId;
      const fuentes = volumen
        ? ordenadas
            .filter((o) => capacidadPrestable(o).almacen.volumenes.includes(volumen))
            .map((o) => o.nodoId)
        : undefined;
      const respaldo = ordenadas.find((o) => o.nodoId !== elegida.nodoId && cubre(o, parte))?.nodoId;
      return {
        destino: elegida.nodoId,
        fuentes: fuentes && fuentes.length > 1 ? fuentes : undefined,
        respaldo,
        motivo: `La parte ${parte.clase} va a ${elegida.nodoId}: privacidad, latencia, energía y capacidad prestable en orden, primero lo propio y gratuito${fuentes && fuentes.length > 1 ? `, con el volumen ${volumen} en ${fuentes.length} fuentes` : ''}.`,
      };
    }
    // Regla 6: si una sola no basta, la parte de cómputo se reparte entre varias neuronas.
    if (usar.has('reparto') && parte.clase === 'computo' && ordenadas.length > 0) {
      const suma = ordenadas.reduce((s, o) => s + capacidadPrestable(o).computo.ramLibreMb, 0);
      const n = parte.necesita;
      const conGpu = !n.gpu || ordenadas.some((o) => capacidadPrestable(o).computo.gpu);
      const conMotor = !n.motor || ordenadas.some((o) => capacidadPrestable(o).computo.motores.includes(n.motor));
      if (suma >= (n.ramMb ?? 0) && conGpu && conMotor) {
        const fuentes = ordenadas.map((o) => o.nodoId);
        return {
          destino: fuentes[0],
          fuentes,
          motivo: `Reparto: ninguna neurona cubre sola ${faltaDe(parte)}, así que la parte ${parte.clase} se reparte en ${fuentes.length} neuronas.`,
        };
      }
    }
    return suelo(peticion, parte);
  });
}
