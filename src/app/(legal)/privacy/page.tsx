import { LegalDocument } from '../_lib/legal-document';
import { legalMetadata } from '../_lib/load';

export const generateMetadata = () => legalMetadata('privacy');

export default function PrivacyPage() {
  return <LegalDocument slug="privacy" />;
}
