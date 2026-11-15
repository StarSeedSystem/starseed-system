"use client";

/**
 * IDI1115N · Ajustes › Neuronas: el idioma de esta neurona. El mismo selector de la ventana de acceso,
 * con el idioma actual y si su catálogo está revisado o es traducción automática.
 * Contrato: architecture/idiomas.md.
 */
import { SelectorIdioma } from "@/components/idiomas/selector-idioma";

export function AjusteIdioma() {
    return (
        <section aria-labelledby="ajuste-idioma-titulo" data-testid="ajuste-idioma" className="rounded-2xl border border-border/50 bg-card/40 p-4">
            <h3 id="ajuste-idioma-titulo" className="text-sm font-semibold">Idioma de esta neurona</h3>
            <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
                Cambia todos los textos de StarSeed OS en este aparato; tu cuenta lo recuerda para tus próximos aparatos. Lo que escriben las personas no se traduce.
            </p>
            <SelectorIdioma />
        </section>
    );
}
