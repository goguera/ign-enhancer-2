import { ToolbarButtonSpecs, ToolbarButtonSpecsResolver } from '@lib/types';
import { egofilterButton } from './toolbar-features/egofilter';
import { countersObservable } from '@lib/services/thread-list.service';

function detectDesiredSibling() {
  const desiredSibling = document.querySelector(
    '.block-outer-opposite .buttonGroup',
  ) as HTMLElement;
  return desiredSibling;
}

function createToolbar() {
  // Create the main div element for the button group
  const toolbar = document.createElement('div');
  toolbar.className = 'buttonGroup';
  toolbar.style.marginRight = '15px';
  toolbar.id = 'ign-enhancer-toolbar';

  return toolbar;
}

function insertToolBar() {
  const desiredSibling = detectDesiredSibling();
  const toolbar = createToolbar();
  // Get the parent node of the desired sibling
  const parent = desiredSibling.parentNode;
  // Insert the toolbar before the desired sibling within the parent node
  parent?.insertBefore(toolbar, desiredSibling);
  return Promise.resolve();
}

function addElementToToolbar(element: HTMLElement) {
  const toolbar = document.getElementById('ign-enhancer-toolbar');
  toolbar?.appendChild(element);
}

async function addButtonToToolbar(options: ToolbarButtonSpecs | ToolbarButtonSpecsResolver) {
  if (typeof options === 'function') {
    options = await options() as ToolbarButtonSpecs;
  }
  const { onClick, initialText } = options;

  // Create the first anchor element
  const anchor = document.createElement('span');
  anchor.className = 'button--link button rippleButton';

  // Create inner span
  const inner = document.createElement('span');
  inner.className = 'button-text';
  inner.textContent = initialText;

  // Create the ripple container div
  const ripple = document.createElement('div');
  ripple.className = onClick ? 'ripple-container' : '';

  // Append the inner span and ripple container to the anchor
  anchor.appendChild(inner);
  anchor.appendChild(ripple);

  if (onClick) {
    anchor.addEventListener('click', () => {
      onClick(anchor, inner, ripple);
    });
  }
  addElementToToolbar(anchor);
  return [anchor, inner, ripple];
}

async function initCounters() {
  const threadsCounter = await addButtonToToolbar({
    initialText: 'Tópicos: 0/0, Páginas 1',
  });

  countersObservable.subscribe((counts) => {
    threadsCounter[1].textContent = `Tópicos: ${counts.threadsLoadedVisible}/${counts.threadsLoaded}, Páginas ${counts.page}`;
  });

  //   of([threadsLoadedVisible, threadsLoaded, page]).subscribe(([visible, total]) => {
  //     threadsCounter[1].textContent = `Tópicos: ${visible}/${total}, Página ${page}`;
  //   });
}

export async function initToolbar() {
  await insertToolBar();
  await addButtonToToolbar(egofilterButton);
  await initCounters();
}
