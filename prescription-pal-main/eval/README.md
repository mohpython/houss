# Harnais d'évaluation de l'extraction d'ordonnances

## À quoi ça sert

L'extraction d'ordonnances est pilotée par `gemini-3.6-flash` avec un prompt
système d'environ 60 lignes. **Aucun modèle n'est entraîné** : on ne fait que
demander à un modèle généraliste de lire une photo. Conséquence : quand on
touche au prompt, au catalogue ou au modèle, on n'a aucun moyen de savoir si on
améliore ou si on casse quelque chose.

Ce harnais comble ce vide. Il rejoue les ordonnances déjà traitées et note le
résultat.

## Ce qu'il mesure — et ce qu'il ne mesure pas

| Mesuré | Non mesuré |
|---|---|
| La **stabilité** : le même document donne-t-il la même sortie qu'avant ? | La **justesse** : un nom lu correctement ou non |
| Les **anomalies** : noms absents du catalogue, non-médicaments, doublons | La complète couverture d'une ordonnance |

> Un score de 100 % signifie « rien n'a changé », **pas** « tout est correct ».
> La référence (`eval/golden.json`) est un instantané de notre propre
> comportement, pas une vérité terrain. La vérité se construit par **relecture
> humaine** dans l'espace admin (`review_status`), pas par le harnais.

## Usage

Le harnais tourne **sur le serveur**, où se trouvent à la fois les fichiers des
ordonnances (`STORAGE_DIR`) et la configuration `.env`.

```bash
# 1. Figer la référence (à faire une fois, et après toute relecture humaine)
npm run eval:golden

# 2. Rejouer et noter
npm run eval:rx
```

### Options

| Option | Effet |
|---|---|
| `--limit N` | n'évaluer que les N premiers cas (essai rapide) |
| `--no-catalog` | passer le catalogue à `null` : isole l'effet du prompt seul |
| `--out <fichier>` | écrit aussi le rapport au format JSON |
| `--concurrency N` | appels IA simultanés (défaut 1) |
| `--delay MS` | pause entre deux cas (défaut 1500) |

```bash
npm run eval:rx -- --limit 3
npm run eval:rx -- --no-catalog
npm run eval:rx -- --out /tmp/rapport-avant.json
```

## Limite de débit de l'IA

L'API (Google AI Studio, plan gratuit) régénère son quota de façon lente (de
l'ordre d'un appel par minute quand il est épuisé). Un passage entier échoue en
masse (« Too Many Requests ») si on ne fait rien. Le harnais absorbe cela tout
seul : à la première réponse 429, il attend plusieurs minutes (4 min, puis 8,
puis 12, jusqu'à 5 essais) puis réessaie **le même cas**. Un passage complet de
14 ordonnances peut donc prendre 1 à 2 heures quand le quota est épuisé par de
précédents essais — c'est normal, ne pas interrompre. Les cas restés en échec
sont marqués `ERREUR` dans le rapport, le reste est mesuré quand même.

## Sortie

```
SAHA — evaluation de l'extraction d'ordonnances
  cas        : 12
  catalogue  : 213 entrees
  note       : score de stabilite, pas de justesse (cf. eval/README.md)

  cas       fichier / verdict
  --------------------------------------------------------------------------
  #1   42ff8bd0  3 med. | inchange 3/3  | +0 -0
  #2   de60ca76  5 med. | inchange 4/5  | +1 -1  | 1 hors-catalogue

Anomalies
  --------------------------------------------------------------------------
  #2  hors catalogue : "Till" (aucune pharmacie ne pourra le servir)
  #4  non-medicament : "Catheter G 24" (mot-clé « catheter »)

Bilan
  --------------------------------------------------------------------------
  rappel           : 96 % des medicaments attendus sont toujours la
  precision        : 92 % rien en trop
  hors catalogue   : 2
```

## Les trois anomalies à surveiller

Elles correspondent aux défauts observés en production, pas à des hypothèses.

1. **`hors catalogue`** — le nom extrait ne se raccorde à aucune entrée du
   catalogue, donc à aucun stock. Le patient se voit répondre « indisponible »
   alors que la pharmacie a le produit. Cause habituelle : le catalogue est trop
   petit (213 entrées) ou l'IA a mal lu le nom (`Till` pour *Tylol*).
2. **`non-medicament`** — un dispositif ou un soluté listé comme médicament
   (`Catheter G 24`, `SG 10 %`, `eau`). Heuristique, à confirmer à l'œil.
3. **`doublon`** — le même noyau de nom sur plusieurs lignes
   (`Gencloben crème` + `Gencloben ovule` = un seul produit). Gonfle les
   quantités et fait commander deux fois.

## Confidentialité

`eval/golden.json` référence des ordonnances de patients réels. Il est **exclu
de git** (`.gitignore`) et se régénère sur le serveur. Ne pas le copier ni le
versionner.

## Architecture

`runPrescriptionVisionAi` (`src/lib/rx-core.server.ts`) est le **cœur pur** de
l'extraction : octets → JSON, sans base ni journal. `extractPrescriptionCore`
l'appelle puis persiste. Cette séparation est ce qui rend le harnais possible
sans dupliquer la logique d'extraction — et sans risque pour les données.

Si quelqu'un ajoute une étape à l'extraction, elle doit aller dans
`runPrescriptionVisionAi` : sinon le harnais mesurera une chaîne qui n'est plus
celle de la production.
