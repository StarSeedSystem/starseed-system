/**
 * UNI1115M · las palabras del panel y de la ventana de control: cada motivo de rechazo de `control_entrada`, lo que
 * falta en el aparato controlado y cada estado de la ventana, en español llano. Una función por cosa; nada de códigos
 * en la cara de la persona (el código crudo se añade solo al final, para quien lo busque en el registro).
 */

import type { LimiteSesion } from "./sesion";

/** `control_entrada` (seam 1) y los motivos de la puerta de la web que la persona puede ver. */
export const PALABRAS_MOTIVO: Readonly<Record<string, string>> = {
    firma: "La orden no venía firmada por un aparato de confianza: este aparato no la ejecutó. Si es la primera vez, vuelve a pedir el control.",
    "no-autorizado": "Este aparato todavía no te ha aceptado para operar su entrada. Acéptalo en él con su código.",
    sesion: "No hay una sesión de control abierta; se abre de nuevo sola.",
    "regla-g": "Este aparato está en «Protegido»: tiene delante una ventana protegida (permisos, instalador o ajustes) y no deja tocarla desde otra neurona. Pulsa Inicio para salir de ella, o pon el aparato en «Control total» desde su ajuste local.",
    "pausa-local": "Están usando esa neurona: el control de la entrada espera, pero la pantalla se sigue viendo.",
    limite: "Demasiadas órdenes seguidas; el aparato espera un momento.",
    "sin-servicio": "El servicio de accesibilidad de StarSeed no está encendido en el aparato: la persona debe encenderlo allí.",
    "sin-soporte": "Esta neurona todavía no puede hacer esto.",
    "sin-consentimiento": "Falta que la persona active, en el aparato, «Ver la pantalla sin preguntar en cada sesión».",
    "sin-indicador-nativo": "El aparato no pudo enseñar su aviso de control (borde rojo y «Terminar»): sin aviso no hay control.",
    "permiso-apagado": "El control está apagado en el aparato; solo su dueño puede encenderlo.",
    // CTL1117J · S3: el aparato dijo que SÍ avisó a su dueño (ventana, aviso del sistema y centro de notificaciones).
    "permiso-apagado-avisado": "La otra neurona tiene el control apagado; ya se lo avisamos a su dueño.",
    "otra-cuenta": "Ese aparato es de otra cuenta: solo se controlan los de la misma cuenta.",
    "otro-destino": "La orden iba a otro aparato.",
    "sesion-caducada": "Se dejaron de recibir los latidos de quien controla (45 s) y la sesión se cortó. Se reabre sola mientras el permiso siga encendido.",
    "sin-sesion": "El aparato ya no tiene esta sesión abierta. Si el permiso sigue encendido, se reabre sola con el siguiente latido, sin pedir otra aceptación.",
    // CTL1117C · FALLO 3: sin el motivo real no se sabe QUIÉN paró (antes toda parada se decía «Terminar»).
    "parada-nativa": "El aparato cerró el control por su cuenta y no dijo por qué.",
    "parada-nativa-persona": "La persona terminó la sesión desde el aviso del aparato («Terminar»). El permiso sigue encendido: pulsa «Reabrir» para volver a abrirla.",
    "parada-nativa-caducada": "La sesión de control caducó en el aparato por falta de latidos (45 s) o porque se cumplió el límite elegido al aceptar.",
    "parada-nativa-sin-indicador": "El aviso de control del aparato (el borde rojo y su botón) dejó de verse y el control se cortó por seguridad.",
    "parada-nativa-no-se-pudo-mostrar": "Android no dejó mantener el aviso de control en el aparato: sin aviso no hay control.",
    "parada-nativa-indicador-perdido": "El aparato perdió su aviso de control y lo cerró.",
    "parada-nativa-sin-sesion": "El aparato ya no tenía una sesión de control abierta.",
    "parada-nativa-otro-token": "El aparato abrió otra sesión de control y esta quedó atrás.",
    "parada-nativa-revocado": "La persona quitó el permiso de control en el aparato.",
    "a-mano": "La persona usó el aparato con la mano y el control se detuvo.",
    "terminado-por-el-dueno": "La persona terminó la sesión en el aparato. El permiso sigue encendido: pulsa «Reabrir» para volver a abrirla.",
    "limite-cumplido": "Se cumplió el tiempo de control que se eligió al aceptar. Para seguir, la persona dueña tiene que aceptar otra vez y elegir un nuevo límite.",
    "apagado-por-el-dueno": "La persona apagó el control en el aparato.",
    nivel: "Esa orden pide un nivel de control que la sesión no tiene.",
    caducada: "La orden llegó tarde y no se ejecutó.",
    repetida: "Esa orden llegó dos veces al aparato y la segunda no se ejecutó; la ventana la vuelve a mandar sola.",
    argumentos: "La orden venía mal formada.",
    "sin-oferta": "El aparato no empezó a mandar su pantalla a tiempo.",
    negociacion: "No se pudo preparar la conexión de vídeo.",
    "sin-conexion": "La conexión de vídeo no llegó a establecerse.",
    "conexion-perdida": "Se perdió la conexión de vídeo.",
    "cuadro-fallo": "El aparato dejó de dar imágenes de su pantalla.",
    "sin-cuadros": "El aparato no está dando imágenes nuevas.",
    "sin-pantalla": "El aparato no está mandando su pantalla.",
    desmontada: "La ventana se cerró.",
    "cerrada-por-la-persona": "Cerraste la ventana de control.",
    "sin-neurona": "No hay ninguna neurona elegida.",
    "medio-no-disponible": "El medio elegido para este aparato no está disponible ahora. Elige otro medio o pasa a Automático.",
};

