import {browser} from 'webextension-polyfill-ts';
import { getAccountStates } from '@lib/utils/account-state';
import { 
  addToMessageQueue, 
  ensureProcessingIsActive, 
  getMessageQueue, 
  removeFromQueue,
  clearCompletedMessages,
  QueuedMessage
} from '@lib/services/message-queue';

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
      // Handle queuing a post message from a specific account
      else if (request.command === 'queuePostMessage') {
        const { accountId, threadUrl, message } = request;
        
        if (!accountId || !threadUrl || !message) {
          reject('Missing required parameters for queuePostMessage');
          return;
        }
        
        try {
          const queuedMessage = await addToMessageQueue(accountId, threadUrl, message);
          resolve({ success: true, messageId: queuedMessage.id });
        } catch (error) {
          console.error('Error queuing message:', error);
          reject(`Error queuing message: ${error}`);
        }
      }
      // Handle getting all queued messages 
      else if (request.command === 'getQueuedMessages') {
        try {
          const queue = await getMessageQueue();
          resolve({ success: true, messages: queue });
        } catch (error) {
          console.error('Error getting queued messages:', error);
          reject(`Error getting queued messages: ${error}`);
        }
      }
      // Handle removing a message from the queue
      else if (request.command === 'removeQueuedMessage') {
        const { messageId } = request;
        
        if (!messageId) {
          reject('Missing required messageId parameter');
          return;
        }
        
        try {
          await removeFromQueue(messageId);
          resolve({ success: true });
        } catch (error) {
          console.error('Error removing queued message:', error);
          reject(`Error removing queued message: ${error}`);
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
      // Handle cleaning up old completed messages 
      else if (request.command === 'clearCompletedMessages') {
        const { olderThanHours } = request;
        
        try {
          await clearCompletedMessages(olderThanHours || 24);
          resolve({ success: true });
        } catch (error) {
          console.error('Error clearing completed messages:', error);
          reject(`Error clearing completed messages: ${error}`);
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

// Ensure queue processing is started when the background script loads
ensureProcessingIsActive();

// Periodically clean up old completed messages (once a day)
setInterval(() => {
  clearCompletedMessages(24).catch(console.error);
}, 24 * 60 * 60 * 1000);
