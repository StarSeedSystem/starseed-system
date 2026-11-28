export type TipoTarjeta = 
  | "presentacion" 
  | "amistad" 
  | "evento" 
  | "pagina" 
  | "grupo" 
  | "partido" 
  | "perfil" 
  | "cuenta" 
  | "cerebro" 
  | "repositorio" 
  | "archivo" 
  | "app" 
  | "programa" 
  | "enlace";

export interface TarjetaNeurona {
  // existing fields ...
  version: number;
  neuronaId: string;
  clavePublica: string;
  cuenta: { modo: "hash" | "alias" | "nada"; valor?: string };
  claveEfimera: string;
  nonce: string;
  emitidaEn: number;
  ofertas: string[];
  transportes: { tipo: "ble" | "wifi-direct" | "lan" | "malla"; direccion: string }[];
  firma: string;
  // new fields
  tipo: TipoTarjeta;
  contactos?: boolean; // true if this tarjeta should be saved in contacts (amistad)
  accion?: string; // primary action for the receiver
  comercial?: boolean; // true if this tarjeta is commercial (should be false for allowed tarjetas)
  plantilla?: string; // template or design description
}