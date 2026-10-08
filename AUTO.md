## L'automatisation

```
npm run tunnel
```

Le script télécharge `cloudflared` si besoin, ouvre le tunnel, écrit l'URL dans `backend/.env`, redémarre le backend, et **affiche l'URL à coller**. Trois étapes sur quatre automatisées.

La quatrième — la liste blanche Meta — reste manuelle : l'API Graph n'expose pas l'écriture des URI de redirection. Aucun script n'y changera rien.
