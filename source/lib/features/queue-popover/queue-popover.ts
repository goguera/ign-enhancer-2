import { browser } from 'webextension-polyfill-ts';
import { logger } from '@lib/utils/logging';

// Log source identifier
const LOG_SOURCE = 'queue-popover';

interface QueuedMessage {
  id: string;
  accountId: string;
  threadUrl: string;
  message: string;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  retryCount: number;
  retryAfter?: number;
}

interface Account {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
  isActive: boolean;
}

const REFRESH_INTERVAL = 5000; // Refresh queue every 5 seconds
let accounts: Record<string, Account> = {};
let queuedMessages: QueuedMessage[] = [];
let refreshInterval: number | undefined;
let isExpanded = false;

/**
 * Format the message status with appropriate styling
 */
function formatStatus(message: QueuedMessage): { text: string, className: string } {
  if (message.status === 'pending') {
    if (message.retryAfter) {
      const waitUntil = new Date(message.timestamp + (message.retryAfter * 1000));
      const now = new Date();
      
      if (waitUntil > now) {
        const seconds = Math.round((waitUntil.getTime() - now.getTime()) / 1000);
        return { 
          text: `Aguardando (${seconds}s)`, 
          className: 'ign-enhancer-queue-waiting' 
        };
      }
    }
    return { text: 'Pendente', className: 'ign-enhancer-queue-pending' };
  } else if (message.status === 'processing') {
    return { text: 'Processando...', className: 'ign-enhancer-queue-processing' };
  } else if (message.status === 'completed') {
    return { text: 'Concluído', className: 'ign-enhancer-queue-completed' };
  } else if (message.status === 'error') {
    return { text: `Erro (${message.retryCount})`, className: 'ign-enhancer-queue-error' };
  }
  return { text: message.status, className: 'ign-enhancer-queue-unknown' };
}

/**
 * Truncate message content and remove HTML tags
 */