const PASOS_SENAL: Record<string, string> = { oferta: "enviar la oferta de vídeo", respuesta: "recibir la respuesta de vídeo", candidatos: "intercambiar las rutas de red", conexion: "abrir la conexión" };
const LADOS_SENAL: Record<string, string> = { controlador: "en este aparato (el que manda)", aparato: "en el aparato controlado" };
const CAUSAS_SENAL: Record<string, string> = {
    "demasiado-grande": "la oferta o la respuesta de vídeo era demasiado grande",
    "resumen-no-casa": "las partes no casaban entre sí (llegaron alteradas)",
    "partes-incoherentes": "las partes pertenecían a distintas negociaciones",
    "parte-repetida-distinta": "una parte llegó repetida con otro contenido",
    "demasiadas-negociaciones": "había demasiadas negociaciones a medias",
    "respuesta-invalida": "la respuesta no tenía la forma esperada",
    "respuesta-incompleta": "faltaron partes de la respuesta",
    "respuesta-rechazada": "la conexión de vídeo rechazó la respuesta",
    "conexion-rechazada": "la conexión de vídeo rechazó la oferta",
    "ya-negociada": "ya había una conexión de vídeo en marcha",
};

/** (CTL1117A · S9) Frase corta de UNA orden rechazada, para enseñarla dentro de la ventana de control. */
export function palabrasOrden(motivo: string | undefined | null): string | undefined {
    return palabrasMotivo(motivo);
}

/** (CTL1117A · S3) Motivos que ya no se arreglan pidiendo otra vez: se dice claro y se espera, sin insistir. */
export const MOTIVOS_TERMINALES: ReadonlySet<string> = new Set(["permiso-apagado", "permiso-apagado-avisado", "no-autorizado", "otra-cuenta", "otro-destino", "parada-nativa", "a-mano", "terminado-por-el-dueno", "parada-nativa-persona"]);

/**
 * CTL1117C · FALLO 3: la clave fina de una parada del aparato. `parada-nativa` + el motivo real que dijo lo nativo
 * (`detalle.motivo`, en `resultado`) → `parada-nativa-<causa>`; «Terminar» (indicador, notificación o superposición) → `-persona`.
 * Sin motivo (aparato anterior) se queda `parada-nativa`, que ya no afirma que la persona terminó.
 */
export function claveParadaNativa(motivo: string, resultado?: unknown): string {
    if (motivo === "permiso-apagado") {
        // CTL1117J · S3: solo se dice «ya se lo avisamos» si el aparato lo confirmó en su respuesta.
        const d0 = resultado && typeof resultado === "object" ? (resultado as { detalle?: unknown }).detalle : undefined;
        const a = d0 && typeof d0 === "object" ? (d0 as { aviso?: unknown }).aviso : undefined;
        return a === "si" || a === "ya" ? "permiso-apagado-avisado" : motivo;
    }
    if (motivo !== "parada-nativa") return motivo;
    const d = resultado && typeof resultado === "object" ? (resultado as { detalle?: unknown }).detalle : undefined;
    const m = d && typeof d === "object" ? (d as { motivo?: unknown }).motivo : undefined;
    if (typeof m !== "string" || !/^[a-z-]{1,40}$/.test(m)) return motivo;
    if (m === "terminado-por-el-dueno") return "terminado-por-el-dueno"; // CTL1118G: «Terminar» solo corta la sesión; el permiso sigue
    if (m === "la-persona-desde-el-indicador" || m === "la-persona-desde-la-notificacion" || m === "la-persona-desde-la-superposicion") return "parada-nativa-persona";
    if (m === "revocado" || m === "apagado-por-el-dueno" || m === "la-persona-quito-el-permiso") return "parada-nativa-revocado";
    return `parada-nativa-${m}`;
}

