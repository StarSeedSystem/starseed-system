"use client";

import { createContext, useContext } from "react";
import { INFO_NATIVA_VACIA, type InfoNativaLlamada } from "@/lib/llamadas/superficie/vista";

/**
 * Información nativa opcional de la llamada (rutas de audio, proximidad). Por defecto vacía: la
 * superficie funciona igual en la web. LLA1108D (o el integrador) la conecta con un `Provider`.
 */
export const ContextoNativoLlamada = createContext<InfoNativaLlamada>(INFO_NATIVA_VACIA);
export const useInfoNativaLlamada = () => useContext(ContextoNativoLlamada);
