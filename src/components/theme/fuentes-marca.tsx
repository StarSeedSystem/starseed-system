/**
 * Gestión de fuentes de marca bajo demanda.
 * Satoshi (Fontshare) y Quicksand (Google Fonts) cargadas dinámicamente.
 */

export type FontVariables = {
    display: string;
    titular: string;
    organica: string;
};

export const DEFAULT_FONT_STACK = "Inter, system-ui, sans-serif";

export const shouldLoadSatoshi = (paper: string | undefined): boolean => {
    return paper === 'display-editorial';
};

export const shouldLoadQuicksand = (theme: string | undefined): boolean => {
    return theme === 'Natural';
};

export const getFontVariables = (isNatural: boolean): FontVariables => {
    const displayFont = isNatural ? 'Quicksand' : 'Satoshi';
    return {
        display: `"${displayFont}", ${DEFAULT_FONT_STACK}`,
        titular: `"${displayFont}", ${DEFAULT_FONT_STACK}`,
        organica: `"Quicksand", ${DEFAULT_FONT_STACK}`,
    };
};

export const getFontLink = (family: 'satoshi' | 'quicksand'): string | null => {
    if (family === 'satoshi') {
        return 'https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap';
    }
    if (family === 'quicksand') {
        return 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;700&display=swap';
    }
    return null;
};

export const loadFont = (family: 'satoshi' | 'quicksand') => {
    if (typeof document === 'undefined') return;
    
    const linkId = `font-${family}`;
    if (document.getElementById(linkId)) return;

    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = getFontLink(family) || '';
    
    document.head.appendChild(link);
};

export const applyFontVariables = (variables: FontVariables) => {
    if (typeof document === 'undefined') return;
    
    const root = document.documentElement;
    root.style.setProperty('--ss-font-display', variables.display);
    root.style.setProperty('--ss-font-titular', variables.titular);
    root.style.setProperty('--ss-font-organica', variables.organica);
};

