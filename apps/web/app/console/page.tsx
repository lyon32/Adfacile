import type { ReactNode } from 'react';
import { SignedInHome } from '../../features/auth/signed-in-home';

// Accueil provisoire (S04 : connexion obligatoire, salutation, déconnexion) ; le tableau de
// bord arrive en S09 dans console/(shell).
export default function ConsolePage(): ReactNode {
  return <SignedInHome />;
}
