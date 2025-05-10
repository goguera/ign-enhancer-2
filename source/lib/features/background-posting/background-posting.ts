import { browser } from 'webextension-polyfill-ts';
import { getReplyContainer } from '@lib/utils/dom';
import { logger } from '@lib/utils/logging';

// Log source identifier
const LOG_SOURCE = 'background-posting';

interface Account {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
  isActive: boolean;
}

/**
 * Get all available accounts that can be used for posting
 */
async function getAvailableAccounts(): Promise<Account[]> {
  logger.debug(LOG_SOURCE, 'Fetching available accounts');
  try {
    const response = await browser.runtime.sendMessage({ 
      command: 'getAccounts'
    });
    
    if (response.success && Array.isArray(response.accounts)) {
      logger.info(LOG_SOURCE, `Retrieved ${response.accounts.length} accounts`, {
        activeAccounts: response.accounts.filter((a: Account) => a.isActive).length
      });
      return response.accounts;
    } else {
      logger.error(LOG_SOURCE, 'Failed to get accounts', { response });
      console.error('Failed to get accounts:', response);
      return [];
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(LOG_SOURCE, 'Error fetching accounts', {
      error: errorMessage,
      errorObject: error
    });
    console.error('Error fetching accounts:', error);
    return [];
  }
}

/**
 * Queue a message for sending from a specific account
 */
async function queuePostMessage(accountId: string, threadUrl: string, message: string): Promise<string | null> {
  logger.info(LOG_SOURCE, 'Queueing message for posting', {
    accountId,
    threadUrl,
    messageLength: message.length
  });
  
  try {
    const response = await browser.runtime.sendMessage({
      command: 'queuePostMessage',
      accountId,
      threadUrl,
      message
    });
    
    if (response.success && response.messageId) {
      logger.info(LOG_SOURCE, 'Message successfully queued', {
        messageId: response.messageId,
        accountId,
        threadUrl
      });
      return response.messageId;
    } else {
      logger.error(LOG_SOURCE, 'Failed to queue message', { 
        response,
        accountId,
        threadUrl
      });
      console.error('Failed to queue message:', response);
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(LOG_SOURCE, 'Error queueing message', {
      error: errorMessage,
      errorObject: error,
      accountId,
      threadUrl
    });
    console.error('Error queuing message:', error);
    return null;
  }
}

/**
 * Extract message content from the forum editor
 */
function extractMessageContent(): string | null {
  logger.debug(LOG_SOURCE, 'Attempting to extract message content from editor');
  
  // Try to get the message from various possible editors
  
  // First try the iframe-based rich text editor
  const editorIframe = document.querySelector<HTMLIFrameElement>('.fr-iframe');
  if (editorIframe && editorIframe.contentWindow) {
    const iframeDoc = editorIframe.contentWindow.document;
    const editorContent = iframeDoc.querySelector('.fr-element');
    if (editorContent) {
      logger.debug(LOG_SOURCE, 'Found message in iframe editor', {
        contentLength: editorContent.innerHTML.length
      });
      return editorContent.innerHTML;
    }
  }
  
  // Try the BB code editor textarea
  const bbCodeEditor = document.querySelector<HTMLTextAreaElement>('textarea.bbCodeEditorContainer');
  if (bbCodeEditor) {
    logger.debug(LOG_SOURCE, 'Found message in BB code editor', {
      contentLength: bbCodeEditor.value.length
    });
    return bbCodeEditor.value;
  }
  
  // Try the XF editor
  const xfEditor = document.querySelector<HTMLDivElement>('.fr-element');
  if (xfEditor) {
    logger.debug(LOG_SOURCE, 'Found message in XF editor', {
      contentLength: xfEditor.innerHTML.length
    });
    return xfEditor.innerHTML;
  }
  
  logger.warning(LOG_SOURCE, 'Could not find message content in any editor');
  return null;
}

/**
 * Get current thread URL (simplified to thread base path)
 */
function getCurrentThreadUrl(): string {
  const url = window.location.href;
  logger.debug(LOG_SOURCE, 'Getting thread URL from', { currentUrl: url });
  
  // Extract thread path
  const match = url.match(/https?:\/\/(?:www\.)?ignboards\.com\/threads\/[^\/]+\.\d+/);
  if (match) {
    logger.debug(LOG_SOURCE, 'Thread URL extracted', { threadUrl: match[0] });
    return match[0];
  }
  
  // For conversations
  const convMatch = url.match(/https?:\/\/(?:www\.)?ignboards\.com\/conversations\/[^\/]+\.\d+/);
  if (convMatch) {
    logger.debug(LOG_SOURCE, 'Conversation URL extracted', { conversationUrl: convMatch[0] });
    return convMatch[0];
  }
  
  logger.warning(LOG_SOURCE, 'Could not extract thread/conversation URL, using full URL');
  return url;
}

/**
 * Create the UI for account selection
 */
function createAccountSelectorUI(accounts: Account[], onSubmit: (accountId: string) => void): HTMLElement {
  // Create modal container
  const modal = document.createElement('div');
  modal.className = 'ign-enhancer-account-modal';
  modal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #fff;
    border-radius: 5px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
    z-index: 9999;
    width: 350px;
    max-width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
    padding: 20px;
  `;
  
  // Create header
  const header = document.createElement('div');
  header.innerHTML = '<h3 style="margin-top: 0;">Escolha a conta para enviar a mensagem</h3>';
  modal.appendChild(header);
  
  // Create accounts list
  const accountsList = document.createElement('div');
  accountsList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 15px 0;
  `;
  
  accounts.forEach(account => {
    const accountItem = document.createElement('div');
    accountItem.className = 'account-item';
    accountItem.style.cssText = `
      display: flex;
      align-items: center;
      padding: 10px;
      border-radius: 3px;
      cursor: pointer;
      transition: background-color 0.2s;
      background-color: ${account.isActive ? '#e9f5ff' : '#f5f5f5'};
      border: 1px solid ${account.isActive ? '#c2e0ff' : '#e0e0e0'};
    `;
    
    accountItem.innerHTML = `
      <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; margin-right: 10px;">
        <img src="${account.avatarUrl || ''}" alt="${account.name}" style="width: 100%; height: 100%; object-fit: cover;">
      </div>
      <div>
        <div style="font-weight: bold;">${account.name}</div>
        <div style="font-size: 0.8em; color: #666;">@${account.username}</div>
      </div>
      ${account.isActive ? '<div style="margin-left: auto; color: #0078d7; font-size: 0.8em;">Conta Atual</div>' : ''}
    `;
    
    accountItem.addEventListener('mouseover', () => {
      accountItem.style.backgroundColor = account.isActive ? '#d6ecff' : '#e8e8e8';
    });
    
    accountItem.addEventListener('mouseout', () => {
      accountItem.style.backgroundColor = account.isActive ? '#e9f5ff' : '#f5f5f5';
    });
    
    accountItem.addEventListener('click', () => {
      onSubmit(account.id);
      modal.remove();
      overlay.remove();
    });
    
    accountsList.appendChild(accountItem);
  });
  
  modal.appendChild(accountsList);
  
  // Create cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancelar';
  cancelButton.style.cssText = `
    padding: 8px 15px;
    border: 1px solid #ddd;
    background: #f5f5f5;
    border-radius: 3px;
    cursor: pointer;
    font-size: 14px;
  `;
  
  cancelButton.addEventListener('mouseover', () => {
    cancelButton.style.backgroundColor = '#e8e8e8';
  });
  
  cancelButton.addEventListener('mouseout', () => {
    cancelButton.style.backgroundColor = '#f5f5f5';
  });
  
  cancelButton.addEventListener('click', () => {
    modal.remove();
    overlay.remove();
  });
  
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = 'text-align: right;';
  buttonContainer.appendChild(cancelButton);
  
  modal.appendChild(buttonContainer);
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9998;
  `;
  
  overlay.addEventListener('click', () => {
    modal.remove();
    overlay.remove();
  });
  
  document.body.appendChild(overlay);
  document.body.appendChild(modal);
  
  return modal;
}

/**
 * Show notification toast
 */
function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 3000): void {
  logger.debug(LOG_SOURCE, 'Showing notification', { message, type, duration });
  
  const toast = document.createElement('div');
  toast.className = 'ign-enhancer-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 10px 15px;
    background-color: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
    color: white;
    border-radius: 4px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: 10000;
    max-width: 80vw;
  `;
  
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Fade in
  setTimeout(() => {
    toast.style.opacity = '1';
  }, 10);
  
  // Fade out and remove
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
}

/**
 * Check if the current page is a conversation or thread page
 */
export function isMessagePage(): boolean {
  const url = window.location.href;
  const isMessage = (
    url.includes('/threads/') || 
    url.includes('/conversations/') ||
    // Also check URL path segments for more reliability
    /\/(threads|conversations)\//.test(url)
  );
  
  logger.debug(LOG_SOURCE, 'Checking if current page is a message page', {
    url,
    isMessage
  });
  
  return isMessage;
}

/**
 * Log DOM elements for debugging purposes
 */
function logDOMState(): void {
  logger.debug(LOG_SOURCE, 'Logging DOM state for debugging');
  
  const domState = {
    currentUrl: window.location.href,
    isMessagePage: isMessagePage(),
    formCount: document.querySelectorAll('form').length,
    buttonCount: document.querySelectorAll('button[type="submit"]').length,
    editorElements: {
      hasIframe: Boolean(document.querySelector('.fr-iframe')),
      hasBBCodeEditor: Boolean(document.querySelector('textarea.bbCodeEditorContainer')),
      hasFrElement: Boolean(document.querySelector('.fr-element'))
    },
    hasReplyContainer: Boolean(getReplyContainer())
  };
  
  logger.debug(LOG_SOURCE, 'DOM state', domState);
  
  console.log('Current URL:', window.location.href);
  console.log('Is message page:', isMessagePage());
  
  // Log form elements
  console.log('Form elements:');
  document.querySelectorAll('form').forEach((form, index) => {
    console.log(`Form ${index}:`, form);
  });
  
  // Log submit buttons
  console.log('Submit buttons:');
  document.querySelectorAll('button[type="submit"]').forEach((button, index) => {
    console.log(`Button ${index}:`, button, 'Text:', button.textContent);
  });
  
  // Log editor elements
  console.log('Editor elements:');
  console.log('.fr-iframe:', document.querySelector('.fr-iframe'));
  console.log('textarea.bbCodeEditorContainer:', document.querySelector('textarea.bbCodeEditorContainer'));
  console.log('.fr-element:', document.querySelector('.fr-element'));
  
  // Check reply container
  const replyContainer = getReplyContainer();
  console.log('Reply container from utility function:', replyContainer);
}

/**
 * Add multi-account posting button to the reply area
 */
export function addMultiAccountPostingButton(): void {
  // Check if our button already exists
  if (document.querySelector('.ign-enhancer-multi-account-post')) {
    logger.debug(LOG_SOURCE, 'Button already exists, not adding again');
    console.log('Button already exists, not adding again');
    return;
  }
  
  logger.info(LOG_SOURCE, 'Adding multi-account posting button to the page');
  console.log('Adding multi-account posting button to the page...');
  
  // Get the container using our utility function
  const buttonContainer = getReplyContainer();
  if (!buttonContainer) {
    logger.error(LOG_SOURCE, 'Could not find button container for posting button');
    console.error('Could not find button container, logging DOM state for debugging...');
    logDOMState();
    return;
  }
  
  logger.debug(LOG_SOURCE, 'Found button container');
  console.log('Found button container:', buttonContainer);
  
  // Create our button
  const multiAccountButton = document.createElement('button');
  multiAccountButton.className = 'button ign-enhancer-multi-account-post';
  multiAccountButton.type = 'button'; // Important: not submit type
  multiAccountButton.textContent = 'Postar com Outra Conta';
  multiAccountButton.title = 'Selecione uma conta para enviar esta mensagem em background';
  
  // Style similar to other buttons
  multiAccountButton.style.cssText = `
    margin-right: 10px;
    background-color: #3a434b;
    color: white;
    border-radius: 3px;
    padding: 6px 12px;
    border: none;
    cursor: pointer;
  `;
  
  // Add click handler
  multiAccountButton.addEventListener('click', async (e) => {
    e.preventDefault();
    logger.info(LOG_SOURCE, 'Multi-account post button clicked');
    
    // Extract the message content
    const messageContent = extractMessageContent();
    if (!messageContent) {
      logger.error(LOG_SOURCE, 'Failed to extract message content');
      showNotification('Não foi possível extrair o conteúdo da mensagem', 'error');
      return;
    }
    
    // Get current thread URL
    const threadUrl = getCurrentThreadUrl();
    
    // Get available accounts
    const accounts = await getAvailableAccounts();
    if (accounts.length === 0) {
      logger.warning(LOG_SOURCE, 'No accounts available for posting');
      showNotification('Não há contas disponíveis para postar', 'error');
      return;
    }
    
    logger.debug(LOG_SOURCE, 'Showing account selector', { 
      accountCount: accounts.length 
    });
    
    // Show account selector UI
    createAccountSelectorUI(accounts, async (accountId) => {
      logger.info(LOG_SOURCE, 'Account selected for posting', { accountId });
      
      // Queue the message for posting
      const messageId = await queuePostMessage(accountId, threadUrl, messageContent);
      
      if (messageId) {
        // Success
        const account = accounts.find(a => a.id === accountId);
        logger.info(LOG_SOURCE, 'Message successfully queued', {
          messageId,
          accountId,
          accountName: account?.name,
          threadUrl
        });
        
        showNotification(
          `Mensagem adicionada à fila para envio como ${account?.name || 'conta selecionada'}`, 
          'success'
        );
        
        // Clear the editor if needed
        // We could add an option for this later
      } else {
        // Error
        logger.error(LOG_SOURCE, 'Failed to queue message');
        showNotification('Erro ao adicionar mensagem à fila', 'error');
      }
    });
  });
  
  // Add button to the container
  // In threads, insert before the reply button
  const replyButton = buttonContainer.querySelector('button.button--icon--reply');
  if (replyButton) {
    buttonContainer.insertBefore(multiAccountButton, replyButton);
    logger.debug(LOG_SOURCE, 'Added button before the reply button');
    console.log('Added button before the reply button');
  } else {
    // In other cases, just append it
    buttonContainer.appendChild(multiAccountButton);
    logger.debug(LOG_SOURCE, 'Added button to the end of the container');
    console.log('Added button to the end of the container');
  }
  
  logger.info(LOG_SOURCE, 'Multi-account posting button added successfully');
  console.log('Multi-account posting button added successfully');
}

/**
 * Main initialization function for the background posting feature
 * This should be called from the content script
 */
export function initBackgroundPosting(): void {
  logger.info(LOG_SOURCE, 'Background posting feature initializing', {
    url: window.location.href,
    timestamp: new Date().toISOString()
  });
  console.log('Background posting feature initializing on ' + window.location.href);
  
  if (isMessagePage()) {
    logger.info(LOG_SOURCE, 'On a message page, will add multi-account posting button');
    console.log('On a message page, will add multi-account posting button');
    
    // Add button when DOM is fully loaded
    if (document.readyState === 'loading') {
      logger.debug(LOG_SOURCE, 'DOM still loading, will add button on DOMContentLoaded');
      document.addEventListener('DOMContentLoaded', () => {
        logger.debug(LOG_SOURCE, 'DOM loaded, adding button');
        console.log('DOM loaded, adding button');
        addMultiAccountPostingButton();
      });
    } else {
      logger.debug(LOG_SOURCE, 'DOM already loaded, adding button immediately');
      console.log('DOM already loaded, adding button immediately');
      addMultiAccountPostingButton();
    }
    
    // Also add after a short delay to ensure dynamic content is loaded
    setTimeout(() => {
      logger.debug(LOG_SOURCE, 'Delayed button addition to catch dynamic content');
      console.log('Delayed button addition to catch dynamic content');
      addMultiAccountPostingButton();
    }, 1500);
    
    // And check periodically for dynamically loaded content
    setInterval(() => {
      if (!document.querySelector('.ign-enhancer-multi-account-post')) {
        logger.debug(LOG_SOURCE, 'Periodic check found no button, adding now');
        console.log('Periodic check found no button, adding now');
        addMultiAccountPostingButton();
      }
    }, 5000);
  } else {
    logger.debug(LOG_SOURCE, 'Not on a message page, button will not be added');
    console.log('Not on a message page, button will not be added');
  }
}

export const placeholder = ""
