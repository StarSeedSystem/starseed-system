"use client";

import React from "react";
import { useBoardSystem } from "@/context/board-context";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Users, Sparkles } from "lucide-react";

export function MarketplaceView() {
    const { marketplaceBoards, installBoard } = useBoardSystem();

    return (
        <div className="h-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10">
            <div className="mb-8">
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                    Bibliotecas (Marketplace)
                </h2>
                <p className="text-muted-foreground">
                    Explore and install boards created by the StarSeed community.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {marketplaceBoards.map((board) => (
                    <Card key={board.id} className="bg-black/40 border-white/10 backdrop-blur-md overflow-hidden hover:border-indigo-500/50 transition-all group">
                        <div className="h-32 bg-gradient-to-br from-indigo-900/20 to-purple-900/20 relative group-hover:from-indigo-900/30 group-hover:to-purple-900/30 transition-all">
                            <div className="absolute inset-0 flex items-center justify-center opacity-30">
                                <Sparkles className="w-12 h-12 text-indigo-400" />
                            </div>
                        </div>
                        <CardHeader>
                            <CardTitle className="flex justify-between items-start">
                                <span className="truncate">{board.name}</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center text-xs text-muted-foreground gap-4">
                                <div className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    <span>Community</span>
                                </div>
                                <div>
                                    {board.widgets.length} Widgets
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button
                                className="w-full bg-white/5 hover:bg-white/10 text-indigo-300 border border-white/5 hover:border-indigo-500/30 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300"
                                onClick={() => installBoard(board.id)}
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Install Board
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    );
}
