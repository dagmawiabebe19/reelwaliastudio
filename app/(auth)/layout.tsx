import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-6">
      <div className="absolute right-4 top-4">
        <div className="studio-toolbar">
          <ThemeToggle variant="compact" />
        </div>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
