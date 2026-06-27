"use client";
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Folder, PlusCircle, Search, Link2, FileText } from "lucide-react";

type CollectionItem = { id: string; type: string; name: string; avatar?: string; icon?: React.ReactNode };
type Collection = { id: string; name: string; description: string; items: CollectionItem[] };

// Sin colecciones de ejemplo: el usuario crea las suyas. Estado vacío real.
const collections: Collection[] = [];

export function CollectionsGrid() {
    const [selectedCollection, setSelectedCollection] = useState<(typeof collections)[0] | null>(null);

    const renderItemIcon = (item: any) => {
        switch (item.type) {
            case 'profile':
            case 'page':
                return (
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={item.avatar} data-ai-hint="avatar" />
                        <AvatarFallback>{item.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                );
            case 'publication':
                return <FileText className="w-6 h-6 text-muted-foreground" />;
            case 'file':
            default:
                return item.icon || <FileText className="w-6 h-6 text-muted-foreground" />;
        }
    };

    return (
        <Dialog>
            <div className="flex justify-end mb-4">
                <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Crear Nueva Colección
                </Button>
            </div>
            {collections.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/12 p-12 text-center text-sm text-muted-foreground">
                    Aún no tienes colecciones. Crea la primera para organizar perfiles, páginas y archivos.
                </div>
            )}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {collections.map(collection => (
                    <Card key={collection.id} className="hover:shadow-lg transition-shadow flex flex-col group hover:border-primary/30">
                        <CardHeader>
                            <div className="flex items-start gap-2">
                                <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                                    <Folder className="text-primary w-6 h-6" />
                                </div>
                                <div>
                                    <CardTitle className="font-headline text-lg group-hover:text-primary transition-colors">{collection.name}</CardTitle>
                                    <CardDescription>{collection.items.length} elementos</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                            <p className="text-sm text-muted-foreground mb-4 h-10 line-clamp-2">{collection.description}</p>
                            <div className="flex -space-x-2">
                                {collection.items.slice(0, 5).map((item) => (
                                    <div key={item.id} className="h-8 w-8 rounded-full bg-background border-2 border-muted flex items-center justify-center overflow-hidden">
                                        {renderItemIcon(item)}
                                    </div>
                                ))}
                                {collection.items.length > 5 && (
                                    <div className="h-8 w-8 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                                        <span className="text-xs font-bold">+{collection.items.length - 5}</span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="w-full" onClick={() => setSelectedCollection(collection)}>Ver Colección</Button>
                            </DialogTrigger>
                        </CardFooter>
                    </Card>
                ))}
            </div>

            <DialogContent className="sm:max-w-2xl h-[70vh] flex flex-col liquid-glass-ui">
                {selectedCollection && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="font-headline text-2xl flex items-center gap-2"><Folder className="w-6 h-6 text-primary" /> {selectedCollection.name}</DialogTitle>
                            <DialogDescription>{selectedCollection.description}</DialogDescription>
                        </DialogHeader>

                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Buscar en la colección..." className="pl-8" />
                            </div>
                            <Button><PlusCircle className="mr-2" />Añadir a la Colección</Button>
                        </div>

                        <div className="flex-1 overflow-y-auto -mx-6 px-6">
                            <div className="space-y-2 mt-4">
                                {selectedCollection.items.map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            {renderItemIcon(item)}
                                            <span className="font-medium text-sm">{item.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="capitalize">{item.type}</Badge>
                                            <Button variant="ghost" size="icon" className="h-8 w-8"><Link2 className="h-4 w-4" /></Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <DialogFooter>
                            <DialogTrigger asChild>
                                <Button variant="outline" onClick={() => setSelectedCollection(null)}>Cerrar</Button>
                            </DialogTrigger>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
