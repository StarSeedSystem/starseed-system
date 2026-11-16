/* src/lib/traductor/conversacion.ts */
export type Speaker = "A" | "B";

export interface Turn {
    quien: Speaker;
    texto: string;
    traduccion?: string;
    msReconocer: number;
    msTraducir: number;
    msHablar: number;
}

export type State =
    | "INACTIVO"
    | "ESCUCHANDO_A"
    | "TRADUCIR_A"
    | "HABLANDO_B"
    | "ESCUCHANDO_B"
    | "TRADUCIR_B"
    | "HABLANDO_A";

export interface Conversacion {
    estado: State;
    turno?: Turn;
    encolados: Turn[];
}

export const inicial: Conversacion = {
    estado: "INACTIVO",
    encolados: [],
};

export function pulsarHablar(m: Conversacion, quien: Speaker): void {
    // If the machine is speaking, enqueue
    if (m.estado.startsWith("HABLANDO")) {
        m.encolados.push({
            quien,
            texto: "",
            msReconocer: 0,
            msTraducir: 0,
            msHablar: 0,
        });
        return;
    }
    if (m.estado !== "INACTIVO") return;
    m.estado = quien === "A" ? "ESCUCHANDO_A" : "ESCUCHANDO_B";
    m.turno = {
        quien,
        texto: "",
        msReconocer: 0,
        msTraducir: 0,
        msHablar: 0,
    };
}

export function resultadoParcial(m: Conversacion, texto: string): void {
    if (!m.turno) return;
    m.turno.texto = texto;
    m.turno.msReconocer = 100; // dummy value
}

export function resultadoFinal(m: Conversacion, texto: string): void {
    if (!m.turno) return;
    m.turno.texto = texto;
    m.turno.msReconocer = 120; // dummy value
    const quien = m.turno.quien;
    m.estado = quien === "A" ? "TRADUCIR_A" : "TRADUCIR_B";
}

export function traducionLista(m: Conversacion, traduccion: string): void {
    if (!m.turno) return;
    m.turno.traduccion = traduccion;
    m.turno.msTraducir = 150; // dummy value
    // speak the other speaker
    const siguiente = m.turno.quien === "A" ? "B" : "A";
    m.estado = siguiente === "A" ? "HABLANDO_A" : "HABLANDO_B";
    m.turno.msHablar = 200; // dummy value
}

export function finDeVoz(m: Conversacion): void {
    if (!m.turno) return;
    m.turno.msHablar = 200; // dummy value
    const siguiente = m.turno.quien === "A" ? "B" : "A";
    // If there are pending turns, start the first queued turn
    if (m.encolados.length > 0) {
        const encola = m.encolados.shift()!;
        m.turno = encola;
        m.estado = encola.quien === "A" ? "ESCUCHANDO_A" : "ESCUCHANDO_B";
    } else {
        m.turno = undefined;
        m.estado = `ESCUCHANDO_${siguiente}` as State;
    }
}

export function error(m: Conversacion, motivo: string): void {
    if (!m.turno) return;
    m.turno.traduccion = `error: ${motivo}`;
    const siguiente = m.turno.quien === "A" ? "B" : "A";
    m.encolados = [];
    m.turno = undefined;
    m.estado = `ESCUCHANDO_${siguiente}` as State;
}
