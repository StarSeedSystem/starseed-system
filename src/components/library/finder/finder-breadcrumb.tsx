"use client";

// Breadcrumb propio (no hay componente shadcn Breadcrumb en el repo): ruta de
// folders desde la raíz hasta el folder activo, cada tramo clicable.

import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LibraryFolder } from "@/lib/library/entity-library";

export function FinderBreadcrumb({
    path,
    onNavigate,
}: {
    path: LibraryFolder[];
    onNavigate: (folderId: string | null) => void;
}) {
    return (
        <nav className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="Ruta de folders">
            <button
                type="button"
                onClick={() => onNavigate(null)}
                className={cn(
                    "flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-medium transition-colors hover:bg-white/5 hover:text-white",
                    path.length === 0 && "text-white",
                )}
            >
                <Home className="h-3 w-3" /> Biblioteca
            </button>
            {path.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 opacity-40" />
                    <button
                        type="button"
                        onClick={() => onNavigate(f.id)}
                        className={cn(
                            "cursor-pointer rounded-md px-1.5 py-0.5 font-medium transition-colors hover:bg-white/5 hover:text-white",
                            i === path.length - 1 && "text-white",
                        )}
                    >
                        {f.name}
                    </button>
                </span>
            ))}
        </nav>
    );
}

export default FinderBreadcrumb;
