// Module @pubeka/platforms : connecteurs de plateformes publicitaires (LLD §4, §6.13-6.14).
export type * from './types';
export { UnavailableConnector } from './unavailable';
export { googleConnector } from './google';
export { tiktokConnector } from './tiktok';
export * from './meta/errors';
export * from './meta/token-crypto';
