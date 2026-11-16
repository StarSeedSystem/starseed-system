// Reglas puras de compartir internet por la malla de forma automática
import { PuertaInternet, Compartir, Contadores, puedeUsar, usadoHoyMb, restanteParaOtrosMb } from './cristal/puertas-internet';

export interface PreferenciasRedCompartida {
  /** Máximo nivel de compartir que el dueño permite (nunca se sube por encima). */
  compartirMaximo: Compartir;
  /** Solo ofrecer si está en Wi-Fi. */
  soloWifi: boolean;
  /** Tope de subida en kbps para compartir. */
  kbpsSubidaMax: number;
  /** Permitir compartir en conexiones con datos medidos (tope mensual). */
  permitirMedida: boolean;
  /** Reserva mínima de batería para compartir (%), salvo si está cargando. */
  reservaBateriaMinPct: number;
  /** Modo banco: racionar por día (opcional). */
  bancoActivo?: boolean;
  /** Tope diario en MB para otras cuentas (modo banco). */
  bancoDiarioMb?: number;
}

export interface EstadoDispositivo {
  enWifi: boolean;
  cargando: boolean;
  bateriaPct: number | null;
  medida: boolean;
  usoMb: number;
}

export interface DecisionComparticion {
  puertaId: string;
  con: Compartir;
  accion: 'ofrecer' | 'retirar' | 'mantener';
  motivo: string;
}

export function sugerirComparticion(entrada: {
  puertas: PuertaInternet[];
  preferencias: PreferenciasRedCompartida;
  estado: EstadoDispositivo;
  ahora: number;
  desfaseMin: number;
  contadores?: Map<string, Contadores>;
}): { decisiones: DecisionComparticion[] } {
  const { puertas, preferencias, estado, ahora, desfaseMin, contadores } = entrada;
  const decisiones: DecisionComparticion[] = [];

  for (const puerta of puertas) {
    // 1. Interruptor por aparato apagado = nunca ofrece
    if (!puerta.compartir || puerta.compartir === 'nadie') {
      decisiones.push({
        puertaId: puerta.id,
        con: 'nadie',
        accion: 'retirar',
        motivo: 'Interruptor de compartir apagado en esta puerta',
      });
      continue;
    }

    // 2. Nivel pedido por encima del máximo → baja al máximo
    const nivelMaximoPermitido = preferencias.compartirMaximo;
    const nivelesCompartir: Compartir[] = ['nadie', 'mi-cuenta', 'vinculos', 'grupo', 'publico'];
    const indicePuerta = nivelesCompartir.indexOf(puerta.compartir);
    const indiceMaximo = nivelesCompartir.indexOf(nivelMaximoPermitido);
    let conEfectivo: Compartir = puerta.compartir;

    if (indicePuerta > indiceMaximo) {
      conEfectivo = nivelMaximoPermitido;
    }

    // 3. En datos móviles con soloWifi → retira
    if (preferencias.soloWifi && !estado.enWifi) {
      decisiones.push({
        puertaId: puerta.id,
        con: conEfectivo,
        accion: 'retirar',
        motivo: 'Preferencia solo Wi-Fi activa y no hay conexión Wi-Fi',
      });
      continue;
    }

    // 4. Batería baja sin cargar → retira
    const bateriaMinima = preferencias.reservaBateriaMinPct;
    if (
      estado.bateriaPct !== null &&
      !estado.cargando &&
      estado.bateriaPct < bateriaMinima
    ) {
      decisiones.push({
        puertaId: puerta.id,
        con: conEfectivo,
        accion: 'retirar',
        motivo: `Batería al ${estado.bateriaPct}% (mínimo ${bateriaMinima}%) y no está cargando`,
      });
      continue;
    }

    // 5. Subida supera tope → retira
    if (puerta.subidaKbps > preferencias.kbpsSubidaMax) {
      decisiones.push({
        puertaId: puerta.id,
        con: conEfectivo,
        accion: 'retirar',
        motivo: `Subida ${puerta.subidaKbps} kbps supera tope ${preferencias.kbpsSubidaMax} kbps`,
      });
      continue;
    }

    // 6. Conexión medida sin permiso → no ofrece
    if (puerta.medida && !preferencias.permitirMedida) {
      decisiones.push({
        puertaId: puerta.id,
        con: conEfectivo,
        accion: 'retirar',
        motivo: 'Conexión con datos medidos y preferencia no permite medidos',
      });
      continue;
    }

    // 7. Tope mensual medido superado → retira
    if (puerta.medida && puerta.topeMensualMb !== undefined) {
      const usado = puerta.usadoMesMb ?? 0;
      const reserva = puerta.reservaDuenoPct ?? 20;
      const disponibleParaOtros = Math.max(
        0,
        puerta.topeMensualMb - usado - (puerta.topeMensualMb * reserva) / 100
      );
      if (disponibleParaOtros <= 0) {
        decisiones.push({
          puertaId: puerta.id,
          con: conEfectivo,
          accion: 'retirar',
          motivo: 'Tope mensual de datos medidos superado (reserva del dueño incluida)',
        });
        continue;
      }
    }

    // 8. Uso actual en conexión medida supera tope → retira
    if (estado.medida && preferencias.permitirMedida) {
      if (estado.usoMb > 0 && puerta.topeMensualMb !== undefined) {
        const reserva = puerta.reservaDuenoPct ?? 20;
        const disponible = Math.max(
          0,
          puerta.topeMensualMb - estado.usoMb - (puerta.topeMensualMb * reserva) / 100
        );
        if (disponible <= 0) {
          decisiones.push({
            puertaId: puerta.id,
            con: conEfectivo,
            accion: 'retirar',
            motivo: 'Uso actual en conexión medida supera tope disponible',
          });
          continue;
        }
      }
    }

    // 9. Modo banco: tope diario para otras cuentas (entidad + público)
    if (preferencias.bancoActivo && preferencias.bancoDiarioMb !== undefined && contadores) {
      const c = contadores.get(puerta.id);
      if (c) {
        const otrosHoyMb = usadoHoyMb(c, 'otros', ahora, desfaseMin);
        if (otrosHoyMb >= preferencias.bancoDiarioMb) {
          decisiones.push({
            puertaId: puerta.id,
            con: conEfectivo,
            accion: 'retirar',
            motivo: `Tope diario de modo banco superado (${otrosHoyMb} MB usados de ${preferencias.bancoDiarioMb} MB)`,
          });
          continue;
        }
      }
    }

    // 10. Verificación final de límites (mensual + diario) para otros
    const cFinal = contadores?.get(puerta.id);
    if (conEfectivo !== 'mi-cuenta' && cFinal) {
      const restante = restanteParaOtrosMb(puerta, cFinal, ahora, desfaseMin);
      if (restante === null || restante <= 0) {
        decisiones.push({
          puertaId: puerta.id,
          con: conEfectivo,
          accion: 'retirar',
          motivo: 'No queda datos disponibles para compartir (límite mensual o diario)',
        });
        continue;
      }
    }

    // 11. Todo permitido → ofrece
    decisiones.push({
      puertaId: puerta.id,
      con: conEfectivo,
      accion: 'ofrecer',
      motivo: 'Cumple todas las condiciones: interruptor encendido, nivel dentro del máximo, Wi-Fi/batería/subida/medida dentro de topes',
    });
  }

  return { decisiones };
}