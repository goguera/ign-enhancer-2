import { browser } from 'webextension-polyfill-ts';
import { injectScript } from '@lib/utils/helpers';
import { initAutoFlood } from '@lib/features/autoflood';
import { initAutoClose } from '@lib/features/autoclose';
import { initBackgroundPosting } from '@lib/features/background-posting/background-posting';

export {};

function injectScripts() {
  setTimeout(function () {
    injectScript(browser.runtime.getURL('assets/js/injection.js'), 'body');
  }, 1);
}

console.log('Threads content script loaded');

// Initialize features
initAutoFlood();
initAutoClose();
initBackgroundPosting();
injectScripts();
