import { LegalDocument } from '../_lib/legal-document';
import { legalMetadata } from '../_lib/load';

export const generateMetadata = () => legalMetadata('terms');

export default function TermsPage() {
  return <LegalDocument slug="terms" />;
}
