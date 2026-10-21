import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VozLicencias } from "@/components/astraura/voz-licencias";
import type { MotorVozCatalogo } from "@/lib/aurora/catalogo-voces";

/**
 * Tests del componente VozLicencias
 * ─────────────────────────────────────────────────────────────────────────────
 * Prueban el componente VozLicencias con diferentes contextos, estados de VoiceStudio y configuraciones de neurona.
 * Utilizan Testing Library para probar la renderización, el contenido y las interacciones.
 */

// Datos de prueba
const mockMotores: MotorVozCatalogo[] = [
    {
        id: "voicemorphic",
        nombre: "VoiceMorphic (voz nativa de Astraura)",
        origen: "Nuestro sistema: fusión adaptada sobre OmniVoice",
        repo: "https://github.com/StarSeedSystem/starseed-system/tree/main/native/astraura-voice",
        releasesDe: "StarSeedSystem/starseed-system",
        formato: "GGUF Q8_0 (656 MB + códec 289 MB) · Metal / CPU",
        ramMinGB: 4,
        gpu: "opcional",
        offline: true,
        plataformas: ["macos", "windows", "linux"],
        porDefectoEn: ["macos", "windows", "linux"],
        velocidad: "~4× tiempo real en un M1 de 8 GB; instantáneo con anticipación y caché",
        calidad: "alta",
        licenciaPesos: "CC-BY-NC",
        claseLicencia: "personal",
        notas: "Modelo base: OmniVoice (Apache-2.0).",
    },
    {
        id: "kokoro",
        nombre: "Kokoro (WebAssembly, en el navegador)",
        origen: "Externo (hexgrad/Kokoro-82M, Apache-2.0). Integrado tal cual.",
        repo: "https://github.com/hexgrad/kokoro",
        releasesDe: "hexgrad/kokoro",
        formato: "ONNX ~80 MB · WASM/WebGPU",
        ramMinGB: 2,
        gpu: "no",
        offline: true,
        plataformas: ["web", "android", "ios", "macos", "windows", "linux"],
        porDefectoEn: ["android", "ios", "web"],
        velocidad: "menos de tiempo real incluso en móviles",
        calidad: "media",
        licenciaPesos: "Apache-2.0",
        claseLicencia: "libre",
        notas: "Voces españolas: ef_dora, em_alex, em_santa.",
    },
    {
        id: "voicestudio",
        nombre: "VoiceStudio",
        origen: "Estudio de voz local con múltiples motores",
        repo: "https://github.com/debpalash/voicestudio",
        releasesDe: "debpalash/voicestudio",
        formato: "Electron app · Python/FastAPI backend",
        ramMinGB: 8,
        gpu: "opcional",
        offline: true,
        plataformas: ["macos", "windows", "linux"],
        porDefectoEn: [],
        velocidad: "depende del motor seleccionado",
        calidad: "alta",
        licenciaPesos: "Múltiple (según motor)",
        claseLicencia: "personal",
        notas: "Estudio de voz con múltiples motores. Requiere 8 GB RAM.",
    },
];

const defaultProps = {
    voiceStudioAlive: true,
    contexto: "personal" as const,
    neuronaPlataforma: "macos" as const,
    neuronaRamGB: 8,
};

describe("VozLicencias - contexto personal con VoiceStudio activo", () => {
    it("debe mostrar todos los motores aptos para contexto personal", () => {
        render(<VozLicencias {...defaultProps} />);
        
        expect(screen.getByText("VoiceMorphic (voz nativa de Astraura)")).toBeInTheDocument();
        expect(screen.getByText("Kokoro (WebAssembly, en el navegador)")).toBeInTheDocument();
        expect(screen.getByText("VoiceStudio")).toBeInTheDocument();
        
        expect(screen.getByText("Libre")).toBeInTheDocument();
        expect(screen.getByText("Solo personal")).toBeInTheDocument();
    });
    
    it("debe mostrar el estado de VoiceStudio activo", () => {
        render(<VozLicencias {...defaultProps} />);
        expect(screen.getByText("VoiceStudio activo")).toBeInTheDocument();
    });
});

describe("VozLicencias - contexto personal sin VoiceStudio activo", () => {
    const props = {
        ...defaultProps,
        voiceStudioAlive: false,
    };
    
    it("debe mostrar el motivo de reprobación de VoiceStudio inactivo", () => {
        render(<VozLicencias {...props} />);
        
        expect(screen.getByText("VoiceStudio inactivo")).toBeInTheDocument();
        expect(screen.getByText("VoiceStudio no está activo en esta neurona")).toBeInTheDocument();
    });
});

describe("VozLicencias - contexto grupal sin VoiceStudio activo", () => {
    const props = {
        ...defaultProps,
        voiceStudioAlive: false,
        contexto: "grupo" as const,
    };
    
    it("debe mostrar los motivos de reprobación para motores personales en contexto grupal", () => {
        render(<VozLicencias {...props} />);
        
        expect(screen.getByText("VoiceStudio inactivo")).toBeInTheDocument();
        expect(screen.getByText("Solo personal — no disponible en contextos grupales, comunitarios, públicos o comerciales")).toBeInTheDocument();
    });
});

describe("VozLicencias - contexto grupal con RAM insuficiente", () => {
    const props = {
        ...defaultProps,
        contexto: "grupo" as const,
        neuronaRamGB: 2,
    };
    
    it("debe mostrar el motivo de reprobación por RAM insuficiente para motores que requieren más RAM", () => {
        render(<VozLicencias {...props} />);
        
        expect(screen.getByText("VoiceStudio inactivo")).toBeInTheDocument();
        expect(screen.getByText("Solo personal — no disponible en contextos grupales, comunitarios, públicos o comerciales")).toBeInTheDocument();
    });
});

describe("VozLicencias - plataforma no soportada", () => {
    const props = {
        ...defaultProps,
        neuronaPlataforma: "android" as const,
    };
    
    it("debe mostrar el motivo de reprobación por plataforma no soportada", () => {
        render(<VozLicencias {...props} />);
        
        expect(screen.getByText("VoiceStudio inactivo")).toBeInTheDocument();
        expect(screen.getByText("Solo personal — no disponible en contextos grupales, comunitarios, públicos o comerciales")).toBeInTheDocument();
    });
});

describe("VozLicencias - todos los motores aptos", () => {
    const props = {
        ...defaultProps,
        voiceStudioAlive: true,
        contexto: "grupo" as const,
        neuronaPlataforma: "macos" as const,
        neuronaRamGB: 8,
    };
    
    it("debe mostrar el mensaje de que todos los motores cumplen los requisitos", () => {
        render(<VozLicencias {...props} />);
        
        expect(screen.getByText("Todos los motores cumplen los requisitos del contexto actual.")).toBeInTheDocument();
    });
});
