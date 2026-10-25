/**
 * ArtCraft · TABLAS de la lista permitida. Módulo PURO: solo datos.
 * Contrato: `architecture/artcraft-y-rare.md` §3.2 (lista permitida, primera versión).
 * Cualquier herramienta que no esté en `libre` ni en `trabajo` se deniega.
 */

export type AppArtcraft = "figcraft" | "gridcraft" | "deckcraft";

export const APPS_ARTCRAFT: readonly AppArtcraft[] = ["figcraft", "gridcraft", "deckcraft"];

export interface TablaHerramientas {
  libre: string[];
  trabajo: string[];
  vetadas: string[];
}

export const HERRAMIENTAS: Record<AppArtcraft, TablaHerramientas> = {
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

export const PREFIJOS_VETADOS: Record<AppArtcraft, string[]> = {
  figcraft: ["collab.", "plugin.", "widget.insert"],
  gridcraft: ["automate."],
  deckcraft: [],
};
