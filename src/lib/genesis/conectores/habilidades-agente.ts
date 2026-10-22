/**
 * Habilidades de la Biblioteca para los agentes de Genesis y PoliGenesis.
 * Ola 1019G (GCA1019Wc) · architecture/genesis-conectores-abiertos.md §6, §10 ·
 * architecture/laya-y-habilidades.md §5.
 *
 * PURO: recibe las capacidades vivas (`SkillCapability` de src/ai/astraura/skills.ts)
 * y decide, para cada papel o director, cuáles son útiles (por `routing` y por
 * etiquetas) y en qué tamaño: tarjeta ≤ 60 palabras para Needle y BitNet,
 * resumen ≤ 250 para Bonsai 1,7–4B y completa para razón, profunda y nube.
 * Sin red, sin reloj y sin almacenamiento: todo entra por parámetros.
 */
import type { SkillCapability } from "@/ai/astraura/skills";

/** Tamaño del texto según la capa del modelo que lo va a leer. */
export type CapaModelo = "tarjeta" | "resumen" | "completa";

/** Banderas de routing que puede traer una capacidad. */
type Bandera = "preferStrong" | "web" | "vision" | "planning";
const BANDERAS: Bandera[] = ["preferStrong", "web", "vision", "planning"];

/** Qué hace que una habilidad sirva a un papel o director. */
interface Perfil {
  /** Banderas de `routing` que encajan con este papel o director. */
  banderas: Bandera[];
  /** Palabras que, presentes en la etiqueta o el id, bastan por sí solas. */
  etiquetas: string[];
}

/** Perfil para un papel o director desconocido: solo conocimiento de base. */
const PERFIL_DESCONOCIDO: Perfil = { banderas: [], etiquetas: [] };

/**
 * Perfiles de papeles de agente y de directores (§6 de
 * genesis-conectores-abiertos.md). Las palabras van en minúsculas CON su acento:
 * `toLowerCase()` conserva los acentos, así que «Diseño» matchea con «diseño».
 */
const PERFILES: Record<string, Perfil> = {
  escritor: { banderas: ["preferStrong", "web", "planning"], etiquetas: ["planific", "flujos", "receta"] },
  revisor: { banderas: ["preferStrong"], etiquetas: ["revisión", "auditoría", "seguridad", "grill"] },
  chat: { banderas: ["preferStrong", "web", "vision"], etiquetas: [] },
  visión: { banderas: ["vision"], etiquetas: ["vision", "imagen", "foto", "avatar"] },
  voz: { banderas: [], etiquetas: ["voz", "audio"] },
  imagen: { banderas: ["vision"], etiquetas: ["imagen", "audiovisual", "dibujo", "pizarra"] },
  código: { banderas: ["preferStrong", "planning"], etiquetas: ["código", "constructor", "desarrollo"] },
  optimizador: { banderas: ["preferStrong", "planning"], etiquetas: ["enrutad", "proxy", "router", "descubrimiento"] },
  diseno: { banderas: ["preferStrong"], etiquetas: ["diseño", "estética", "pizarra", "penpot", "interfaz"] },
  producción: { banderas: ["preferStrong", "planning"], etiquetas: ["vídeo", "edición", "flujos", "automatización", "receta"] },
  nube: { banderas: ["web", "planning"], etiquetas: ["nube", "despliegue", "self-host", "contenedor", "sincroniz"] },
  medidores: { banderas: ["web", "planning"], etiquetas: ["telemetría", "medición", "consumo", "monitor", "red"] },
  aprendizaje: { banderas: ["preferStrong", "planning"], etiquetas: ["aprendizaje", "enseñ", "memoria", "investigación", "rag"] },
};

/** Alias del director «diseno» escrito con acento. */
PERFILES["diseño"] = PERFILES["diseno"];

/** Etiquetas de deliberación colectiva: en un grupo o página (PoliGenesis)
 *  sirven a cualquier papel, porque deliberar es tarea de todos. */
const ETIQUETAS_DELIBERACION = ["consejo", "deliberación", "gobernanza"];
const AMBITOS_DELIBERATIVOS = new Set(["grupo", "página"]);

/** Recorta el prompt a las palabras que pide la capa (§5 laya-y-habilidades.md). */
function recortar(texto: string, capa: CapaModelo): string {
  if (capa === "completa") return texto;
  const max = capa === "tarjeta" ? 60 : 250;
  const palabras = texto.split(/\s+/).filter(Boolean);
  return palabras.length <= max ? texto : palabras.slice(0, max).join(" ") + "…";
}

/** ¿La etiqueta o el id contiene alguna palabra buscada? */
function porEtiqueta(cap: SkillCapability, palabras: string[]): boolean {
  const texto = `${cap.id} ${cap.label}`.toLowerCase();
  return palabras.some((palabra) => texto.includes(palabra));
}

/** ¿La capacidad sirve para el perfil? Sin routing es conocimiento de base:
 *  sirve a todos; si trae banderas encaja por papel o por etiqueta. */
function sirve(cap: SkillCapability, perfil: Perfil): boolean {
  const activas = BANDERAS.filter((b) => !!cap.routing?.[b]);
  if (activas.length === 0) return true;
  return (
    activas.some((b) => perfil.banderas.includes(b)) || porEtiqueta(cap, perfil.etiquetas)
  );
}

/**
 * Devuelve las habilidades útiles para un papel o director en un ámbito, con su
 * prompt al tamaño de la capa elegida, en el orden del manifiesto recibido.
 * En un grupo o página (PoliGenesis) la deliberación colectiva sirve a todos.
 */
export function habilidadesPara(
  papel: string,
  ambito: string,
  opciones: { capacidades: SkillCapability[]; desactivadas: string[] },
  capa: CapaModelo = "completa"
): SkillCapability[] {
  const apagadas = new Set(opciones.desactivadas);
  const perfil = PERFILES[papel.toLowerCase().trim()] ?? PERFIL_DESCONOCIDO;
  const deliberativo = AMBITOS_DELIBERATIVOS.has(ambito.toLowerCase().trim());
  const salida: SkillCapability[] = [];
  for (const cap of opciones.capacidades) {
    if (apagadas.has(cap.id)) continue;
    if (sirve(cap, perfil) || (deliberativo && porEtiqueta(cap, ETIQUETAS_DELIBERACION))) {
      salida.push({ ...cap, systemPrompt: recortar(cap.systemPrompt, capa) });
    }
  }
  return salida;
}
