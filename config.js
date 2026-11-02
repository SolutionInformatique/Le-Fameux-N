// Réglages du projet. Après une modification, incrémenter VERSION dans sw.js.
window.FAMEUX_N = {
  // Dépôt GitHub qui reçoit les signalements (onglet « Issues »), au format "utilisateur/depot"
  depot: "SolutionInformatique/Le-Fameux-N",
};

// Lien vers un nouveau ticket GitHub pré-rempli
window.lienSignalement = function (titre, corps) {
  const q = new URLSearchParams({ title: titre, body: corps });
  return `https://github.com/${window.FAMEUX_N.depot}/issues/new?${q}`;
};
