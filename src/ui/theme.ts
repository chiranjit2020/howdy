/** Theme preference: "daylight" | "dusk" force a theme; absent means follow the system. */
export const THEME_COOKIE = 'howdy_theme';
export type Theme = 'daylight' | 'dusk';

export function parseTheme(value: string | undefined): Theme | undefined {
  return value === 'daylight' || value === 'dusk' ? value : undefined;
}

/**
 * Browser only. Applies the choice to <html data-theme> immediately and persists it in a plain
 * (non-sensitive) cookie so the server renders the right theme on the next request. 'system' clears both.
 */
export function applyTheme(choice: Theme | 'system'): void {
  const root = document.documentElement;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  if (choice === 'system') {
    delete root.dataset.theme;
    document.cookie = `${THEME_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  } else {
    root.dataset.theme = choice;
    document.cookie = `${THEME_COOKIE}=${choice}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }
}
