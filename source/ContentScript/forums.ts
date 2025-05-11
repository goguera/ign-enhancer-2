import { initNeverEnding } from '@lib/features/neverending';
import { initToolbar } from '@lib/features/toolbar/toolbar';
import { initQuickFlood } from '@lib/features/quick-flood/quick-flood';

initNeverEnding();
initToolbar();

// Initialize quick flood asynchronously
initQuickFlood().catch(error => {
  console.error('Error initializing quick flood:', error);
});

console.log('Forums content script loaded');
