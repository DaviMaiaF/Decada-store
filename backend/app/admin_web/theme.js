/*
 * Tema do painel: automático (segue o sistema), claro ou escuro.
 *
 * Carregado no <head>, sem defer, para aplicar o tema antes do primeiro desenho:
 * sem isso a página piscaria clara antes de ficar escura.
 *
 * A escolha fica no armazenamento do navegador. É a única coisa que o painel guarda
 * ali, e não é dado de ninguém: a sessão continua só em memória (ver admin.js).
 */
"use strict";

(() => {
  const KEY = "decada-painel-tema";
  const MODES = ["auto", "light", "dark"];
  const NAMES = { auto: "automático", light: "claro", dark: "escuro" };

  function read() {
    try {
      const saved = localStorage.getItem(KEY);
      return MODES.includes(saved) ? saved : "auto";
    } catch {
      return "auto";
    }
  }

  function save(mode) {
    try {
      if (mode === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch {
      // Navegação privada ou armazenamento bloqueado: a escolha vale só nesta visita.
    }
  }

  const nextOf = (mode) => MODES[(MODES.indexOf(mode) + 1) % MODES.length];

  function apply(mode) {
    const root = document.documentElement;
    if (mode === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);

    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      button.setAttribute("aria-label", `Tema ${NAMES[mode]}. Trocar para ${NAMES[nextOf(mode)]}`);
      button.title = `Tema ${NAMES[mode]}`;
      for (const icon of button.querySelectorAll("[data-icon]")) {
        // toggleAttribute, e não `icon.hidden`: SVG não tem essa propriedade, e atribuir
        // a ela não tirava o atributo — o ícone de claro e o de escuro nunca apareciam.
        icon.toggleAttribute("hidden", icon.dataset.icon !== mode);
      }
    }
  }

  let mode = read();
  apply(mode);

  document.addEventListener("DOMContentLoaded", () => {
    apply(mode);
    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      button.addEventListener("click", () => {
        mode = nextOf(mode);
        save(mode);
        apply(mode);
      });
    }
  });
})();
