/**
 * The one extra origin a page may send uploads to (CSP `connect-src`), or undefined when uploads stay on this site (the local
 * driver). Pure and dependency-free on purpose: the CSP is built in the request proxy, which must not load the storage SDK.
 */
export function uploadOrigin(driver: string | undefined, accountId: string | undefined): string | undefined {
  if (driver !== 'r2' || !accountId || !/^[0-9a-f]{32}$/.test(accountId)) return undefined;
  return `https://${accountId}.r2.cloudflarestorage.com`;
}
