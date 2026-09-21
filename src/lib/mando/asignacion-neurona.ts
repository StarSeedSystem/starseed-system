// src/lib/mando/asignacion-neurona.ts
// -----------------------------------------------------------------------------
// Decisión de asignación: a qué neurona debería ir cada tarea y por qué.
// Módulo PURO: no abre sockets, no lee disco, no mira el reloj — quien llama
// pasa el estado ya medido y aplica la decisión. Así la preferencia de Alex se
// puede auditar y probar sin tocar la Mac ni la nube.
// -----------------------------------------------------------------------------

/** Lo mínimo que hay que saber de una tarea para colocarla. */
export interface TareaAsignable {
    id: string;
    /** Motor de modelo que necesita, p. ej. "ollama" o "gemini". Vacío: cualquiera. */
    motor: string;
}

/** Vista pública de una neurona, ya con su estado medido fuera de aquí. */
export interface NeuronaOpcion {
    id: string;
    /** Tipo de ubicación: decide el desempate por cercanía. */
    tipo: "esta máquina" | "motor local" | "nube";
    /** Si no responde, no cabe nada: asignarle es tirar la tarea. */
    responde: boolean;
    /** Motores disponibles; vacío significa «acepta cualquiera». */
    motores: string[];
    /** Tareas que ya lleva: a más carga, menos candidata. */
    carga: number;
}

export interface Asignacion {
    idTarea: string;
    neurona: string;
    motivo: string;
    /** true solo si Alex la eligió a mano y esa neurona está viva. */
    forzada: boolean;
}

function candidatas(tarea: TareaAsignable, neuronas: NeuronaOpcion[]): NeuronaOpcion[] {
    return neuronas.filter(
        (n) => n.responde && (n.motores.length === 0 || !tarea.motor || n.motores.includes(tarea.motor)),
    );
}

// Cercanía: en empate de carga gana la máquina delante de Alex. Un proceso en
// local no paga red ni espera cola de nube; la nube es la última opción porque
// añade latencia y coste sin ventaja si la local está igual de libre.
const CERCANIA: Record<NeuronaOpcion["tipo"], number> = {
    "esta máquina": 0,
    "motor local": 1,
    nube: 2,
};

export function elegirNeurona(
    tarea: TareaAsignable,
    neuronas: NeuronaOpcion[],
    preferencia?: string,
): Asignacion {
    const elegida = preferencia ? neuronas.find((n) => n.id === preferencia) : undefined;
    if (elegida?.responde && (!tarea.motor || elegida.motores.length === 0 || elegida.motores.includes(tarea.motor))) {
        return {
            idTarea: tarea.id, neurona: elegida.id, forzada: true,
            motivo: `preferencia de Alex: ${elegida.id} responde y tiene el motor`,
        };
    }
    const motivoCaida = preferencia
        ? !elegida
            ? `la preferencia «${preferencia}» no existe; `
            : `la preferencia «${preferencia}» no responde o le falta el motor; `
        : "";
    const vivas = candidatas(tarea, neuronas);
    if (vivas.length === 0) {
        return {
            idTarea: tarea.id, neurona: "", forzada: false,
            motivo: `${motivoCaida}ninguna neurona responde con el motor necesario`,
        };
    }
    // Orden estable: menos carga primero y, a igual carga, la más cercana.
    const mejor = [...vivas].sort((a, b) => a.carga - b.carga || CERCANIA[a.tipo] - CERCANIA[b.tipo])[0];
    return {
        idTarea: tarea.id, neurona: mejor.id, forzada: false,
        motivo: `${motivoCaida}${mejor.id} responde, tiene el motor y lleva menos procesos (${mejor.carga})`,
    };
}

// Reparte una tanda sin amontonar: simula la carga acumulada asignando de una
// en una, así la segunda tarea ya «ve» ocupada la neurona que ganó la primera.
export function reparto(tareas: TareaAsignable[], neuronas: NeuronaOpcion[]): Asignacion[] {
    const carga = new Map(neuronas.map((n) => [n.id, n.carga]));
    return tareas.map((t) => {
        const vista = neuronas.map((n) => ({ ...n, carga: carga.get(n.id) ?? n.carga }));
        const asignacion = elegirNeurona(t, vista);
        if (asignacion.neurona) carga.set(asignacion.neurona, (carga.get(asignacion.neurona) ?? 0) + 1);
        return asignacion;
    });
}
