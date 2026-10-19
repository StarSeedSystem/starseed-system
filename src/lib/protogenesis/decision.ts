/**
 * ProtoGenesis · decisión por ámbito (Genesis / PoliGenesis / MetaGenesis) y propuesta a MetaGenesis (PG1013D)
 * Módulo puro: sin node:, sin Supabase, sin window.
 * Contratación: architecture/protogenesis.md §2 y architecture/protomolecula.md §3·7·8.
 */

import type { Ambito } from "@/lib/protomolecula/tipos";
import type { Encargo } from "./encargo";
import { decidirAplicacion, rangoDeRol, Ambito as GenesisAmbito, EntidadAmbito } from "@/lib/genesis/operaciones";

/**
 * Determina quién decide el resultado de un encargo de ProtoGenesis según el ámbito y las condiciones.
 * 
 * @param e - Objeto con:
 *   - ambito: ámbito de la molécula (personal, perfil, grupo, pública)
 *   - esDueno: si el usuario es el dueño de la molécula
 *   - rol: rol del usuario en el ámbito (null si no aplica o no es de grupo)
 *   - democratico: si el ámbito es democrático (true) o jerárquico (false)
 *   - tocaFueraDeLaMolecula: si el resultado implica cambios fuera de la molécula (átomo nuevo, conversor, código del OS)
 * 
 * @returns Objeto con:
 *   - modo: 'aceptar' | 'proponer-voto' | 'proponer-metagenesis' | 'sin-permiso'
 *   - motivo: explicación de la decisión
 */
export function decidirResultado(e: {
  ambito: Ambito;
  esDueno: boolean;
  rol?: string | null;
  democratico?: boolean;
  tocaFueraDeLaMolecula: boolean;
}): { modo: 'aceptar' | 'proponer-voto' | 'proponer-metagenesis' | 'sin-permiso'; motivo: string } {
  // Si toca fuera de la molécula → proponer-metagenesis
  if (e.tocaFueraDeLaMolecula) {
    return {
      modo: 'proponer-metagenesis',
      motivo: 'un átomo, un conversor o código del OS lo decide MetaGenesis',
    };
  }

  // Para ámbitos personal y perfil, solo el dueño puede aceptar
  if (e.ambito === 'personal' || e.ambito === 'perfil') {
    if (e.esDueno) {
      return { modo: 'aceptar', motivo: 'es el dueño del ámbito personal/perfil' };
    } else {
      return { modo: 'sin-permiso', motivo: 'no es el dueño del ámbito personal/perfil' };
    }
  }

  // Para ámbitos grupo y pública, tratamos como grupo (según la especificación)
  // 'publica' → como grupo
  const esGrupo = e.ambito === 'grupo' || e.ambito === 'publica';
  if (!esGrupo) {
    // Esto no debería pasar dado los valores de Ambito, pero por seguridad
    return { modo: 'sin-permiso', motivo: 'ámbito no reconocido' };
  }

  // Para grupo, usamos decidirAplicacion de génesis
  const rango = e.rol ? rangoDeRol(e.rol) : 0;
  const democratico = e.democratico ?? false;

  // Convertir nuestro Ambito (string) al Ambito de génesis
  // Para grupo y pública, siempre es tipo entidad (no persona)
  const genesisAmbito: GenesisAmbito = {
    tipo: "entidad",
    entidad: {
      tipo: "pagina", // Puede ser página o grupo, pero la función no usa el entidad.tipo
      id: "dummy",
      slug: "dummy",
      nombre: "dummy",
    } as EntidadAmbito,
  };

  const { modo: modoAplicacion, motivo: motivoAplicacion } = decidirAplicacion(
    genesisAmbito,
    rango,
    democratico
  );

  // Mapeamos los modos de decidirAplicacion a los modos de ProtoGenesis
  switch (modoAplicacion) {
    case 'aplicar':
      return { modo: 'aceptar', motivo: motivoAplicacion };
    case 'proponer':
      return { modo: 'proponer-voto', motivo: motivoAplicacion };
    case 'sin-permiso':
      return { modo: 'sin-permiso', motivo: motivoAplicacion };
    default:
      return { modo: 'sin-permiso', motivo: 'modo de aplicación desconocido' };
  }
}

/**
 * Crea una propuesta de tarea para MetaGenesis cuando falta algo en la molécula.
 * 
 * @param encargo - El encargo original de ProtoGenesis
 * @param falta - Lo que falta para completar el encargo
 *   - tipo: 'atomo' | 'conversor' | 'otro'
 *   - detalle: descripción detallada de lo que falta
 * 
 * @returns Objeto con:
 *   - id: string (PGM + 8 caracteres de hash estable)
 *   - titulo: string
 *   - archivos: string[] (vacío, lo pone MetaGenesis)
 *   - depende: string[] (vacío, lo pone MetaGenesis)
 *   - prompt: string (sin la intención si el ámbito es 'personal')
 */
export function propuestaMetaGenesis(
  encargo: Encargo,
  falta: { tipo: 'atomo' | 'conversor' | 'otro'; detalle: string }
): {
  id: string;
  titulo: string;
  archivos: string[];
  depende: string[];
  prompt: string;
} {
  // Crear un hash estable basado en el encargo y lo que falta
  // Para simplificar, usamos una función de hash básica (en un entorno real se usaría algo como SHA-256)
  const hash = crearHashEstable(JSON.stringify({ encargo, falta }));
  const id = `PGM${hash.substring(0, 8)}`;

  // El título se basa en el tipo de falta
  let titulo = '';
  switch (falta.tipo) {
    case 'atomo':
      titulo = `Átomo faltante: ${falta.detalle}`;
      break;
    case 'conversor':
      titulo = `Conversor faltante: ${falta.detalle}`;
      break;
    case 'otro':
      titulo = `Otro recurso faltante: ${falta.detalle}`;
      break;
  }

  // El prompt: si el ámbito es 'personal', no incluimos la intención
  // Según la especificación: "un prompt que NO incluye la intención si el ámbito es 'personal' (solo el tipo de lo que falta)"
  const prompt = encargo.ambito === 'personal' 
    ? `Falta: ${falta.detalle}`
    : `Intencion: ${encargo.intencion}. Falta: ${falta.detalle}`;

  return {
    id,
    titulo,
    archivos: [], // lo pone MetaGenesis
    depende: [],  // lo pone MetaGenesis
    prompt,
  };
}

/**
 * Función auxiliar para crear un hash estable simple.
 * En un entorno de producción se usaría una librería criptográfica, pero aquí simulamos.
 */
function crearHashEstable(input: string): string {
  // Implementación sencilla de hash (no criptográfica) para demostrar el concepto
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convertir a hexadecimal y asegurar que sea positivo
  return ((hash < 0 ? -hash : hash) >>> 0).toString(16);
}