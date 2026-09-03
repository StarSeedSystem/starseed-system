"use client";

/**
 * CONEXIONES del perfil (Adenda 220): datos REALES en vez de los arrays vacíos
 * fijos de antes. Para el dueño lista sus páginas y grupos (`fetchMyEntities`)
 * y los recuentos reales de comunidades/grupos; para una visita, los recuentos
 * que se conocen y un estado vacío honesto.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Globe, Plus, Compass } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchMyEntities, type OsPage, type OsGroup } from "@/lib/os-social";

function inicial(n: string): string { return (n || "?").trim().charAt(0).toUpperCase() || "?"; }

export function ConnectionsWidget({
    isOwner = false,
    name,
    counts,
}: {
    isOwner?: boolean;
    name?: string;
    /** Recuentos reales (null = desconocido; no se pinta). */
    counts?: { comunidades?: number | null; grupos?: number | null };
}) {
    const [propias, setPropias] = useState<{ pages: OsPage[]; groups: OsGroup[] } | null>(null);
    const [cargando, setCargando] = useState(isOwner);

    useEffect(() => {
        let vivo = true;
        if (!isOwner) { setPropias(null); setCargando(false); return; }
        setCargando(true);
        fetchMyEntities()
            .then((r) => { if (vivo) setPropias({ pages: r.pages, groups: r.groups }); })
            .catch(() => { if (vivo) setPropias({ pages: [], groups: [] }); })
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, [isOwner]);

    const chips = [
        typeof counts?.comunidades === "number" ? { label: "comunidades", value: counts.comunidades, icon: Globe } : null,
        typeof counts?.grupos === "number" ? { label: "grupos", value: counts.grupos, icon: Users } : null,
    ].filter(Boolean) as Array<{ label: string; value: number; icon: typeof Globe }>;

    const total = (propias?.pages.length ?? 0) + (propias?.groups.length ?? 0);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Conexiones</CardTitle>
                <CardDescription>{isOwner ? "Páginas, comunidades y grupos de tu red." : `La red de ${name || "este perfil"}.`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {chips.length > 0 && (
                    <ul className="flex flex-wrap gap-2" aria-label="Recuentos de conexiones">
                        {chips.map((c) => (
                            <li key={c.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/80">
                                <c.icon className="h-3.5 w-3.5 text-primary" />
                                <span className="font-semibold text-white/95">{c.value.toLocaleString("es-ES")}</span> {c.label}
                            </li>
                        ))}
                    </ul>
                )}

                {isOwner ? (
                    cargando ? (
                        <div className="space-y-2"><Skeleton className="h-10 w-full rounded-lg" /><Skeleton className="h-10 w-3/4 rounded-lg" /></div>
                    ) : total === 0 ? (
                        <EmptyState
                            icon={Compass}
                            title="Aún no tienes páginas ni grupos"
                            description="Crea tu primera página o grupo, o únete a una comunidad desde el Hub."
                            className="py-8 sm:py-10"
                            action={
                                <>
                                    <Button asChild size="sm" variant="outline" className="cursor-pointer gap-1.5"><Link href="/hub"><Compass className="h-3.5 w-3.5" /> Explorar el Hub</Link></Button>
                                    <Button asChild size="sm" className="cursor-pointer gap-1.5"><Link href="/crear"><Plus className="h-3.5 w-3.5" /> Crear</Link></Button>
                                </>
                            }
                        />
                    ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                            {[...(propias?.pages ?? []).map((p) => ({ id: `p-${p.id}`, nombre: p.name, tipo: "Página", href: `/pagina/${p.slug}`, avatar: p.avatarUrl })),
                              ...(propias?.groups ?? []).map((g) => ({ id: `g-${g.id}`, nombre: g.name, tipo: "Grupo", href: `/grupo/${g.slug}`, avatar: g.avatarUrl }))]
                                .slice(0, 8)
                                .map((c) => (
                                    <Link key={c.id} href={c.href} className="-ml-2 flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/[0.05]">
                                        <Avatar className="h-9 w-9">
                                            {c.avatar ? <AvatarImage src={c.avatar} alt="" /> : null}
                                            <AvatarFallback>{inicial(c.nombre)}</AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">{c.nombre}</p>
                                            <p className="text-xs text-muted-foreground">{c.tipo}</p>
                                        </div>
                                    </Link>
                                ))}
                        </div>
                    )
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {chips.length > 0 ? "Las páginas y grupos concretos se muestran cuando la persona los hace públicos." : "Esta persona todavía no ha hecho públicas sus conexiones."}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