export function palabrasMotivo(motivo: string | undefined | null): string | undefined {
    if (!motivo) return undefined;
    const pn = /^parada-nativa-([a-z-]{1,40})$/.exec(motivo);
    if (pn && !PALABRAS_MOTIVO[motivo]) return `El aparato cerró el control (motivo «${pn[1]}»).`;
    const m = /^senal-(oferta|respuesta|candidatos|conexion)-(controlador|aparato)-([a-z-]{1,32})$/.exec(motivo);
    if (m) {
        const causa = CAUSAS_SENAL[m[3]] ?? PALABRAS_MOTIVO[m[3]] ?? `motivo «${m[3]}»`;
        return `No se pudo preparar la conexión de vídeo. Falló el paso «${PASOS_SENAL[m[1]]}» ${LADOS_SENAL[m[2]]}: ${causa}.`;
    }
    return PALABRAS_MOTIVO[motivo] ?? PALABRAS_FALTA[motivo] ?? `Motivo: ${motivo.slice(0, 40)}`;
}

/** Lo que `control_capacidades().falta` puede decir, y el botón de cada cosa (`control_abrir_ajuste`). */
export const PALABRAS_FALTA: Readonly<Record<string, string>> = {
    "servicio-accesibilidad": "El servicio de accesibilidad de StarSeed está apagado. Sin él no se puede ver ni tocar la pantalla desde otra neurona.",
    "ajustes-restringidos": "Android bloquea el servicio de una app instalada fuera de la tienda hasta que permitas «ajustes restringidos» para StarSeed.",
    "consentimiento-pantalla": "Falta el interruptor «Ver la pantalla sin preguntar en cada sesión»: sin él, Android no deja mandar la pantalla.",
    "escribir-ajustes": "Falta el permiso «Modificar ajustes del sistema»: sin él no se puede cambiar el brillo desde otra neurona.",
    "consentimiento-proyeccion": "Android te preguntará en el aparato si compartes la pantalla; contesta allí.",
    // CTL1117M · Mac controlado: los dos permisos los da la persona en ese Mac, en Ajustes del Sistema.
    "grabacion-pantalla": "Falta el permiso «Grabación de pantalla» de StarSeed OS en ese Mac: sin él no se puede ver la pantalla. Se da en Ajustes del Sistema › Privacidad y seguridad.",
    "accesibilidad-mac": "Falta el permiso «Accesibilidad» de StarSeed OS en ese Mac: sin él no se puede mover el ratón ni escribir. Se da en Ajustes del Sistema › Privacidad y seguridad.",
    // CTL1118L · Linux controlado: no son permisos que se den en Ajustes, es la sesión gráfica del equipo (por eso no hay botón).
    "wayland": "Ese equipo Linux usa una sesión Wayland: StarSeed OS solo puede mostrar y controlar su pantalla en una sesión X11. Cierra la sesión allí y entra eligiendo «Xfce (X11)» o similar.",
    "sin-pantalla-x11": "StarSeed OS no encuentra la pantalla (servidor X) de ese equipo Linux: sin ella no se puede ver ni tocar. Hace falta que alguien haya iniciado sesión en el escritorio.",
    "webrtc-linux": "Este equipo Linux no tiene lo que WebKitGTK necesita para WebRTC (GStreamer: nice y plugins-bad). La pantalla irá por la malla, más lenta que por vídeo. En una terminal: su -c 'apt-get install -y gstreamer1.0-nice gstreamer1.0-plugins-bad' y vuelve a abrir StarSeed OS.",
    "entrada-x11": "El servidor gráfico de ese equipo Linux no tiene la extensión XTEST: se puede ver su pantalla, pero no mover el ratón ni escribir.",
};

