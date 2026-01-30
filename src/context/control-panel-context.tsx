"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface ControlPanelContextType {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    toggle: () => void;
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

const ControlPanelContext = createContext<ControlPanelContextType | undefined>(undefined);

export function ControlPanelProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("ai");

    const toggle = () => setIsOpen((prev) => !prev);

    return (
        <ControlPanelContext.Provider value={{
            isOpen, setIsOpen, toggle, activeTab, setActiveTab
        }}>
            {children}
        </ControlPanelContext.Provider>
    );
}

export function useControlPanel() {
    const context = useContext(ControlPanelContext);
    if (context === undefined) {
        throw new Error("useControlPanel must be used within a ControlPanelProvider");
    }
    return context;
}

