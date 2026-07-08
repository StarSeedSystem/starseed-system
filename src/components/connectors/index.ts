/*
 * Conectores · Barrel de componentes.
 * Reexporta el Hub de Conectores para importarlo con una sola ruta.
 */
export { ConnectorsHub, default } from "./ConnectorsHub";
/*
 * Hub de Conectores POR USUARIO (aditivo): por categoría funcional, con
 * modo de selección (automático/preferir mi cuenta/solo gratis-OSS) y
 * credenciales locales opcionales. Ver src/lib/connectors/connector-credentials.ts.
 */
export { UserConnectorsHub } from "./UserConnectorsHub";
