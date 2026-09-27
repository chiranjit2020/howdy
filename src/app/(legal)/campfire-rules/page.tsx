import { LegalDocument } from '../_lib/legal-document';
import { legalMetadata } from '../_lib/load';

export const generateMetadata = () => legalMetadata('campfire-rules');

export default function CampfireRulesPage() {
  return <LegalDocument slug="campfire-rules" />;
}
