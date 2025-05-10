import { initNeverEnding } from '@lib/features/neverending';
import { initToolbar } from '@lib/features/toolbar/toolbar';
import { initQueuePopover } from '@lib/features/queue-popover/queue-popover';
import { getConfig } from '@lib/utils/options';

initNeverEnding();
initToolbar();

console.log('Forums content script loaded');

// Initialize the queue popover on forum pages if enabled in settings
(async function() {
  try {
    // Get the setting that controls whether to show the queue popover
    const showQueuePopover = await getConfig('showQueuePopover');
    
    // Only initialize the queue popover if it's enabled
    if (showQueuePopover === 'yes') {
      console.log('Queue popover is enabled in settings, initializing...');
      initQueuePopover();
    } else {
      console.log('Queue popover is disabled in settings, not initializing');
    }
  } catch (error) {
    // If there's an error reading the settings, default to showing the popover
    console.error('Error reading settings:', error);
    initQueuePopover();
  }
})();
