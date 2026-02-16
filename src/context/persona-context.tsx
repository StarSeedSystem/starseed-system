"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type PersonaType = "analyst" | "creative" | "strategic" | "standard";

interface PersonaContextType {
    activePersona: PersonaType;
    setPersona: (persona: PersonaType) => void;
}

const PersonaContext = createContext<PersonaContextType | undefined>(undefined);

export function PersonaProvider({ children }: { children: React.ReactNode }) {
    const [activePersona, setActivePersona] = useState<PersonaType>("standard");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem("starseed-persona");
        if (saved) {
            setActivePersona(saved as PersonaType);
        }
        setMounted(true);
    }, []);

    const setPersona = (persona: PersonaType) => {
        setActivePersona(persona);
        localStorage.setItem("starseed-persona", persona);
    };

    if (!mounted) return null;

    return (
        <PersonaContext.Provider value={{ activePersona, setPersona }}>
            {children}
        </PersonaContext.Provider>
    );
}

export function usePersona() {
    const context = useContext(PersonaContext);
    if (context === undefined) {
        throw new Error("usePersona must be used within a PersonaProvider");
    }
    return context;
}
