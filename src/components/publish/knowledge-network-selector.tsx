// src/components/publish/knowledge-network-selector.tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle, Search } from "lucide-react";
import type { Category, Theme } from "@/lib/data";

type DataItem = Category | Theme;

interface KnowledgeNetworkSelectorProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    title: string;
    data: DataItem[];
    selectedItems: string[];
    onSelectedItemsChange: (items: string[]) => void;
    type: 'category' | 'theme';
}

function ItemRenderer({ item, selectedItems, handleSelect, level = 0 }: { item: DataItem, selectedItems: string[], handleSelect: (id: string, isSelected: boolean) => void, level?: number }) {
    const isSelected = selectedItems.includes(item.id);

    if ('subCategories' in item && item.subCategories && item.subCategories.length > 0) {
        return (
            <AccordionItem value={item.id} key={item.id}>
                <AccordionTrigger className="hover:no-underline">
                     <div className="flex items-center gap-2">
                        <Checkbox
                            id={item.id}
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelect(item.id, !!checked)}
                        />
                        <label htmlFor={item.id} className="font-semibold">{item.name}</label>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="pl-6 border-l ml-3">
                     <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                     <Accordion type="multiple" className="w-full">
                        {item.subCategories.map(subItem => (
                            <ItemRenderer key={subItem.id} item={subItem} selectedItems={selectedItems} handleSelect={handleSelect} level={level + 1} />
                        ))}
                     </Accordion>
                </AccordionContent>
            </AccordionItem>
        )
    }

    return (
        <div key={item.id} className="flex items-center space-x-2 py-2" style={{ paddingLeft: `${level * 1.5}rem` }}>
            <Checkbox
                id={item.id}
                checked={isSelected}
                onCheckedChange={(checked) => handleSelect(item.id, !!checked)}
            />
            <div className="grid gap-1.5 leading-none">
                <label
                    htmlFor={item.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                    {item.name}
                </label>
                <p className="text-sm text-muted-foreground">
                    {item.description}
                </p>
            </div>
        </div>
    );
}


export function KnowledgeNetworkSelector({ isOpen, onOpenChange, title, data, selectedItems, onSelectedItemsChange, type }: KnowledgeNetworkSelectorProps) {
    const [searchTerm, setSearchTerm] = useState("");

    const handleSelect = (id: string, isSelected: boolean) => {
        if (isSelected) {
            onSelectedItemsChange([...selectedItems, id]);
        } else {
            onSelectedItemsChange(selectedItems.filter(itemId => itemId !== id));
        }
    };

    const filterData = (items: DataItem[]): DataItem[] => {
        if (!searchTerm) return items;

        return items.reduce((acc: DataItem[], item: DataItem) => {
            const nameMatch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
            const descMatch = item.description.toLowerCase().includes(searchTerm.toLowerCase());
            
            let subItems: DataItem[] = [];
            if('subCategories' in item && item.subCategories) {
                subItems = filterData(item.subCategories);
            }

            if (nameMatch || descMatch || subItems.length > 0) {
                const newItem = { ...item };
                if('subCategories' in newItem && newItem.subCategories) {
                    newItem.subCategories = subItems;
                }
                acc.push(newItem);
            }

            return acc;
        }, []);
    };
    
    const filteredData = filterData(data);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="font-headline text-2xl">{title}</DialogTitle>
                     <DialogDescription>
                        Busca, selecciona y crea {type === 'category' ? 'categorías' : 'temas'} para conectar tu publicación a la Red de Conocimiento.
                    </DialogDescription>
                </DialogHeader>

                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={`Buscar ${type === 'category' ? 'categorías' : 'temas'}...`}
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex-1 overflow-y-auto pr-4 -mr-6">
                    <Accordion type="multiple" className="w-full">
                        {filteredData.map(item => (
                            <ItemRenderer key={item.id} item={item} selectedItems={selectedItems} handleSelect={handleSelect} />
                        ))}
                    </Accordion>
                </div>

                <DialogFooter className="!justify-between items-center">
                    <Button variant="outline"><PlusCircle/>Crear Nuev{type === 'category' ? 'a Categoría' : 'o Tema'}</Button>
                    <Button onClick={() => onOpenChange(false)}>Confirmar Selección</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
