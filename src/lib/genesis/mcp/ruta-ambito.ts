/**
 * Ruta MCP de Genesis por ámbito con permisos (Ola 1019G · tarea S).
 * Módulo PURO: el almacén de tokens, el registro de llamadas, el reloj y la
 * sesión se inyectan; aquí solo se decide. `route.ts` hace el cableado.
 * Contrato: architecture/genesis-conectores-abiertos.md §7.
 */

import {
    huellaSha256,
    incrementarUso,
    verificarToken,
    type AlmacenTokens,
} from "./tokens-externos";
import { atenderMcp, type RespuestaJsonRpc } from "./protocolo";
import { HERRAMIENTAS_MCP, type FichaHerramientaMcp } from "./herramientas";

/** Sesión resuelta fuera (servidor): ámbito y permisos concedidos. */
export interface SesionAtender {
    ambito: string;
    permisos: string[];
}

/** Llamada sin datos sensibles: va a `genesis_llamadas` en producción. */
export interface LlamadaGenesis {
    ambito: string;
    tipo: string;
    endpoint: string;
    metodo: string;
    statusCode: number;
}

/** Registro inyectado; en producción inserta en `genesis_llamadas`. */
export interface RegistroLlamadas {
    registrar(llamada: LlamadaGenesis): void;
}

/** Opciones de la ruta; nada de nodo: inyección pura. */
export interface OpcionesRutaAmbito {
    almacen: AlmacenTokens;
    registro: RegistroLlamadas;
    herramientas?: readonly FichaHerramientaMcp[];
    sesion?: SesionAtender | null;
    /** Tope de usos del token externo; sin él, sin tope verificado. */
    limiteUsos?: number;
    /** Reloj inyectable (ms desde época) para pruebas. */
    ahoraMs?: number;
}

/** Salida: código HTTP + cuerpo JSON-RPC 2.0. */
export interface SalidaRuta {
    estado: number;
    cuerpo: RespuestaJsonRpc;
}

/** Error JSON-RPC con id del cuerpo si es válido. */
export function errorJsonRpc(id: string | number | null, codigo: number, mensaje: string): RespuestaJsonRpc {
    return { jsonrpc: "2.0", id, error: { code: codigo, message: mensaje } };
}

/** Id JSON-RPC del cuerpo si tiene forma válida. */
export function idDeCuerpo(cuerpo: unknown): string | number | null {
    const id = (cuerpo as { id?: unknown } | null)?.id;
    return typeof id === "string" || typeof id === "number" ? id : null;
}

/** Extrae el valor del token de la cabecera «Authorization: Bearer …». */
export function tokenDeEstra(cabecera: string | null): string | null {
    const valor = cabecera?.trim() ?? "";
    if (!valor.startsWith("Bearer ")) return null;
    const token = valor.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
}

/** Deja solo las herramientas cuyo permiso está en el alcance concedido. */
export function filtrarPorPermisos(
    herramientas: readonly FichaHerramientaMcp[],
    permisos: readonly string[],
): FichaHerramientaMcp[] {
    const concedidos = new Set(permisos);
    return herramientas.filter((h) => concedidos.has(h.permiso));
}

/** Permisos que cubren todas las herramientas pasadas (caso sesión). */
export function permisosTodos(herramientas: readonly FichaHerramientaMcp[]): string[] {
    return [...new Set(herramientas.map((h) => h.permiso))];
}

/** Nombre de herramienta pedido en «tools/call», si es texto. */
function nombreDeHerramienta(peticion: unknown): string {
    const params = (peticion as { params?: { name?: unknown } }).params;
    return typeof params?.name === "string" ? params.name : "";
}

/** Deja la llamada lista para `genesis_llamadas`, sin datos sensibles. */
function registrarLlamada(
    registro: RegistroLlamadas,
    ambito: string,
    metodoJsonRpc: string,
    herramienta: string,
    statusCode: number,
): void {
    registro.registrar({
        ambito,
        tipo: `mcp:${metodoJsonRpc}`.slice(0, 50),
        endpoint: herramienta ? `/api/mcp/genesis?h=${herramienta}` : "/api/mcp/genesis",
        metodo: "POST",
        statusCode,
    });
}

/**
 * Atiende un POST de la ruta MCP con permisos: resuelve el acceso por token
 * externo o sesión, aplica el límite de uso, filtra `tools/list` por alcance
 * y registra cada llamada sin datos sensibles. Nunca devuelves el token.
 */
