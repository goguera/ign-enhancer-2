import { XhrData } from '@lib/types';
import { xhrDataObservable } from '@lib/utils/xhr.observable';
import { getSubmitButton } from '@lib/utils/dom';

let onAntiFlood = false;



function parseAntiFloodTime(errorMessage: string): number {
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

function startAutoFlood(xhrData: any, errorMessage: string): void {
  if (onAntiFlood) {
    closeAntiFloodMessage();
    return;
  }
  onAntiFlood = true;
  const replyButton = getSubmitButton(xhrData.url);
  if (replyButton === null) {
    onAntiFlood = false;
    return;
  }
  const antiFloodTime = parseAntiFloodTime(errorMessage);
  closeAntiFloodMessage();
  replyButton.style.pointerEvents = 'none';
  startAntiFloodCountdown(antiFloodTime, replyButton);
}

function xhrCallback(data: { xhrData: XhrData }): void {
  if (data.xhrData.status === 'error') {
    const errorMessage = 'must wait at least';
    const isMatch = data.xhrData.errors?.some((error) => error.includes(errorMessage));
    if (isMatch) {
      startAutoFlood(data.xhrData, data.xhrData.errors!.join(' '));
    }
  }
}


export function initAutoFlood(): void {
  xhrDataObservable.subscribe(data => {
    console.log('autoflood emitted');
    xhrCallback({ xhrData: data });
  });
}