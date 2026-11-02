# Le fameux N

Petite web app (HTML/CSS/JS, sans framework) qui dit si un produit appartient au groupe Nestlé.

- **Scan de code-barres** avec la caméra (iPhone compris) via [html5-qrcode](https://github.com/mebjas/html5-qrcode) (moteur ZXing), ou depuis une photo.
- **Open Food Facts** fournit la marque et le propriétaire du produit.
- **Recherche manuelle** par marque (ou en tapant le code-barres).
- Résultat **rouge = Nestlé** (avec deux alternatives hors Nestlé), **vert = pas Nestlé**, gris = impossible à dire.
- Page **« Pourquoi certains boycottent Nestlé »** (`pourquoi.html`) : les controverses, la réponse de Nestlé et les sources sous chaque section.
- Boutons **« Signaler »** : ouvrent un ticket GitHub (*issue*) pré-rempli avec ce que l'app a affiché (code-barres, produit, marque reconnue) et une case pour la source.

## Avant de publier

Dans [`config.js`](config.js), remplacer `UTILISATEUR/le-fameux-n` par le nom de votre dépôt GitHub (ex. `kelly/le-fameux-n`), puis incrémenter `VERSION` dans `sw.js`. Les signalements arriveront dans l'onglet *Issues* du dépôt (il faut un compte GitHub pour en créer un).
- **PWA** installable, fonctionne hors ligne pour la recherche par marque.

## Mettre à jour la liste des marques

Tout est dans [`marques-nestle.json`](marques-nestle.json) :

```json
{ "nom": "Vittel", "categorie": "Eaux" }
```

| Champ | Rôle |
|---|---|
| `nom` | Nom affiché (les accents et la casse sont ignorés pour la comparaison). |
| `categorie` | Groupe dans la liste « Voir toutes les marques ». |
| `alias` | *(optionnel)* Autres écritures : `["kit kat", "kitkat"]`. |
| `exact` | *(optionnel)* `true` pour les noms courts ou ambigus (« Lion », « Polo ») : la marque doit correspondre en entier. Sinon « Nescafé Gold » est reconnu grâce à « Nescafé ». |
| `note` | *(optionnel)* Précision affichée sous le résultat (licence, coentreprise, pays…). |
| `alternatives` | *(optionnel)* Deux produits hors Nestlé proposés quand le résultat est rouge : `["Twix", "Kinder Bueno"]`. |
| `pays` | *(optionnel)* Où la marque est vendue, pour les marques étrangères : `"Pérou"`. |
| `partiel` | *(optionnel)* `true` si la marque n'est Nestlé que sous licence ou dans certains pays (Starbucks, Häagen-Dazs…) : résultat **orange** « Ça dépend ». |
| `ambigu` | *(optionnel)* `true` pour un nom porté par d'autres marques (« Tango », « Club »…). Au scan, la marque ne compte que si Nestlé apparaît aussi comme propriétaire du produit ; en recherche manuelle, résultat orange. |

Sans `alternatives`, l'app prend celles de la catégorie (`alternativesParCategorie`), puis `alternativesParDefaut`.

`anciennes` liste les marques vendues par Nestlé (Herta, Quézac, Butterfinger…) : elles s'affichent en vert avec la mention « Ancienne marque Nestlé ».

La liste reprend la [liste Wikipédia des marques Nestlé](https://en.wikipedia.org/wiki/List_of_Nestl%C3%A9_brands), corrigée quand une vente est connue. `conseilsAlternatives` ajoute une phrase par catégorie (ex. demander conseil au pédiatre pour le lait infantile).

`proprietaires` liste les mots-clés cherchés dans le champ « propriétaire » d'Open Food Facts (ex. « Nestlé France », « Cereal Partners France »).

Pensez à changer `miseAJour`. Le service worker télécharge toujours la dernière version du fichier quand il y a du réseau : pas besoin de toucher au code.

## Tester en local

La caméra et le service worker exigent `https` ou `localhost` :

```bash
python -m http.server 8000
```

Puis ouvrir http://localhost:8000. Pour tester directement un code : `http://localhost:8000/?code=3017620422003`.

## Déployer sur GitHub Pages

1. Créer un dépôt et y pousser le contenu de ce dossier (à la racine).
2. *Settings › Pages* : source « Deploy from a branch », branche `main`, dossier `/ (root)`.
3. L'app est en ligne sur `https://<utilisateur>.github.io/<depot>/`. Tous les chemins sont relatifs, ça marche dans un sous-dossier.

À chaque mise en ligne du code (pas de la liste), incrémenter `VERSION` dans `sw.js` pour que les téléphones récupèrent la nouvelle version.

## Installer sur le téléphone

- **Android (Chrome)** : menu ⋮ › « Ajouter à l'écran d'accueil » (ou « Installer l'application »).
- **iPhone (Safari)** : bouton Partager › « Sur l'écran d'accueil ».
