// Puntuación de relevancia de las aportaciones del Hub, extraída a módulo puro
// (SP092928): sustituye la relevancia inventada con Math.random por una señal
// determinista y honesta, derivada de la participación real. Sigue la regla de
// la Adenda 66 §8 de esa página: solo datos reales, nada fingido.

// Señales que ya existen de verdad en cada aportación: los voluntarios
// inscritos (participación real), la urgencia declarada por quien publicó y la
// coordinación que ha surgido alrededor de la solicitud (canal creado, evento
// agendado, meta del grupo cumplida).
export interface AportacionEvaluada {
    members: { name: string }[];
    urgencyVal: number;
    messagingGroupCreated: boolean;
    goalsAchieved: boolean;
    calendarItemId?: string;
}

// Peso de cada voluntario inscrito; con 10 se cubre el tramo completo (60).
const PESO_POR_VOLUNTARIO = 6;
// Peso por nivel de urgencia declarado (1 Bajo … 4 Crítico → hasta 16).
const PESO_POR_NIVEL_DE_URGENCIA = 4;
// Bonus de coordinación real alrededor de la aportación (hasta +24).
const BONUS_CHAT = 8;
const BONUS_AGENDA = 8;
const BONUS_META = 8;

export function puntuacionAportacion(aportacion: AportacionEvaluada): number {
    // Participación real: cada voluntario inscrito suma; a partir del décimo
    // ya no escala (el tocho no debe tapar el resto de señales).
    const voluntarios = Math.max(0, Math.min(10, aportacion.members.length));
    // Urgencia clampada a [0,4]: un valor fuera de rango no descontrola ni
    // rompe la escala, y un NaN cuenta como cero.
    const urgencia = Math.max(0, Math.min(4, Math.floor(aportacion.urgencyVal) || 0));
    const coordinacion =
        (aportacion.messagingGroupCreated ? BONUS_CHAT : 0) +
        (aportacion.calendarItemId ? BONUS_AGENDA : 0) +
        (aportacion.goalsAchieved ? BONUS_META : 0);
    return Math.min(
        100,
        voluntarios * PESO_POR_VOLUNTARIO +
            urgencia * PESO_POR_NIVEL_DE_URGENCIA +
            coordinacion,
    );
}
