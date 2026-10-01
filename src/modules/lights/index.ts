/**
 * Public surface of the lights module: Porch Light (ADR-032). Depends on profiles (names) and relationships (who a light
 * reaches); nothing depends on it.
 */
export {
  lightFor,
  litPals,
  myLight,
  purgeExpiredLights,
  switchOff,
  switchOn,
  LIT_LIST_LIMIT,
} from './service';
export type { LightView, LitPal, MyLight } from './service';
