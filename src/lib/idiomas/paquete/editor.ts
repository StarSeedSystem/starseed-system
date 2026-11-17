import { normalizarTexto } from "../catalogo";
import type { PaqueteIdioma } from "./formato";
import type { AlmacenPaquetes } from "./almacen";
import { desdeCsv, desdeJsonAnidado, desdeJsonPlano, type EntradaDescartada } from "./importar-json-csv";

export interface EditorEstado {
  abierto: boolean;
  codigo?: string;
  nombre?: string;
}

/** Formato común del que se importa traducción (contrato A2 de architecture/traductor-universal.md). */
export type FormatoImportado =
  | { tipo: "json-plano" }
  | { tipo: "json-anidado" }
  | { tipo: "csv"; separador: "," | ";" | "\t" };

export interface ResultadoImportarEditor {
  /** Traducciones que casaron y quedaron en el paquete en edición. */
  entradas: number;
  descartadas: EntradaDescartada[];
}

const CLAVE_ESTADO = "starseed.idiomas.editor.v1" as const;

export interface Editor {
  abrirEdicion(codigo: string, nombre: string): void;
  paqueteEnEdicion(): PaqueteIdioma | null;
  anadirPendiente(textoEspanol: string): boolean;
  traducir(clave: string, valor: string): void;
  importar(texto: string, formato: FormatoImportado): ResultadoImportarEditor;
  pendientes(): string[];
  completadas(): string[];
  cerrarEdicion(): void;
  publicarBorrador(): PaqueteIdioma | null;
}

export function crearEditor(almacen: AlmacenPaquetes): Editor {
  let estado: EditorEstado = leerEstado();
  let entradas: Record<string, string> = {};

  function leerEstado(): EditorEstado {
    let e: EditorEstado = { abierto: false };
    try {
      const bruto = almacen.listarPaquetes();
      for (const p of bruto) {
        if (p.codigo === "editor-state") {
          const parsed = JSON.parse(p.entradas["_estado"] ?? "{}") as EditorEstado;
          e = { ...e, ...parsed };
        }
      }
    } catch {
      // Estado corrupto, usar defecto
    }
    return e;
  }

  function guardarEstado(): void {
    const nuevoEstado: EditorEstado = { ...estado };
    const tempPaquete: Omit<PaqueteIdioma, "hash"> = {
      formato: "starseed-idioma",
      version: 1,
      codigo: "editor-state",
      nombre: "Estado Editor",
      dir: "ltr",
      autor: { nombre: "OS" },
      creado: new Date().toISOString(),
      revisado: { estado: "automatico" },
      licencia: "MIT",
      base: "es",
      entradas: {
        _estado: JSON.stringify(nuevoEstado),
      },
    };
    almacen.guardarPaquete({ ...tempPaquete, hash: "" } as PaqueteIdioma);
  }

  return {
    abrirEdicion(codigo, nombre) {
      if (!estado.abierto) {
        estado = { abierto: true, codigo, nombre };
        entradas = {};
        guardarEstado();
      }
    },

    paqueteEnEdicion(): PaqueteIdioma | null {
      if (!estado.abierto || !estado.codigo || !estado.nombre) {
        return null;
      }
      return {
        formato: "starseed-idioma",
        version: 1,
        codigo: estado.codigo,
        nombre: estado.nombre,
        dir: "ltr",
        autor: { nombre: "Usuario" },
        creado: new Date().toISOString(),
        revisado: { estado: "automatico" },
        licencia: "MIT",
        base: "es",
        entradas: { ...entradas },
        hash: "",
      };
    },

    anadirPendiente(textoEspanol): boolean {
      if (!estado.abierto) return false;
      const normalizado = normalizarTexto(textoEspanol);
      if (!normalizado) return false;
      if (normalizado.length > 500) return false;
      if (Object.keys(entradas).some((k) => entradas[k] === normalizado || k === normalizado)) return false;
      if (Object.keys(entradas).length >= 2000) return false;
      entradas[normalizado] = "";
      return true;
    },

    traducir(clave, valor) {
      if (!estado.abierto) return;
      entradas[clave] = valor;
    },

    importar(texto, formato): ResultadoImportarEditor {
      const importado =
        formato.tipo === "json-plano" ? desdeJsonPlano(texto)
        : formato.tipo === "json-anidado" ? desdeJsonAnidado(texto)
        : desdeCsv(texto, formato.separador);
      const descartadas = importado.descartadas;
      if (!estado.abierto) {
        descartadas.push({ motivo: "No hay paquete en edición" });
        return { entradas: 0, descartadas };
      }
      let casaron = 0;
      for (const [clave, valor] of Object.entries(importado.entradas)) {
        const normalizada = normalizarTexto(clave);
        if (!normalizada || normalizada.length > 500) {
          descartadas.push({ motivo: "Clave vacía o demasiado larga" });
          continue;
        }
        if (Object.keys(entradas).length >= 2000 && entradas[normalizada] === undefined) {
          descartadas.push({ motivo: `No se pudo añadir "${normalizada}" (tope de 2000 entradas)` });
          continue;
        }
        entradas[normalizada] = valor;
        casaron++;
      }
      return { entradas: casaron, descartadas };
    },

    pendientes(): string[] {
      return Object.entries(entradas)
        .filter(([, v]) => !v)
        .map(([k]) => k);
    },

    completadas(): string[] {
      return Object.entries(entradas)
        .filter(([, v]) => v)
        .map(([k]) => k);
    },

    cerrarEdicion() {
      estado = { abierto: false };
      entradas = {};
      guardarEstado();
    },

    publicarBorrador(): PaqueteIdioma | null {
      if (!estado.abierto || !estado.codigo || !estado.nombre) return null;
      const traducciones: Record<string, string> = {};
      for (const [clave, valor] of Object.entries(entradas)) {
        if (valor) traducciones[clave] = valor;
      }
      return {
        formato: "starseed-idioma",
        version: 1,
        codigo: estado.codigo,
        nombre: estado.nombre,
        dir: "ltr",
        autor: { nombre: "Usuario" },
        creado: new Date().toISOString(),
        revisado: { estado: "automatico" },
        licencia: "MIT",
        base: "es",
        entradas: traducciones,
        hash: "",
      };
    },
  };
}