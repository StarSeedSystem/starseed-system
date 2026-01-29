'use client';

import { Button } from "@/components/ui/button";
import { Book, Plus, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

export function MyPagesWidget() {
    const [pages, setPages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        async function fetchPages() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user.id).single();

            if (profile) {
                // Mock data for now if DB is empty to show UI potential
                // In production, uncomment the real fetch
                // const { data } = await supabase.from('pages').select('*').limit(5);

                // MOCK DATA FOR DEMO
                const mockPages = [
                    { id: '1', name: 'Jardines Comunitarios', type: 'COLECTIVO', handle: 'jardines-cdmx', avatar_url: null },
                    { id: '2', name: 'Asamblea Zona Norte', type: 'ORGANIZACION', handle: 'asamblea-norte', avatar_url: null },
                    { id: '3', name: 'Taller de Arte', type: 'PROYECTO', handle: 'taller-arte', avatar_url: null },
                ];
                setPages(mockPages);
            }
            setLoading(false);
        }
        fetchPages();
    }, []);

    return (
        <div className="flex h-full flex-col p-0 overflow-hidden bg-card/30 backdrop-blur-sm">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <Book className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm font-semibold">Mis Páginas</h3>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Plus className="h-4 w-4 text-muted-foreground hover:text-primary" />
                </Button>
            </div>

            <ScrollArea className="flex-1 p-2">
                <div className="space-y-1">
                    {loading ? (
                        [1, 2, 3].map(i => (
                            <div key={i} className="flex items-center gap-3 p-2 rounded-lg">
                                <div className="h-8 w-8 rounded-md bg-muted animate-pulse" />
                                <div className="space-y-1 flex-1">
                                    <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                                    <div className="h-2 w-16 bg-muted/50 animate-pulse rounded" />
                                </div>
                            </div>
                        ))
                    ) : pages.length > 0 ? (
                        pages.map(page => (
                            <div key={page.id} className="group flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-all cursor-pointer">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <Avatar className="h-9 w-9 rounded-md border border-border/50">
                                        <AvatarImage src={page.avatar_url} />
                                        <AvatarFallback className="rounded-md bg-secondary text-xs">{page.name[0]}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm truncate text-foreground/90 group-hover:text-primary transition-colors">{page.name}</p>
                                        <p className="text-[10px] text-muted-foreground capitalize font-medium tracking-wide">{page.type.toLowerCase()}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                </Button>
                            </div>
                        ))
                    ) : (
                        <div className="h-[150px] flex flex-col items-center justify-center text-center p-4 text-muted-foreground">
                            <Book className="h-8 w-8 mb-2 opacity-20" />
                            <p className="text-xs">Sin páginas activas</p>
                            <Button variant="link" size="sm" className="text-xs h-6">Crear una</Button>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