export async function atenderPostMcp(
    cuerpo: unknown,
    token: string | null,
    opciones: OpcionesRutaAmbito,
): Promise<SalidaRuta> {
    const herramientas = opciones.herramientas ?? HERRAMIENTAS_MCP;
    if (!cuerpo || typeof cuerpo !== "object" || typeof (cuerpo as { method?: unknown }).method !== "string") {
        return { estado: 400, cuerpo: errorJsonRpc(idDeCuerpo(cuerpo), -32600, "Solicitud JSON-RPC 2.0 inválida.") };
    }
    const metodo = String((cuerpo as { method: unknown }).method);
    const id = idDeCuerpo(cuerpo);

    if (token !== null) {
        const verificado = await verificarToken(token, opciones.almacen, opciones.ahoraMs);
        if (verificado === null) {
            return { estado: 401, cuerpo: errorJsonRpc(id, -32001, "Token externo inválido, caducado o revocado.") };
        }
        return atenderConToken(metodo, id, verificado, token, cuerpo, opciones, herramientas);
    }
    if (opciones.sesion) {
        return atenderConSesion(metodo, id, opciones.sesion, cuerpo, opciones, herramientas);
    }
    return { estado: 401, cuerpo: errorJsonRpc(id, -32001, "Inicia sesión o presenta un token externo válido.") };
}

/** Ramas internas una vez resuelto el acceso (token o sesión). */
interface AccesoResuelto {
    via: "token" | "sesion";
    ambito: string;
    permisos: string[];
    huella: string;
}

async function atenderConToken(
    metodo: string,
    id: string | number | null,
    verificado: { ambito: string; alcance: string[] },
    token: string,
    cuerpo: unknown,
    opciones: OpcionesRutaAmbito,
    herramientas: readonly FichaHerramientaMcp[],
): Promise<SalidaRuta> {
    const huella = await huellaSha256(token);
    if (opciones.limiteUsos !== undefined && opciones.limiteUsos >= 0) {
        const entrada = opciones.almacen.leerPorHuella(huella);
        if (entrada && entrada.usos >= opciones.limiteUsos) {
            registrarLlamada(opciones.registro, verificado.ambito, metodo, "", 429);
            return { estado: 429, cuerpo: errorJsonRpc(id, -32002, "Límite de uso del token externo alcanzado.") };
        }
    }
    return atenderConPermisos(metodo, id, {
        via: "token",
        ambito: verificado.ambito,
        permisos: verificado.alcance,
        huella,
    }, cuerpo, opciones, herramientas);
}

async function atenderConSesion(
    metodo: string,
    id: string | number | null,
    sesion: SesionAtender,
    cuerpo: unknown,
    opciones: OpcionesRutaAmbito,
    herramientas: readonly FichaHerramientaMcp[],
): Promise<SalidaRuta> {
    return atenderConPermisos(metodo, id, {
        via: "sesion",
        ambito: sesion.ambito,
        permisos: sesion.permisos,
        huella: "",
    }, cuerpo, opciones, herramientas);
}

/** Despacho común: filtro de alcance, registro de la llamada y límite. */
async function atenderConPermisos(
    metodo: string,
    id: string | number | null,
    acceso: AccesoResuelto,
    cuerpo: unknown,
    opciones: OpcionesRutaAmbito,
    herramientas: readonly FichaHerramientaMcp[],
): Promise<SalidaRuta> {
    if (metodo === "tools/call") {
        const nombre = nombreDeHerramienta(cuerpo);
        const ficha = herramientas.find((h) => h.nombre === nombre);
        if (ficha && !acceso.permisos.includes(ficha.permiso)) {
            registrarLlamada(opciones.registro, acceso.ambito, metodo, nombre, 403);
            return {
                estado: 403,
                cuerpo: errorJsonRpc(id, -32003, `Permiso insuficiente: ${ficha.permiso}.`),
            };
        }
    }
    const filtradas = metodo === "initialize" || metodo === "tools/list"
        ? filtrarPorPermisos(herramientas, acceso.permisos)
        : herramientas;
    const respuesta = await atenderMcp(cuerpo, { herramientas: filtradas });
    const nombre = metodo === "tools/call" ? nombreDeHerramienta(cuerpo) : "";
    registrarLlamada(opciones.registro, acceso.ambito, metodo, nombre, 200);
    if (acceso.via === "token" && acceso.huella) incrementarUso(acceso.huella, opciones.almacen);
    return { estado: 200, cuerpo: respuesta };
}
