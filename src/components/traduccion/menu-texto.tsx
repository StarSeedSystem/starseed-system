export function registrarEntradaMenuTexto(entrada: EntradaMenuTexto): () => void {
  entradas = [...entradas.filter((x) => x.id !== entrada.id), entrada];
  return () => {
    entradas = entradas.filter((x) => x.id !== entrada.id);
  };
}

// Default translations entries
registrarEntradaMenuTexto({ id: "traducir-sel", etiqueta: "Traducir selección", ejecutar: () => {} });
registrarEntradaMenuTexto({ id: "traducir-par", etiqueta: "Traducir este párrafo", ejecutar: () => {} });
registrarEntradaMenuTexto({ id: "traducir-pag", etiqueta: "Traducir toda la página", visible: (ctx) => !ctx.paginaTraducida, ejecutar: () => {} });
registrarEntradaMenuTexto({ id: "ver-orig", etiqueta: "Ver original", visible: (ctx) => ctx.paginaTraducida, ejecutar: () => {} });
