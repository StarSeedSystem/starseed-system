"use client";

/* Panel de asignaciones por papel y director (Ola 1019G · GCA1019N). Una fila por papel o director
 * con su cadena ordenable, el peldaño (local, malla, contenedor, gratis, pago) y su motivo. En
 * PoliGenesis democrático, guardar crea una propuesta en vez de aplicar. Las funciones puras se
 * exportan para probarlas sin red, sin disco y sin reloj; los textos van en español con acentos. */

import { useState } from "react";
import { GripVertical, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { Director } from "@/lib/genesis/conectores/asignaciones";
import type { OpcionCatalogo, Papel } from "@/lib/genesis/conectores/catalogo-opciones";

export type ModoPanel = "aplicar" | "proponer" | "sin-permiso";
export type Peldano = "local" | "malla" | "contenedor" | "gratis" | "pago";
export type ClavePanel = Papel | Director;

export interface FilaPanel {
  tipo: "papel" | "director";
  clave: ClavePanel;
  cadena: string[];
}

export interface EntradaFila {
  id: string;
  nombre: string;
  peldano: Peldano;
  motivo: string;
}

export interface PropsPanel {
  catalogo: readonly OpcionCatalogo[];
  modo?: ModoPanel;
  filasIniciales?: readonly FilaPanel[];
  onGuardar?: (filas: FilaPanel[]) => void | Promise<void>;
}

export const PAPELES: readonly Papel[] = ["escritor", "revisor", "chat", "visión", "voz", "imagen", "código"];
export const DIRECTORES: readonly Director[] = ["chat", "optimizador", "diseno", "produccion", "nube", "medidores", "aprendizaje"];

const NOMBRES: Record<string, string> = {
  escritor: "Escritor", revisor: "Revisor", chat: "Chat", visión: "Visión", voz: "Voz", imagen: "Imagen",
  código: "Código", optimizador: "Optimizador", diseno: "Diseño", produccion: "Producción", nube: "Nube",
  medidores: "Medidores", aprendizaje: "Aprendizaje",
};

export function peldanoDe(opcion: OpcionCatalogo): Peldano {
  if (opcion.tipo === "contenedor") return "contenedor";
  if (opcion.privacidad === "local") return "local";
  if (opcion.gratis === null) return "pago";
  return opcion.tipo === "modelo" ? "malla" : "gratis";
}

export function motivoDe(opcion: OpcionCatalogo): string {
  const base: Record<Peldano, string> = {
    local: "Corre en esta cuenta: nada sale del aparato.",
    malla: "Modelo de la malla: solo si no cabe en local.",
    contenedor: "Contenedor para los procesos del agente.",
    gratis: "Gratis con la cuenta vinculada del ámbito.",
    pago: "De pago: solo con el permiso y el tope del ámbito.",
  };
  return `${base[peldanoDe(opcion)]} ${opcion.gratis?.nota ? `Límite: ${opcion.gratis.nota}.` : "Límite no verificado."}`;
}

export function entradasDeFila(fila: FilaPanel, catalogo: readonly OpcionCatalogo[]): EntradaFila[] {
  const porId = new Map(catalogo.map((o) => [o.id, o]));
  return fila.cadena.flatMap((id) => {
    const opcion = porId.get(id);
    return opcion ? [{ id, nombre: opcion.nombre, peldano: peldanoDe(opcion), motivo: motivoDe(opcion) }] : [];
  });
}

export function disponiblesParaFila(fila: FilaPanel, catalogo: readonly OpcionCatalogo[]): OpcionCatalogo[] {
  const sirven = fila.tipo === "papel"
    ? catalogo.filter((o) => o.papeles.includes(fila.clave as Papel))
    : [...catalogo];
  return sirven.filter((o) => !fila.cadena.includes(o.id));
}

export function moverEnCadena(cadena: readonly string[], desde: number, hasta: number): string[] {
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= cadena.length || hasta >= cadena.length) return [...cadena];
  const copia = [...cadena];
  const [movido] = copia.splice(desde, 1);
  copia.splice(hasta, 0, movido);
  return copia;
}

export function agregarACadena(cadena: readonly string[], id: string): string[] {
  return cadena.includes(id) ? [...cadena] : [...cadena, id];
}

export function quitarDeCadena(cadena: readonly string[], id: string): string[] {
  return cadena.filter((x) => x !== id);
}

const PESO: readonly Peldano[] = ["local", "malla", "contenedor", "gratis", "pago"];

export function filasSugeridas(catalogo: readonly OpcionCatalogo[], max = 3): FilaPanel[] {
  const orden = [...catalogo].sort((a, b) => PESO.indexOf(peldanoDe(a)) - PESO.indexOf(peldanoDe(b)) || a.nombre.localeCompare(b.nombre));
  const fila = (tipo: FilaPanel["tipo"], clave: ClavePanel): FilaPanel => ({
    tipo, clave,
    cadena: orden.filter((o) => tipo === "director" || o.papeles.includes(clave as Papel)).slice(0, max).map((o) => o.id),
  });
  return [...PAPELES.map((p) => fila("papel", p)), ...DIRECTORES.map((d) => fila("director", d))];
}

export function accionGuardar(modo: ModoPanel): "aplicar" | "proponer" | "nada" {
  return modo === "sin-permiso" ? "nada" : modo === "proponer" ? "proponer" : "aplicar";
}

export function etiquetaFila(fila: FilaPanel): string {
  return `${fila.tipo === "papel" ? "Papel" : "Director"} · ${NOMBRES[fila.clave] ?? fila.clave}`;
}

export function AsignacionesPanel(_props: PropsPanel) {
  return null;
}
