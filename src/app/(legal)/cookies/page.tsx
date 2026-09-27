import { LegalDocument } from '../_lib/legal-document';
import { legalMetadata } from '../_lib/load';

export const generateMetadata = () => legalMetadata('cookies');

export default function CookiesPage() {
  return <LegalDocument slug="cookies" />;
}
