import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { feedItems } from "@/lib/data";
import { MessageCircle, Heart, Repeat } from "lucide-react";
import Image from "next/image";

export default function FeedPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Content Feed</h1>
        <p className="text-muted-foreground">
          Discover what&apos;s new and trending in your workspace.
        </p>
      </div>

      <Tabs defaultValue="foryou" className="w-full">
        <TabsList>
          <TabsTrigger value="foryou">For You</TabsTrigger>
          <TabsTrigger value="trending">Trending</TabsTrigger>
          <TabsTrigger value="newest">Newest</TabsTrigger>
        </TabsList>
        <TabsContent value="foryou" className="mt-6">
          <FeedList />
        </TabsContent>
        <TabsContent value="trending" className="mt-6">
          <FeedList />
        </TabsContent>
        <TabsContent value="newest" className="mt-6">
          <FeedList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FeedList() {
    return (
        <div className="grid gap-6 max-w-2xl mx-auto">
            {feedItems.map(item => (
                <Card key={item.id} className="overflow-hidden">
                    <CardHeader className="flex flex-row items-start gap-4 p-4">
                        <Avatar>
                            <AvatarImage src={item.avatar} alt={item.author} data-ai-hint={item.dataAiHint} />
                            <AvatarFallback>{item.author.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-2">
                                <p className="font-semibold">{item.author}</p>
                                <p className="text-sm text-muted-foreground">{item.handle}</p>
                                <p className="text-sm text-muted-foreground">·</p>
                                <p className="text-sm text-muted-foreground">{item.timestamp}</p>
                            </div>
                            <p className="text-sm">{item.content}</p>
                        </div>
                    </CardHeader>
                    {item.id === 'feed-3' && (
                         <CardContent className="px-0 pb-0">
                           <Image src="https://placehold.co/600x400.png" alt="Project Constellation" width={600} height={400} className="w-full h-auto" data-ai-hint={item.dataAiHint}/>
                         </CardContent>
                    )}
                    <CardFooter className="px-4 py-2 flex justify-between">
                        <Button variant="ghost" size="sm" className="flex items-center gap-2 text-muted-foreground">
                            <MessageCircle className="h-4 w-4" />
                            {item.comments}
                        </Button>
                        <Button variant="ghost" size="sm" className="flex items-center gap-2 text-muted-foreground">
                            <Repeat className="h-4 w-4" />
                            
                        </Button>
                        <Button variant="ghost" size="sm" className="flex items-center gap-2 text-muted-foreground">
                            <Heart className="h-4 w-4" />
                            {item.likes}
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
    )
}
