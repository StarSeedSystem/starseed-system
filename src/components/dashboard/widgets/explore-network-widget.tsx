'use client';

import { Button } from "@/components/ui/button";
import { Network, Book, MessageSquare, Briefcase, Globe } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export function ExploreNetworkWidget() {
    return (
        <div className="flex h-full flex-col p-6 bg-gradient-to-br from-background/50 to-background/80 backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-headline font-semibold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                    Explorar la Red
                </h3>
                <Link href="/network">
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-primary">
                        Ver Todo
                    </Button>
                </Link>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
                <CategoryButton
                    href="/network/politics"
                    icon={Network}
                    label="Política"
                    colorClass="text-blue-500"
                    bgClass="bg-blue-500/10 hover:bg-blue-500/20"
                />
                <CategoryButton
                    href="/network/education"
                    icon={Book}
                    label="Educación"
                    colorClass="text-green-500"
                    bgClass="bg-green-500/10 hover:bg-green-500/20"
                />
                <CategoryButton
                    href="/network/culture"
                    icon={MessageSquare}
                    label="Cultura"
                    colorClass="text-purple-500"
                    bgClass="bg-purple-500/10 hover:bg-purple-500/20"
                />
                <CategoryButton
                    href="/network/economy"
                    icon={Briefcase}
                    label="Economía"
                    colorClass="text-amber-500"
                    bgClass="bg-amber-500/10 hover:bg-amber-500/20"
                />
                <CategoryButton
                    href="/network/global"
                    icon={Globe}
                    label="Global"
                    colorClass="text-teal-500"
                    bgClass="bg-teal-500/10 hover:bg-teal-500/20"
                />
                <div className="flex items-center justify-center rounded-xl border border-dashed text-muted-foreground text-xs hover:bg-muted/50 cursor-pointer transition-colors">
                    <span>+ Más</span>
                </div>
            </div>
        </div>
    );
}

function CategoryButton({ href, icon: Icon, label, colorClass, bgClass }: any) {
    return (
        <Link href={href} className="contents">
            <div className={`
                flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-transparent 
                transition-all duration-300 cursor-pointer
                ${bgClass} hover:border-primary/20 hover:shadow-sm group
            `}>
                <div className={`
                    p-2 rounded-full bg-background/50 shadow-sm
                    group-hover:scale-110 transition-transform duration-300
                `}>
                    <Icon className={`h-5 w-5 ${colorClass}`} />
                </div>
                <span className="font-medium text-xs text-foreground/80 group-hover:text-foreground">{label}</span>
            </div>
        </Link>
    );
}
