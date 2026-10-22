import * as React from "react";

import { cn } from "@/lib/utils";

// Native checkbox: keeps form submission simple with server actions.
function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "accent-primary focus-visible:ring-ring/50 size-4 shrink-0 rounded-[4px] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox };
