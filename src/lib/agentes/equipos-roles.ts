// Equipos por roles como DATOS (forma CrewAI). Cualquier motor intercambiable del
// contrato de agentes puede ejecutar el mismo equipo, y el validador impide que se
// salte las reglas del OS: interfaz como dato, visto bueno humano, grupo público sin
// escritura ni internet. Módulo PURO: sin `node:*`, sin red, sin disco ni reloj.
import { catalogoDeclarado } from "./taller";
import { MOTORES } from "./reparto-motores";
import { tieneSecreto } from "@/lib/astraura-bots/acciones";

export type ContextoEquipo = "publicaciones" | "apps" | "protogenesis";

export type RolEquipo = {
  id: string;
  rol: string;
  objetivo: string;
  historia: string;
  herramientas: string[];
  internet: boolean;
  escribe: boolean;
  verifica: boolean;
};

export type TareaEquipo = {
  id: string;
  descripcion: string;
  rol: string;
  depende: string[];
  salidaEsperada: string;
};

export type EquipoRoles = {
  id: string;
  nombre: string;
  contexto: ContextoEquipo;
  proceso: "secuencial" | "jerarquico";
  roles: RolEquipo[];
  tareas: TareaEquipo[];
  motoresValidos: string[];
  revisionHumana: boolean;
};

export type AmbitoEquipo = "personal" | "grupo-publico" | "grupo-privado";

const rol = (
  id: string, etiqueta: string, objetivo: string, historia: string,
  herramientas: string[], internet = false, escribe = false, verifica = false,
): RolEquipo => ({ id, rol: etiqueta, objetivo, historia, herramientas, internet, escribe, verifica });

const tarea = (
  id: string, descripcion: string, rolId: string, depende: string[], salidaEsperada: string,
): TareaEquipo => ({ id, descripcion, rol: rolId, depende, salidaEsperada });

export const EQUIPOS_BASE: EquipoRoles[] = [
  {
    id: "publicacion", nombre: "Publicación con visto bueno humano",
    contexto: "publicaciones", proceso: "secuencial", revisionHumana: true,
    motoresValidos: ["nativo", "crewai"],
    roles: [
      rol("investigador", "Investigador", "Reunir fuentes fiables y contrastarlas",
        "Busca en la web y cita cada afirmación con su enlace.",
        ["astraura:crawl", "prompt:investigar"], true),
      rol("redactor", "Redactor", "Escribir con la voz del canal",
        "Conoce la cadencia y el formato de la personalidad del canal.",
        ["prompt:canal"]),
      rol("revisor", "Revisor", "Verificar rigor y dejar el borrador listo",
        "Separa lo bloqueante de lo opinable y nunca publica por su cuenta.",
        [], false, false, true),
    ],
    tareas: [
      tarea("investigar", "Buscar y contrastar al menos dos fuentes", "investigador", [],
        "Fichas con fuentes y lo que no se pudo verificar"),
      tarea("redactar", "Escribir el borrador con la voz del canal", "redactor", ["investigar"],
        "Borrador con citas y formato del canal"),
      tarea("revisar", "Revisar el borrador antes de cualquier publicación", "revisor", ["redactar"],
        "Borrador listo para visto bueno humano, nunca publicado"),
    ],
  },
  {
    id: "app-widget", nombre: "App o widget como UiSpec",
    contexto: "apps", proceso: "secuencial", revisionHumana: true,
    motoresValidos: ["nativo", "crewai", "deepcode"],
    roles: [
      rol("arquitecto", "Arquitecto", "Diseñar la app con el vocabulario del OS",
        "Planifica por olas y consulta la Biblioteca antes de inventar.",
        ["prompt:ola", "astraura:biblioteca"]),
      rol("constructor", "Constructor", "Producir la UiSpec pedida",
        "Entrega datos de interfaz, nunca código que se ejecute en el OS.",
        []),
      rol("verificador", "Verificador", "Revisar que la UiSpec respeta el vocabulario cerrado",
        "Comprueba el resultado contra las reglas antes de darlo por bueno.",
        ["prompt:revisar"], false, false, true),
    ],
    tareas: [
      tarea("disenar", "Diseñar la pantalla y su estructura", "arquitecto", [],
        "Plan de pantalla con vocabulario del OS"),
      tarea("construir", "Construir la interfaz como dato", "constructor", ["disenar"],
        "UiSpec de vocabulario cerrado, nunca código ejecutable"),
      tarea("verificar", "Verificar la UiSpec entregada", "verificador", ["construir"],
        "UiSpec revisada, con los problemas separados de lo opinable"),
    ],
  },
  {
    id: "atomo-proto", nombre: "Átomo de ProtoGenesis",
    contexto: "protogenesis", proceso: "jerarquico", revisionHumana: false,
    motoresValidos: ["nativo", "crewai", "langgraph"],
    roles: [
      rol("director", "Director", "Decidir el nivel donde vive la molécula",
        "Coordina el equipo jerárquico y elige la escala del átomo.", ["prompt:ola"]),
      rol("agente-atomo", "Agente del átomo", "Crear el átomo en el nivel decidido",
        "Ejecuta la creación dentro del nivel que fija el director.", []),
      rol("verificador", "Verificador", "Comprobar el átomo creado",
        "Valida que el átomo cumple su forma antes de integrarlo.",
        ["prompt:revisar"], false, false, true),
    ],
    tareas: [
      tarea("planificar", "Decidir el nivel y la forma del átomo", "director", [],
        "Nivel elegido y plan del átomo"),
      tarea("crear-atomo", "Crear el átomo en el nivel decidido", "agente-atomo", ["planificar"],
        "Átomo creado en el nivel asignado"),
      tarea("verificar-atomo", "Verificar el átomo antes de integrarlo", "verificador", ["crear-atomo"],
        "Átomo verificado o devuelto con sus problemas"),
    ],
  },
];

