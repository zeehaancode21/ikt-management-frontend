import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Spinner = ({ className }: { className?: string }) => (
  <Loader2 className={cn("h-5 w-5 animate-spin text-primary", className)} />
);

export const FullSpinner = () => (
  <div className="flex h-40 w-full items-center justify-center">
    <Spinner className="h-8 w-8" />
  </div>
);
