export interface Sala {
  entrar(tema: string, conexion: any): { ok: boolean; motivo?: string };
  salir(conexion: any): void;
  presencia(tema: string): number;
  temaDe(conexion: any): string | undefined;
  difundir(emisor: any, texto: string): any[];
}

export function crearSalas(options: {
  maxSalas?: number;
  maxPorSala?: number;
  maxBytes?: number;
} = {}): Sala {
  const maxSalas = options.maxSalas ?? 100;
  const maxPorSala = options.maxPorSala ?? 100;
  const maxBytes = options.maxBytes ?? 1000;
  
  const salas = new Map<string, Set<any>>(); // tema -> set of conexiones
  const conexionTema = new Map<any, string>(); // conexion -> tema
  
  return {
    entrar: (tema: string, conexion: any) => {
      // Validate tema format
      if (!tema.startsWith('estacion-vivo:') && !tema.startsWith('estacion-p:')) {
        return { ok: false, motivo: 'Tema inválido' };
      }
      
      // Validate tema length (must have at least 8 characters after prefix)
      const prefix = tema.startsWith('estacion-vivo:') ? 'estacion-vivo:' : 'estacion-p:';
      if (tema.length <= prefix.length + 7) {
        return { ok: false, motivo: 'Tema inválido' };
      }
      
      // Check if we've reached the maximum number of salas
      if (salas.size >= maxSalas && !salas.has(tema)) {
        return { ok: false, motivo: 'Límite de salas alcanzado' };
      }
      
      // Check if we've reached the maximum number of connections for this sala
      const currentConexiones = salas.get(tema) ?? new Set<any>();
      if (currentConexiones.size >= maxPorSala) {
        return { ok: false, motivo: 'Límite de conexiones por sala alcanzado' };
      }
      
      // Add the connection to the sala
      if (!salas.has(tema)) {
        salas.set(tema, new Set<any>());
      }
      salas.get(tema)!.add(conexion);
      conexionTema.set(conexion, tema);
      
      return { ok: true };
    },
    
    salir: (conexion: any) => {
      const tema = conexionTema.get(conexion);
      if (tema) {
        const conexiones = salas.get(tema);
        if (conexiones) {
          conexiones.delete(conexion);
          // Clean up empty salas
          if (conexiones.size === 0) {
            salas.delete(tema);
          }
        }
        conexionTema.delete(conexion);
      }
    },
    
    presencia: (tema: string) => {
      const conexiones = salas.get(tema);
      return conexiones ? conexiones.size : 0;
    },
    
    temaDe: (conexion: any) => {
      return conexionTema.get(conexion);
    },
    
    difundir: (emisor: any, texto: string) => {
      // Validate texto
      if (typeof texto !== 'string') {
        return [];
      }
      
      // Check if texto is too long
      if (new TextEncoder().encode(texto).length > maxBytes) {
        return [];
      }
      
      // Check if texto starts with {"t":"est"}
      if (!texto.startsWith('{"t":"est"')) {
        return [];
      }
      
      // Get the tema of the emisor
      const emisorTema = conexionTema.get(emisor);
      if (!emisorTema) {
        return [];
      }
      
      // Get all connections in the same sala except the emisor
      const conexiones = salas.get(emisorTema) ?? new Set<any>();
      const destino = [];
      
      for (const conexion of conexiones) {
        if (conexion !== emisor) {
          destino.push(conexion);
        }
      }
      
      return destino;
    }
  };
}