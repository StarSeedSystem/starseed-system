// StarSeed OS — Núcleo · Entorno completo.
//
// Guarda, duplica y comparte el entorno de un perfil con la misma revisión
// que un paquete. Solo las claves sincronizadas (`SYNCED_KEYS`) viajan;
// los volúmenes van por referencia (manifiesto por bandas), nunca su contenido.
//
// Módulo PURO: sin red, sin disco, sin `node:*`. Importa el cliente.

import { SYNCED_KEYS, NEVER_SYNCED_KEYS, isNeverSyncedKey } from "@/lib/settings-sync";
import type { PaqueteSistema, Revision } from "./paquete-sistema";
import { revisar, detectarSecretos, esInstalable } from "./paquete-sistema";

export interface VolumenEntorno {
  id: string;
  raiz: string;
}

export interface EntornoCompleto {
  version: number;
  nombre: string;
  paquete: PaqueteSistema;
  ajustes: Record<string, unknown>;
  volumenes: VolumenEntorno[];
}
