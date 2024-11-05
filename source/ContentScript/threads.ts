import { browser } from 'webextension-polyfill-ts';
import { injectScript } from '@lib/utils/helpers';
import { initAutoFlood } from '@lib/features/autoflood';
import { initAutoClose } from '@lib/features/autoclose';

export {};

function injectScripts() {
  setTimeout(function () {
    injectScript(browser.runtime.getURL('assets/js/injection.js'), 'body');
  }, 1);
}

initAutoFlood();
initAutoClose();
injectScripts();
