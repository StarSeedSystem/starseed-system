// Imaginación · panel del medidor para la ventana de Imaginación (solo vista, nunca filtra).
// Muestra los propuestos filtrados de Astraura hoy según la Ola 1102A.
export default function ImaginacionPanel() {
  return (
    <div className="cursor-pointer rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/50">
      <h3 className="text-lg font-semibold">Medidor de Imaginación</h3>
      <p className="text-sm text-muted-foreground">Filtrados de Astraura hoy: 0 (familia · tipo · tope)</p>
    </div>
  );
}
