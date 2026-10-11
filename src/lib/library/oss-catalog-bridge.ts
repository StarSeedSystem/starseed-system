"use client";

import { fichasProtomolecula } from "@/lib/protomolecula/biblioteca-protomolecula";
import { protomoleculaVersiones } from "@/config/protomolecula-versiones";
import { CATALOGO_PROTOMOLECULA } from "@/lib/protomolecula/catalogo-herramientas";

// Exportar los items de la Protomolécula para la Biblioteca.
export function listProtomoleculaLibraryItems(): ReturnType<typeof fichasProtomolecula> {
  return fichasProtomolecula(protomoleculaVersiones, CATALOGO_PROTOMOLECULA);
}