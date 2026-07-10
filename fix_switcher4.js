const fs = require('fs');
const path = '/Users/alex/Documents/starseed-os-main/src/components/profiles/account-profiles-switcher.tsx';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('import { useAccount }')) {
    code = code.replace(
        'import { useSearchParams, useRouter } from "next/navigation";',
        'import { useSearchParams, useRouter } from "next/navigation";\nimport { useAccount } from "@/context/account-context";'
    );
}

// Add mainProfile to dependency array of the useEffect
code = code.replace(
    '}, [searchParams, loading, editor, router, profiles.length]);',
    '}, [searchParams, loading, editor, router, profiles.length, mainProfile]);'
);

fs.writeFileSync(path, code);
