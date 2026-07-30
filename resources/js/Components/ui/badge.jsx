import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
    'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-vw-light-blue focus:ring-offset-2',
    {
        variants: {
            variant: {
                default:
                    'border-transparent bg-vw-blue text-white hover:bg-vw-blue/85',
                secondary:
                    'border-transparent bg-accent text-accent-foreground hover:bg-accent/70',
                destructive:
                    'border-transparent bg-urgent text-white hover:bg-urgent/85',
                outline: 'border-vw-grey/40 text-foreground',
                success:
                    'border-transparent bg-approved text-white hover:bg-approved/85',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    }
);

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }