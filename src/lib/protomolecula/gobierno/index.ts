/**
 * Gobierno de la Protomolécula de cada grupo, comunidad o página (Ola 1026P · P2).
 *
 * `decidirCambio(contexto, actor, tipo)` conserva la firma del contrato de la ola: devuelve un `VeredictoGobierno`
 * (aplicar · proponer · votar · denegar, con el motivo en lenguaje claro y `confirmar` siempre que el origen sea IA o
 * agente). Lee las reglas de la entidad de lo último que la pantalla cargó (`almacen.ts`); un cuarto parámetro
 * opcional permite pasarle el entorno ya cargado (reglas, modo de gobierno, umbral y quórum, reloj).
 *
 * Quien APLICA un cambio gracias a un permiso directo debe anotarlo con `registrarUsoPermiso` (transparencia).
 * SOP: `architecture/protomolecula-gobierno.md`.
 */
import type { ActorProto, ContextoProto, TipoCambioProto } from "../peticion/contrato";
import { decidirCambioConReglas, entidadGobernante, type EntornoGobierno, type VeredictoDetallado } from "./decision";
import { entornoDeCache } from "./almacen";

export function decidirCambio(contexto: ContextoProto, actor: ActorProto, tipo: TipoCambioProto, entorno?: EntornoGobierno): VeredictoDetallado {
  const ent = entidadGobernante(contexto);
  const deCache: EntornoGobierno = ent ? entornoDeCache(ent) : {};
  return decidirCambioConReglas(contexto, actor, tipo, { ...deCache, ...entorno });
}

export * from "./reglas";
export * from "./decision";
export { EVENTO_GOBIERNO_PROTO, entornoDeCache, leerEstado, type EstadoEntidad, type OrigenReglas } from "./almacen";
export { registrarUsoPermiso, leerUsosPermiso, DONDE_SE_GUARDA_EL_REGISTRO, type UsoPermiso } from "./registro";
