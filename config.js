// Réglages du projet. Après une modification, incrémenter VERSION dans sw.js.
window.FAMEUX_N = {
  // Dépôt GitHub qui reçoit les signalements (onglet « Issues »), au format "utilisateur/depot"
  depot: "SolutionInformatique/Le-Fameux-N",
  // Page « Nous contacter » (site de MJ Solution Informatique). Vide = bouton masqué.
  contact: "https://www.mjinformatique.fr/#contact",
  // Code du compteur de visites GoatCounter (anonyme, sans cookies), ex. "lefameuxn". Vide = pas de compteur.
  goatcounter: "solutioninformatique",
};

// Compteur de visites GoatCounter, chargé seulement si un code est renseigné
if (window.FAMEUX_N.goatcounter) {
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `https://${window.FAMEUX_N.goatcounter}.goatcounter.com/count`;
  document.head.appendChild(s);
}

// Compte un type de résultat (« nestle », « pas-nestle »…), jamais le produit ni le code-barres
window.compterEvenement = function (nom) {
  if (window.goatcounter && window.goatcounter.count) {
    window.goatcounter.count({ path: `resultat-${nom}`, title: nom, event: true });
  }
};

// Affiche le bouton « Nous contacter » de la page s'il y a une adresse
document.addEventListener("DOMContentLoaded", () => {
  const lien = document.getElementById("contact-link");
  if (!lien) return;
  if (window.FAMEUX_N.contact) lien.href = window.FAMEUX_N.contact;
  else lien.hidden = true;
});

// Lien vers un nouveau ticket GitHub pré-rempli
window.lienSignalement = function (titre, corps) {
  const q = new URLSearchParams({ title: titre, body: corps });
  return `https://github.com/${window.FAMEUX_N.depot}/issues/new?${q}`;
};
