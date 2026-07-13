"use client";

/*
 * UserDirectoryResults — resultados de PERSONAS del Buscador Universal del Hub.
 * ---------------------------------------------------------------------------
 * Búsqueda en el directorio de usuarios (os_profiles) con avatar y acciones
 * rápidas Mensaje (crea/abre un DM real) y Seguir (mismo mecanismo `os_follows`
 * que el resto del sistema usa para páginas/perfiles públicos, con
 * page_slug=username — no existe todavía una tabla de "seguir cuenta" separada
 * y esta es la primitiva real y consistente con la arquitectura Cuenta/Perfil).
 *
 * Se monta DEBAJO de <UniversalSearchBox> en la pestaña "Buscador" del Hub
 * (inserción acotada, no sustituye nada existente). También expone
 * <UserRecommendationsStrip> para "Personas que quizá conozcas" (recommendations()).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    ArrowUpRight, Loader2, MessageSquare, Sparkles, UserCheck, UserPlus,
    Users, Users2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    recommendations,
    type OsProfile, type SocialGroupHit, type UserRecommendation,
} from "@/lib/social/os-profiles";
// (Adenda 67 · P4-5) Búsqueda UNIFICADA: usa Typesense si el usuario lo tiene
// configurado y habilitado; si no —o si falla— cae SOLA a la misma búsqueda de
// Supabase de siempre. Misma firma que `os-profiles`, cero cambios de uso.
import { searchUsers, searchGroups } from "@/lib/search/unified-search";
import { createDm } from "@/lib/messages/dm";
import { isFollowing, setFollow } from "@/lib/os-social";

function MessageButton({ userId }: { userId: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const handleClick = async () => {
        setLoading(true);
        try {
            const res = await createDm(userId);
            if (res.needsAuth) {
                toast.error("Inicia sesión para escribir a alguien.");
                return;
            }
            if (!res.ok || !res.thread) {
                toast.error(res.error || "No se pudo iniciar la conversación.");
                return;
            }
            router.push("/messages");
        } finally {
            setLoading(false);
        }
    };
    return (
        <Button size="sm" variant="outline" className="h-8 cursor-pointer gap-1.5 text-xs" onClick={() => void handleClick()} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
            Mensaje
        </Button>
    );
}

function FollowButton({ username }: { username: string }) {
    const [following, setFollowing] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        void isFollowing(username).then(setFollowing);
    }, [username]);

    const handleClick = async () => {
        setLoading(true);
        try {
            const res = await setFollow(username, !following);
            if (res.needsAuth) {
                toast.error("Inicia sesión para seguir a alguien.");
                return;
            }
            if (res.ok) setFollowing(!!res.active);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            size="sm"
            variant={following ? "outline" : "default"}
            className={cn("h-8 cursor-pointer gap-1.5 text-xs", following && "border-emerald-500/40 text-emerald-300 bg-emerald-500/10")}
            onClick={() => void handleClick()}
            disabled={loading}
        >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : following ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
            {following ? "Siguiendo" : "Seguir"}
        </Button>
    );
}

function UserRow({ profile }: { profile: OsProfile | UserRecommendation }) {
    const reason = (profile as UserRecommendation).reason;
    return (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <Avatar className="h-10 w-10 ring-2 ring-white/10 shrink-0">
                <AvatarImage src={profile.avatarUrl} />
                <AvatarFallback className="bg-primary/15 text-primary font-bold">{profile.displayName[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{profile.displayName}</p>
                <p className="text-[11px] text-muted-foreground truncate">@{profile.username}</p>
                {reason && (
                    <div className="flex items-start gap-1 mt-1">
                        <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-primary" />
                        <span className="text-[11px] text-primary/90 leading-snug">{reason}</span>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
                <MessageButton userId={profile.userId} />
                <FollowButton username={profile.username} />
            </div>
        </div>
    );
}

export function UserDirectoryResults({ query }: { query: string }) {
    const [results, setResults] = useState<OsProfile[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const term = query.trim();
        if (term.length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);
        const t = setTimeout(async () => {
            setResults(await searchUsers(term));
            setLoading(false);
        }, 250);
        return () => clearTimeout(t);
    }, [query]);

    if (query.trim().length < 2) return null;

    return (
        <div className="rounded-2xl border border-white/5 bg-black/20 backdrop-blur-md p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/10 text-primary">
                        <Users className="w-4 h-4" />
                    </span>
                    <h3 className="text-sm font-black uppercase tracking-wider text-foreground/90">Personas</h3>
                </div>
                {results.length > 0 && (
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                        {results.length}
                    </Badge>
                )}
            </div>
            {loading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando personas…
                </div>
            ) : results.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Ninguna persona coincide con "{query.trim()}".</p>
            ) : (
                <div className="space-y-2">
                    {results.map((p) => <UserRow key={p.userId} profile={p} />)}
                </div>
            )}
        </div>
    );
}

const GROUP_KIND_META: Record<SocialGroupHit["kind"], { label: string; accent: string }> = {
    pagina: { label: "Página", accent: "text-cyan-300 border-cyan-500/30 bg-cyan-500/10" },
    comunidad: { label: "Comunidad", accent: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" },
    grupo: { label: "Grupo", accent: "text-purple-300 border-purple-500/30 bg-purple-500/10" },
};

function GroupRow({ hit }: { hit: SocialGroupHit }) {
    const meta = GROUP_KIND_META[hit.kind];
    return (
        <Link
            href={`/pagina/${hit.slug}`}
            className="group/item flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 hover:border-primary/30 transition-colors cursor-pointer"
        >
            <Avatar className="h-10 w-10 ring-2 ring-white/10 shrink-0">
                <AvatarImage src={hit.avatarUrl} />
                <AvatarFallback className="bg-primary/15 text-primary font-bold">{hit.name[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate group-hover/item:text-primary transition-colors">{hit.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", meta.accent)}>{meta.label}</Badge>
                    {hit.memberCount > 0 && (
                        <span className="text-[11px] text-muted-foreground">{hit.memberCount.toLocaleString()} miembros</span>
                    )}
                </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-muted-foreground shrink-0 opacity-0 group-hover/item:opacity-100 group-hover/item:text-primary transition-all" />
        </Link>
    );
}

/** Resultados de GRUPOS/páginas/comunidades del Buscador Universal del Hub. */
export function GroupDirectoryResults({ query }: { query: string }) {
    const [results, setResults] = useState<SocialGroupHit[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const term = query.trim();
        if (term.length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);
        const t = setTimeout(async () => {
            setResults(await searchGroups(term));
            setLoading(false);
        }, 250);
        return () => clearTimeout(t);
    }, [query]);

    if (query.trim().length < 2) return null;

    return (
        <div className="rounded-2xl border border-white/5 bg-black/20 backdrop-blur-md p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/10 text-primary">
                        <Users2 className="w-4 h-4" />
                    </span>
                    <h3 className="text-sm font-black uppercase tracking-wider text-foreground/90">Grupos y páginas</h3>
                </div>
                {results.length > 0 && (
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                        {results.length}
                    </Badge>
                )}
            </div>
            {loading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando grupos y páginas…
                </div>
            ) : results.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Ningún grupo o página coincide con "{query.trim()}".</p>
            ) : (
                <div className="space-y-2">
                    {results.map((hit) => <GroupRow key={`${hit.kind}:${hit.slug}`} hit={hit} />)}
                </div>
            )}
        </div>
    );
}

/** Tira de "Personas que quizá conozcas" — sugerencias honestas (tags/grupos comunes). */
export function UserRecommendationsStrip() {
    const [recs, setRecs] = useState<UserRecommendation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        void recommendations().then((r) => {
            setRecs(r);
            setLoading(false);
        });
    }, []);

    if (loading || recs.length === 0) return null;

    return (
        <div className="space-y-3">
            <div className="section-label px-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" /> Personas que quizá conozcas
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recs.map((p) => <UserRow key={p.userId} profile={p} />)}
            </div>
        </div>
    );
}

export default UserDirectoryResults;
