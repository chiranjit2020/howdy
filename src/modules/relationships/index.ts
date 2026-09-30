/**
 * Public surface of the relationships module: Posse (mutual), Scouting (one-way), and the private controls Block / Mute /
 * Restrict. It works on user ids only — turning handles into ids and ids into names is the profiles module's job, composed
 * in the app layer, so this module never reads users/profiles and does not depend on them.
 */
export {
  act,
  fenceStanding,
  fenceStandings,
  getRelationshipView,
  hiddenAuthors,
  listMyRelationships,
  relationshipOf,
  spendRequestBudget,
  posseMembersAmong,
} from './service';
export type { MyRelationships, PersonRef, RelationshipView } from './service';
