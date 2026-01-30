"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { useBoardSystem } from "./board-context"; // Import for analysis

// --- Types ---

export interface MemoryNode {
    id: string;
    type: "interest" | "widget_preference" | "topic" | "interaction" | "trait";
    value: string;
    weight: number; // 0.0 to 1.0 (confidence/importance)
    timestamp: number;
    source?: string; // e.g., "board:Quantum Physics", "profile:bio"
}

interface UserContextType {
    memory: MemoryNode[];
    addMemory: (type: MemoryNode["type"], value: string, weight?: number, source?: string) => void;
    recall: (query: string) => MemoryNode[]; // Simulated vector search
    analyzeContext: () => void; // Scans boards/profile to update memory
    getContextSummary: () => string; // Returns a natural language summary of the user
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// --- Provider ---

const MEMORY_STORAGE_KEY = "starseed_user_memory";

export function UserProvider({ children }: { children: ReactNode }) {
    const [memory, setMemory] = useState<MemoryNode[]>([]);

    // We access board system to analyze it
    const { boards } = useBoardSystem();

    // Load detailed memory on mount
    useEffect(() => {
        const saved = localStorage.getItem(MEMORY_STORAGE_KEY);
        if (saved) {
            try {
                setMemory(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to load user memory", e);
            }
        }
    }, []);

    // Save memory on change
    useEffect(() => {
        if (memory.length > 0) {
            localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memory));
        }
    }, [memory]);

    const addMemory = (type: MemoryNode["type"], value: string, weight: number = 0.5, source?: string) => {
        setMemory(prev => {
            // Check if exists to avoid duplicates, effectively updating weight usually
            const existingIndex = prev.findIndex(m => m.type === type && m.value.toLowerCase() === value.toLowerCase());

            if (existingIndex >= 0) {
                // Reinforce existing memory
                const newMemory = [...prev];
                const existing = newMemory[existingIndex];
                // Boost weight but cap at 1.0
                existing.weight = Math.min(1.0, existing.weight + (weight * 0.2));
                existing.timestamp = Date.now();
                if (source) existing.source = source;
                return newMemory;
            }

            // Create new
            return [...prev, {
                id: uuidv4(),
                type,
                value,
                weight,
                timestamp: Date.now(),
                source
            }];
        });
    };

    const recall = (query: string): MemoryNode[] => {
        if (!query) return [];
        const lowerQ = query.toLowerCase();
        // Simple keyword matching simulation of semantic search
        return memory.filter(m =>
            m.value.toLowerCase().includes(lowerQ) ||
            (m.source && m.source.toLowerCase().includes(lowerQ))
        ).sort((a, b) => b.weight - a.weight);
    };

    const analyzeContext = () => {
        let newMemories = 0;

        // 1. Analyze Boards
        boards.forEach(board => {
            // Title keywords (Naive extraction)
            const words = board.name.split(" ").filter(w => w.length > 3);
            words.forEach(word => {
                addMemory("topic", word, 0.3, `board:${board.name}`);
                newMemories++;
            });

            // Widget Analysis
            const noteCount = board.widgets.filter(w => w.type === 'note').length;
            const mediaCount = board.widgets.filter(w => w.type === 'image').length;

            if (noteCount > 3) addMemory("trait", "Verbal Thinker", 0.6, "behavior:high_note_usage");
            if (mediaCount > 3) addMemory("trait", "Visual Learner", 0.6, "behavior:high_media_usage");
        });

        if (newMemories > 0) {
            toast.success("AI Context Updated", { description: "User evolution data integrated." });
        }
    };

    const getContextSummary = () => {
        const topInterests = memory.filter(m => m.type === 'topic').sort((a, b) => b.weight - a.weight).slice(0, 5);
        const traits = memory.filter(m => m.type === 'trait').sort((a, b) => b.weight - a.weight).slice(0, 3);

        if (topInterests.length === 0 && traits.length === 0) return "New User (Tabula Rasa)";

        return `User appears interested in ${topInterests.map(i => i.value).join(", ")}. Determined traits: ${traits.map(t => t.value).join(", ")}.`;
    };

    return (
        <UserContext.Provider value={{ memory, addMemory, recall, analyzeContext, getContextSummary }}>
            {children}
        </UserContext.Provider>
    );
}

export function useUserContext() {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error("useUserContext must be used within a UserProvider");
    }
    return context;
}
