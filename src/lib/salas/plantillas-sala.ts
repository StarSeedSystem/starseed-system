/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Salas (Ola 307) — plantillas de sala para cualquier propósito.
 * ---------------------------------------------------------------------------
 * Una sala vacía con un botón «añadir elemento» no la usa nadie. Lo que hace
 * que un grupo empiece es abrir algo que YA tiene la forma de lo que van a
 * hacer: la asamblea con sus columnas, el círculo de paz con su relato y su
 * reparación, el aula con su pizarra y sus materiales.
 *
 * Cada plantilla trae andamios VACÍOS con su rótulo — nunca contenido de
 * ejemplo inventado (regla de datos honestos, §6 singularidad del contenido).
 *
 * Módulo PURO: sin red, sin disco, sin `node:*`. Sólo describe y construye.
 * El contrato de la sala vive en `@/lib/salas/sala`; aquí sólo se usa.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { RolSala, Sala, TipoSala } from "@/lib/salas/sala";

/**
 * Un andamio dentro de la plantilla. `tipo` es una capacidad del tipo de sala
 * (las que declara `CAPACIDADES_POR_TIPO` en `@/lib/salas/sala`: la pizarra
 * admite notas, formas y trazos; el dashboard, widgets; la escena 3D y la XR,
 * objetos, anclas y avatares). `datos` lleva el rótulo y la marca de vacío,
 * jamás contenido simulado.
 */
export interface ElementoPlantilla {
    tipo: string;
    datos: Record<string, unknown>;
}

/** Una sala ya formada, lista para abrirse en un clic. */
export interface PlantillaSala {
    id: string;
    nombre: string;
    proposito: string;
    tipo: TipoSala;
    visibilidadSugerida: Sala["visibilidad"];
    elementos: ElementoPlantilla[];
    /**
     * Función dentro de la sala → rol que le conviene. No son identidades:
     * la UI las ofrece al invitar, y quien invita decide a quién da cada rol.
     */
    rolesSugeridos: Record<string, RolSala>;
    /** Para qué sirve, en una frase. La UI la enseña al elegir. */
    porque: string;
}

/** Andamio vacío con rótulo: el único contenido honesto de una plantilla. */
function andamio(
    tipo: string,
    rotulo: string,
    extra: Record<string, unknown> = {},
): ElementoPlantilla {
    return { tipo, datos: { rotulo, vacio: true, ...extra } };
}

/**
 * Las plantillas que el OS ofrece al crear una sala. Ancladas en los tres
 * ecosistemas de CLAUDE.md §4 — político (asamblea, círculo de paz, mapa de
 * comunidad), educativo (aula), cultural (taller creativo) — y en el trabajo
 * real de la red (panel de proyecto, escritorio de equipo, retrospectiva).
 */
