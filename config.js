// Réglages du projet. Après une modification, incrémenter VERSION dans sw.js.
window.FAMEUX_N = {
  // Dépôt GitHub qui reçoit les signalements (onglet « Issues »), au format "utilisateur/depot"
  depot: "SolutionInformatique/Le-Fameux-N",
  // Page « Nous contacter » (site de MJ Solution Informatique). Vide = bouton masqué.
  contact: "https://www.mjinformatique.fr/#contact",
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
