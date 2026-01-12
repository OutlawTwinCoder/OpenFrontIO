# Guide pour gagner contre les bots

Ce guide synthétise le comportement des bots d’après la logique du jeu, puis
donne des stratégies concrètes pour les battre en partie solo ou privée.
Il inclut aussi une explication précise de la croissance des troupes (pourquoi
certains pays grossissent plus vite que d’autres).

## Ce que font les bots (comportement interne)

- **Ils acceptent automatiquement toutes les demandes d’alliance** et renouvellent
  dès qu’on le demande. Cela veut dire qu’une alliance avec un bot est facile à
  obtenir et stable tant que vous ne le trahissez pas.【F:src/core/execution/BotExecution.ts†L52-L80】
- **Ils attaquent par vagues régulières** à un rythme aléatoire (entre 40 et 80 ticks
  environ) et n’attaquent que quand ils ont assez de troupes en réserve
  (ratios aléatoires fixes par bot).【F:src/core/execution/BotExecution.ts†L17-L32】【F:src/core/execution/utils/AiAttackBehavior.ts†L302-L314】
- **Priorité au terrain neutre (Terra Nullius)** : tant qu’il reste du terrain neutre
  non irradié adjacent, ils l’attaquent en premier.【F:src/core/execution/utils/AiAttackBehavior.ts†L52-L70】
- **Ils ciblent surtout d’autres bots** et privilégient les bots à faible densité
  (troupes / tuiles).【F:src/core/execution/utils/AiAttackBehavior.ts†L359-L399】
- **Ils évitent d’attaquer des joueurs humains selon la difficulté** (Easy/Medium
  ont une probabilité de ne pas attaquer un humain).【F:src/core/execution/utils/AiAttackBehavior.ts†L747-L765】
- **Ils peuvent attaquer en bateau** si une bordure de mer est proche, mais
  ils évitent d’envoyer des bateaux vers des joueurs plus forts et privilégient
  des cibles plus faibles ou non-joueurs.【F:src/core/execution/utils/AiAttackBehavior.ts†L74-L184】
- **Ils réagissent aux traîtres et aux attaques entrantes**, et peuvent trahir un allié
  si certaines conditions sont remplies.【F:src/core/execution/utils/AiAttackBehavior.ts†L233-L290】【F:src/core/execution/utils/AiAttackBehavior.ts†L330-L360】
- **La difficulté change l’ordre des priorités** (ex : en Impossible, ils
  contre-attaquent et ciblent les plus faibles en premier).【F:src/core/execution/utils/AiAttackBehavior.ts†L295-L333】

## Fonctionnement précis de la croissance des troupes

La croissance n’est pas un simple “+X par seconde” : elle dépend de la taille
du territoire, du plafond de troupes et du type de joueur (humain, bot, nation).

### 1) Le plafond de troupes (maxTroops)

Le plafond maximum de troupes dépend surtout du **nombre de tuiles possédées**
et des **niveaux de villes**. La formule générale est basée sur `numTilesOwned`
et la somme des niveaux des villes.【F:src/core/configuration/DefaultConfig.ts†L831-L848】

- **Humain** : plafond normal.
- **Bot** : plafond réduit à **1/3** du plafond normal (donc croissance plus lente).
- **Nation** : plafond multiplié selon la difficulté (0.75x à 1.25x).【F:src/core/configuration/DefaultConfig.ts†L831-L858】

### 2) La croissance par tick (troopIncreaseRate)

Chaque tick, le jeu calcule l’augmentation de troupes avec :

- une base `10 + troops^0.73 / 4`,
- un **facteur de saturation** `1 - troops/maxTroops` (plus on s’approche du plafond,
  plus la croissance ralentit),
- un **bonus/malus** selon le type de joueur (bots à 0.6x, nations ajustées
  par difficulté).【F:src/core/configuration/DefaultConfig.ts†L864-L895】

Cette croissance est appliquée à chaque tick par l’exécution joueur.【F:src/core/execution/PlayerExecution.ts†L74-L90】

### 3) Le stock initial

Le stock de départ varie aussi :

- **Humain** : 25 000 (ou 1 000 000 en mode troupes infinies).
- **Bot** : 10 000.
- **Nation** : 18 750 à 31 250 selon la difficulté.【F:src/core/configuration/DefaultConfig.ts†L804-L829】

## Pourquoi un pays (ex: Italie) grossit plus vite que toi ?