function truncateMessage(html: string, maxLength = 50): string {
  // Strip HTML tags
  const text = html.replace(/<[^>]+>/g, '');
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Extract thread title from URL
 */
function extractThreadTitle(url: string): string {
  const match = url.match(/\/([^\/]+\.\d+)$/);
  return match ? match[1].replace(/\.\d+$/, '').replace(/-/g, ' ') : url;
}

/**
 * Fetch queued messages from the background process
 */
async function fetchQueuedMessages(): Promise<void> {
  logger.debug(LOG_SOURCE, 'Fetching queued messages');
  try {
    const response = await browser.runtime.sendMessage({ command: 'getQueuedMessages' });
    
    if (response.success && Array.isArray(response.messages)) {
      const previousCount = queuedMessages.length;
      queuedMessages = response.messages;
      logger.info(LOG_SOURCE, `Fetched ${queuedMessages.length} queued messages`, {
        pendingCount: queuedMessages.filter(m => m.status === 'pending').length,
        processingCount: queuedMessages.filter(m => m.status === 'processing').length,
        completedCount: queuedMessages.filter(m => m.status === 'completed').length,
        errorCount: queuedMessages.filter(m => m.status === 'error').length,
        changeFromPrevious: queuedMessages.length - previousCount
      });
      updatePopoverContent();
    } else {
      logger.warning(LOG_SOURCE, 'Failed to get queued messages or invalid response', {
        response
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(LOG_SOURCE, 'Failed to fetch queued messages', {
      error: errorMessage,
      errorObject: error
    });
    console.error('Failed to fetch queued messages:', error);
  }
}

/**
 * Fetch available accounts from the background process
 */
async function fetchAccounts(): Promise<void> {
  logger.debug(LOG_SOURCE, 'Fetching accounts');
  try {
    const response = await browser.runtime.sendMessage({ command: 'getAccounts' });
    
    if (response.success && Array.isArray(response.accounts)) {
      accounts = response.accounts.reduce((acc: Record<string, Account>, account: Account) => {
        acc[account.id] = account;
        return acc;
      }, {});
      logger.info(LOG_SOURCE, `Fetched ${response.accounts.length} accounts`, {
        activeAccounts: response.accounts.filter((a: Account) => a.isActive).length
      });
    } else {
      logger.warning(LOG_SOURCE, 'Failed to get accounts or invalid response', {
        response
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(LOG_SOURCE, 'Failed to fetch accounts', {
      error: errorMessage,
      errorObject: error
    });
    console.error('Failed to fetch accounts:', error);
  }
}

/**
 * Remove a message from the queue
 */
async function removeMessage(messageId: string): Promise<void> {
  logger.info(LOG_SOURCE, 'Removing message from queue', { messageId });
  try {
    await browser.runtime.sendMessage({ 
      command: 'removeQueuedMessage', 
      messageId 
    });
    logger.debug(LOG_SOURCE, 'Message removed successfully', { messageId });
    await fetchQueuedMessages(); // Refresh the list
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(LOG_SOURCE, 'Failed to remove message', {
      messageId,
      error: errorMessage,
      errorObject: error
    });
    console.error('Failed to remove message:', error);
  }
}

/**
 * Update the popover content with current queue data
 */
function updatePopoverContent(): void {
  logger.debug(LOG_SOURCE, 'Updating popover content');
  const container = document.getElementById('ign-enhancer-queue-container');
  if (!container) {
    logger.warning(LOG_SOURCE, 'Queue container element not found');
    return;
  }
  
  const content = document.getElementById('ign-enhancer-queue-content');
  if (!content) {
    logger.warning(LOG_SOURCE, 'Queue content element not found');
    return;
  }
  
  const badge = document.getElementById('ign-enhancer-queue-badge');
  if (badge) {
    const pendingCount = queuedMessages.filter(msg => 
      msg.status === 'pending' || msg.status === 'processing'
    ).length;
    
    badge.textContent = pendingCount.toString();
    badge.style.display = pendingCount > 0 ? 'flex' : 'none';
  }
  
  // Sort messages: processing first, then pending, then completed, then error
  const sortedMessages = [...queuedMessages].sort((a, b) => {
    const statusOrder = {
      'processing': 0,
      'pending': 1,
      'completed': 2,
      'error': 3
    };
    
    const statusA = statusOrder[a.status as keyof typeof statusOrder] || 99;
    const statusB = statusOrder[b.status as keyof typeof statusOrder] || 99;
    
    if (statusA !== statusB) return statusA - statusB;
    
    // Then by timestamp (newest first)
    return b.timestamp - a.timestamp;
  });
  
  // Limit to showing only 10 most recent messages when collapsed
  const displayMessages = isExpanded ? sortedMessages : sortedMessages.slice(0, 5);
  
  if (displayMessages.length === 0) {
    content.innerHTML = '<div class="ign-enhancer-queue-empty">Nenhuma mensagem na fila</div>';
    return;
  }
  
  let html = '';
  
  displayMessages.forEach(message => {
    const status = formatStatus(message);
    const accountName = accounts[message.accountId]?.name || 'Conta desconhecida';
    const threadTitle = extractThreadTitle(message.threadUrl);
    const messageText = truncateMessage(message.message);
    
    html += `
      <div class="ign-enhancer-queue-item">
        <div class="ign-enhancer-queue-item-header">
          <span class="ign-enhancer-queue-status ${status.className}">${status.text}</span>
          <span class="ign-enhancer-queue-account">${accountName}</span>
          ${message.error ? `
            <div class="ign-enhancer-queue-error-tooltip">
              <span class="ign-enhancer-queue-error-icon">⚠️</span>
              <span class="ign-enhancer-queue-error-text">${message.error}</span>
            </div>
          ` : ''}
        </div>
        <div class="ign-enhancer-queue-item-content">
          <a href="${message.threadUrl}" class="ign-enhancer-queue-thread" target="_blank">${threadTitle}</a>
          <div class="ign-enhancer-queue-message">${messageText}</div>
        </div>
        <div class="ign-enhancer-queue-item-footer">
          <span class="ign-enhancer-queue-time">${new Date(message.timestamp).toLocaleTimeString()}</span>
          <button class="ign-enhancer-queue-remove" data-id="${message.id}">🗑️</button>
        </div>
      </div>
    `;
  });
  
  // Show count if there are more messages than we're displaying
  if (!isExpanded && sortedMessages.length > displayMessages.length) {
    html += `
      <div class="ign-enhancer-queue-more">
        + ${sortedMessages.length - displayMessages.length} mais mensagens
      </div>
    `;
  }
  
  content.innerHTML = html;
  
  // Add event listeners to remove buttons
  document.querySelectorAll('.ign-enhancer-queue-remove').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const messageId = (button as HTMLElement).dataset.id;
      if (messageId) {
        removeMessage(messageId);
      }
    });
  });
}

/**
 * Create and add the queue popover to the page
 */
function createPopover(): void {
  logger.info(LOG_SOURCE, 'Creating queue popover');
  // Create container
  const container = document.createElement('div');
  container.id = 'ign-enhancer-queue-container';
  container.className = 'ign-enhancer-queue-collapsed';
  
  // Create header
  const header = document.createElement('div');
  header.className = 'ign-enhancer-queue-header';
  header.innerHTML = `
    <span class="ign-enhancer-queue-title">Fila de Mensagens</span>
    <span id="ign-enhancer-queue-badge" class="ign-enhancer-queue-badge">0</span>
    <button class="ign-enhancer-queue-expand">
      <span class="ign-enhancer-queue-expand-icon">▼</span>
    </button>
    <button class="ign-enhancer-queue-refresh">
      <span class="ign-enhancer-queue-refresh-icon">↻</span>
    </button>
  `;
  
  // Create content
  const content = document.createElement('div');
  content.id = 'ign-enhancer-queue-content';
  content.className = 'ign-enhancer-queue-content';
  content.innerHTML = '<div class="ign-enhancer-queue-loading">Carregando...</div>';
  
  // Add to container
  container.appendChild(header);
  container.appendChild(content);
  
  // Add to page
  document.body.appendChild(container);
  
  // Add event listeners
  const expandButton = header.querySelector('.ign-enhancer-queue-expand');
  if (expandButton) {
    expandButton.addEventListener('click', () => {
      isExpanded = !isExpanded;
      if (isExpanded) {
        container.classList.remove('ign-enhancer-queue-collapsed');
        container.classList.add('ign-enhancer-queue-expanded');
        (expandButton.querySelector('.ign-enhancer-queue-expand-icon') as HTMLElement).textContent = '▲';
      } else {
        container.classList.remove('ign-enhancer-queue-expanded');
        container.classList.add('ign-enhancer-queue-collapsed');
        (expandButton.querySelector('.ign-enhancer-queue-expand-icon') as HTMLElement).textContent = '▼';
      }
      updatePopoverContent();
    });
  }
  
  const refreshButton = header.querySelector('.ign-enhancer-queue-refresh');
  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      fetchQueuedMessages();
      // Show temporary loading indicator
      (refreshButton as HTMLElement).textContent = '⟳';
      (refreshButton as HTMLElement).classList.add('ign-enhancer-queue-refreshing');
      setTimeout(() => {
        (refreshButton as HTMLElement).innerHTML = '<span class="ign-enhancer-queue-refresh-icon">↻</span>';
        (refreshButton as HTMLElement).classList.remove('ign-enhancer-queue-refreshing');
      }, 500);
    });
  }
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    #ign-enhancer-queue-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 300px;
      background: #fff;
      border-radius: 6px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      font-family: Arial, sans-serif;
      font-size: 12px;
      z-index: 9999;
      transition: all 0.3s ease;
      border: 1px solid #ddd;
      overflow: hidden;
    }
    
    #ign-enhancer-queue-container.ign-enhancer-queue-collapsed {
      max-height: 250px;
    }
    
    #ign-enhancer-queue-container.ign-enhancer-queue-expanded {
      max-height: 80vh;
    }
    
    .ign-enhancer-queue-header {
      padding: 8px 12px;
      background: #3a434b;
      color: white;
      font-weight: bold;
      display: flex;
      align-items: center;
      cursor: move;
    }
    
    .ign-enhancer-queue-title {
      flex: 1;
    }
    
    .ign-enhancer-queue-badge {
      background: #f44336;
      color: white;
      border-radius: 50%;
      min-width: 18px;
      height: 18px;
      font-size: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 8px;
      padding: 0 4px;
    }
    
    .ign-enhancer-queue-expand,
    .ign-enhancer-queue-refresh {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      margin-left: 4px;
    }
    
    .ign-enhancer-queue-expand:hover,
    .ign-enhancer-queue-refresh:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    .ign-enhancer-queue-refreshing {
      animation: ign-enhancer-rotate 1s linear infinite;
    }
    
    @keyframes ign-enhancer-rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    .ign-enhancer-queue-content {
      overflow-y: auto;
      max-height: calc(80vh - 40px);
      padding: 8px;
    }
    
    .ign-enhancer-queue-loading,
    .ign-enhancer-queue-empty {
      padding: 16px;
      text-align: center;
      color: #666;
    }
    
    .ign-enhancer-queue-item {
      margin-bottom: 8px;
      border: 1px solid #eee;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .ign-enhancer-queue-item-header {
      padding: 6px 8px;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      border-bottom: 1px solid #eee;
    }
    
    .ign-enhancer-queue-status {
      font-weight: bold;
      margin-right: 8px;
    }
    
    .ign-enhancer-queue-pending {
      color: #f59f00;
    }
    
    .ign-enhancer-queue-processing {
      color: #339af0;
    }
    
    .ign-enhancer-queue-completed {
      color: #2f9e44;
    }
    
    .ign-enhancer-queue-waiting {
      color: #e67700;
    }
    
    .ign-enhancer-queue-error {
      color: #e03131;
    }
    
    .ign-enhancer-queue-account {
      font-size: 11px;
      color: #666;
      flex: 1;
    }
    
    .ign-enhancer-queue-error-tooltip {
      position: relative;
      display: inline-block;
    }
    
    .ign-enhancer-queue-error-icon {
      cursor: pointer;
      font-size: 14px;
    }
    
    .ign-enhancer-queue-error-text {
      visibility: hidden;
      width: 200px;
      background-color: #333;
      color: #fff;
      text-align: center;
      border-radius: 4px;
      padding: 5px;
      position: absolute;
      z-index: 1;
      top: 125%;
      left: 50%;
      margin-left: -100px;
      opacity: 0;
      transition: opacity 0.3s;
      font-size: 11px;
    }
    
    .ign-enhancer-queue-error-tooltip:hover .ign-enhancer-queue-error-text {
      visibility: visible;
      opacity: 1;
    }
    
    .ign-enhancer-queue-item-content {
      padding: 8px;
    }
    
    .ign-enhancer-queue-thread {
      display: block;
      font-weight: bold;
      margin-bottom: 4px;
      text-decoration: none;
      color: #2980b9;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .ign-enhancer-queue-thread:hover {
      text-decoration: underline;
    }
    
    .ign-enhancer-queue-message {
      color: #666;
      font-size: 11px;
      max-height: 32px;
      overflow: hidden;
    }
    
    .ign-enhancer-queue-item-footer {
      padding: 4px 8px;
      background: #f9f9f9;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid #eee;
    }
    
    .ign-enhancer-queue-time {
      font-size: 10px;
      color: #999;
    }
    
    .ign-enhancer-queue-remove {
      background: none;
      border: none;
      cursor: pointer;
      color: #999;
      padding: 2px 4px;
      border-radius: 3px;
    }
    
    .ign-enhancer-queue-remove:hover {
      background: #f0f0f0;
      color: #e03131;
    }
    
    .ign-enhancer-queue-more {
      text-align: center;
      padding: 6px;
      color: #666;
      font-style: italic;
      background: #f9f9f9;
      border-radius: 4px;
      margin-top: 4px;
    }
  `;
  
  document.head.appendChild(style);
}

/**
 * Make the popover draggable
 */
function makePopoverDraggable(): void {
  logger.debug(LOG_SOURCE, 'Making popover draggable');
  const container = document.getElementById('ign-enhancer-queue-container');
  const header = container?.querySelector('.ign-enhancer-queue-header');
  
  if (!container || !header) return;
  
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;
  
  header.addEventListener('mousedown', ((e: Event) => {
    const mouseEvent = e as MouseEvent;
    isDragging = true;
    offsetX = mouseEvent.clientX - container.getBoundingClientRect().left;
    offsetY = mouseEvent.clientY - container.getBoundingClientRect().top;
    container.style.transition = 'none';
  }) as EventListener);
  
  document.addEventListener('mousemove', ((e: Event) => {
    if (!isDragging) return;
    
    const mouseEvent = e as MouseEvent;
    const x = mouseEvent.clientX - offsetX;
    const y = mouseEvent.clientY - offsetY;
    
    container.style.right = 'auto';
    container.style.bottom = 'auto';
    container.style.left = `${Math.max(0, x)}px`;
    container.style.top = `${Math.max(0, y)}px`;
  }) as EventListener);
  
  document.addEventListener('mouseup', (() => {
    isDragging = false;
    if (container) {
      container.style.transition = 'all 0.3s ease';
    }
  }) as EventListener);
}

/**
 * Initialize the queue popover
 * This function should be called from the content script
 */
export function initQueuePopover(): void {
  logger.info(LOG_SOURCE, 'Initializing queue popover', {
    url: window.location.href,
    timestamp: new Date().toISOString()
  });
  
  // Create the popover
  createPopover();
  makePopoverDraggable();
  
  // Fetch initial data
  fetchAccounts().then(() => {
    fetchQueuedMessages();
  });
  
  // Set up periodic refresh
  refreshInterval = window.setInterval(fetchQueuedMessages, REFRESH_INTERVAL);
  logger.info(LOG_SOURCE, 'Set up refresh interval', { intervalMs: REFRESH_INTERVAL });
  
  // Clean up when the page is unloaded
  window.addEventListener('beforeunload', () => {
    logger.debug(LOG_SOURCE, 'Page unloading, clearing interval');
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });
} 