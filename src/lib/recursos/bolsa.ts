import { OfertaNeurona, capacidadPrestable } from './oferta';
export type TipoContexto = 'cuenta' | 'grupo' | 'comunidad' | 'publicacion' | 'estacion';
export interface Contexto {
  tipo: TipoContexto;
  id: string;
   privado: boolean;
}
export interface Necesidades {
  ramMb?: number;
  gpu?: boolean;
  motor?: string;
  appId?: string;
  volumen?: number;
  kbps?: number;
}

export interface Parte {
  clase: 'computo' | 'bytes' | 'ventana' | 'relevo';
  necesita: Necesidades;
  latenciaMaxMs?: number;
}

export interface Peticion {
  id: string;
  contexto: Contexto;
  partes: Parte[];
}

export interface ResultadoParte {
  destino: string | 'local' | 'nube';
  fuentes?: string[];
  enlace?: string;
  respaldo?: string;
  motivo: string;
}

export interface Suelo {
  abrirEn: 'local' | 'web';
  falta: string; // description of what's missing
}

export type PlanResult = ResultadoParte | Suelo;

export function planificar(peticion: Peticion, ofertas: OfertaNeurona[], reglas: unknown): PlanResult[] {
  const results: PlanResult[] = [];
  const cuentaId = peticion.contexto.id; // Simplification: use contexto.id as cuentaId
  const esPrivado = peticion.contexto.privado;

  for (const parte of peticion.partes) {
    let chosenOferta: OfertaNeurona | null = null;
    let chosenMotivo = '';

     for (const oferta of ofertas) {
       // Check visibility (simplified)
       const visible = esVisible(oferta, cuentaId, esPrivado);
       if (!visible) continue;

      // Check if oferta can satisfy the necesita
      const prestable = capacidadPrestable(oferta);
      const needs = parte.necesita;

      // Check computo needs
      if (needs.ramMb !== undefined && prestable.computo.ramLibreMb < needs.ramMb) continue;
      if (needs.gpu === true && !prestable.computo.gpu) continue;
      if (needs.motor !== undefined && !prestable.computo.motores.includes(needs.motor)) continue;
      if (needs.appId !== undefined) {
        const appMatch = oferta.apps.some(app => app.id === needs.appId);
        if (!appMatch) continue;
      }
      // Check almacen needs
      if (needs.volumen !== undefined && prestable.almacen.prestaMb < needs.volumen) continue;
      // Check bandwidth needs (kbps)
      if (needs.kbps !== undefined) {
        const bandwidth = Math.max(prestable.enlaces.bajadaKbps ?? 0, prestable.enlaces.subidaKbps ?? 0);
        if (bandwidth < needs.kbps) continue;
      }

      // If we pass all checks, we choose this oferta (first match)
      chosenOferta = oferta;
      chosenMotivo = `Oferta ${oferta.nodoId} cumple con los requisitos de visibilidad y capacidad`;
      break;
    }

    if (chosenOferta) {
      results.push({
        destino: chosenOferta.nodoId,
        fuentes: [],
        enlace: undefined,
        respaldo: undefined,
        motivo: chosenMotivo,
      });
    } else {
      // No oferta found, create a suelo
      const faltantes: string[] = [];
      if (parte.necesita.ramMb !== undefined) faltantes.push(`ramMb >= ${parte.necesita.ramMb}`);
      if (parte.necesita.gpu === true) faltantes.push('gpu');
      if (parte.necesita.motor !== undefined) faltantes.push(`motor: ${parte.necesita.motor}`);
      if (parte.necesita.appId !== undefined) faltantes.push(`appId: ${parte.necesita.appId}`);
      if (parte.necesita.volumen !== undefined) faltantes.push(`volumen >= ${parte.necesita.volumen} MB`);
      if (parte.necesita.kbps !== undefined) faltantes.push(`kbps >= ${parte.necesita.kbps}`);

      results.push({
        abrirEn: 'local',
        falta: `No se encontraron recursos para: ${faltantes.join(', ')}`,
      });
    }
  }

  return results;
}

// Helper function to check if an oferta is visible for the given cuentaId and privacy setting
function esVisible(oferta: OfertaNeurona, cuentaId: string, esPrivado: boolean): boolean {
  const { cuenta, grupos: offerGrupos, publico } = oferta.presta;
  // Account access: if the oferta is for the same account and cuenta is true
  const accountAccess = cuenta && oferta.cuentaId === cuentaId;
  // Public access: only if not privado (since privado cannot use public offers)
  const publicAccess = publico && !esPrivado;
  // We ignore group access due to lack of grupo information in contexto
  return accountAccess || publicAccess;
}