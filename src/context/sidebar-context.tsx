"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useAppearance } from "./appearance-context";

interface SidebarContextType {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    toggle: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
    // Default open on desktop, closed on mobile could be logic here, 
    // but we'll start with false (closed) or generic true depending on UX.
    // Given the user wants "buttons to deploy", default closed might be better for the "immersive" feel,
    // OR we respect the responsive defaults (hidden mobile, flex desktop).
    // Let's implement a state that overrides the default CSS 'hidden/flex' if manually toggled.

    const [isOpen, setIsOpen] = useState(false);
    const { config } = useAppearance();

    // Optional: Auto-open/close based on screen size or layout config
    useEffect(() => {
        // Example: If layout changes to dock, maybe ensure open? 
        // For now, we keep it simple.
    }, [config]);

    const toggle = () => setIsOpen((prev) => !prev);

    return (
        <SidebarContext.Provider value={{ isOpen, setIsOpen, toggle }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    const context = useContext(SidebarContext);
    if (context === undefined) {
        throw new Error("useSidebar must be used within a SidebarProvider");
    }
    return context;
}
