/**
 * propuestas-automejora.ts — propuestas de código de Meta^n
 * (`starseed_memory_root/olas/propuestas-automejora/<fecha>.json`, contrato
 * `architecture/automejora-meta-n.md` §3 y §8 · MTN1027K2). PURA: sin disco, red
 * ni `node:*`. Una propuesta NUNCA se carga en caliente: «Mandar al enjambre» la
 * copia como tarea de `cola-automejora-<fecha>.json` y la marca enviada.
 */

export interface PropuestaAutomejora {
  archivo: string;
  id: string;
  capa: string;
  titulo: string;
  descripcion: string;
  fecha: string | null;
  archivos: string[];
  referenciaFuncion: string | null;
  enviada: boolean;
  descartada: boolean;
}

export interface TareaColaAutomejora {
  id: string;
  ola: string;
  titulo: string;
  archivos: string[];
  depende: string[];
  origen: string;
  prompt: string;
}

export interface ColaAutomejora {
  ola: string;
  tareas: TareaColaAutomejora[];
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const listaDeTextos = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

const listaDelArchivo = (crudo: unknown): unknown[] =>
  Array.isArray(crudo) ? crudo : esObjeto(crudo) && Array.isArray(crudo.propuestas) ? crudo.propuestas : [];

const idDePropuesta = (crudo: Record<string, unknown>, indice: number): string =>
  texto(crudo.task_id) ?? texto(crudo.id) ?? `p${indice + 1}`;

export function normalizarPropuesta(crudo: unknown, indice: number, archivo: string): PropuestaAutomejora | null {
  if (!esObjeto(crudo)) return null;
  const id = idDePropuesta(crudo, indice);
  const estado = texto(crudo.estado);
  return {
    archivo,
    id,
    capa: texto(crudo.capa) ?? "sin capa",
    titulo: texto(crudo.titulo) ?? texto(crudo.description) ?? id,
    descripcion: texto(crudo.description) ?? texto(crudo.prompt) ?? "",
    fecha: texto(crudo.fecha),
    archivos: listaDeTextos(crudo.archivos),
    referenciaFuncion: texto(crudo.referencia_funcion) ?? texto(crudo.referenciaFuncion),
    enviada: crudo.enviada === true || estado === "enviada",
    descartada: crudo.descartada === true || estado === "descartada",
  };
}

export function leerPropuestas(entradas: Array<{ archivo: string; crudo: unknown }>): PropuestaAutomejora[] {
  const salida: PropuestaAutomejora[] = [];
  for (const { archivo, crudo } of entradas) {
    listaDelArchivo(crudo).forEach((item, indice) => {
      const propuesta = normalizarPropuesta(item, indice, archivo);
      if (propuesta) salida.push(propuesta);
    });
  }
  return salida;
}

export function cambiarPropuesta(crudo: unknown, id: string, cambio: Record<string, unknown>): unknown | null {
  const lista = listaDelArchivo(crudo);
  if (lista.length === 0) return null;
  const indice = lista.findIndex((item, i) => esObjeto(item) && idDePropuesta(item, i) === id);
  if (indice < 0) return null;
  const item = lista[indice];
  if (!esObjeto(item)) return null;
  const nuevaLista = [...lista];
  nuevaLista[indice] = { ...item, ...cambio };
  return Array.isArray(crudo) ? nuevaLista : { ...(crudo as Record<string, unknown>), propuestas: nuevaLista };
}

export function marcarPropuestaEnviada(crudo: unknown, id: string, fecha: string): unknown | null {
  return cambiarPropuesta(crudo, id, { estado: "enviada", enviada: true, enviadaEn: fecha });
}

export function marcarPropuestaDescartada(crudo: unknown, id: string): unknown | null {
  return cambiarPropuesta(crudo, id, { estado: "descartada", descartada: true });
}

const INICIO = "Comprueba primero si sigue haciendo falta; si ya está resuelto, responde NO APLICA y no toques nada.";

export function tareaDePropuesta(propuesta: PropuestaAutomejora, fecha: string): TareaColaAutomejora {
  const archivos = propuesta.archivos.length > 0 ? propuesta.archivos : [
    `scripts/puente/ayudantes_${propuesta.capa}.py`, `scripts/puente/test_ayudantes_${propuesta.capa}.py`,
  ];
  const lineas = [INICIO, `Propuesta de la automejora Meta^n (capa ${propuesta.capa})${propuesta.fecha ? ` del ${propuesta.fecha}` : ""}.`];
  if (propuesta.descripcion) lineas.push(propuesta.descripcion);
  if (propuesta.referenciaFuncion) lineas.push(`Función de referencia: ${propuesta.referenciaFuncion}. Nunca se carga en caliente.`);
  lineas.push("Reglas: como mucho los archivos listados (≤ 3) y ≤ 120 líneas nuevas o cambiadas por archivo; módulos puros sin `node:*` si los importa el cliente; nada de claves ni rutas del disco; tipos con `bash scripts/enjambre/tsc-turno.sh`; solo las pruebas de lo que tocas.");
  return { id: propuesta.id, ola: `automejora-${fecha}`, titulo: propuesta.titulo, archivos, depende: [], origen: "automejora", prompt: lineas.join("\n\n") };
}

export function colaConTarea(crudo: unknown, tarea: TareaColaAutomejora, fecha: string): ColaAutomejora {
  const previas = listaDelArchivo(crudo).filter(esObjeto) as unknown as TareaColaAutomejora[];
  const yaEsta = previas.some((t) => t.id === tarea.id);
  return { ola: `automejora-${fecha}`, tareas: yaEsta ? previas : [...previas, tarea] };
}
