import { LoaderCircle } from "lucide-react";

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <LoaderCircle className={`${className} animate-spin motion-reduce:animate-[spin_3s_linear_infinite]`} aria-hidden="true" />;
}
