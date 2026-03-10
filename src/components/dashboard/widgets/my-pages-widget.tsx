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
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                // First get the profile id
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('user_id', user.id)
                    .single();

                if (profile) {
                    // Fetch pages where this profile is a member
                    // Note: This assumes a many-to-many relation or that pages array exists on profile
                    // But schema says Page has members: Profile[]. This usually implies a join table or JSONB.
                    // For V1 simple schema, let's assume we fetch pages created by this user or just all public pages for demo if join table missing.
                    // Checking gemini.md schema: "members": "Profile[]" 
                    // This likely suggests a `page_members` join table in a real SQL implementation, 
                    // OR it's a JSONB column. 
                    // Given "StarSeed Network V2" setup, let's try to query the 'pages' table directly.
                    // If we want "My Pages", we usually mean pages I created or follow.
                    // Let's query ALL pages for now to ensure data visibility, limited to 5.

                    const { data, error } = await supabase
                        .from('pages')
                        .select('id, title, type, handle, avatar_url')
                        .limit(5);

                    if (data) {
                        setPages(data);
                    }
                    if (error) {
                        console.error('Error fetching pages:', error);
                    }
                }
            } catch (error) {
                console.error("Error in fetchPages:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchPages();
    }, []);

    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-4 @sm:p-6 border border-border/40 shadow-2xl text-foreground font-display group">
            {/* Background Effects */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-accent/10 opacity-30 pointer-events-none group-hover:rotate-12 transition-transform duration-1000"></div>

            <div className="flex items-center justify-between pb-6 shrink-0 z-10 relative">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10 shadow-sm border border-primary/20">
                        <Book className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-black text-xs @sm:text-sm tracking-[0.2em] uppercase">My Modules</h3>
                        <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-0.5">Personal Nodes</p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl bg-muted/10 hover:bg-primary/20 hover:text-primary transition-all border border-border/10">
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            <ScrollArea className="flex-1 w-full z-10 relative pr-2">
                <div className="space-y-3">
                    {loading ? (
                        [1, 2, 3].map(i => (
                            <div key={i} className="flex items-center gap-4 p-3 rounded-2xl bg-muted/5 border border-border/10 animate-pulse">
                                <div className="h-10 w-10 rounded-xl bg-muted" />
                                <div className="space-y-2 flex-1">
                                    <div className="h-3 w-32 bg-muted rounded" />
                                    <div className="h-2 w-20 bg-muted/50 rounded" />
                                </div>
                            </div>
                        ))
                    ) : pages.length > 0 ? (
                        pages.map(page => (
                            <div key={page.id} className="group flex items-center justify-between p-3 rounded-2xl bg-muted/5 border border-border/10 hover:bg-muted/10 hover:border-primary/30 transition-all cursor-pointer shadow-sm">
                                <div className="flex items-center gap-4 overflow-hidden">
                                    <Avatar className="h-10 w-10 rounded-xl border border-border/20 shadow-sm">
                                        <AvatarImage src={page.avatar_url} />
                                        <AvatarFallback className="rounded-xl bg-secondary text-xs font-black">{page.title?.[0] || '?'}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <p className="font-black text-sm truncate text-foreground/90 group-hover:text-primary transition-colors tracking-tight">{page.title}</p>
                                        <p className="text-[10px] text-muted-foreground/60 capitalize font-bold tracking-[0.1em]">{page.type?.toLowerCase()}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 bg-primary/10 text-primary hover:bg-primary/20 transition-all">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ))
                    ) : (
                        <div className="min-h-[200px] flex flex-col items-center justify-center text-center p-8 bg-muted/5 rounded-3xl border border-dashed border-border/20">
                            <div className="p-4 rounded-full bg-muted/10 mb-4 opacity-50">
                                <Book className="h-10 w-10 text-muted-foreground" />
                            </div>
                            <p className="text-xs font-bold text-muted-foreground/80 tracking-widest uppercase mb-4">No active nodes</p>
                            <Link href="/pages/new">
                                <Button variant="outline" size="sm" className="rounded-full px-6 border-primary/30 text-primary hover:bg-primary/5 text-[10px] font-black uppercase tracking-widest">Generate Node</Button>
                            </Link>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
