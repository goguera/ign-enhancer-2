import { browser } from 'webextension-polyfill-ts';
import { sendForumPostWithStoredCookies, switchToAccountState, storeCurrentSession, getAccountStates } from '@lib/utils/account-state';
import { logger, LogLevel } from '@lib/utils/logging';

// Source identifier for logs
const LOG_SOURCE = 'message-queue';

// Define the message queue structure
export interface QueuedMessage {
  id: string;
  accountId: string;
  threadUrl: string;
  message: string;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  retryCount: number;
  antiFloodCount?: number; // Track anti-flood attempts separately
  retryAfter?: number; // For anti-flood, time to wait in seconds
}

// Constants
const MESSAGE_QUEUE_KEY = 'messageQueue';
const MAX_RETRIES = 3;
const PROCESSING_INTERVAL = 1000; // Check queue every 1 second

// Queue Management
export async function getMessageQueue(): Promise<QueuedMessage[]> {
  const result = await browser.storage.local.get(MESSAGE_QUEUE_KEY);
  return result[MESSAGE_QUEUE_KEY] || [];
}

export async function saveMessageQueue(queue: QueuedMessage[]): Promise<void> {
  await browser.storage.local.set({ [MESSAGE_QUEUE_KEY]: queue });
  // Only log if there are messages in the queue to reduce spam
  if (queue.length > 0) {
    logger.debug(LOG_SOURCE, `Updated queue with ${queue.length} messages`);
  }
}

export async function addToMessageQueue(
  accountId: string,
  threadUrl: string,
  message: string
): Promise<QueuedMessage> {
  logger.info(LOG_SOURCE, `Adding message to queue for ${threadUrl}`, { accountId, messageLength: message.length });
  
  const queue = await getMessageQueue();
  
  const newMessage: QueuedMessage = {
    id: Date.now().toString(),
    accountId,
    threadUrl,
    message,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0
  };
  
  queue.push(newMessage);
  await saveMessageQueue(queue);
  
  // Make sure processing is happening
  ensureProcessingIsActive();
  
  logger.info(LOG_SOURCE, `Message added to queue successfully`, { messageId: newMessage.id });
  return newMessage;
}

export async function removeFromQueue(messageId: string): Promise<void> {
  logger.info(LOG_SOURCE, `Removing message from queue`, { messageId });
  
  const queue = await getMessageQueue();
  const updatedQueue = queue.filter(msg => msg.id !== messageId);
  await saveMessageQueue(updatedQueue);
  
  logger.info(LOG_SOURCE, `Message removed from queue`, { messageId });
}

export async function clearCompletedMessages(olderThanHours = 24): Promise<void> {
  logger.info(LOG_SOURCE, `Clearing completed messages older than ${olderThanHours} hours`);
  
  const queue = await getMessageQueue();
  const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
  
  const beforeCount = queue.length;
  const updatedQueue = queue.filter(msg => 
    !(msg.status === 'completed' && msg.timestamp < cutoffTime)
  );
  const removedCount = beforeCount - updatedQueue.length;
  
  await saveMessageQueue(updatedQueue);
  
  logger.info(LOG_SOURCE, `Cleared ${removedCount} completed messages`);
}

// Queue Processing
let isProcessing = false;
let processingInterval: number | undefined;

export function ensureProcessingIsActive(): void {
  if (!isProcessing && !processingInterval) {
    logger.info(LOG_SOURCE, `Starting queue processing`);
    processingInterval = window.setInterval(processQueue, PROCESSING_INTERVAL);
    processQueue(); // Start processing immediately
  }
}

export function stopProcessing(): void {
  if (processingInterval) {
    logger.info(LOG_SOURCE, `Stopping queue processing`);
    window.clearInterval(processingInterval);
    processingInterval = undefined;
  }
  isProcessing = false;
}

