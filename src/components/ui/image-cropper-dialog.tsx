"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import Cropper from "react-easy-crop";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, Crop } from "lucide-react";
import { toast } from "sonner";

export interface ImageCropperDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The image URL (local object URL or remote) */
    imageSrc: string | null;
    /** 'avatar' = circle crop, 'cover' = rect crop */
    mode: "avatar" | "cover";
    /** aspect ratio: 1 for avatar, 16/9 or adaptable for cover */
    aspect?: number;
    title?: string;
    onCropComplete: (croppedBlob: Blob | null) => void;
}

const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener("load", () => resolve(image));
        image.addEventListener("error", (error) => reject(error));
        image.setAttribute("crossOrigin", "anonymous");
        image.src = url;
    });

async function getCroppedImg(
    imageSrc: string,
    pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob | null> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) return null;

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
    );

    return new Promise((resolve, reject) => {
        canvas.toBlob((file) => {
            if (file) resolve(file);
            else reject(new Error("Canvas is empty"));
        }, "image/jpeg", 0.9);
    });
}

export function ImageCropperDialog({
    open,
    onOpenChange,
    imageSrc,
    mode,
    aspect,
    title,
    onCropComplete,
}: ImageCropperDialogProps) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [internalAspect, setInternalAspect] = useState<number | undefined>(aspect ?? (mode === "avatar" ? 1 : 16 / 9));
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const [naturalAspect, setNaturalAspect] = useState<number>(16 / 9);

    useEffect(() => {
        if (!imageSrc) return;
        let isMounted = true;
        const img = new Image();
        img.onload = () => {
            if (isMounted && img.naturalHeight) {
                setNaturalAspect(img.naturalWidth / img.naturalHeight);
            }
        };
        img.src = imageSrc;
        return () => { isMounted = false; };
    }, [imageSrc]);


    const onCropCompleteHandler = useCallback((croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    
    const handleSave = async () => {
        if (!imageSrc) return;

        // Bypass cropping for Original (Adaptable)
        if (internalAspect === undefined) {
            onCropComplete(null);
            onOpenChange(false);
            return;
        }

        if (!croppedAreaPixels) return;

        setIsProcessing(true);

        try {
            const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
            if (croppedBlob) {
                onCropComplete(croppedBlob);
            } else {
                toast.error("Error al recortar la imagen.");
            }
        } catch (e) {
            console.error("Error cropping image:", e);
            toast.error("Error al procesar la imagen (posible restricción CORS). Intenta subirla directamente desde tu dispositivo.");
        } finally {
            setIsProcessing(false);
            onOpenChange(false);
        }
    };

    useEffect(() => {
        if (aspect) setInternalAspect(aspect);
    }, [aspect]);

    const finalAspect = internalAspect ?? (mode === "avatar" ? 1 : naturalAspect);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl border-white/10 bg-black/95 backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Crop className="size-4 text-cyan-300" /> 
                        {title || (mode === "avatar" ? "Recortar foto de perfil" : "Recortar foto de portada")}
                    </DialogTitle>
                </DialogHeader>

                <div className="relative h-[50vh] w-full bg-black/50 overflow-hidden rounded-xl border border-white/10 mt-2">
                    {imageSrc ? (
                        <Cropper
                            image={imageSrc}
                            crop={crop}
                            zoom={zoom}
                            aspect={finalAspect}
                            cropShape={mode === "avatar" ? "round" : "rect"}
                            showGrid={false}
                            onCropChange={setCrop}
                            onCropComplete={onCropCompleteHandler}
                            onZoomChange={setZoom}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-white/50">
                            No hay imagen cargada
                        </div>
                    )}
                </div>

                {mode === "cover" && (
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2 px-2">
                        <span className="text-xs text-white/60 mr-2">Proporción:</span>
                        <Button 
                            variant={internalAspect === 16 / 9 ? "secondary" : "outline"} 
                            size="sm" className="h-7 text-xs" 
                            onClick={() => setInternalAspect(16 / 9)}
                        >
                            16:9
                        </Button>
                        <Button 
                            variant={internalAspect === 4 / 3 ? "secondary" : "outline"} 
                            size="sm" className="h-7 text-xs" 
                            onClick={() => setInternalAspect(4 / 3)}
                        >
                            4:3
                        </Button>
                        <Button 
                            variant={internalAspect === 21 / 9 ? "secondary" : "outline"} 
                            size="sm" className="h-7 text-xs" 
                            onClick={() => setInternalAspect(21 / 9)}
                        >
                            21:9
                        </Button>
                        <Button 
                            variant={internalAspect === 1 ? "secondary" : "outline"} 
                            size="sm" className="h-7 text-xs" 
                            onClick={() => setInternalAspect(1)}
                        >
                            1:1
                        </Button>
                        <Button 
                            variant={internalAspect === undefined ? "secondary" : "outline"} 
                            size="sm" className="h-7 text-xs" 
                            onClick={() => setInternalAspect(undefined)}
                        >
                            Libre
                        </Button>
                    </div>
                )}

                <div className="mt-4 flex items-center gap-4 px-2">
                    <span className="text-xs text-white/60">Zoom</span>
                    <Slider
                        value={[zoom]}
                        min={1}
                        max={3}
                        step={0.05}
                        onValueChange={(val) => setZoom(val[0])}
                        className="flex-1"
                    />
                </div>

                <DialogFooter className="mt-6">
                    <Button
                        variant="outline"
                        className="border-white/15 cursor-pointer"
                        onClick={() => onOpenChange(false)}
                        disabled={isProcessing}
                    >
                        Cancelar
                    </Button>
                    {mode === "cover" && (
                        <Button
                            variant="secondary"
                            className="cursor-pointer gap-2 mr-auto"
                            onClick={() => {
                                onOpenChange(false);
                                onCropComplete(null);
                            }}
                            disabled={isProcessing}
                        >
                            <Crop className="size-4" /> Original (Adaptable)
                        </Button>
                    )}
                    <Button
                        className="cursor-pointer gap-2"
                        onClick={handleSave}
                        disabled={!imageSrc || isProcessing}
                    >
                        {isProcessing ? <Loader2 className="size-4 animate-spin" /> : "Guardar recorte"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
