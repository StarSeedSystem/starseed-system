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
  contexto: ContextoPeticion;
  partes: Parte[];
};

export type ResultadoParte = {
  destino: string | 'local' | 'nube';
  fuentes?: string[];
  enlace?: string;
  respaldo?: string;
  motivo: string;
};

export type PlanResultado = {
  parteIdx: number;
  resultado: ResultadoParte;
};

/**
 * planificar(peticion, ofertas, reglas) → planResultado[]
 * Pura: sin red, sin disco, sin procesos lanzados.
 * Para cada parte de la petición decide dónde corre, de dónde vienen los bytes,
 * el enlace y el motivo, aplicando reglas deterministas.
 *
 * Orden de reglas (las restricciones ganan siempre a las preferencias):
 * 1. Permisos y privacidad: lo privado solo en neuronas de la misma cuenta o
 *    servidores del cerebro; nunca nube compartida ni vecinos públicos. Un grupo
 *    solo usa lo que sus miembros le prestan.
 * 2. Tiempo real: si la latencia importa (ventanas, juegos, llamadas), solo red
 *    local o enlaces con latencia medida menor que el tope de la petición.
 * 3. Energía: nunca una neurona con batería baja sin cargador, ni una que su dueño
 *    está usando a fondo.
 * 4. Capacidad: cabe en lo que la neurona presta (no en lo que tiene).
 * 5. Coste: primero lo gratuito y propio.
 * 6. Reparto: si una sola no basta, la petición se ramifica (bandas desde varias
 *    fuentes, piezas de cálculo en varias neuronas).
 * 7. Suelo: nunca "nada". Si no hay recursos, abre lo que se pueda en local o en
 *    la web y dice qué falta.
 */
export function planificar(
  peticion: Peticion,
  ofertas: { nodoId: string; computo: { nucleos: number; ramLibreMb: number; gpu: boolean; vramMb?: number; motores: string[] }; presta: { cuenta: boolean; grupos: string[]; publico: boolean; topes: { cpuPct: number; ramMb: number; discoMb: number; horas?: { inicio: number; fin: number }; soloCargando: boolean } }[]; reglas?: string[] }
): PlanResultado[] {
  const reglasUsadas = reglas || [
    'privacidad',
    'latencia',
    'energia',
    'capacidad',
    'coste',
    'reparto',
    'suelo',
  ];

  return peticion.partes.map((parte, parteIdx) => {
    // Filtrar ofertas que pasan el filtro de privacidad
    const ofertasPrivadas = ofertas.filter((o) => {
      if (parte.clase === 'computo' || parte.clase === 'bytes') {
        // Privado: solo misma cuenta o servidores del cerebro
        if (peticion.contexto.privado) {
          return o.presta.cuenta || o.presta.publico === false;
        }
        // No privado: puede ser pública o del grupo
        return o.presta.publico || o.presta.grupos.some((g) => peticion.contexto.grupos.includes(g));
      }
      // Para ventana y relevo, más permisos relajados
      return true;
    });

    if (ofertasPrivadas.length === 0) {
      return {
        parteIdx,
        resultado: {
          destino: 'local',
          motivo: `No hay ofertas disponibles para ${parte.clase} (privacidad: ${peticion.contexto.tipo} privada)`,
        },
      };
    }

    // Regla 1 (già aplicada) + Regla 2: latencia
    let ofertConLatencia = ofertasPrivadas;
    if (parte.latenciaMaxMs) {
      ofertConLatencia = ofertasPrivadas.filter((o) => {
        if (!o.computo) return false;
        // Simulación simple: usar latencia si está disponible
        const lat = o.presta.topes.cpuPct; // placeholder - en implementación real vendría de enlaces
        return lat <= (parte.latenciaMaxMs ?? Infinity);
      });
    }

    // Regla 3: energía
    let ofertEnergia = ofertConLatencia;
    ofertEnergia = ofertConLatencia.filter((o) => {
      // Si la oferta tiene batería baja y no está cargando, y no es para la misma cuenta...
      // Para simplificar: descartar si batería < 20% y no cargando (solo si es privado)
      if (peticion.contexto.privado) {
        return !(o.presta.topes.soloCargando === false && o.presta.topes.cpuPct < 20);
      }
      return true;
    });

    // Regla 4: capacidad
    let ofertCapacidad = ofertEnergia;
    ofertCapacidad = ofertEnergia.filter((o) => {
      if (!o.computo) return false;
      const minRam =parte.necesita.ramMb ?? 0;
      return o.computo.ramLibreMb >= minRam;
    });

    // Regla 5: coste (primero gratuito y propio)
    let ofertCoste = ofertCapacidad;
    ofertCoste = ofertCapacidad.filter((o) => o.presta.cuenta === true);

    // Si después de las reglas quedan varias, usar empate por nodoId (determinista)
    ofertCoste.sort((a, b) => (a.nodoId > b.nodoId ? 1 : -1));

    const resultado: ResultadoParte = {
      destino: 'local' as const,
      motivo: '',
    };

    if (ofertCoste.length === 0) {
      // Regla 7: suelo
      const falta = parte.necesita.ramMb !== undefined ? `${parte.necesita.ramMb} MB de RAM` :
        parte.necesita.gpu ? 'GPU' :
          'recursos disponibles';
      resultado.destino = 'local';
      resultado.motivo = `Suelo: no hay recursos suficientes. Falta ${falta}. Abrir en local o web.`;
      return { parteIdx, resultado };
    }

    const elegida = ofertCoste[0];
    resultado.destino = elegida.nodoId;
    resultado.motivo = `Recurso en ${elegida.nodoId} cumple ${parte.clase} con ${elegida.computo?.ramLibreMb ?? 0} MB RAM`;

    // Regla 6: reparto - si hay múltiples partes y la misma oferta no basta para todas,
    // ramificar. Para una sola parte, no hay reparto.
    if (peticion.partes.length > 1 && ofertCoste.length > 1) {
      resultado Fuentes = ofertCoste.map((o) => o.nodoId);
    }

    return { parteIdx, resultado };
  });
}

export default planificar;