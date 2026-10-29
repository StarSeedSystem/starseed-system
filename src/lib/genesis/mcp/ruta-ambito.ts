/**
 * Lógica PURA de la ruta MCP por ámbito (Genesis abierto · Ola 1019G):
 * autorización `Bearer <token externo>` o sesión, filtro de herramientas por
 * permiso, límite de uso y registro de llamadas sin datos sensibles. Pura:
 * almacén de tokens, reloj y registro inyectados; ni red ni disco.
 * Contrato: architecture/genesis-conectores-abiertos.md §7.
 */
import { atenderMcp, type RespuestaJsonRpc } from "./protocolo";
import { huellaSha256, incrementarUso, verificarToken, type AlmacenTokens } from "./tokens-externos";
import type { FichaHerramientaMcp, PermisoMcp } from "./herramientas";

/** Autorización resuelta: la sesión ve todo («*»); el token, solo su alcance. */
export interface AutorizacionMcp {
    ambito: string;
    tipo: "token" | "sesion";
    permisos: string[];
    /** Huella SHA-256 del token; solo en modo token. */
    huella?: string;
}

/** Registro de una llamada para `genesis_llamadas`, sin datos sensibles. */
export interface RegistroLlamada {
    ambito: string;
    tipo: string;
    endpoint: string;
    metodo: string;
    statusCode: number;
}

/** Dependencias inyectables de la ruta: herramientas, almacén, reloj y registro. */
export interface DepsRutaMcp {
    herramientas: readonly FichaHerramientaMcp[];
    almacen: AlmacenTokens;
    ahora: () => number;
    registrarLlamada: (registro: RegistroLlamada) => void | Promise<void>;
    /** Tope de usos por token; undefined = sin límite. */
    limiteUsos?: number;
}

/** Resuelve la autorización de una petición MCP. `null` = denegada. */
export async function autorizarMcp(
    cabecera: string | null,
    ambitoSesion: string | null,
    deps: Pick<DepsRutaMcp, "almacen" | "ahora">,
): Promise<AutorizacionMcp | null> {
    const valor = cabecera?.startsWith("Bearer ") ? cabecera.slice(7).trim() : "";
    if (!valor) {
        if (ambitoSesion) return { ambito: ambitoSesion, tipo: "sesion", permisos: ["*"] };
        return null;
    }
    const visto = await verificarToken(valor, deps.almacen, deps.ahora());
    if (!visto) return null;
    return {
        ambito: visto.ambito,
        tipo: "token",
        permisos: visto.alcance,
        huella: await huellaSha256(valor),
    };
}

/** ¿Concede la autorización el permiso dado? El «*» lo concede todo. */
export function conPermiso(autorizacion: AutorizacionMcp, permiso: PermisoMcp): boolean {
    return autorizacion.permisos.includes("*") || autorizacion.permisos.includes(permiso);
}

/** Herramientas visibles para la autorización: solo las de permiso concedido. */
export function filtrarHerramientas(herramientas: readonly FichaHerramientaMcp[], autorizacion: AutorizacionMcp): FichaHerramientaMcp[] {
    return herramientas.filter((h) => conPermiso(autorizacion, h.permiso));
}

function errorMcp(id: string | number | null, codigo: number, mensaje: string): RespuestaJsonRpc {
    return { jsonrpc: "2.0", id, error: { code: codigo, message: mensaje } };
}

function metodoDe(cuerpo: unknown): string {
    const metodo = (cuerpo as { method?: unknown } | null)?.method;
    return typeof metodo === "string" && metodo !== "" ? metodo : "desconocido";
}

function endpointDe(cuerpo: unknown, metodo: string): string {
    const nombre = (cuerpo as { params?: { name?: unknown } } | null)?.params?.name;
    return typeof nombre === "string" && nombre !== "" && metodo === "tools/call" ? nombre : metodo;
}

/** Atiende la petición: autoriza, aplica límite de uso, filtra por permiso y anota la llamada. */
export async function atenderPostMcp(
    cuerpo: unknown,
    cabeceraAuth: string | null,
    ambitoSesion: string | null,
    deps: DepsRutaMcp,
): Promise<RespuestaJsonRpc> {
    const metodo = metodoDe(cuerpo);
    const autorizacion = await autorizarMcp(cabeceraAuth, ambitoSesion, deps);
    if (!autorizacion) {
        await deps.registrarLlamada({ ambito: ambitoSesion ?? "desconocido", tipo: "denegado", endpoint: metodo, metodo, statusCode: 401 });
        return errorMcp(null, -32001, "No autorizado");
    }
    if (autorizacion.huella !== undefined) {
        if (deps.limiteUsos !== undefined) {
            const entrada = deps.almacen.leerPorHuella(autorizacion.huella);
            if (!entrada || entrada.usos >= deps.limiteUsos) {
                await deps.registrarLlamada({ ambito: autorizacion.ambito, tipo: autorizacion.tipo, endpoint: metodo, metodo, statusCode: 429 });
                return errorMcp(null, -32002, "Límite de uso alcanzado");
            }
        }
        incrementarUso(autorizacion.huella, deps.almacen);
    }
    const respuesta = await atenderMcp(cuerpo, { herramientas: filtrarHerramientas(deps.herramientas, autorizacion) });
    await deps.registrarLlamada({
        ambito: autorizacion.ambito,
        tipo: autorizacion.tipo,
        endpoint: endpointDe(cuerpo, metodo),
        metodo,
        statusCode: 200,
    });
    return respuesta;
}