export async function processQueue(): Promise<void> {
  // Don't start a new processing cycle if one is already running
  if (isProcessing) {
    return;
  }
  
  isProcessing = true;
  
  try {
    const queue = await getMessageQueue();
    
    // Only log queue status if there are messages in the queue
    if (queue.length > 0) {
      logger.debug(LOG_SOURCE, `Queue status:`, {
        total: queue.length,
        pending: queue.filter(m => m.status === 'pending').length,
        processing: queue.filter(m => m.status === 'processing').length,
        completed: queue.filter(m => m.status === 'completed').length,
        error: queue.filter(m => m.status === 'error').length
      });
    }
    
    let modified = false;
    
    // Find the next pending message that is ready to process
    const now = Date.now();
    const pendingMessage = queue.find(msg => 
      msg.status === 'pending' && 
      (!msg.retryAfter || now >= msg.timestamp + (msg.retryAfter * 1000))
    );
    
    if (pendingMessage) {
      logger.info(LOG_SOURCE, `Processing message ${pendingMessage.id}`, {
        threadUrl: pendingMessage.threadUrl,
        accountId: pendingMessage.accountId,
        retryCount: pendingMessage.retryCount,
        antiFloodCount: pendingMessage.antiFloodCount || 0
      });
      
      // Mark as processing
      pendingMessage.status = 'processing';
      modified = true;
      await saveMessageQueue(queue);
      
      try {
        // Send the message using stored cookies without switching accounts
        logger.info(LOG_SOURCE, `Sending message to ${pendingMessage.threadUrl} using stored cookies`, {
          messageId: pendingMessage.id,
          accountId: pendingMessage.accountId,
          messageLength: pendingMessage.message.length
        });
        
        const response = await sendForumPostWithStoredCookies(
          pendingMessage.accountId,
          pendingMessage.threadUrl, 
          pendingMessage.message
        );
        
        // Log the response
        logger.network(
          LOG_SOURCE,
          'POST',
          `${pendingMessage.threadUrl}/add-reply`,
          { messageId: pendingMessage.id, accountId: pendingMessage.accountId },
          { status: response.status, statusText: response.statusText, ok: response.ok }
        );
        
        // Check if the response indicates success
        if (response.ok) {
          const data = await response.json();
          // Only log response data on errors or for debugging
          if (data.status !== 'ok') {
            logger.debug(LOG_SOURCE, `Message posting response data`, data);
          }
          
          if (data.status === 'ok') {
            // Message sent successfully
            logger.info(LOG_SOURCE, `Message ${pendingMessage.id} sent successfully`);
            pendingMessage.status = 'completed';
          } else if (data.status === 'error' && data.errors?.[0]?.includes('wait')) {
            // Anti-flood protection triggered - does NOT count toward retry limit
            const waitTimeMatch = data.errors[0].match(/(\d+) seconds/);
            const waitTime = waitTimeMatch ? parseInt(waitTimeMatch[1], 10) : 30;
            
            // Initialize or increment anti-flood counter 
            pendingMessage.antiFloodCount = (pendingMessage.antiFloodCount || 0) + 1;
            
            logger.warning(LOG_SOURCE, `Anti-flood detected, waiting ${waitTime} seconds`, {
              messageId: pendingMessage.id,
              error: data.errors[0],
              antiFloodCount: pendingMessage.antiFloodCount
            });
            
            pendingMessage.status = 'pending';
            pendingMessage.retryAfter = waitTime;
            pendingMessage.error = data.errors[0];
            
            // Don't increment the general retry counter for anti-flood
          } else if (data.status === 'error' && data.errors?.[0]?.includes('security')) {
            // Security error - mark as error immediately since retrying won't help without user intervention
            logger.error(LOG_SOURCE, `Security error for message ${pendingMessage.id}`, {
              error: data.errors[0]
            });
            
            pendingMessage.status = 'error';
            pendingMessage.error = `Security error: ${data.errors[0]}. The account may need to be resynced.`;
          } else {
            // Other error
            pendingMessage.retryCount += 1;
            
            if (pendingMessage.retryCount >= MAX_RETRIES) {
              logger.error(LOG_SOURCE, `Max retries reached for message ${pendingMessage.id}`, {
                errors: data.errors,
                retryCount: pendingMessage.retryCount
              });
              
              pendingMessage.status = 'error';
              pendingMessage.error = data.errors ? data.errors.join(', ') : 'Unknown error';
            } else {
              // Use a consistent 30 second retry delay rather than exponential backoff
              const retryDelay = 30;
              
              logger.warning(LOG_SOURCE, `Error sending message, will retry after ${retryDelay} seconds`, {
                messageId: pendingMessage.id,
                errors: data.errors,
                retryCount: pendingMessage.retryCount,
                retryDelay
              });
              
              pendingMessage.status = 'pending';
              pendingMessage.retryAfter = retryDelay;
              pendingMessage.error = data.errors ? data.errors.join(', ') : 'Unknown error';
            }
          }
        } else {
          // HTTP error
          pendingMessage.retryCount += 1;
          
          if (pendingMessage.retryCount >= MAX_RETRIES) {
            logger.error(LOG_SOURCE, `Max retries reached for message ${pendingMessage.id}`, {
              status: response.status,
              statusText: response.statusText,
              retryCount: pendingMessage.retryCount
            });
            
            pendingMessage.status = 'error';
            pendingMessage.error = `HTTP error: ${response.status} ${response.statusText}`;
          } else {
            // Use a consistent 30 second retry delay rather than exponential backoff
            const retryDelay = 30;
            
            logger.warning(LOG_SOURCE, `HTTP error, will retry after ${retryDelay} seconds`, {
              messageId: pendingMessage.id,
              status: response.status,
              statusText: response.statusText,
              retryCount: pendingMessage.retryCount,
              retryDelay
            });
            
            pendingMessage.status = 'pending';
            pendingMessage.retryAfter = retryDelay;
            pendingMessage.error = `HTTP error: ${response.status} ${response.statusText}`;
          }
        }
        
        modified = true;
      } catch (error) {
        // Exception during sending
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        logger.error(LOG_SOURCE, `Exception during message sending`, {
          messageId: pendingMessage.id,
          error: errorMessage,
          retryCount: pendingMessage.retryCount
        });
        
        // Check if it's a security error
        if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'security') {
          // Security errors won't be fixed by retrying
          pendingMessage.status = 'error';
          pendingMessage.error = `Security error: ${errorMessage}. The account may need to be resynced.`;
        } else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'antiflood') {
          // For anti-flood errors thrown by our code, use the specified wait time
          // Anti-flood does NOT count toward retry limit
          pendingMessage.antiFloodCount = (pendingMessage.antiFloodCount || 0) + 1;
          
          if ('retryAfter' in error && typeof error.retryAfter === 'number') {
            pendingMessage.status = 'pending';
            pendingMessage.retryAfter = error.retryAfter;
            pendingMessage.error = errorMessage;
            
            logger.warning(LOG_SOURCE, `Anti-flood detected in exception, waiting ${error.retryAfter} seconds`, {
              messageId: pendingMessage.id,
              error: errorMessage,
              retryAfter: error.retryAfter,
              antiFloodCount: pendingMessage.antiFloodCount
            });
          } else {
            // Fallback to 30 seconds if no specific time provided
            pendingMessage.status = 'pending';
            pendingMessage.retryAfter = 30;
            pendingMessage.error = errorMessage;
            
            logger.warning(LOG_SOURCE, `Anti-flood detected in exception, using default wait of 30 seconds`, {
              messageId: pendingMessage.id,
              error: errorMessage,
              antiFloodCount: pendingMessage.antiFloodCount
            });
          }
          // Don't increment the regular retry counter for anti-flood errors
        } else if (pendingMessage.retryCount >= MAX_RETRIES) {
          pendingMessage.status = 'error';
          pendingMessage.error = errorMessage;
        } else {
          pendingMessage.retryCount += 1;
          // Use a consistent 30 second retry delay rather than exponential backoff
          const retryDelay = 30;
          pendingMessage.status = 'pending';
          pendingMessage.retryAfter = retryDelay;
          pendingMessage.error = errorMessage;
          
          logger.warning(LOG_SOURCE, `Error during sending, will retry after ${retryDelay} seconds`, {
            messageId: pendingMessage.id,
            error: errorMessage,
            retryCount: pendingMessage.retryCount,
            retryDelay
          });
        }
        
        modified = true;
      } finally {
        // Save updated queue if modified
        if (modified) {
          await saveMessageQueue(queue);
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(LOG_SOURCE, `Error processing message queue:`, { error: errorMessage });
    console.error('Error processing message queue:', error);
  } finally {
    isProcessing = false;
  }
}

// Initialize the queue processing when this module is loaded
ensureProcessingIsActive(); 