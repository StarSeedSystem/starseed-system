"use client";

/**
 * Submenú «Guardar en carpeta del chat ▸» (vertical), compartido por las burbujas y por el
 * explorador de archivos del hilo. Lista las carpetas del chat y ofrece crear una al vuelo.
 */
import { toast } from "sonner";
import { FolderPlus, Folder, Globe2, Lock, Users } from "lucide-react";
import {
    DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { usePrompt } from "@/components/ui/confirm-dialog";
import { useContextoHilo, type NuevoItemCarpeta } from "@/components/messages/dm/contexto-hilo";
import type { VisibilidadCarpeta } from "@/lib/mensajeria/carpetas-tipos";

export const ICONO_VISIBILIDAD: Record<VisibilidadCarpeta, typeof Lock> = {
    privada: Lock,
    chat: Users,
    publica: Globe2,
};

export function SubmenuGuardarEnCarpeta({ item }: { item: NuevoItemCarpeta }) {
    const ctx = useContextoHilo();
    const pedir = usePrompt();
    if (!ctx) return null;
    const { carpetas } = ctx;
    const vivas = carpetas.carpetas.filter((c) => !c.borrado);

    const guardar = async (carpetaId: string, nombre: string) => {
        try {
            await carpetas.agregarItem(carpetaId, item);
            toast.success(`Guardado en «${nombre}»`);
        } catch {
            toast.error("No se pudo guardar en la carpeta. Inténtalo de nuevo.");
        }
    };

    const nueva = async () => {
        const nombre = await pedir({
            title: "Nueva carpeta del chat",
            description: "Solo la verás tú. Luego puedes compartirla con el chat o publicarla.",
            label: "Nombre",
            placeholder: "Recetas, viaje, documentos…",
            confirmText: "Crear y guardar",
        });
        if (!nombre?.trim()) return;
        const c = await carpetas.crear(nombre.trim(), "privada");
        if (!c) {
            toast.error(carpetas.error || "No se pudo crear la carpeta.");
            return;
        }
        await guardar(c.id, c.nombre);
    };

    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer gap-2">
                <Folder className="h-4 w-4" /> Guardar en carpeta del chat
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="z-[140] min-w-[220px] max-w-[280px]" collisionPadding={12}>
                {vivas.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-white/55">Aún no hay carpetas en este chat.</p>
                )}
                {vivas.map((c) => {
                    const Icono = ICONO_VISIBILIDAD[c.visibilidad] ?? Lock;
                    return (
                        <DropdownMenuItem key={c.id} className="cursor-pointer gap-2" onSelect={() => void guardar(c.id, c.nombre)}>
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                            <Icono className="h-3.5 w-3.5 shrink-0 text-white/45" aria-label={c.visibilidad} />
                        </DropdownMenuItem>
                    );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => void nueva()}>
                    <FolderPlus className="h-4 w-4" /> Nueva carpeta…
                </DropdownMenuItem>
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    );
}

export default SubmenuGuardarEnCarpeta;
