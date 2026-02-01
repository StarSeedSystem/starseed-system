"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

export type PerimeterEdge = "zenith" | "anchor" | "horizon" | "logic" | null;

interface PerimeterContextType {
    activeEdge: PerimeterEdge;
    setActiveEdge: (edge: PerimeterEdge) => void;
    // We can add 'intention' or 'pressure' metrics here later if needed
}

const PerimeterContext = createContext<PerimeterContextType | undefined>(undefined);

export const PerimeterProvider = ({ children }: { children: ReactNode }) => {
    const [activeEdge, setActiveEdge] = useState<PerimeterEdge>(null);

    return (
        <PerimeterContext.Provider value={{ activeEdge, setActiveEdge }}>
            {children}
        </PerimeterContext.Provider>
    );
};

export const usePerimeter = () => {
    const context = useContext(PerimeterContext);
    if (!context) {
        throw new Error("usePerimeter must be used within a PerimeterProvider");
    }
    return context;
};
