
export type ThemeColors = {
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    popover: string;
    popoverForeground: string;
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    muted: string;
    mutedForeground: string;
    accent: string;
    accentForeground: string;
    destructive: string;
    destructiveForeground: string;
    border: string;
    input: string;
    ring: string;
};

export const cssVariables = [
    "--background-hsl",
    "--foreground-hsl",
    "--card-hsl",
    "--card-foreground-hsl",
    "--popover-hsl",
    "--popover-foreground-hsl",
    "--primary-hsl",
    "--primary-foreground-hsl",
    "--secondary-hsl",
    "--secondary-foreground-hsl",
    "--muted-hsl",
    "--muted-foreground-hsl",
    "--accent-hsl",
    "--accent-foreground-hsl",
    "--destructive-hsl",
    "--destructive-foreground-hsl",
    "--border-hsl",
    "--input-hsl",
    "--ring-hsl",
];

export const exportTheme = () => {
    const themeData: Record<string, string> = {};
    const styles = getComputedStyle(document.documentElement);

    cssVariables.forEach((variable) => {
        themeData[variable] = styles.getPropertyValue(variable).trim();
    });

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(themeData, null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "theme-starseed.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

export const importTheme = (file: File): Promise<Record<string, string>> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                // Basic validation: Check if at least one expected variable exists
                if (json["--background-hsl"]) {
                    resolve(json);
                } else {
                    reject(new Error("Invalid theme file"));
                }
            } catch (error) {
                reject(error);
            }
        };
        reader.readAsText(file);
    });
};

export const applyTheme = (themeData: Record<string, string>) => {
    const root = document.documentElement;
    Object.entries(themeData).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
    // Persist custom theme data
    localStorage.setItem("custom-theme-data", JSON.stringify(themeData));
};

export const loadCustomTheme = () => {
    if (typeof window === "undefined") return;
    const storedTheme = localStorage.getItem("custom-theme-data");
    if (storedTheme) {
        try {
            const themeData = JSON.parse(storedTheme);
            applyTheme(themeData);
        } catch (e) {
            console.error("Failed to load custom theme", e);
        }
    }
}

// Radical Theme Presets (Structural Independence)
import { AppearanceConfig } from "@/context/appearance-context";

export const themePresets: Record<string, Partial<AppearanceConfig>> = {
    light: {
        styling: { radius: 0.5, glassIntensity: 0, opacity: 0.95 },
        background: { type: 'solid', value: '#ffffff', blur: 0, animation: 'none', overlayOpacity: 0, overlayColor: 'white' },
        liquidGlass: { enabled: false, applyToUI: false, distortRadius: 0, distortWidth: 0, distortHeight: 0, smoothStepEdge: 0, distanceOffset: 0 },
        layout: { menuPosition: 'left', menuStyle: 'minimal', iconStyle: 'thin', menuBehavior: 'smart' },
        typography: { fontFamily: 'Inter', scale: 1, customFonts: [] }
    },
    dark: {
        styling: { radius: 0.75, glassIntensity: 10, opacity: 0.8 },
        background: { type: 'gradient', value: 'linear-gradient(to top, #0f172a 0%, #1e1b4b 100%)', blur: 0, animation: 'pulse', overlayOpacity: 0.2, overlayColor: 'black' },
        liquidGlass: { enabled: true, applyToUI: true, distortRadius: 0.5, distortWidth: 0.2, distortHeight: 0.2, smoothStepEdge: 0.5, distanceOffset: 0.1 },
        layout: { menuPosition: 'left', menuStyle: 'sidebar', iconStyle: 'outline', menuBehavior: 'smart' },
        typography: { fontFamily: 'Satoshi', scale: 1, customFonts: [] }
    },
    grey: {
        // Brutalist / Utilitarian
        styling: { radius: 0, glassIntensity: 0, opacity: 1 },
        background: { type: 'solid', value: '#f4f4f5', blur: 0, animation: 'none', overlayOpacity: 0, overlayColor: 'white' },
        liquidGlass: { enabled: false, applyToUI: false, distortRadius: 0, distortWidth: 0, distortHeight: 0, smoothStepEdge: 0, distanceOffset: 0 },
        layout: { menuPosition: 'top', menuStyle: 'minimal', iconStyle: 'solid', menuBehavior: 'sticky' },
        typography: { fontFamily: 'Space Grotesk', scale: 1.05, customFonts: [] }
    },
    natural: {
        // Organic / Soft
        styling: { radius: 1.5, glassIntensity: 15, opacity: 0.7 },
        background: { type: 'image', value: 'https://images.unsplash.com/photo-1584714268709-c3dd9c92b378?q=80&w=1480', blur: 5, animation: 'pan', overlayOpacity: 0.3, overlayColor: 'white' },
        liquidGlass: { enabled: true, applyToUI: true, distortRadius: 0.8, distortWidth: 0.1, distortHeight: 0.1, smoothStepEdge: 0.2, distanceOffset: 0.1 },
        layout: { menuPosition: 'left', menuStyle: 'dock', iconStyle: 'outline', menuBehavior: 'smart' },
        typography: { fontFamily: 'Outfit', scale: 1.02, customFonts: [] }
    },
    glass: {
        // Apple / Crystal
        styling: { radius: 1, glassIntensity: 30, opacity: 0.6 },
        background: { type: 'image', value: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1480', blur: 0, animation: 'zoom', overlayOpacity: 0.2, overlayColor: 'black' },
        liquidGlass: { enabled: true, applyToUI: true, distortRadius: 1, distortWidth: 0.3, distortHeight: 0.3, smoothStepEdge: 0.5, distanceOffset: 0.15 },
        layout: { menuPosition: 'bottom', menuStyle: 'dock', iconStyle: 'thin', menuBehavior: 'smart' },
        typography: { fontFamily: 'Inter', scale: 0.95, customFonts: [] }
    }
};
