import { LegalDocument } from '../_lib/legal-document';
import { legalMetadata } from '../_lib/load';

export const generateMetadata = () => legalMetadata('community-guidelines');

export default function CampfireRulesPage() {
  return <LegalDocument slug="community-guidelines" />;
}
