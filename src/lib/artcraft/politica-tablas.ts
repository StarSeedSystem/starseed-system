/**
 * Pasarela ArtCraft · TABLAS de la política pura (contrato: `architecture/artcraft-y-rare.md` §3.2).
 * Solo DATOS: lista permitida por app, herramientas libres/trabajo/vetadas y prefijos vetados.
 * Sin lógica, sin `node:*`, sin React, sin red.
 */
export type AppArtcraft = "figcraft" | "gridcraft" | "deckcraft";

export const APPS_ARTCRAFT: readonly AppArtcraft[] = ["figcraft", "gridcraft", "deckcraft"] as const;

export interface TablasApp {
  libre: readonly string[];
  trabajo: readonly string[];
  vetadas: readonly string[];
}

export const HERRAMIENTAS: Record<AppArtcraft, TablasApp> = {
  figcraft: {
    libre: ["list_commands", "inspect_document", "get_node", "screenshot", "inspect_ui", "undo", "redo"],
    trabajo: ["create_node", "set_properties", "batch", "run_command", "export", "open_file", "save_file"],
    vetadas: ["pointer", "key", "type_text", "select"],
  },
  gridcraft: {
    libre: ["list_commands", "list_functions", "inspect_workbook", "read_range", "get_cell", "evaluate_formula", "screenshot"],
    trabajo: ["write_range", "set_cell", "format_range", "insert_chart", "create_table", "sort_range", "filter", "new_workbook", "open_workbook", "save_workbook", "execute_command", "undo", "redo"],
    vetadas: ["select"],
  },
  deckcraft: {
    libre: ["list_commands", "inspect_document", "inspect_slide", "render_slide", "screenshot"],
    trabajo: ["new_presentation", "open_presentation", "save_presentation", "export", "add_slide", "add_shape", "add_text_box", "set_text", "insert_picture", "insert_table", "insert_chart", "batch", "run_command", "go_to_slide"],
    vetadas: ["call_app", "pointer", "key", "type_text", "select", "select_tool"],
  },
} as const;

export const PREFIJOS_VETADOS: Record<AppArtcraft, readonly string[]> = {
  figcraft: ["collab.", "plugin.", "widget.insert"] as const,
  gridcraft: ["automate."] as const,
  deckcraft: [] as const,
} as const;