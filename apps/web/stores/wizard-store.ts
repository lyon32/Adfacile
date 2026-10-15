// Brouillon de l'étape « Sources » (LLD §7.4) : ce que la personne est en train de saisir, avant tout envoi. Rien du
// serveur ici (l'analyse vit dans TanStack Query) et rien n'est écrit dans le navigateur : les fichiers choisis et
// les textes ne sont jamais stockés en local (données du client).
import { create } from 'zustand';
import {
  EMPTY_DRAFT,
  MAX_PHOTOS,
  type Draft,
  type SourceKind,
} from '../features/campaign-wizard/sources-model';

export interface WizardState {
  draft: Draft;
  toggleKind(kind: SourceKind): void;
  setField<K extends 'websiteUrl' | 'postUrl' | 'text' | 'intent' | 'pageId'>(
    key: K,
    value: Draft[K],
  ): void;
  addPhotos(files: readonly File[]): void;
  removePhoto(index: number): void;
  setDocument(file: File | null): void;
  reset(): void;
}

export const useWizardStore = create<WizardState>()((set) => ({
  draft: EMPTY_DRAFT,
  toggleKind: (kind) => {
    set(({ draft }) => ({
      draft: {
        ...draft,
        kinds: draft.kinds.includes(kind)
          ? draft.kinds.filter((k) => k !== kind)
          : [...draft.kinds, kind],
      },
    }));
  },
  setField: (key, value) => {
    set(({ draft }) => ({ draft: { ...draft, [key]: value } }));
  },
  addPhotos: (files) => {
    // Au plus 10 images (APPFLOW §8.1) : le surplus est ignoré ici et signalé à l'écran par `validateDraft`.
    set(({ draft }) => ({
      draft: { ...draft, photos: [...draft.photos, ...files].slice(0, MAX_PHOTOS + 1) },
    }));
  },
  removePhoto: (index) => {
    set(({ draft }) => ({
      draft: { ...draft, photos: draft.photos.filter((_, i) => i !== index) },
    }));
  },
  setDocument: (file) => {
    set(({ draft }) => ({ draft: { ...draft, document: file } }));
  },
  reset: () => {
    set({ draft: EMPTY_DRAFT });
  },
}));