export const PLANTILLAS: PlantillaSala[] = [
    {
        id: "asamblea",
        nombre: "Asamblea",
        proposito: "Deliberar una propuesta y llegar a acuerdos entre todas",
        tipo: "pizarra",
        visibilidadSugerida: "grupo",
        elementos: [
            andamio("notas", "Propuesta"),
            andamio("notas", "Argumentos a favor"),
            andamio("notas", "Argumentos en contra"),
            andamio("notas", "Dudas por resolver"),
            andamio("notas", "Acuerdos"),
        ],
        rolesSugeridos: {
            facilitacion: "editor",
            participantes: "comentarista",
            publico: "observador",
        },
        porque:
            "Separa la propuesta de sus argumentos y de las dudas, para que la asamblea discuta una cosa cada vez y termine con acuerdos escritos.",
    },
    {
        id: "circulo-de-paz",
        nombre: "Círculo de paz",
        proposito: "Reparar un daño escuchando a quien lo sufrió y a quien lo causó",
        tipo: "pizarra",
        visibilidadSugerida: "privada",
        elementos: [
            andamio("notas", "Qué pasó (relato de cada parte)"),
            andamio("notas", "Impacto: a quién y en qué le afectó"),
            andamio("notas", "Reparación propuesta"),
            andamio("notas", "Acuerdos de cuidado y seguimiento"),
        ],
        rolesSugeridos: {
            facilitacion: "editor",
            partes: "comentarista",
            acompanamiento: "observador",
        },
        porque:
            "Justicia restaurativa (§6): nace PRIVADA porque el relato de un daño es de quien lo vive, no de la red; sólo salen de aquí los acuerdos que las partes decidan compartir.",
    },
    {
        id: "aula",
        nombre: "Aula",
        proposito: "Dar y seguir una clase con materiales a mano",
        tipo: "pizarra",
        visibilidadSugerida: "grupo",
        elementos: [
            andamio("notas", "Qué vamos a aprender hoy"),
            andamio("formas", "Espacio de explicación"),
            andamio("notas", "Materiales de la Biblioteca", { fuente: "biblioteca" }),
            andamio("notas", "Preguntas de la clase"),
            andamio("notas", "Para practicar"),
        ],
        rolesSugeridos: {
            docencia: "editor",
            estudiantes: "comentarista",
            familias: "observador",
        },
        porque:
            "Deja la explicación y los materiales de la Biblioteca en la misma sala, y da un sitio fijo a las preguntas para que nadie se quede fuera.",
    },
    {
        id: "taller-creativo",
        nombre: "Taller creativo",
        proposito: "Crear y montar piezas juntas en un espacio 3D",
        tipo: "escena3d",
        visibilidadSugerida: "grupo",
        elementos: [
            andamio("objetos", "Piezas en curso"),
            andamio("anclas", "Zona de montaje"),
            andamio("objetos", "Referencias y bocetos"),
            andamio("avatares", "Puestos del taller"),
        ],
        rolesSugeridos: {
            taller: "editor",
            aprendices: "comentarista",
            visitas: "observador",
        },
        porque:
            "Da volumen al trabajo cultural: las piezas se ven y se mueven en el mismo espacio, y cada quien tiene su puesto sin pisar el de al lado.",
    },
    {
        id: "panel-de-proyecto",
        nombre: "Panel de proyecto",
        proposito: "Ver de un vistazo cómo va un proyecto del grupo",
        tipo: "dashboard",
        visibilidadSugerida: "grupo",
        elementos: [
            andamio("widgets", "Objetivo del proyecto"),
            andamio("widgets", "Tareas en curso"),
            andamio("widgets", "Próximo hito"),
            andamio("widgets", "Bloqueos y riesgos"),
            andamio("widgets", "Recursos disponibles"),
        ],
        rolesSugeridos: {
            coordinacion: "editor",
            equipo: "editor",
            interesadas: "observador",
        },
        porque:
            "Reúne en una pantalla lo que el grupo necesita decidir hoy — qué falta, qué bloquea y con qué se cuenta — sin abrir cinco herramientas.",
    },
    {
        id: "escritorio-de-equipo",
        nombre: "Escritorio compartido de equipo",
        proposito: "Trabajar en los mismos documentos y ventanas a la vez",
        tipo: "escritorio",
        visibilidadSugerida: "grupo",
        elementos: [
            andamio("ventanas", "Ventana de trabajo compartida"),
            andamio("archivos", "Documentos del equipo"),
            andamio("ventanas", "Notas del turno"),
        ],
        rolesSugeridos: {
            equipo: "editor",
            apoyo: "comentarista",
            invitadas: "observador",
        },
        porque:
            "El equipo abre el mismo escritorio en vez de mandarse copias: lo que toca una persona lo ven las demás, y los archivos viven en un solo sitio.",
    },
    {
        id: "mapa-de-comunidad",
        nombre: "Mapa de comunidad",
        proposito: "Situar sobre el territorio lo que la comunidad tiene y necesita",
        tipo: "xr",
        visibilidadSugerida: "publica",
        elementos: [
            andamio("anclas", "Lugares del territorio"),
            andamio("objetos", "Recursos y bienes comunes"),
            andamio("objetos", "Necesidades detectadas"),
            andamio("avatares", "Quién acompaña cada zona"),
        ],
        rolesSugeridos: {
            cartografia: "editor",
            vecindario: "comentarista",
            red: "observador",
        },
        porque:
            "Un mapa en AR se recorre con el cuerpo y en el sitio: la comunidad marca dónde está cada recurso y cada necesidad, y cualquiera de la red puede mirarlo.",
    },
    {
        id: "retrospectiva",
        nombre: "Retrospectiva",
        proposito: "Mirar atrás un tramo de trabajo y decidir qué cambiar",
        tipo: "pizarra",
        visibilidadSugerida: "grupo",
        elementos: [
            andamio("notas", "Qué funcionó"),
            andamio("notas", "Qué no funcionó"),
            andamio("notas", "Qué probamos la próxima vez"),
            andamio("notas", "Compromisos concretos"),
        ],
        rolesSugeridos: {
            facilitacion: "editor",
            equipo: "editor",
            invitadas: "observador",
        },
        porque:
            "Convierte la queja suelta en un cambio acordado: tres columnas para hablar y una cuarta donde el grupo se compromete a algo concreto.",
    },
];

