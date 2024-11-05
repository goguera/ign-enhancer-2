import { loadNextPage } from '@lib/services/thread-list.service';
import { createButton } from '@lib/utils/helpers';

function injectNextPageButton(): void {
  const location: string = window.location.href;
  if (location.split('/').pop()!.includes('page')) {
    return;
  }
  const threadsEnd = document.querySelector('.block-outer--after') as HTMLElement;
  const button = createButton({
    id: 'newPageButton',
    text: 'Carregar nova página',
    style: {
      width: '100%',
      height: '42px',
    },
    callback: loadNextPage,
  });

  threadsEnd?.parentNode?.insertBefore(button, threadsEnd);
}

export function initNeverEnding(): void {
  injectNextPageButton();
}
