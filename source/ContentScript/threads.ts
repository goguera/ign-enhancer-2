import { browser } from 'webextension-polyfill-ts';
import { injectScript } from './lib/helpers';
import { initAutoFlood } from './lib/autoflood';
import { initAutoClose } from './lib/autoclose';

console.log('helloworld from content script threads');

export {};

function injectScripts() {
  setTimeout(function () {
    injectScript(browser.runtime.getURL('assets/js/injection.js'), 'body');
  }, 1);
}

initAutoFlood();
initAutoClose();
injectScripts();
