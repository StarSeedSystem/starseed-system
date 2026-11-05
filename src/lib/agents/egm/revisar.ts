/**
 * EGM · REVISAR CON PECES — el cableado del contrato §2
 * (`architecture/repos-libreria-1104.md`): 2 a 3 peces (llamadas a modelos
 * gratuitos) que ven SOLO el artefacto y devuelven objeciones con gravedad;
 * aquí se combinan y se dicta el veredicto. Las llamadas de red entran
 * INYECTADAS (el patrón de `generacion-capas.ts`), así que la costura de
 * decisión es pura y se prueba sin red. Quien lo usa entrega sus peces:
 * Astraura y la Protomolécula antes de una respuesta larga o una creación.
 */
import {
  leerObjeciones,
  promptDePez,
  veredicto,
  type GravedadPez,
  type Objecion,
  type TipoArtefacto,
  type VeredictoPez,
} from "./peces";

/** Un pez: su nombre (para las notas) y su única llamada real. null = el modelo calló. */
export interface RevisorPez {
  nombre: string;
  contestar: (prompt: string) => Promise<string | null>;
}

export interface OpcionesRevision {
  /** Los peces (modelos gratuitos distintos). Sin peces no hay revisión. */
  peces: RevisorPez[];
  /** Qué es el artefacto: respuesta · plan · ola · página · app (por defecto «respuesta»). */
  tipo?: TipoArtefacto;
  /** Tope del artefacto entregado a cada pez (caracteres). */
  maxCaracteres?: number;
}

export interface RevisionPeces {
  /** Todas las objeciones de todos los peces: sin duplicar y con la gravedad primero. */
  objeciones: Objecion[];
  /** `{ pasa, bloqueantes }`: pasa si ninguna objeción es `bloquea`. */
  veredicto: VeredictoPez;
  /** Lo que dijo cada pez que contestó. */
  porPez: { pez: string; objeciones: Objecion[] }[];
  /** Peces que fallaron o callaron: se dice, no se finge que revisaron. */
  pecesSilenciosos: string[];
}

const ORDEN: Record<GravedadPez, number> = { bloquea: 0, importa: 1, menor: 2 };
const MAX_ARTEFACTO_POR_OMISION = 12_000;

const clave = (gravedad: GravedadPez, texto: string): string =>
  `${gravedad}: ${texto.toLowerCase().replace(/\s+/g, " ").trim()}`;

/** Combina las objeciones de varios peces: quita duplicados y ordena bloquea → menor. */
export function combinarObjeciones(grupos: Objecion[][]): Objecion[] {
  const vistas = new Set<string>();
  const todas: Objecion[] = [];
  for (const grupo of grupos) for (const o of grupo) {
    const c = clave(o.gravedad, o.texto);
    if (vistas.has(c)) continue;
    vistas.add(c);
    todas.push(o);
  }
  return todas.sort((a, b) => ORDEN[a.gravedad] - ORDEN[b.gravedad]);
}

/**
 * Pasa el artefacto a cada pez (en paralelo), lee sus objeciones con tolerancia
 * y combina. Un pez que lanza o calla NO rompe la revisión: queda anotado en
 * `pecesSilenciosos`. Nunca lanza.
 */
export async function revisarConPeces(
  artefacto: string,
  opciones: OpcionesRevision,
): Promise<RevisionPeces> {
  const tipo = opciones.tipo ?? "respuesta";
  const texto = artefacto.slice(0, opciones.maxCaracteres ?? MAX_ARTEFACTO_POR_OMISION);
  const prompt = promptDePez(texto, tipo);

  const porPez: RevisionPeces["porPez"] = [];
  const pecesSilenciosos: string[] = [];
  await Promise.all(
    opciones.peces.map(async (pez) => {
      let respuesta: string | null = null;
      try {
        respuesta = await pez.contestar(prompt);
      } catch {
        respuesta = null;
      }
      if (!respuesta) {
        pecesSilenciosos.push(pez.nombre);
        return;
      }
      // «Sin objeciones» también contestó: entra en porPez con su lista vacía;
      // solo un error o una respuesta vacía es pecesSilenciosos.
      porPez.push({ pez: pez.nombre, objeciones: leerObjeciones(respuesta) });
    }),
  );

  const objeciones = combinarObjeciones(porPez.map((p) => p.objeciones));
  return { objeciones, veredicto: veredicto(objeciones), porPez, pecesSilenciosos };
}
