import * as React from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Image URL. When it fails to load, the fallback is shown. */
  src?: string;
  alt?: string;
  /** Fallback content (e.g. initials) when no image / image error. */
  fallback?: React.ReactNode;
}

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, src, alt, fallback, ...props }, ref) => {
    const [errored, setErrored] = React.useState(false);
    const showImage = src && !errored;

    return (
      <span
        ref={ref}
        className={cn(
          "relative flex h-9 w-9 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground",
          className,
        )}
        {...props}
      >
        {showImage ? (
          <img
            src={src}
            alt={alt ?? ""}
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
          />
        ) : (
          <span aria-hidden={!!alt}>{fallback}</span>
        )}
      </span>
    );
  },
);
Avatar.displayName = "Avatar";

export { Avatar };
