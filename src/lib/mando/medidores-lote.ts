/**
 * Helpers PUROS para la lectura por lotes de `/api/mando/medidores?claves=...`
 * y la extracción del resumen de pastillas en `CentroMando`.
 *
 * POR QUÉ (2026-11-20): `CentroMando` lanzaba 13 peticiones GET simultáneas a
 * `/api/mando/medidores?clave=...` en cada montaje y cada 20 s, saturando el
 * límite de 6 conexiones HTTP/1.1 de Chrome y la cola de `guardia-fetch`. Una
 * sola petición `?claves=...` calcula la reunión compartida UNA vez y devuelve
 * todas las pastillas en un solo viaje.
 *
 * Módulo PURO: nada de `node:*`, nada de JSX.
 */
import {
    ESPERA_A_OTRA,
    cifraDePastilla,
    type ClaveMedidor,
    type DetalleMedidor,
    type FilaMedidor,
    type ResumenImaginacionMedidor,
} from "./medidores";

export type TonoResumenMedidor = "normal" | "aviso" | "peligro" | "ok";

export interface ResumenMedidoresPulso {
    listas: number | null;
    bloqueadas: number | null;
    bloqueadasResumen?: string | null;
    enCadena?: number | null;
    enCadenaResumen?: string | null;
    agentes: number | null;
    agentesResumen: string | null;
    enCurso: number | null;
    enCursoResumen: string | null;
    contenedores: number | null;
    contenedoresResumen: string | null;
    tokens: number | null;
    tokensResumen: string | null;
    tokensCiegos: number | null;
    olas: number | null;
    olaTitulo: string | null;
    olasResumen: string | null;
    integradas: number | null;
    integradasResumen: string | null;
    agotados: number | null;
    vivos: number | null;
    proveedoresResumen: string | null;
    fallidas: number | null;
    fallidasResumen: string | null;
    imaginacion?: ResumenImaginacionMedidor | null;
    credito: string | null;
    creditoResumen: string | null;
    creditoTono: TonoResumenMedidor;
    creditos: FilaMedidor[];
}

export const RESUMEN_MEDIDORES_VACIO: ResumenMedidoresPulso = {
    listas: null,
    bloqueadas: null,
    agentes: null,
    agentesResumen: null,
    enCurso: null,
    enCursoResumen: null,
    contenedores: null,
    contenedoresResumen: null,
    tokens: null,
    tokensResumen: null,
    tokensCiegos: null,
    olas: null,
    olaTitulo: null,
    olasResumen: null,
    integradas: null,
    integradasResumen: null,
    agotados: null,
    vivos: null,
    proveedoresResumen: null,
    fallidas: null,
    fallidasResumen: null,
    imaginacion: null,
    credito: null,
    creditoResumen: null,
    creditoTono: "normal",
    creditos: [],
};

export const CLAVES_RESUMEN_PULSO: readonly ClaveMedidor[] = [
    "listas",
    "bloqueadas",
    "agentes",
    "en-curso",
    "contenedores",
    "proveedores",
    "tokens",
    "ola-activa",
    "integradas",
    "credito-claude",
    "creditos",
    "fallidas",
    "imaginacion",
] as const;

export const TODAS_CLAVES_MEDIDOR: readonly ClaveMedidor[] = [
    "en-curso",
    "agentes",
    "listas",
    "bloqueadas",
    "sin-publicar",
    "proveedores",
    "contenedores",
    "tokens",
    "integradas",
    "memoria",
    "disco",
    "almacenamiento",
    "ola-activa",
    "credito-claude",
    "creditos",
    "fallidas",
    "en-cadena",
    "imaginacion",
    "versiones",
    "pruebas",
] as const;

const CONJUNTO_CLAVES = new Set<string>(TODAS_CLAVES_MEDIDOR);

/** Parsea `?claves=a,b,c` aceptando solo claves conocidas, sin repetir y con tope 20. PURA. */
export function parsearClavesLote(parametro: string | null): ClaveMedidor[] {
    if (!parametro) return [];
    const vistas = new Set<ClaveMedidor>();
    for (const trozo of parametro.split(",")) {
        const limpia = trozo.trim();
        if (!CONJUNTO_CLAVES.has(limpia)) continue;
        vistas.add(limpia as ClaveMedidor);
        if (vistas.size >= 20) break;
    }
    return [...vistas];
}

