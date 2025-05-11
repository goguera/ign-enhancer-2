import {browser} from 'webextension-polyfill-ts';
import { getAccountStates } from '@lib/utils/account-state';

// Handle extension icon click
browser.browserAction.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
});

// Message handlers for various features
function handleMessage(request: any, sender: any): Promise<any> {
  return new Promise<any>(async (resolve, reject) => {
    try {
      // Handle closing the current tab
      if (request.command === 'closeCurrentTab') {
        if (sender.tab && sender.tab.id) {
          await browser.tabs.remove(sender.tab.id);
          resolve(void 0);
        } else {
          reject('No tab or tab ID specified.');
        }
      } 
      // Handle getting available accounts
      else if (request.command === 'getAccounts') {
        try {
          const states = await getAccountStates();
          const accountsList = Object.entries(states.accounts)
            .filter(([_, account]) => account.status === 'synced' && !account.isResyncing)
            .map(([id, account]) => ({
              id,
              name: account.profile?.displayName || account.name,
              username: account.profile?.username || '',
              avatarUrl: account.profile?.avatarUrl || '',
              isActive: id === states.activeAccountId
            }));
          
          resolve({ success: true, accounts: accountsList });
        } catch (error) {
          console.error('Error getting accounts:', error);
          reject(`Error getting accounts: ${error}`);
        }
      }
      else {
        resolve(void 0);  // Resolve in cases where no action is necessary
      }
    } catch (error) {
      console.error('Error handling message:', error);
      reject(`Error handling message: ${error}`);
    }
  });
}

browser.runtime.onMessage.addListener(handleMessage);
