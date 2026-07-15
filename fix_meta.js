const fs = require('fs');
const path = 'src/lib/aurora/engine.ts';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('modelText?: string;')) {
    content = content.replace(
        '  attempts?: number;',
        '  attempts?: number;\n  modelText?: string;'
    );
}

// And fix ChatRole:
// src/lib/aurora/engine.ts(1058,9): error TS2322: Type '"user" | "agent"' is not assignable to type 'ChatRole'.
// wait, where is this?
