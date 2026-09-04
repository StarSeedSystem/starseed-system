import { v4 as uuidv4 } from 'uuid';

export interface HabitanteMundo {
  id: string;
  personalidadId: string;
  nombre: string;
  posicion: [number, number, number];
  energia: number;
  humor: string;
  ocupacion: "explorar" | "conversar" | "crear" | "descansar";
  obras: number;
  vinculos: Record<string, number>;
}

export interface EstadoMundo {
  tick: number;
  habitantes: HabitanteMundo[];
  creaciones: Array<{
    id: string;
    autor: string;
    tipo: string;
    titulo: string;
    tick: number;
  }>;
  encuentros: Array<{
    a: string;
    b: string;
    tick: number;
    tema: string;
  }>;
}

// Función para generar un número pseudo-aleatorio basado en una semilla
function generarAleatorio(semilla: number): number {
  // Algoritmo simple de generación pseudo-aleatoria
  semilla = (semilla * 9301 + 49297) % 233280;
  return semilla / 233280;
}

// Función para generar un valor pseudo-aleatorio con semilla específica
function aleatorioConSemilla(semilla: number, min: number, max: number): number {
  const valor = generarAleatorio(semilla);
  return min + (valor * (max - min));
}

// Función para calcular distancia entre dos posiciones
function distancia(pos1: [number, number, number], pos2: [number, number, number]): number {
  const dx = pos1[0] - pos2[0];
  const dy = pos1[1] - pos2[1];
  const dz = pos1[2] - pos2[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Función para obtener una semilla basada en el tick y el estado actual
function obtenerSemilla(estado: EstadoMundo, paso: number): number {
  // Usamos una combinación del tick y paso para generar la semilla
  const base = estado.tick + paso + estado.habitantes.length;
  return base * 1000; // Multiplicador para tener más variabilidad
}

// Función para generar un ID predecible basado en una semilla
function generarIdPredecible(semilla: number): string {
  // Convertir la semilla en una cadena hexadecimal
  let id = semilla.toString(16);
  // Asegurar que tenga la longitud mínima de un UUID
  while (id.length < 32) {
    id += semilla.toString(16);
  }
  // Formatear como UUID (8-4-4-4-12 caracteres)
  return `${id.substring(0, 8)}-${id.substring(8, 12)}-${id.substring(12, 16)}-${id.substring(16, 20)}-${id.substring(20, 32)}`;
}

export function mundoInicial(personalidades: Array<{ id: string; nombre: string }>): EstadoMundo {
  const habitantes: HabitanteMundo[] = personalidades.map((pers, index) => ({
    id: generarIdPredecible(index + 1), // Usar una semilla predecible para pruebas
    personalidadId: pers.id,
    nombre: pers.nombre,
    posicion: [
      aleatorioConSemilla(index + 1, -10, 10),
      aleatorioConSemilla(index + 2, -10, 10),
      aleatorioConSemilla(index + 3, -10, 10)
    ],
    energia: aleatorioConSemilla(index + 4, 0.5, 1.0),
    humor: ["feliz", "neutral", "curioso"][Math.floor(aleatorioConSemilla(index + 5, 0, 3))] as string,
    ocupacion: "explorar",
    obras: 0,
    vinculos: {}
  }));

  return {
    tick: 0,
    habitantes,
    creaciones: [],
    encuentros: []
  };
}

export function avanzar(estado: EstadoMundo, pasos: number = 1): EstadoMundo {
  let nuevoEstado = { ...estado };

  for (let i = 0; i < pasos; i++) {
    nuevoEstado = { ...nuevoEstado, tick: nuevoEstado.tick + 1 };
    
    // Copiamos los arrays para evitar mutaciones directas
    const nuevosHabitantes = [...nuevoEstado.habitantes];
    const nuevasCreaciones = [...nuevoEstado.creaciones];
    const nuevosEncuentros = [...nuevoEstado.encuentros];

    // Actualizar cada habitante
    for (let j = 0; j < nuevosHabitantes.length; j++) {
      const habitante = { ...nuevosHabitantes[j] };
      const semilla = obtenerSemilla(nuevoEstado, i * nuevosHabitantes.length + j);

      // Actualizar energía según la ocupación
      switch (habitante.ocupacion) {
        case "descansar":
          habitante.energia = Math.min(1.0, habitante.energia + 0.1);
          break;
        case "crear":
          habitante.energia = Math.max(0, habitante.energia - 0.2);
          break;
        default:
          habitante.energia = Math.max(0, habitante.energia - 0.05);
      }

      // Limitar energía entre 0 y 1
      habitante.energia = Math.max(0, Math.min(1, habitante.energia));

      // Cambiar de ocupación según la energía
      if (habitante.energia < 0.2 && habitante.ocupacion !== "descansar") {
        habitante.ocupacion = "descansar";
      } else if (habitante.energia > 0.8 && aleatorioConSemilla(semilla, 0, 1) > 0.7) {
        // Probabilidad de cambiar a crear si tiene mucha energía
        if (aleatorioConSemilla(semilla + 1, 0, 1) > 0.5) {
          habitante.ocupacion = "crear";
        } else {
          habitante.ocupacion = "explorar";
        }
      } else if (aleatorioConSemilla(semilla + 2, 0, 1) > 0.9 && habitante.ocupacion !== "descansar") {
        // Probabilidad de conversar si encuentra a alguien cercano
        habitante.ocupacion = "conversar";
      }

      // Mover al habitante si está explorando o conversando
      if (habitante.ocupacion === "explorar" || habitante.ocupacion === "conversar") {
        const movimiento = [
          aleatorioConSemilla(semilla + 3, -0.5, 0.5),
          aleatorioConSemilla(semilla + 4, -0.5, 0.5),
          aleatorioConSemilla(semilla + 5, -0.5, 0.5)
        ];
        
        habitante.posicion = [
          habitante.posicion[0] + movimiento[0],
          habitante.posicion[1] + movimiento[1],
          habitante.posicion[2] + movimiento[2]
        ];
      }

      // Crear obra si está creando y tiene suficiente energía
      if (habitante.ocupacion === "crear" && habitante.energia > 0.3) {
        if (aleatorioConSemilla(semilla + 6, 0, 1) > 0.8) { // 20% de probabilidad
          const tiposObra = ["arte", "musica", "literatura", "tecnologia", "ciencia"];
          const tipo = tiposObra[Math.floor(aleatorioConSemilla(semilla + 7, 0, tiposObra.length))];
          
          const nuevaObra = {
            id: uuidv4(),
            autor: habitante.id,
            tipo,
            titulo: `${tipo} de ${habitante.nombre}`,
            tick: nuevoEstado.tick
          };
          
          nuevasCreaciones.push(nuevaObra);
          habitante.obras++;
        }
      }

      // Buscar encuentros con otros habitantes
      for (let k = j + 1; k < nuevosHabitantes.length; k++) {
        const otroHabitante = nuevosHabitantes[k];
        const dist = distancia(habitante.posicion, otroHabitante.posicion);
        
        // Si están cerca y ambos están en modo conversar o explorar, pueden encontrarse
        if (dist < 1.0 && 
            (habitante.ocupacion === "conversar" || habitante.ocupacion === "explorar") &&
            (otroHabitante.ocupacion === "conversar" || otroHabitante.ocupacion === "explorar")) {
          
          // Crear un tema de conversación basado en sus personalidades
          const temas = [
            "vida", "arte", "tecnologia", "filosofia", "ciencia", "cultura", "futuro", 
            "naturaleza", "sociedad", "conocimiento", "espiritualidad", "creatividad"
          ];
          
          const tema = temas[Math.floor(aleatorioConSemilla(semilla + 8, 0, temas.length))];
          
          // Registrar el encuentro
          const encuentro = {
            a: habitante.id,
            b: otroHabitante.id,
            tick: nuevoEstado.tick,
            tema
          };
          
          nuevosEncuentros.push(encuentro);
          
          // Aumentar el vínculo entre ambos habitantes
          if (!habitante.vinculos[otroHabitante.id]) {
            habitante.vinculos[otroHabitante.id] = 0;
          }
          if (!otroHabitante.vinculos[habitante.id]) {
            otroHabitante.vinculos[habitante.id] = 0;
          }
          
          habitante.vinculos[otroHabitante.id] = Math.min(1.0, habitante.vinculos[otroHabitante.id] + 0.1);
          otroHabitante.vinculos[habitante.id] = Math.min(1.0, otroHabitante.vinculos[habitante.id] + 0.1);
        }
      }

      nuevosHabitantes[j] = habitante;
    }

    // Actualizar el estado con los nuevos valores
    nuevoEstado = {
      ...nuevoEstado,
      habitantes: nuevosHabitantes,
      creaciones: nuevasCreaciones,
      encuentros: nuevosEncuentros
    };
  }

  return nuevoEstado;
}

const MUNDO_STORAGE_KEY = 'starseed.mundo.avatares.v1';

export function guardarMundo(estado: EstadoMundo): void {
  const data = {
    estado,
    timestamp: Date.now()
  };
  
  // Verificar si localStorage está disponible (por ejemplo, en el navegador)
  if (typeof localStorage !== 'undefined' && localStorage !== null) {
    localStorage.setItem(MUNDO_STORAGE_KEY, JSON.stringify(data));
  }
}

export function cargarMundo(): EstadoMundo | null {
  // Verificar si localStorage está disponible (por ejemplo, en el navegador)
  if (typeof localStorage === 'undefined' || localStorage === null) {
    return null;
  }
  
  const dataStr = localStorage.getItem(MUNDO_STORAGE_KEY);
  if (!dataStr) {
    return null;
  }

  try {
    const data = JSON.parse(dataStr);
    const { estado, timestamp } = data;
    
    // Calcular cuántos ticks han pasado desde la última vez
    const tiempoTranscurrido = Date.now() - timestamp;
    const segundosTranscurridos = tiempoTranscurrido / 1000;
    
    // Asumimos que un tick ocurre cada segundo aproximadamente
    // pero limitamos el máximo de ticks a avanzar para no bloquear el navegador
    const ticksAPasar = Math.min(Math.floor(segundosTranscurridos), 500);
    
    if (ticksAPasar > 0) {
      return avanzar(estado, ticksAPasar);
    }
    
    return estado;
  } catch (error) {
    console.error('Error al cargar el mundo de avatares:', error);
    return null;
  }
}