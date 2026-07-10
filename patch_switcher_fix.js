const fs = require('fs');
const file = '/Users/alex/Documents/starseed-os-main/src/components/profiles/account-profiles-switcher.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('const justSavedRef = useRef(false);')) {
    content = content.replace('import { useCallback, useMemo, useState, useEffect } from "react";', 'import { useCallback, useMemo, useState, useEffect, useRef } from "react";');
    content = content.replace('const searchParams = useSearchParams();', 'const searchParams = useSearchParams();\n    const justSavedRef = useRef(false);');
    
    content = content.replace('if (!loading && !editor) {', 'if (justSavedRef.current) return;\n        if (!loading && !editor) {');
    
    content = content.replace('setEditor(null);', 'justSavedRef.current = true;\n                        setEditor(null);\n                        setTimeout(() => { justSavedRef.current = false; }, 2000);');
    
    fs.writeFileSync(file, content);
    console.log("Patched!");
} else {
    console.log("Already patched");
}
