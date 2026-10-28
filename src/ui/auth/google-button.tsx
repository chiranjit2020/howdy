import { Img } from '../art/img';
import { buttonClasses } from '../primitives';

/**
 * "Continue with Google" (ADR-048). A plain link, because it is a page load: Howdy's server sends the browser to
 * Google and Google sends it back. Works for logging in and for signing up alike.
 */
export function GoogleButton({
  remember = true,
  invite,
}: {
  remember?: boolean;
  invite?: string | undefined;
}) {
  const params = new URLSearchParams({ remember: remember ? '1' : '0', ...(invite ? { invite } : {}) });
  return (
    <a
      href={`/api/auth/google/start?${params.toString()}`}
      className={buttonClasses({ variant: 'secondary', fullWidth: true })}
    >
      <Img src="/brand/google-g.svg" width={18} height={18} alt="" loading="eager" className="size-[18px]" />
      Continue with Google
    </a>
  );
}
