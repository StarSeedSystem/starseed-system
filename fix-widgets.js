const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/modules/weather/components/widgets');

function walkDir(currentPath) {
    const files = fs.readdirSync(currentPath);
    files.forEach(file => {
        const fullPath = path.join(currentPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            processFile(fullPath);
        }
    });
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    let original = content;

    // Fix contrast: bg-slate-950/60 -> bg-slate-950/80
    content = content.replace(/bg-slate-950\/60/g, 'bg-slate-950/90');
    // For specific widgets that use bg-black/40 -> bg-black/60
    content = content.replace(/bg-black\/40/g, 'bg-black/60');

    // Replace padding
    content = content.replace(/p-\[[\d\.]+cqmin\]( \@[a-z]+:p-\[[\d\.]+cqmin\])?/g, 'p-4 @md:p-6');
    content = content.replace(/px-\[[\d\.]+cqmin\]( \@[a-z]+:px-\[[\d\.]+cqmin\])?/g, 'px-4 @md:px-6');
    content = content.replace(/py-\[[\d\.]+cqmin\]( \@[a-z]+:py-\[[\d\.]+cqmin\])?/g, 'py-2 @md:py-4');
    content = content.replace(/pb-\[[\d\.]+cqmin\]( \@[a-z]+:pb-\[[\d\.]+cqmin\])?/g, 'pb-2 @md:pb-4');
    content = content.replace(/pt-\[[\d\.]+cqmin\]( \@[a-z]+:pt-\[[\d\.]+cqmin\])?/g, 'pt-2 @md:pt-4');

    // Replace gap
    content = content.replace(/gap-\[[\d\.]+cqmin\]( \@[a-z]+:gap-\[[\d\.]+cqmin\])?/g, 'gap-3 @md:gap-4');
    
    // Replace margin
    content = content.replace(/mb-\[[\d\.]+cqmin\]( \@[a-z]+:mb-\[[\d\.]+cqmin\])?/g, 'mb-2 @md:mb-4');
    content = content.replace(/mt-\[[\d\.]+cqmin\]( \@[a-z]+:mt-\[[\d\.]+cqmin\])?/g, 'mt-2 @md:mt-4');

    // Replace rounded
    content = content.replace(/rounded-\[[\d\.]+cqmin\]/g, 'rounded-2xl');
    content = content.replace(/rounded-\[[\d\.]+cqw\]/g, 'rounded-2xl');

    // Replace text sizes (General mappings)
    content = content.replace(/text-\[([1|2](\.\d+)?)cqmin\]( \@[a-z]+:text-\[[\d\.]+cqmin\])*/g, 'text-xs @md:text-sm');
    content = content.replace(/text-\[([3|4](\.\d+)?)cqmin\]( \@[a-z]+:text-\[[\d\.]+cqmin\])*/g, 'text-sm @md:text-base');
    content = content.replace(/text-\[([5|6](\.\d+)?)cqmin\]( \@[a-z]+:text-\[[\d\.]+cqmin\])*/g, 'text-xl @md:text-3xl');
    content = content.replace(/text-\[([7-9]|10)cqmin\]( \@[a-z]+:text-\[[\d\.]+cqmin\])*/g, 'text-4xl @md:text-6xl');
    content = content.replace(/text-\[\d+cqmin\]/g, 'text-base');

    // Replace size (icons, divs)
    content = content.replace(/size-\[([1-2](\.\d+)?)cqmin\]( \@[a-z]+:size-\[[\d\.]+cqmin\])*/g, 'size-4 @md:size-5');
    content = content.replace(/size-\[([3-4](\.\d+)?)cqmin\]( \@[a-z]+:size-\[[\d\.]+cqmin\])*/g, 'size-6 @md:size-8');
    content = content.replace(/size-\[([5-9]|10)cqmin\]( \@[a-z]+:size-\[[\d\.]+cqmin\])*/g, 'size-12 @md:size-16');
    content = content.replace(/size-\[(1[1-9]|[2-9]\d)cqmin\]( \@[a-z]+:size-\[[\d\.]+cqmin\])*/g, 'size-24 @md:size-32');

    // Generic height and width
    content = content.replace(/h-\[(1[1-9]|[2-9]\d)cqmin\]( \@[a-z]+:h-\[[\d\.]+cqmin\])*/g, 'h-24 @md:h-32');
    content = content.replace(/h-\[\d+(\.\d+)?cqmin\]( \@[a-z]+:h-\[[\d\.]+cqmin\])*/g, ''); // just remove small explicit heights to let content size it, or fix later
    content = content.replace(/w-\[\d+(\.\d+)?cqmin\]( \@[a-z]+:w-\[[\d\.]+cqmin\])*/g, ''); 

    // Specific border
    content = content.replace(/border-\[[\d\.]+cqmin\]/g, 'border-2');
    
    // Blur fallback
    content = content.replace(/blur-\[[\d\.]+cqmin\]/g, 'blur-sm');

    // Left, top, etc.
    content = content.replace(/left-\[[\d\.]+cqmin\]/g, 'left-4');
    content = content.replace(/top-\[[\d\.]+cqmin\]/g, 'top-4');
    content = content.replace(/bottom-\[[\d\.]+cqmin\]/g, 'bottom-4');

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`Updated: ${filePath}`);
    }
}

walkDir(dir);
