import Image from "next/image";

type BrandMarkProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

/**
 * The FIT23 batch logo. The source artwork is drawn on solid black; the
 * black was converted to transparency, so it sits on any of the site's dark
 * surfaces, including the blurred glass cards, without a visible square.
 */
export default function BrandMark({ size = 40, className = "", priority = false }: BrandMarkProps) {
  return (
    <Image
      src="/brand/fit23-mark.png"
      alt="FIT23 batch logo"
      width={size}
      height={size}
      priority={priority}
      className={`shrink-0 ${className}`}
    />
  );
}
