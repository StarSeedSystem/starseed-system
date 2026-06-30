const fs = require('fs');
const path = require('path');

const rootDir = '/Users/alex/Documents/StarSeed Café';

function findFiles(dir, exts) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.startsWith('.')) {
                results = results.concat(findFiles(filePath, exts));
            }
        } else {
            const ext = path.extname(file);
            if (exts.includes(ext)) {
                results.push(filePath);
            }
        }
    });
    return results;
}

const files = findFiles(rootDir, ['.html', '.js']);
const linkRegex = /(?:src|href)=['"]([^'"]+)['"]/g;

let missing = [];

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
        let link = match[1];
        if (link.startsWith('http') || link.startsWith('//') || link.startsWith('#') || link.includes('${')) {
            continue;
        }
        
        let linkPath = link.split('?')[0].split('#')[0]; // remove query and hash
        
        // Context checking: if a JS file uses a path, it might be relative to the HTML file including it.
        // For 'app/assets/js/app.js', base is 'app/'
        let baseDir = path.dirname(file);
        if (file.endsWith('.js') && file.includes('/assets/js/')) {
            baseDir = path.join(rootDir, 'app');
        } else if (file.endsWith('.js') && file.includes('/cafe/')) {
            baseDir = path.join(rootDir, 'app', 'cafe');
        }

        let absPath;
        if (linkPath.startsWith('/')) {
            absPath = path.join(rootDir, 'app', linkPath);
        } else {
            absPath = path.join(baseDir, linkPath);
        }

        if (!fs.existsSync(absPath)) {
            missing.push(`File: ${path.relative(rootDir, file)}\nBroken Link: ${link} (Resolved to ${absPath})`);
        }
    }
});

if (missing.length > 0) {
    console.log(missing.join('\n\n'));
} else {
    console.log("No broken local links found.");
}
