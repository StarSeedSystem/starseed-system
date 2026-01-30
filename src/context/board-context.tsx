"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

// --- Types ---

export type WidgetType = "note" | "image" | "checklist" | "ai";

export interface BoardWidget {
    i: string; // Unique ID for RGL
    x: number;
    y: number;
    w: number;
    h: number;
    type: WidgetType;
    content: any; // Flexible payload
    layer?: number; // z-index
}

export interface Board {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    isPublic: boolean;
    widgets: BoardWidget[];
    theme: "glass" | "cyber" | "minimal" | "grid";
    thumbnail?: string; // Optional: could be a dataURL in future
}

interface BoardContextType {
    boards: Board[];
    activeBoardId: string | null;
    viewMode: "panel" | "fullscreen";
    marketplaceBoards: Board[]; // NEW

    // Actions
    createBoard: (name: string, isPublic?: boolean) => void;
    deleteBoard: (id: string) => void;
    updateBoard: (id: string, updates: Partial<Board>) => void;
    setActiveBoard: (id: string | null) => void;
    setViewMode: (mode: "panel" | "fullscreen") => void;
    addWidgetToActiveBoard: (type: WidgetType, initialContent?: any) => void;
    removeWidgetFromActiveBoard: (widgetId: string) => void;
    updateWidgetOnActiveBoard: (widgetId: string, updates: Partial<BoardWidget>) => void;
    publishBoard: (boardId: string) => void; // NEW
    installBoard: (boardId: string) => void; // NEW
}

const BoardContext = createContext<BoardContextType | undefined>(undefined);

// --- Provider ---

const STORAGE_KEY = "starseed_boards";

export function BoardProvider({ children }: { children: ReactNode }) {
    const [boards, setBoards] = useState<Board[]>([]);
    const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"panel" | "fullscreen">("panel");
    const [isLoaded, setIsLoaded] = useState(false);

    // Marketplace State
    const [marketplaceBoards, setMarketplaceBoards] = useState<Board[]>([
        {
            id: "mp-1",
            name: "Community Starter Kit",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isPublic: true,
            theme: "cyber",
            widgets: [
                {
                    i: "mp-w-1",
                    x: 0,
                    y: 0,
                    w: 4,
                    h: 2,
                    type: "note",
                    content: { title: "Welcome!", text: "This is a starter kit from the community marketplace." }
                }
            ]
        }
    ]);

    // Load from LocalStorage
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setBoards(parsed);
            } catch (e) {
                console.error("Failed to parse boards", e);
            }
        }
        setIsLoaded(true);
    }, []);

    // Save to LocalStorage
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
        }
    }, [boards, isLoaded]);

    const createBoard = (name: string, isPublic: boolean = false) => {
        const newBoard: Board = {
            id: uuidv4(),
            name: name || "Untitled Board",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isPublic,
            widgets: [],
            theme: "glass",
        };
        setBoards((prev) => [newBoard, ...prev]);
        setActiveBoardId(newBoard.id);
        toast.success("Board created successfully!");
    };

    const deleteBoard = (id: string) => {
        setBoards((prev) => prev.filter((b) => b.id !== id));
        if (activeBoardId === id) {
            setActiveBoardId(null);
        }
        toast.success("Board deleted");
    };

    const updateBoard = (id: string, updates: Partial<Board>) => {
        setBoards((prev) =>
            prev.map((b) => (b.id === id ? { ...b, ...updates, updatedAt: Date.now() } : b))
        );
    };

    const publishBoard = (boardId: string) => {
        const boardToPublish = boards.find(b => b.id === boardId);
        if (!boardToPublish) return;

        const publishedCopy: Board = {
            ...boardToPublish,
            id: uuidv4(), // New ID for the marketplace version
            name: `${boardToPublish.name} (Published)`,
            updatedAt: Date.now(),
            isPublic: true,
        };

        setMarketplaceBoards(prev => [publishedCopy, ...prev]);
        toast.success(`Published "${boardToPublish.name}" to Marketplace!`);
    };

    const installBoard = (boardId: string) => {
        const boardToInstall = marketplaceBoards.find(b => b.id === boardId);
        if (!boardToInstall) return;

        const installedCopy: Board = {
            ...boardToInstall,
            id: uuidv4(),
            name: `${boardToInstall.name} (Copy)`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isPublic: false,
        };

        setBoards(prev => [installedCopy, ...prev]);
        toast.success(`Installed "${boardToInstall.name}"!`);
    };

    const addWidgetToActiveBoard = (type: WidgetType, initialContent: any = {}) => {
        if (!activeBoardId) return;

        const newWidget: BoardWidget = {
            i: uuidv4(),
            x: 0,
            y: 0, // Should nominally place at center or reasonable void
            w: type === "note" ? 2 : 4,
            h: type === "note" ? 2 : 4,
            type,
            content: initialContent,
        };

        updateBoard(activeBoardId, {
            widgets: [...(boards.find((b) => b.id === activeBoardId)?.widgets || []), newWidget],
        });
    };

    const removeWidgetFromActiveBoard = (widgetId: string) => {
        if (!activeBoardId) return;
        const currentBoard = boards.find((b) => b.id === activeBoardId);
        if (!currentBoard) return;

        updateBoard(activeBoardId, {
            widgets: currentBoard.widgets.filter((w) => w.i !== widgetId),
        });
    };

    const updateWidgetOnActiveBoard = (widgetId: string, updates: Partial<BoardWidget>) => {
        if (!activeBoardId) return;
        const currentBoard = boards.find((b) => b.id === activeBoardId);
        if (!currentBoard) return;

        const updatedWidgets = currentBoard.widgets.map((w) =>
            w.i === widgetId ? { ...w, ...updates } : w
        );
        updateBoard(activeBoardId, { widgets: updatedWidgets });
    };

    return (
        <BoardContext.Provider
            value={{
                boards,
                activeBoardId,
                viewMode,
                marketplaceBoards,
                createBoard,
                deleteBoard,
                updateBoard,
                setActiveBoard: setActiveBoardId,
                setViewMode,
                addWidgetToActiveBoard,
                removeWidgetFromActiveBoard,
                updateWidgetOnActiveBoard,
                publishBoard,
                installBoard
            }}
        >
            {children}
        </BoardContext.Provider>
    );
}

export function useBoardSystem() {
    const context = useContext(BoardContext);
    if (context === undefined) {
        throw new Error("useBoardSystem must be used within a BoardProvider");
    }
    return context;
}