/** Orden topológico estable (Kahn por declaración); si hay ciclo, los ids sin resolver. */
export function ordenDeTareas(e: EquipoRoles): string[] | { ciclo: string[] } {
  const hechas = new Set<string>();
  const orden: string[] = [];
  while (orden.length < e.tareas.length) {
    const siguiente = e.tareas.find(
      (t) => !hechas.has(t.id) && t.depende.every((d) => hechas.has(d)),
    );
    if (!siguiente) break;
    hechas.add(siguiente.id);
    orden.push(siguiente.id);
  }
  if (orden.length < e.tareas.length) {
    return { ciclo: e.tareas.filter((t) => !hechas.has(t.id)).map((t) => t.id) };
  }
  return orden;
}

/** Problemas del equipo en español; lista vacía significa válido. */
export function validarEquipo(e: EquipoRoles, opciones?: { ambito?: AmbitoEquipo }): string[] {
  const problemas: string[] = [];
  const ambito = opciones?.ambito ?? "personal";
  const idsRol = new Set<string>();
  for (const r of e.roles) {
    if (idsRol.has(r.id)) problemas.push(`rol repetido: ${r.id}`);
    idsRol.add(r.id);
  }
  const idsTarea = new Set<string>();
  for (const t of e.tareas) {
    if (idsTarea.has(t.id)) problemas.push(`tarea repetida: ${t.id}`);
    idsTarea.add(t.id);
  }
  for (const t of e.tareas) {
    if (!idsRol.has(t.rol)) problemas.push(`la tarea ${t.id} apunta al rol inexistente ${t.rol}`);
    for (const d of t.depende) {
      if (!idsTarea.has(d)) problemas.push(`la tarea ${t.id} depende de una tarea inexistente: ${d}`);
    }
  }
  const orden = ordenDeTareas(e);
  if (!Array.isArray(orden)) {
    problemas.push(`hay un ciclo entre tareas: ${orden.ciclo.join(", ")}`);
  } else {
    const verificadores = new Set(e.roles.filter((r) => r.verifica).map((r) => r.id));
    if (verificadores.size === 0) problemas.push("ningún rol verifica");
    const ultima = e.tareas.find((t) => t.id === orden[orden.length - 1]);
    if (ultima && !verificadores.has(ultima.rol)) {
      problemas.push(`la última tarea (${ultima.id}) no es de un rol que verifica`);
    }
  }
  const idsCatalogo = new Set(catalogoDeclarado().map((r) => r.id));
  for (const r of e.roles) {
    for (const h of r.herramientas) {
      if (!idsCatalogo.has(h)) problemas.push(`herramienta no declarada en el taller: ${h} (rol ${r.id})`);
    }
  }
  if ((e.contexto === "publicaciones" || e.contexto === "apps") && !e.revisionHumana) {
    problemas.push(`el contexto ${e.contexto} exige revisión humana`);
  }
  if (e.motoresValidos.length === 0) problemas.push("motoresValidos está vacío");
  for (const id of e.motoresValidos) {
    const motor = MOTORES[id];
    if (!motor) { problemas.push(`motor inexistente: ${id}`); continue; }
    if (motor.estado === "referencia") problemas.push(`motor de referencia no válido: ${id}`);
  }
  if (ambito === "grupo-publico") {
    for (const r of e.roles) {
      if (r.escribe) problemas.push(`en grupo público el rol ${r.id} no puede escribir`);
      if (r.internet) problemas.push(`en grupo público el rol ${r.id} no puede salir a internet`);
    }
  }
  const textos: Array<[string, string]> = [[e.nombre, "el nombre"]];
  for (const r of e.roles) {
    textos.push([r.objetivo, `el objetivo del rol ${r.id}`], [r.historia, `la historia del rol ${r.id}`]);
  }
  for (const t of e.tareas) {
    textos.push([t.descripcion, `la descripción de ${t.id}`], [t.salidaEsperada, `la salida de ${t.id}`]);
  }
  for (const [texto, donde] of textos) {
    if (tieneSecreto(texto)) problemas.push(`hay algo con forma de secreto en ${donde}`);
  }
  return problemas;
}
