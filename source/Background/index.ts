import {browser} from 'webextension-polyfill-ts';

function handleMessage(request: any, sender: any): Promise<void> {
  return new Promise((resolve, reject) => {
    if (request.command === 'closeCurrentTab') {
      if (sender.tab && sender.tab.id) {
        browser.tabs.remove(sender.tab.id)
          .then(() => resolve())
          .catch(error => reject(error));
      } else {
        reject('No tab or tab ID specified.');
      }
    } else {
      resolve();  // Resolve in cases where no action is necessary
    }
  });
}

browser.runtime.onMessage.addListener(handleMessage);
