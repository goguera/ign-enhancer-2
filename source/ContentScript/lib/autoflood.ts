import { XhrData } from './types';

let onAntiFlood = false;

function detectSubmitButton(currentUrl: string): HTMLButtonElement | null {
  const location = currentUrl.split('/')[1].split('/')[0];
  let button: HTMLButtonElement | undefined;
  console.log('location', location);
  const allButtons = document.querySelectorAll<HTMLButtonElement>('button[type=submit]');
  if (location === 'conversations' || location === 'threads') {
    button = allButtons[4];
    if (location === 'threads' && button.classList.contains('button--icon--vote')) {
      button = allButtons[5];
    }
  } else {
    return null;
  }
  return button ?? null;
}

function detectAntiFloodTime(errorMessage: string): number {
  return parseInt(errorMessage.split('at least ')[1].split(' seconds')[0], 10);
}

function closeAntiFloodMessage(): void {
  try {
    const blocks = document.getElementsByClassName('overlay-titleCloser');
    for (let i = 0, len = blocks.length; i < len; i++) {
      try {
        (blocks[i] as HTMLElement).click();
      } catch {}
    }
  } catch (e) {
    console.error('Error on closeAntiFloodMessage: ', e);
  }
}

async function startAntiFloodCountdown(
  time: number,
  replyButton: HTMLButtonElement,
): Promise<void> {
  const originalButtonText = replyButton.innerHTML;
  replyButton.innerHTML = time.toString();
  while (time > 0) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    time--;
    replyButton.innerHTML = time.toString();
    replyButton.style.pointerEvents = 'none';
  }
  replyButton.style.pointerEvents = 'auto';
  replyButton.innerHTML = originalButtonText;
  onAntiFlood = false;
  replyButton.click();
}

function startAntiFlood(xhrData: any, errorMessage: string): void {
  console.log('startAntiFlood', xhrData, errorMessage);
  if (onAntiFlood) {
    console.log('onAntiFlood', onAntiFlood);
    closeAntiFloodMessage();
    return;
  }
  onAntiFlood = true;
  const replyButton = detectSubmitButton(xhrData.url);
  console.log('replyButton', replyButton);
  if (replyButton === null) {
    onAntiFlood = false;
    return;
  }
  const antiFloodTime = detectAntiFloodTime(errorMessage);
  closeAntiFloodMessage();
  replyButton.style.pointerEvents = 'none';
  startAntiFloodCountdown(antiFloodTime, replyButton);
}

function xhrCallback(data: { xhrData: XhrData }): void {
  if (data.xhrData.status === 'error') {
    const stringToCheck = 'must wait at least';
    const includesTheString = data.xhrData.errors?.some((error) => error.includes(stringToCheck));
    if (includesTheString) {
      startAntiFlood(data.xhrData, data.xhrData.errors!.join(' '));
    }
  }
}

export function initAutoFlood(): void {
  window.addEventListener(
    'getXhrData',
    function (event: CustomEvent<{ data: XhrData }>) {
      xhrCallback({
        xhrData: event.detail.data,
      });
    } as any,
    false,
  );
}