export const BOTON_FALTA: Readonly<Record<string, string>> = {
    "servicio-accesibilidad": "Abrir Accesibilidad",
    "ajustes-restringidos": "Abrir la información de la app",
    "consentimiento-pantalla": "Activar «Ver la pantalla sin preguntar»",
    "escribir-ajustes": "Abrir «Modificar ajustes del sistema»",
    "consentimiento-proyeccion": "Compartir la pantalla en esta sesión",
    "grabacion-pantalla": "Abrir «Grabación de pantalla»", // CTL1117M
    "accesibilidad-mac": "Abrir «Accesibilidad»", // CTL1117M
};

/** Los estados de la ventana (seam 3), con el nombre de la neurona. */
export function palabrasEstado(estado: "conectando" | "en-vivo" | "pausa-local" | "sin-pantalla" | "cerrada", nombre: string): string {
    switch (estado) {
        case "conectando": return `Conectando con ${nombre}…`;
        case "en-vivo": return `Controlando ${nombre} en directo.`;
        case "pausa-local": return `${nombre}: están usando esa neurona; el control espera.`;
        case "sin-pantalla": return `${nombre} no enseña su pantalla ahora.`;
        default: return `La ventana de ${nombre} está cerrada.`;
    }
}

/** CTL1119A · «Límite de tiempo» al aceptar el control: las opciones que ve la persona. */
export const PALABRAS_LIMITE: Readonly<Record<string, string>> = {
    "sin-limite": "Sin límite de tiempo",
    "15-minutos": "15 minutos",
    "1-hora": "1 hora",
    "hasta-las": "Hasta las…",
};

/**
 * CTL1119A: los mismos textos con las claves que usa el selector de la banda (`OpcionLimite`). Así la persona ve
 * una sola redacción, venga del panel o de la ventana, y no hay dos listas que se puedan separar.
 */
export const PALABRAS_LIMITE_OPCION: Readonly<Record<string, string>> = {
    "sin-limite": PALABRAS_LIMITE["sin-limite"],
    "15-min": PALABRAS_LIMITE["15-minutos"],
    "1-hora": PALABRAS_LIMITE["1-hora"],
    hasta: PALABRAS_LIMITE["hasta-las"],
};

/** El texto de una opción del selector; una clave desconocida no inventa un límite: dice «Sin límite de tiempo». */
export function textoOpcionLimite(opcion: string): string {
    return PALABRAS_LIMITE_OPCION[opcion] ?? PALABRAS_LIMITE["sin-limite"];
}

/** El nombre llano de un límite (para el ajuste local y el punto de color). */
export function palabrasLimite(limite: LimiteSesion | null | undefined): string {
    if (!limite || limite.tipo === "sin-limite") return PALABRAS_LIMITE["sin-limite"];
    if (limite.tipo === "hasta") return `Hasta las ${limite.hora}`;
    if (limite.minutos === 60) return PALABRAS_LIMITE["1-hora"];
    return limite.minutos === 1 ? "1 minuto" : `${Math.round(limite.minutos)} minutos`;
}

/**
 * CTL1119A: el tope que puso el dueño de una neurona ajena o pública, en llano. Si no puso tope se dice también el
 * defecto que se aplica (15 min), para que nadie crea que ahí se puede elegir «sin límite».
 */
export function palabrasTopeLimite(topeMin: number | null | undefined, porDefectoMin = 15): string {
    if (topeMin === null || topeMin === undefined) return `Esta neurona permite sin límite, pero por defecto se pone ${porDefectoMin} min.`;
    const min = Math.max(1, Math.round(topeMin));
    return min === 60 ? "El dueño permite como máximo 1 hora." : `El dueño permite como máximo ${min} min.`;
}

/** CTL1119A: el tiempo que queda, en llano; undefined si no hay límite (el punto no inventa cuenta atrás). */
export function palabrasRestante(ms: number | null | undefined): string | undefined {
    if (ms === null || ms === undefined) return undefined;
    if (ms <= 0) return "El tiempo de control terminó";
    const minutos = Math.ceil(ms / 60_000);
    if (minutos < 60) return minutos === 1 ? "Queda 1 min" : `Quedan ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    const base = horas === 1 ? "Queda 1 h" : `Quedan ${horas} h`;
    return resto ? `${base} ${resto} min` : base;
}
