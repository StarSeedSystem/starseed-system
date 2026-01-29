
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
