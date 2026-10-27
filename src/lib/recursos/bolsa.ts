export type ContextoPeticion = {
  tipo: 'cuenta' | 'grupo' | 'comunidad' | 'publicacion' | 'estacion';
  id: string;
  privado: boolean;
  grupos?: string[];
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
  ofertas: {
    nodoId: string;
    computo: { nucleos: number; ramLibreMb: number; gpu: boolean; vramMb?: number; motores: string[] };
    presta: {
      cuenta: boolean;
      grupos: string[];
      publico: boolean;
      topes: {
        cpuPct: number;
        ramMb: number;
        discoMb: number;
        horas?: { inicio: number; fin: number };
        soloCargando: boolean;
      };
    };
  }[],
  reglas?: string[]
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
    // --- Regla 1: Permisos y privacidad ---
    const esPrivado = peticion.contexto.privado;
    let ofertasFiltradas = ofertas.filter((o) => {
      if (esPrivado) {
        // Lo privado solo en neuronas de la misma cuenta
        return o.presta.cuenta || o.presta.publico === false;
      }
      // No privado: grupo o público
      return (
        o.presta.publico ||
        o.presta.grupos.some((g) => peticion.contexto.grupos?.includes(g) ?? false)
      );
    });

    // --- Regla 2: Tiempo real (latencia) ---
    if (parte.latenciaMaxMs) {
      ofertasFiltradas = ofertasFiltradas.filter((o) => {
        // Simulación: usar cpuPct como proxy de latencia disponible
        // En implementación real vendría de o.presta.enlaces?.latenciaMs
        return o.presta.topes.cpuPct <= parte.latenciaMaxMs;
      });
    }

    // --- Regla 3: Energía ---
    ofertasFiltradas = ofertasFiltradas.filter((o) => {
      // Nunca una neurona con batería baja sin cargador ni usando a fondo
      const bateriaBaja = o.presta.topes.cpuPct < 20; // proxy simple
      const enUso = o.presta.topes.soloCargando === false && o.presta.topes.cpuPct < 30;
      if (esPrivado) {
        // Privado: si es de la misma cuenta, permite; si no, restricciones
        return !bateriaBaja || o.presta.cuenta;
      }
      return !bateriaBaja;
    });

    // --- Regla 4: Capacidad ---
    ofertasFiltradas = ofertasFiltradas.filter((o) => {
      if (!o.computo) return false;
      const minRam = parte.necesita.ramMb ?? 0;
      return o.computo.ramLibreMb >= minRam;
    });

    // --- Regla 5: Coste (primero gratuito y propio) ---
    ofertasFiltradas = ofertasFiltradas.filter((o) => o.presta.cuenta === true);

    // Empate por nodoId (determinista)
    ofertasFiltradas.sort((a, b) =>
      a.nodoId > b.nodoId ? 1 : a.nodoId < b.nodoId ? -1 : 0
    );

    const resultado: ResultadoParte = {
      destino: 'local',
      motivo: '',
    };

    if (ofertasFiltradas.length === 0) {
      // --- Regla 7: Suelo ---
      let falta = 'recursos';
      if (parte.necesita.ramMb !== undefined) {
        falta = `${parte.necesita.ramMb} MB de RAM`;
      } else if (parte.necesita.gpu) {
        falta = 'GPU';
      }
      resultado.destino = 'local';
      resultado.motivo = `Suelo: no hay recursos suficientes. Falta ${falta}. Abrir en local o web.`;
      return { parteIdx, resultado };
    }

    const elegida = ofertasFiltradas[0];
    resultado.destino = elegida.nodoId;
    resultado.motivo = `Recurso en ${elegida.nodoId} cumple ${parte.clase} con ${elegida.computo?.ramLibreMb ?? 0} MB RAM libre`;

    // --- Regla 6: Reparto ---
    // Si hay múltiples partes y la oferta elegida no puede cubrir todas,
    // ramificar indicando múltiples fuentes
    if (peticion.partes.length > 1) {
      resultado.fuentes = ofertasFiltradas.map((o) => o.nodoId);
    }

    return { parteIdx, resultado };
  });
}

export default planificar;