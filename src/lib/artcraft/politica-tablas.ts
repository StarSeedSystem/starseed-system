/**
 * Pasarela ArtCraft · TABLAS de la lista permitida (contrato: `architecture/artcraft-y-rare.md` §3.2).
 * Módulo PURO y SOLO DE DATOS: sin lógica, sin `node:*`, sin React, sin red.
 * La lógica que lee estas tablas vive en `politica.ts`; aquí no se decide nada.
 */

export type AppArtcraft = "figcraft" | "gridcraft" | "deckcraft";

/** Las tres Craft Apps que pasan por la pasarela, en el orden del contrato. */
export const APPS_ARTCRAFT: readonly AppArtcraft[] = ["figcraft", "gridcraft", "deckcraft"];

export interface TablasApp {
  /** Lectura libre dentro del directorio de trabajo. */
  libre: string[];
  /** Escritura dentro del directorio de trabajo, sujeta al ámbito y la confirmación. */
  trabajo: string[];
  /** Vetadas siempre, también para una persona desde un agente. */
  vetadas: string[];
}

/** Lista permitida de §3.2, copiada tal cual. Lo que no esté aquí se deniega. */
export const HERRAMIENTAS: Record<AppArtcraft, TablasApp> = {
  figcraft: {
    libre: ["list_commands", "inspect_document", "get_node", "screenshot", "inspect_ui", "undo", "redo"],
    trabajo: ["create_node", "set_properties", "batch", "run_command", "export", "open_file", "save_file"],
    vetadas: ["pointer", "key", "type_text", "select"],
  },
  gridcraft: {
    libre: ["list_commands", "list_functions", "inspect_workbook", "read_range", "get_cell", "evaluate_formula", "screenshot"],
    trabajo: [
      "write_range", "set_cell", "format_range", "insert_chart", "create_table", "sort_range", "filter",
      "new_workbook", "open_workbook", "save_workbook", "execute_command", "undo", "redo",
    ],
    vetadas: ["select"],
  },
  deckcraft: {
    libre: ["list_commands", "inspect_document", "inspect_slide", "render_slide", "screenshot"],
    trabajo: [
      "new_presentation", "open_presentation", "save_presentation", "export", "add_slide", "add_shape",
      "add_text_box", "set_text", "insert_picture", "insert_table", "insert_chart", "batch", "run_command",
      "go_to_slide",
    ],
    vetadas: ["call_app", "pointer", "key", "type_text", "select", "select_tool"],
  },
};

/** Prefijos de orden vetados dentro de `run_command`, `execute_command` y `batch` (§3.2). */
export const PREFIJOS_VETADOS: Record<AppArtcraft, string[]> = {
  figcraft: ["collab.", "plugin.", "widget.insert"],
  gridcraft: ["automate."],
  deckcraft: [],
};
