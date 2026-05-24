// src/app/(app)/network/_components/navigation.tsx
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Scale, School, Palette } from 'lucide-react';

const navItems = [
    { href: '/network', label: 'Panorama' },
    { href: '/network/politics', label: 'Política' },
    { href: '/network/education', label: 'Educación' },
    { href: '/network/culture', label: 'Cultura' },
];

export function NetworkNavigation() {
    const pathname = usePathname();

    return (
        <div className="border-b">
            <nav className="flex gap-4" aria-label="Network navigation">
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            'pb-3 px-1 text-sm font-medium transition-colors',
                            pathname === item.href
                                ? 'border-b-2 border-primary text-primary'
                                : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {item.label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}
