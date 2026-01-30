"use client";

import React, { useState } from "react";
import { useBoardSystem } from "@/context/board-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Layout, Lock, Globe, Monitor, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function BoardManager() {
    const { boards, createBoard, deleteBoard, setActiveBoard, activeBoardId } = useBoardSystem();
    const [newBoardName, setNewBoardName] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const handleCreate = () => {
        if (!newBoardName.trim()) return;
        createBoard(newBoardName);
        setNewBoardName("");
        setIsCreating(false);
    };

    return (
        <div className="h-full flex flex-col space-y-4">
            {/* Header / Actions */}
            <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest">My Boards</h3>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-dashed"
                    onClick={() => setIsCreating(!isCreating)}
                >
                    <Plus className="w-3 h-3" /> New Board
                </Button>
            </div>

            {/* Creation Mode */}
            {isCreating && (
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg animate-in fade-in slide-in-from-top-2">
                    <Input
                        value={newBoardName}
                        onChange={(e) => setNewBoardName(e.target.value)}
                        placeholder="Board name..."
                        className="h-8 text-sm"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    />
                    <Button size="sm" onClick={handleCreate} disabled={!newBoardName.trim()} className="h-8">Create</Button>
                </div>
            )}

            {/* Board Grid */}
            <div className="grid grid-cols-1 gap-3 overflow-y-auto pb-10 pr-2 scrollbar-thin">
                {boards.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground/50 border-2 border-dashed border-muted rounded-xl bg-muted/5">
                        <Layout className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">No boards yet.</p>
                    </div>
                ) : (
                    boards.map((board) => (
                        <div
                            key={board.id}
                            onClick={() => setActiveBoard(board.id)}
                            className={cn(
                                "group relative p-3 rounded-lg border transition-all cursor-pointer hover:shadow-md",
                                activeBoardId === board.id
                                    ? "bg-primary/5 border-primary/50 shadow-sm ring-1 ring-primary/20"
                                    : "bg-card border-border/50 hover:bg-muted/20"
                            )}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "w-8 h-8 rounded-md flex items-center justify-center bg-muted/50 text-muted-foreground",
                                        activeBoardId === board.id && "bg-primary/10 text-primary"
                                    )}>
                                        <Layout className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h4 className={cn("text-sm font-medium leading-none", activeBoardId === board.id && "text-primary")}>
                                            {board.name}
                                        </h4>
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                            {formatDistanceToNow(board.updatedAt, { addSuffix: true })}
                                        </p>
                                    </div>
                                </div>

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <MoreVertical className="w-3 h-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => { e.stopPropagation(); deleteBoard(board.id) }}>
                                            <Trash2 className="w-3 h-3 mr-2" /> Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                                    {board.widgets.length} items
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {board.isPublic ? (
                                        <Globe className="w-3 h-3 text-green-500/70" />
                                    ) : (
                                        <Lock className="w-3 h-3 text-muted-foreground/50" />
                                    )}
                                </div>
                            </div>

                            {/* Active Indicator Strip */}
                            {activeBoardId === board.id && (
                                <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-primary rounded-r-full" />
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
