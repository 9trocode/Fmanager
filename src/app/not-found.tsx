import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="text-center space-y-4 max-w-md">
        <div className="text-6xl font-mono text-muted-foreground tracking-tight">
          404
        </div>
        <h1 className="text-xl font-semibold">Not here.</h1>
        <p className="text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or moved.
        </p>
        <Button asChild size="sm">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
