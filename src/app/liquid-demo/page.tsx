"use client";

import { useState, useEffect } from "react";

import Link from "next/link";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, Twitter } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LiquidGlassDemo() {
    const backgrounds = [
        {
            name: "Vector Winds",
            url: "https://i.ibb.co/MDbLn4N4/vectors.png",
            description: "Abstract vector pattern"
        },
        {
            name: "Spring Flowers",
            url: "https://img.freepik.com/free-vector/flat-floral-spring-pattern-design_23-2150117078.jpg",
            description: "Colorful spring floral pattern"
        },
        {
            name: "Green Mistletoe",
            url: "https://media.istockphoto.com/id/1430511443/vector/christmas-mistletoe-foliage-and-berries-vector-seamless-pattern.jpg?s=612x612&w=0&k=20&c=oqxlH7ytgd5yjBQroACirJ1gH7Au1tq8gmsdeGd-Crk=",
            description: "Christmas mistletoe pattern"
        },
        {
            name: "Orange Flowers",
            url: "https://images.fineartamerica.com/images/artworkimages/mediumlarge/3/beautiful-orange-and-pastel-flowers-seamless-pattern-julien.jpg",
            description: "Orange and pastel floral pattern"
        },
        {
            name: "Margaritas",
            url: "https://static.vecteezy.com/system/resources/previews/056/652/082/non_2x/hand-drawn-white-flower-seamless-pattern-floral-repeating-wallpaper-for-textile-design-fabric-print-wrapping-paper-cute-daisy-flowers-on-blue-background-repeated-ditsy-texture-vector.jpg",
            description: "White daisy flowers on blue"
        },
        {
            name: "Red Flowers",
            url: "https://www.publicdomainpictures.net/pictures/610000/velka/seamless-floral-wallpaper-art-1715193626Gct.jpg",
            description: "Red floral wallpaper pattern"
        },
    ];

    const [selectedBackground, setSelectedBackground] = useState(backgrounds[0]);

    const [animationActive, setAnimationActive] = useState(true);

    const backgroundStyle = {
        backgroundImage: `url(${selectedBackground.url})`,
        backgroundSize: "500px",
        backgroundPosition: "center center",
        animation: animationActive ? "moveBackground 600s linear infinite" : "none",
    };

    return (
        <main
            className="min-h-screen p-16 font-serif text-primary min-w-full relative"
            style={backgroundStyle}
        >
            <div className="mx-auto max-w-screen-lg space-y-2 text-center relative z-10">
                <h1 className="text-3xl font-bold bg-background/50 backdrop-blur-md p-2 rounded inline-block">Liquid Glass Demo</h1>
                <div className="mb-8 flex justify-center">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="bg-background/70 backdrop-blur-sm">
                                {selectedBackground.name}
                                <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56">
                            {backgrounds.map((bg) => (
                                <DropdownMenuItem
                                    key={bg.name}
                                    onClick={() => setSelectedBackground(bg)}
                                    className="flex items-center justify-between"
                                >
                                    <div>
                                        <div>{bg.name}</div>
                                        <p className="text-xs text-muted-foreground">{bg.description}</p>
                                    </div>
                                    {selectedBackground.name === bg.name && <Check className="h-4 w-4" />}
                                </DropdownMenuItem>
                            ))}
                            <DropdownMenuItem
                                onClick={() => setAnimationActive(!animationActive)}
                                className="mt-2 flex items-center justify-between border-t pt-2"
                            >
                                <div>
                                    <div>{animationActive ? "Pause Animation" : "Play Animation"}</div>
                                </div>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            <style jsx global>{`
        @keyframes moveBackground {
          from {
            background-position: 0% 0%;
          }
          to {
            background-position: 0% -1500%;
          }
        }
      `}</style>
        </main>
    );
}
