import type { ComponentProps } from 'react';

/**
 * The one way images are drawn: a plain <img> with its real size, so the page never jumps.
 *
 * Not next/image, on purpose. next/image writes an inline `style="color:transparent"` on every image, and our Content-Security-Policy
 * (no 'unsafe-inline' for styles, see src/proxy.ts) blocks inline styles, which floods the console with violations in production. Our
 * images are small, fixed files in /public (or a photo served by our own route, which the image optimiser could not fetch anyway because it
 * has no session), so its resizing would add nothing.
 */
export function Img({
  src,
  width,
  height,
  alt,
  ...rest
}: Omit<ComponentProps<'img'>, 'src' | 'width' | 'height' | 'alt'> & {
  src: string;
  width: number;
  height: number;
  /** Empty for decoration. */
  alt: string;
}) {
  // eslint-disable-next-line @next/next/no-img-element -- see above
  return <img src={src} width={width} height={height} alt={alt} loading="lazy" decoding="async" {...rest} />;
}
