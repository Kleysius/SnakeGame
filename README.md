# 🐍 Snake

Un Snake revisité, en JavaScript natif (aucune dépendance, aucun build).

## Jouer

Les modules ES doivent être servis en HTTP (ouvrir `index.html` en `file://` ne marche pas) :

```bash
npm start            # ou l'extension Live Server de VS Code
```

| Action | Clavier | Mobile |
| --- | --- | --- |
| Diriger | Flèches, ZQSD (AZERTY) ou WASD (QWERTY) | Glisser sur le plateau ou croix directionnelle |
| Pause | `Espace`, `P`, `Échap` | Bouton ⏸ |
| Jouer / Rejouer | `Entrée` | Bouton |
| Son | `M` | Bouton 🔊 |

## Nouveautés

- **Rendu Canvas fluide** : boucle à pas fixe + interpolation, mouvement doux à 60/120/144 Hz quelle que soit la vitesse du jeu.
- **Serpent vivant** : dégradé, yeux qui suivent la nourriture, clignements, langue qui sort, yeux en croix à la mort.
- **Combos** : enchaîne les prises rapidement pour un multiplicateur jusqu'à ×5.
- **Pommes dorées** (500 pts, +3 anneaux) et **souris fuyardes** (350 pts) qui s'échappent si tu es trop lent.
- **Niveaux** : la vitesse augmente toutes les 5 prises.
- **Deux modes** : *Classique* (murs mortels) et *Portail* (on traverse les bords).
- **Juice** : particules, textes flottants, tremblement d'écran, flash, compte à rebours, sons synthétisés (Web Audio, 0 fichier).
- **Records persistants** (top 5 par mode, `localStorage`) et écran de fin avec statistiques.
- **Démo** : une IA joue en fond du menu.
- **Accessibilité** : navigation clavier, focus visibles, `prefers-reduced-motion` respecté, pause automatique quand l'onglet perd le focus.

## Mécaniques avancées 🌶️

Tout se multiplie entre soi : **combo (×5) × Frénésie (×2) × Piment (×3) × Lasso (×3)**, soit jusqu'à **×90** sur une seule prise. Chaque couche est limitée dans le temps ou demande de la technique, pour que le jackpot se mérite.

| | Mécanique | Comment |
| --- | --- | --- |
| 🪢 | **Lasso ×3** | Referme ton corps autour d'un objet (les murs comptent) : il est capturé à distance. La meilleure façon de piéger une souris. |
| 😬 | **Frôlement** | Passer au ras de son propre corps rapporte des points et charge la Frénésie. Récompensé une fois par approche (impossible à farmer en longeant son corps). |
| 🌶️ | **Piment ×3** | Apparaît parfois à partir du niveau 2 et se fane vite. Le manger rend le serpent 30 % plus rapide pendant quelques secondes, mais tout vaut le triple. À toi de choisir. |
| 🌈 | **Frénésie ×2** | Jauge remplie en mangeant, en frôlant et au lasso. Pleine : serpent arc-en-ciel, ligne de basse au rythme du jeu, et tous les points doublés. |

Tous les réglages (probabilités, durées, multiplicateurs) sont dans `src/config.js`.

## Corrections par rapport à la v1

- Faire demi-tour tuait instantanément → les demi-tours sont ignorés, et les virages rapides sont mis en file d'attente.
- La nourriture pouvait apparaître sous le serpent.
- Sur mobile la grille logique (25 px) ne correspondait pas aux cases affichées (20 px).
- L'image de fond (800 Ko) ne correspondait pas à la zone jouable → plateau dessiné en code.
- Un écouteur « rejouer » était ajouté à chaque partie ; la difficulté ne montait que si le score tombait pile sur un multiple de 1000.

## Architecture

```
src/
  config.js     réglages du jeu (grille, points, vitesse…)
  game.js       logique pure : état + step() qui renvoie des événements (testable, sans DOM)
  renderer.js   rendu canvas + effets visuels
  input.js      clavier / swipe / croix directionnelle
  audio.js      effets sonores synthétisés
  storage.js    records & réglages (localStorage, tolérant aux erreurs)
  autopilot.js  IA de la démo du menu
  main.js       machine à états + boucle de jeu, relie le tout
tests/          tests unitaires de la logique (node --test)
```

```bash
npm test
```

Astuce dev : ajouter `?autopilot` à l'URL laisse l'IA jouer une vraie partie (l'état du jeu est alors exposé dans `window.__snake.game`).
