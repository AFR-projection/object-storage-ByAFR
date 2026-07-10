import { FileBrowser } from "@/components/files/file-browser";
import { Star } from "lucide-react";

export default function FavoritesPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 sm:gap-3 text-2xl sm:text-3xl font-bold tracking-tight">
          <Star className="h-6 w-6 sm:h-7 sm:w-7 text-amber-400" />
          Favorites
        </h1>
        <p className="mt-1 text-sm text-muted-foreground/70">Your starred files and folders</p>
      </div>
      <FileBrowser favorites />
    </div>
  );
}