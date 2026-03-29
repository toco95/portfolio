let controller: AbortController;

export function initModal() {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;

  const modal = document.getElementById('project-modal');
  const backdrop = document.getElementById('modal-backdrop');
  const closeBtn = document.getElementById('modal-close');
  const contentEl = document.getElementById('modal-content');
  if (!modal || !backdrop || !closeBtn || !contentEl) return;

  window.addEventListener('open-project-modal', ((e: CustomEvent) => {
    const { id } = e.detail;
    openModal(id, modal, contentEl);
  }) as EventListener, { signal });

  closeBtn.addEventListener('click', () => closeModal(modal), { signal });
  backdrop.addEventListener('click', () => closeModal(modal), { signal });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal(modal);
    }
  }, { signal });
}

function openModal(id: string, modal: HTMLElement, contentEl: HTMLElement) {
  const template = document.querySelector(`template[data-project="${id}"]`) as HTMLTemplateElement;
  if (!template) return;

  contentEl.innerHTML = '';
  contentEl.appendChild(template.content.cloneNode(true));
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal: HTMLElement) {
  modal.classList.remove('active');
  document.body.style.overflow = '';
}
