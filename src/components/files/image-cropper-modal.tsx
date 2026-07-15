"use client";

import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { getCroppedImg } from "@/lib/utils/crop-image";
import { Loader2 } from "lucide-react";

interface ImageCropperModalProps {
    open: boolean;
    imageSrc: string | null;
    onClose: () => void;
    onCropComplete: (croppedFile: File) => void;
    aspectRatio?: number;
    circularCrop?: boolean;
}

export function ImageCropperModal({
    open,
    imageSrc,
    onClose,
    onCropComplete,
    aspectRatio = 1,
    circularCrop = false,
}: ImageCropperModalProps) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const onCropChange = (crop: any) => setCrop(crop);
    const onZoomChange = (zoom: any) => setZoom(zoom);

    const onCropCompleteHandler = useCallback((croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleConfirm = async () => {
        if (!imageSrc || !croppedAreaPixels) return;
        setIsProcessing(true);
        try {
            const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels, 0);
            if (croppedImage) {
                onCropComplete(croppedImage);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsProcessing(false);
            onClose();
        }
    };

    return (
        <Dialog open={open && !!imageSrc} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Recortar Imagen</DialogTitle>
                    <DialogDescription>
                        Ajusta la imagen para tu perfil. Arrastra para mover o usa el deslizador para hacer zoom.
                    </DialogDescription>
                </DialogHeader>
                <div className="relative w-full h-[300px] bg-black/20 rounded-md overflow-hidden">
                    {imageSrc && (
                        <Cropper
                            image={imageSrc}
                            crop={crop}
                            zoom={zoom}
                            aspect={aspectRatio}
                            cropShape={circularCrop ? "round" : "rect"}
                            showGrid={false}
                            onCropChange={onCropChange}
                            onCropComplete={onCropCompleteHandler}
                            onZoomChange={onZoomChange}
                        />
                    )}
                </div>
                <div className="px-2 pt-2">
                    <Slider
                        value={[zoom]}
                        min={1}
                        max={3}
                        step={0.1}
                        onValueChange={(vals) => setZoom(vals[0])}
                    />
                </div>
                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={onClose} disabled={isProcessing}>
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirm} disabled={isProcessing}>
                        {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Confirmar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
