/** Native disclosure menus: links stay links, Tab stays native. */
let controller: AbortController | undefined;

function initDropdowns() {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  const menus = [...document.querySelectorAll<HTMLDetailsElement>('details[data-dropdown]')];
  const close = (except?: HTMLDetailsElement) => menus.forEach(menu => {
    if (menu !== except) menu.open = false;
  });

  for (const menu of menus) {
    menu.addEventListener('toggle', () => {
      if (menu.open) close(menu);
    }, { signal });
    menu.addEventListener('focusout', event => {
      if (!(event.relatedTarget instanceof Node) || !menu.contains(event.relatedTarget)) menu.open = false;
    }, { signal });
  }
  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    close(menus.find(menu => menu.contains(target)));
  }, { signal });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = menus.find(menu => menu.open);
    if (!open) return;
    open.open = false;
    open.querySelector('summary')?.focus();
  }, { signal });
  document.addEventListener('scroll', () => close(), { capture: true, passive: true, signal });
}

document.addEventListener('astro:page-load', initDropdowns);
document.addEventListener('astro:before-swap', () => controller?.abort());