/** Palabras que no distinguen nada al buscar propósito. */
const PALABRAS_VACIAS = new Set([
    "para", "con", "sin", "una", "uno", "unos", "unas", "los", "las", "del",
    "que", "por", "sobre", "como", "entre", "quiero", "necesito", "hacer",
    "sala", "grupo", "gente", "este", "esta", "nuestro", "nuestra", "mis",
]);

/** Minúsculas y sin acentos: «Asamblea» y «asamblea» buscan lo mismo. */
export function normalizar(texto: string): string {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function palabras(texto: string): string[] {
    return normalizar(texto)
        .split(/[^a-z0-9]+/)
        .filter((p) => p.length >= 3 && !PALABRAS_VACIAS.has(p));
}

/**
 * Las capacidades que una plantilla necesita del tipo de sala. La UI (y el
 * contrato `CAPACIDADES_POR_TIPO` de `@/lib/salas/sala`) comprueba con esto
 * que la sala puede sostener sus andamios antes de ofrecerla.
 */
export function capacidadesRequeridas(plantilla: PlantillaSala): string[] {
    return [...new Set(plantilla.elementos.map((e) => e.tipo))];
}

/** Todo el texto por el que una plantilla puede encontrarse. */
function texto(plantilla: PlantillaSala): string[] {
    const rotulos = plantilla.elementos.map((e) =>
        typeof e.datos.rotulo === "string" ? e.datos.rotulo : "",
    );
    return palabras(
        [plantilla.id, plantilla.nombre, plantilla.proposito, plantilla.porque, ...rotulos].join(" "),
    );
}

/**
 * Cuánto se parece una plantilla a lo que la persona escribió. Coincidir en el
 * nombre pesa más que coincidir en la descripción, y las primeras palabras de
 * la consulta pesan más que las últimas: al escribir «una retrospectiva del
 * equipo» se está pidiendo una retrospectiva, no un escritorio de equipo.
 */
function afinidad(plantilla: PlantillaSala, consulta: string): number {
    const buscadas = palabras(consulta);
    if (buscadas.length === 0) return 0;
    const propias = texto(plantilla);
    const nombre = palabras(`${plantilla.id} ${plantilla.nombre}`);
    let puntos = 0;
    buscadas.forEach((palabra, orden) => {
        const peso = buscadas.length - orden;
        if (nombre.includes(palabra)) puntos += 3 * peso;
        else if (propias.includes(palabra)) puntos += 2 * peso;
        else if (propias.some((p) => p.startsWith(palabra) || palabra.startsWith(p))) puntos += peso;
    });
    return puntos;
}

/**
 * Filtra por tipo de sala y ordena por afinidad con el propósito escrito por
 * la persona (sin acentos ni mayúsculas). No descarta por propósito: mueve lo
 * probable arriba y deja el resto a la vista, porque quien crea la sala sabe
 * mejor que nosotras lo que va a hacer en ella.
 */
export function plantillasPara(tipo?: TipoSala, proposito?: string): PlantillaSala[] {
    const candidatas = tipo ? PLANTILLAS.filter((p) => p.tipo === tipo) : [...PLANTILLAS];
    const consulta = (proposito ?? "").trim();
    if (consulta === "") return candidatas;
    return candidatas
        .map((plantilla, orden) => ({ plantilla, orden, puntos: afinidad(plantilla, consulta) }))
        .sort((a, b) => (b.puntos - a.puntos) || (a.orden - b.orden))
        .map((c) => c.plantilla);
}

/**
 * Construye una `Sala` real a partir de la plantilla. Nace en `local`: quien
 * abre la sala aún no sabe qué caminos hay, y `elegirTransporte` decidirá con
 * la alcanzabilidad de verdad. Los `rolesSugeridos` NO entran en `miembros`:
 * son funciones, no identidades — la UI las usa al invitar.
 */
export function desdePlantilla(
    plantilla: PlantillaSala,
    id: string,
    dueno: string,
    ahora: number,
): Sala {
    return {
        id,
        tipo: plantilla.tipo,
        titulo: plantilla.nombre,
        visibilidad: plantilla.visibilidadSugerida,
        transporte: "local",
        miembros: { [dueno]: "dueno" },
        creadaEn: ahora,
        proposito: plantilla.proposito,
    };
}