Plusieurs raisons explicables par le code :

1. **Type de joueur**  
   Si l’Italie est une **Nation**, elle bénéficie de multiplicateurs de croissance
   et de plafond liés à la difficulté (jusqu’à +25% en Impossible).【F:src/core/configuration/DefaultConfig.ts†L831-L858】【F:src/core/configuration/DefaultConfig.ts†L864-L895】

2. **Taille du territoire**  
   Le plafond `maxTroops` augmente avec **le nombre de tuiles possédées**. Un pays
   qui a capturé plus de terrain aura un plafond plus haut, donc une croissance
   plus rapide (la saturation est moins forte).【F:src/core/configuration/DefaultConfig.ts†L831-L848】【F:src/core/configuration/DefaultConfig.ts†L864-L873】

3. **Villes capturées**  
   Chaque niveau de ville augmente le plafond de troupes, ce qui accélère
   indirectement la croissance.【F:src/core/configuration/DefaultConfig.ts†L835-L839】

4. **Niveau de troupes actuel**  
   Deux joueurs ayant le même plafond ne grandissent pas pareil si l’un est
   proche de son plafond (croissance ralentie) et l’autre non.【F:src/core/configuration/DefaultConfig.ts†L868-L895】

**En bref :** si l’Italie grossit plus vite, c’est généralement parce qu’elle est
une Nation (bonus de difficulté), qu’elle possède plus de tuiles ou plus de villes,
ou qu’elle est moins proche de son plafond de troupes.

## Stratégie globale pour battre les bots

### 1) Exploiter les alliances faciles

- Proposez une alliance tôt : le bot accepte automatiquement.
- Utilisez l’alliance pour sécuriser un front, puis concentrez vos troupes
  sur les bots les plus faibles ou les humains adverses.
- Gardez à l’esprit que les bots peuvent trahir s’ils trouvent une opportunité
  (surtout en difficulté élevée).

### 2) Punir leur obsession de Terra Nullius

Les bots préfèrent attaquer les tuiles neutres proches. Cela crée une ouverture :
laissez un petit couloir de terrain neutre adjacent pour détourner leurs attaques,
pendant que vous préparez un encerclement ou une contre-offensive ailleurs.

### 3) Cibler les bots à faible densité

Ils choisissent leurs cibles bots par **densité** (troupes / tuiles). Faites l’inverse :
priorisez les bots dont les territoires sont grands mais pauvres en troupes. Vous
gagnerez beaucoup de terrain avec peu de pertes.

### 4) Éviter de devenir leur “cible facile”

Les bots cherchent des adversaires plus faibles et évitent les plus forts. Pour
réduire la pression :

- Montez rapidement votre réserve de troupes.
- Évitez d’être isolé avec une faible frontière défendue.
- Maintenez une force supérieure à vos voisins directs.

### 5) Utiliser la mer pour des attaques surprises

Ils envoient des bateaux si vous êtes proches d’une côte, mais ils évitent les
cibles plus fortes. Faites l’inverse : surprenez les bots par la mer quand ils
sont en expansion et ont peu de réserve.

### 6) Punir les bots en multi-fronts

Sur difficultés élevées, ils attaquent plusieurs bots en parallèle. Si vous êtes
humain, prenez l’initiative :

- Lancez 2-3 attaques en parallèle sur des bots faibles.
- Évitez les attaques “all-in” : laissez toujours une réserve pour les ripostes.

## Stratégie par phase de partie

### Début de partie (expansion)

- **Priorité** : capturer Terra Nullius rapidement pour empêcher les bots d’y
  investir leurs attaques.
- **Alliance** : sécurisez un bot voisin pour réduire le nombre de fronts.

### Milieu de partie (stabilisation)

- **Ciblez les bots les plus étendus mais faibles**.
- **Évitez d’être le plus faible sur votre frontière**, sinon vous serez ciblé.

### Fin de partie (domination)

- **Éliminez les bots isolés** (ils deviennent des cibles “faibles” pour les autres,
  mais aussi pour vous).
- **Conservez un avantage de troupes** pour dissuader les attaques aléatoires.

## Résumé rapide (checklist)

- ✅ Alliance facile = front sécurisé
- ✅ Détourner les bots avec Terra Nullius
- ✅ Attaquer les bots à faible densité
- ✅ Garder une réserve de troupes
- ✅ Exploiter les attaques maritimes surprise
