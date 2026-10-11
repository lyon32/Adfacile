# Pubeka

Créer et lancer des publicités en ligne en quelques clics, sur Meta Ads aujourd'hui, puis Google Ads, TikTok Ads et les plateformes suivantes. Pubeka remplace AdFacile.

- Documentation : [docs/README.md](docs/README.md) (PRD, agents IA, design system)
- Banc de test des modèles IA : [bench/](bench/)

## Lancer le projet en local

```bash
npm install
npm run dev            # application web sur http://localhost:5173
```

```bash
cd backend && npm install && npm run dev   # API (création des campagnes Meta)
```

Les variables d'environnement sont décrites dans `.env.example` et `backend/.env.example`.
