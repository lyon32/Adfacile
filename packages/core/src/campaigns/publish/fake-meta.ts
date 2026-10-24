// La fausse Meta pour les tests d'intégration de `apps/web`, qui n'ont pas le droit d'importer `@pubeka/platforms` (LLD §3).
// Aucun appel réel : pannes simulables, compteurs de créations, d'activations et de mises en pause.
export { FakeMetaConnector, FAKE_EXPIRED_TOKEN, MetaGraphError } from '@pubeka/platforms';
