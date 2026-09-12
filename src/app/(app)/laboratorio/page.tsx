```tsx
import Laboratorio from "./components/laboratorio/laboratorio-astraura";

export default function LaboratorioPage() {
  return (
    <section className="flex min-h-[78vh] flex-1 flex-col">
      <header className="mb-3 shrink-0">
        <h1 className="text-2xl font-semibold">Laboratorio de Astraura</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El genoma de nueve capas fásicas, del núcleo ternario al contexto. Nada de lo que veas aquí escribe en el OS sin tu confirmación.
        </p>
      </header>
      <div className="min-h-[60vh] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Laboratorio />
      </div>
    </section>
  );
}
```