/** Convierte el diccionario `detalles` del lote en el resumen exacto que consume la cabecera. PURA. */
export function extraerResumenMedidores(
    detalles: Partial<Record<ClaveMedidor, DetalleMedidor>>,
): ResumenMedidoresPulso {
    let listas: number | null = null;
    let bloqueadas: number | null = null;
    let bloqueadasResumen: string | null = null;
    let enCadena: number | null = null;
    let enCadenaResumen: string | null = null;
    let agentes: number | null = null;
    let agentesResumen: string | null = null;
    let enCurso: number | null = null;
    let enCursoResumen: string | null = null;
    let tokens: number | null = null;
    let tokensResumen: string | null = null;
    let tokensCiegos: number | null = null;
    let olas: number | null = null;
    let olaTitulo: string | null = null;
    let olasResumen: string | null = null;
    let integradas: number | null = null;
    let integradasResumen: string | null = null;
    let contenedores: number | null = null;
    let contenedoresResumen: string | null = null;
    let agotados: number | null = null;
    let vivos: number | null = null;
    let proveedoresResumen: string | null = null;
    let fallidas: number | null = null;
    let fallidasResumen: string | null = null;
    let imaginacion: ResumenImaginacionMedidor | null = null;
    let credito: string | null = null;
    let creditoResumen: string | null = null;
    let creditoTono: TonoResumenMedidor = "normal";
    let creditos: FilaMedidor[] = [];

    const dListas = detalles.listas;
    if (dListas?.filas) {
        listas = dListas.filas.filter((f) => f.estado !== ESPERA_A_OTRA).length;
    }

    const dBloqueadas = detalles.bloqueadas;
    if (dBloqueadas?.bloqueadas) {
        bloqueadas = dBloqueadas.bloqueadas.valor;
        bloqueadasResumen = dBloqueadas.bloqueadas.pastilla;
        const r = dBloqueadas.bloqueadas;
        enCadena = r.enCadena;
        enCadenaResumen = r.enCadena
            ? `esperan a ${r.cadenas.length} que avanza${r.cadenas.length === 1 ? "" : "n"} · se desbloquean solas`
            : "ninguna espera a otra";
    } else if (dBloqueadas?.filas) {
        bloqueadas = dBloqueadas.filas.filter((f) => !f.historica).length;
    }

    const dAgentes = detalles.agentes;
    if (dAgentes?.filas) {
        agentes = cifraDePastilla(dAgentes);
        agentesResumen = dAgentes.resumen ?? null;
    }

    const dEnCurso = detalles["en-curso"];
    if (dEnCurso?.filas) {
        enCurso = cifraDePastilla(dEnCurso);
        enCursoResumen = dEnCurso.resumen ?? null;
    }

    const dCont = detalles.contenedores;
    if (dCont) {
        const m = /(\d+)\s+libre/.exec(dCont.resumen ?? "");
        contenedores = m ? Number(m[1]) : 0;
        contenedoresResumen = dCont.resumen ?? null;
    }

    const dProv = detalles.proveedores;
    if (dProv?.filas) {
        agotados = dProv.filas.filter((f) => f.estado !== "vivo").length;
        vivos = dProv.filas.length - agotados;
        proveedoresResumen = dProv.resumen ?? null;
    }

    const dTok = detalles.tokens;
    if (dTok) {
        const m = /^([\d.]+)\s*tok\/s/.exec(dTok.resumen ?? "");
        tokens = m ? Number(m[1]) : null;
        tokensResumen = dTok.resumen ?? null;
        tokensCiegos = dTok.filas
            .filter((f) => f.estado === "trabajando sin contador")
            .reduce((n, f) => n + (Number(/^(\d+)/.exec(f.etapa ?? "")?.[1]) || 0), 0);
    }

    const dOlas = detalles["ola-activa"];
    if (dOlas) {
        const cabeceras = dOlas.filas.filter((f) => f.id.startsWith("ola:"));
        olas = cabeceras.length;
        olaTitulo = cabeceras[0]?.titulo ?? null;
        olasResumen = dOlas.resumen ?? null;
    }

    const dInt = detalles.integradas;
    if (dInt) {
        const m = /^(\d+)\s+tareas integradas/.exec(dInt.resumen ?? "");
        integradas = m ? Number(m[1]) : null;
        integradasResumen = dInt.resumen ?? null;
    }

    const dCred = detalles["credito-claude"];
    if (dCred) {
        const resumen = dCred.resumen ?? "";
        const m = /^sesión (\d+) % · semana (\d+) %/.exec(resumen);
        credito = m ? `${m[1]} % · ${m[2]} %` : resumen === "sin lectura" ? "sin lectura" : resumen || "—";
        creditoResumen = resumen;
        const estados = dCred.filas.map((f) => f.estado);
        creditoTono = estados.includes("peligro") ? "peligro" : estados.includes("aviso") || dCred.aviso ? "aviso" : "ok";
    }

    const dFallidas = detalles.fallidas;
    if (dFallidas) {
        fallidas = dFallidas.filas.length;
        fallidasResumen = dFallidas.resumen ?? null;
    }

    const dImaginacion = detalles.imaginacion;
    if (dImaginacion) {
        imaginacion = dImaginacion.imaginacion ?? null;
    }

    const dCreditos = detalles.creditos;
    if (dCreditos) {
        creditos = dCreditos.filas ?? [];
    }

    return {
        listas,
        bloqueadas,
        bloqueadasResumen,
        enCadena,
        enCadenaResumen,
        agentes,
        agentesResumen,
        enCurso,
        enCursoResumen,
        contenedores,
        contenedoresResumen,
        tokens,
        tokensResumen,
        tokensCiegos,
        olas,
        olaTitulo,
        olasResumen,
        integradas,
        integradasResumen,
        agotados,
        vivos,
        proveedoresResumen,
        fallidas,
        fallidasResumen,
        imaginacion,
        credito,
        creditoResumen,
        creditoTono,
        creditos,
    };
}
