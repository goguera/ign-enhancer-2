import { browser } from 'webextension-polyfill-ts';
import { sleep } from '../utils/helpers';
import { XhrData } from '../types';
import { xhrDataObservable } from '@lib/utils/xhr.observable';

let isAutoCloseCanceled = false;

const checkIfAutoCloseIsCanceled = (): boolean => isAutoCloseCanceled;

async function startAutoCloseTab(xhrData: XhrData): Promise<void> {
  const shouldCloseTabSettings = await browser.storage.local.get('closeTabOnPost');
  const shouldCloseTab = shouldCloseTabSettings.closeTabOnPost === 'yes';
  if (shouldCloseTab) {
    isAutoCloseCanceled = false;
    insertCloseTabWarningButton(xhrData);
  }
}

function closeCurrentTab(): void {
  browser.runtime.sendMessage({
    command: 'closeCurrentTab',
  });
}

const startAutoCloseCountdown = async (time: number): Promise<void> => {
  while (time >= 0) {
    await sleep(1000);
    time--;
    if (checkIfAutoCloseIsCanceled()) {
      return;
    }
  }
  closeCurrentTab();
};

const cancelAutoClose = (): void => {
  removeCloseWarningButton();
  isAutoCloseCanceled = true;
};

function removeCloseWarningButton(): void {
  const button = document.getElementById('closeWarningButton');
  button?.remove();
}

async function insertCloseTabWarningButton(xhrData: XhrData): Promise<void> {
  const timeToClose = await browser.storage.local.get('timeToClose');
  const replyButton = document.querySelector<HTMLButtonElement>('#replyButton'); // Assuming #replyButton is the id of your reply button
  const warningButtonHtml = `<button type='button' id='closeWarningButton'>Fechando aba em ${timeToClose.timeToClose} segundos, clique para cancelar</button>`;
  replyButton?.insertAdjacentHTML('beforebegin', warningButtonHtml);
  document.getElementById('closeWarningButton')?.addEventListener('click', cancelAutoClose);
  startAutoCloseCountdown(parseInt(timeToClose.timeToClose));
}

function xhrCallback(data: { xhrData: XhrData }): void {
  if (data.xhrData.status === 'ok' && data.xhrData.url) {
    const actionName = data.xhrData.url.split('/').pop();
    if (actionName === 'add-reply') {
      startAutoCloseTab(data.xhrData);
    }
  }
}

export function initAutoClose(): void {
  xhrDataObservable.subscribe(data => {
    xhrCallback({ xhrData: data });
  });
}