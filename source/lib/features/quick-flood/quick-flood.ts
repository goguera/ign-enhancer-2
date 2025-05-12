import { browser } from 'webextension-polyfill-ts';
import { logger } from '@lib/utils/logging';
import { getSettings } from '@lib/utils/options';

const LOG_SOURCE = 'quick-flood';

interface ExtendedWindow extends Window {
  [key: string]: any;
  ign_flood_config?: {
    enabled: boolean;
    autoCollapseThreadAfterPosting: boolean;
    threadFrameHeight: string;
  };
}

declare global {
  interface HTMLIFrameElement {
    _messageHandler?: (event: MessageEvent) => void;
    _cleanup?: () => void;
  }

  interface Window {
    ign_flood_config?: {
      enabled: boolean;
      autoCollapseThreadAfterPosting: boolean;
      threadFrameHeight: string;
    };
  }
}

interface ThreadState {
  container: HTMLElement;
  button: HTMLButtonElement;
  successIndicator: HTMLElement;
  titleLabel?: HTMLElement;
  statusIndicator?: HTMLElement;
  isVisible: boolean;
  hasPosted?: boolean;
}
const EXPANDED_THREADS = new Map<string, ThreadState>();

// Update the icon set with new, more modern expand/collapse icons
const ICONS = {
  // Replace the play icon with a better "expand" icon (chevron-right)
  play: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',

  // Replace the collapse icon with a more modern one (chevron-down)
  collapse:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',

  // Keep the existing success icon
  success:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',

  // Keep the existing waiting icon
  waiting:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-4.42 8-8 8z"/><path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>',

  // Keep the existing loading icon
  loading:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BF1313" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ign-spinner"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>',
};

function updateThreadState(threadId: string, isVisible: boolean): void {
  const st = EXPANDED_THREADS.get(threadId);
  if (!st) return;
  st.isVisible = isVisible;

  // Get thread elements
  const wrapper = document.getElementById(`ign-quick-flood-wrapper-${threadId}`);
  const iframe = st.container.querySelector('iframe') as HTMLIFrameElement;
  const titleLabel = st.container.querySelector('.ign-quick-flood-title') as HTMLElement;
  const statusIndicator = st.container.querySelector('.ign-quick-flood-status') as HTMLElement;

  if (isVisible) {
    // Show full content
    if (wrapper) {
      wrapper.style.height = 'auto';
      wrapper.style.margin = '10px 0';
      wrapper.style.display = 'block';
      wrapper.style.visibility = 'visible';
      wrapper.style.position = 'static';
    }

    // Get the configured height from global config or use default
    const heightValue = window.ign_flood_config?.threadFrameHeight || '700px';

    st.container.classList.remove('collapsed');
    st.container.style.height = heightValue;
    st.container.style.opacity = '1';
    st.container.style.position = 'relative';
    st.container.style.overflow = 'visible';
    st.container.style.margin = '10px 0';
    st.container.style.border = '1px solid #ddd';
    st.container.style.zIndex = 'auto';

    if (iframe) {
      iframe.style.height = heightValue;
      iframe.style.visibility = 'visible';
      iframe.style.position = 'relative';
      iframe.style.pointerEvents = 'auto';
      iframe.style.opacity = '1';
    }

    if (titleLabel) titleLabel.style.display = 'none';
    if (statusIndicator) statusIndicator.style.display = 'none';
  } else {
    // Hide content but keep DOM active
    if (wrapper) {
      wrapper.style.height = '0';
      wrapper.style.margin = '0';
      wrapper.style.display = 'block';
      wrapper.style.visibility = 'hidden';
      wrapper.style.position = 'absolute';
    }

    st.container.classList.add('collapsed');
    st.container.style.height = '0';
    st.container.style.opacity = '0';
    st.container.style.position = 'absolute';
    st.container.style.overflow = 'hidden';
    st.container.style.margin = '0';
    st.container.style.border = 'none';
    st.container.style.padding = '0';
    st.container.style.zIndex = '-1';

    if (iframe) {
      iframe.style.visibility = 'hidden';
      iframe.style.position = 'absolute';
      iframe.style.pointerEvents = 'none';
      iframe.style.opacity = '0';
    }

    if (titleLabel) titleLabel.style.display = 'none';
    if (statusIndicator) statusIndicator.style.display = 'none';
  }

  // Update button with SVG instead of text
  st.button.innerHTML = isVisible ? ICONS.collapse : ICONS.play;
  st.button.style.color = '#2196F3';
}

function toggleThreadExpansion(
  threadId: string,
  btn: HTMLButtonElement,
  url: string,
  title: string,
  row: Element,
): void {
  if (btn.dataset.toggling) return;
  btn.dataset.toggling = '1';

  // Show loading state with animated spinner
  btn.innerHTML = ICONS.loading;
  btn.classList.add('ign-spinner-animate');
  btn.style.color = '#BF1313';

  try {
    if (EXPANDED_THREADS.has(threadId)) {
      const st = EXPANDED_THREADS.get(threadId)!;
      updateThreadState(threadId, !st.isVisible);
    } else {
      createThreadExpansion(threadId, btn, url, title, row);
    }
  } catch (e) {
    logger.error(LOG_SOURCE, e);
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
    btn.style.color = 'red';
    setTimeout(() => {
      btn.innerHTML = ICONS.play;
      btn.style.color = '#2196F3';
    }, 1500);
  } finally {
    delete btn.dataset.toggling;
    btn.classList.remove('ign-spinner-animate');
    if (!EXPANDED_THREADS.has(threadId) || !EXPANDED_THREADS.get(threadId)!.isVisible) {
      btn.style.color = '#2196F3';
    }
  }
}

function createThreadExpansion(
  threadId: string,
  btn: HTMLButtonElement,
  url: string,
  title: string,
  row: Element,
): void {
  if (document.getElementById(`ign-quick-flood-wrapper-${threadId}`)) return;

  // Create outer wrapper that will be used for collapsing
  const wrapper = document.createElement('li');
  wrapper.id = `ign-quick-flood-wrapper-${threadId}`;
  wrapper.className = 'ign-quick-flood-wrapper';
  wrapper.style.cssText =
    'grid-column:1/-1;width:100%;list-style:none;transition:height 0.3s ease, margin 0.3s ease;';

  // Get the configured height or use default
  const heightValue = window.ign_flood_config?.threadFrameHeight || '700px';

  // Create content container
  const container = document.createElement('div');
  container.id = `ign-quick-flood-content-${threadId}`;
  container.className = 'ign-quick-flood-content';
  container.style.cssText =
    `border:1px solid #ddd;border-radius:4px;margin:10px 0;padding:0;background:#f9f9f9;overflow:hidden;animation:ign-quick-flood-fade-in .3s ease;transition:height 0.3s ease, opacity 0.3s ease, position 0s;height:${heightValue};position:relative;`;

  // Add a title label for the collapsed state
  const titleLabel = document.createElement('div');
  titleLabel.className = 'ign-quick-flood-title';
  titleLabel.textContent = title || 'Thread preview';
  titleLabel.style.cssText =
    'position:absolute;top:0;left:0;right:0;padding:10px;background:rgba(249,249,249,0.9);font-weight:bold;z-index:10;border-bottom:1px solid #eee;display:none;';
  container.appendChild(titleLabel);

  // Add status indicator for the collapsed state
  const statusIndicator = document.createElement('div');
  statusIndicator.className = 'ign-quick-flood-status';
  statusIndicator.textContent = 'Not posted';
  statusIndicator.style.cssText =
    'position:absolute;bottom:5px;right:10px;padding:3px 8px;color:#777;font-size:12px;display:none;';
  container.appendChild(statusIndicator);

  const iframe = createThreadIframe(url, threadId);
  iframe.style.transition = 'visibility 0.3s ease';
  container.appendChild(iframe);

  wrapper.appendChild(container);

  const next = row.nextElementSibling;
  row.parentElement?.insertBefore(wrapper, next || null);

  const success = document.getElementById(
    `ign-quick-flood-success-list-${threadId}`,
  ) as HTMLElement;
  EXPANDED_THREADS.set(threadId, {
    container,
    button: btn,
    successIndicator: success,
    titleLabel,
    statusIndicator,
    isVisible: true,
  });
  updateThreadState(threadId, true);
}

function createThreadIframe(url: string, threadId: string): HTMLIFrameElement {
  const ifr = document.createElement('iframe');
  ifr.id = `ign-quick-flood-iframe-${threadId}`;
  ifr.className = 'ign-quick-flood-iframe';
  
  // Get the configured height or use default
  const heightValue = window.ign_flood_config?.threadFrameHeight || '700px';
  
  // Initially hide the iframe completely until content is ready
  ifr.style.cssText =
    `width:100%;height:${heightValue};border:none;opacity:0;visibility:hidden;transition:opacity 0.3s ease;`;

  // Create a loading indicator with SVG spinner
  const loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'ign-quick-flood-loading';
  loadingOverlay.id = `ign-quick-flood-loading-${threadId}`;
  loadingOverlay.style.cssText =
    'position:absolute;top:0;left:0;right:0;bottom:0;display:flex;justify-content:center;align-items:center;background:#f9f9f9;z-index:10;';

  // Use SVG spinner instead of emoji
  loadingOverlay.innerHTML = `
    <div style="text-align:center;">
      <div class="ign-spinner-container" style="margin-bottom:15px;font-size:32px;">${ICONS.loading}</div>
      <div style="color:#BF1313;font-weight:500;">Loading thread...</div>
    </div>
  `;

  // Add the loading indicator before the iframe
  setTimeout(() => {
    const container = document.getElementById(`ign-quick-flood-content-${threadId}`);
    if (container && !container.querySelector('.ign-quick-flood-loading')) {
      container.appendChild(loadingOverlay);
    }
  }, 0);

  // Load the content
  ifr.src = url;
  ifr.addEventListener('load', () => {
    injectCleanupScript(ifr, threadId);

    // Remove the loading indicator and show the iframe after a small delay
    setTimeout(() => {
      const loadingEl = document.getElementById(`ign-quick-flood-loading-${threadId}`);
      if (loadingEl) {
        // Fade out the loading indicator
        loadingEl.style.opacity = '0';
        setTimeout(() => loadingEl.remove(), 300);
      }

      // Show the iframe with transition
      ifr.style.opacity = '1';
      ifr.style.visibility = 'visible';
    }, 200); // Short delay to ensure styles are applied
  });

  return ifr;
}

function injectCleanupScript(ifr: HTMLIFrameElement, threadId: string): void {
  try {
    const doc = ifr.contentDocument || ifr.contentWindow?.document;
    if (!doc) return;

    // Immediately apply initial styles before showing content
    const instantStyles = document.createElement('style');
    instantStyles.textContent = `
      header.p-header, .p-nav-wrapper, .p-body-sidebar, .p-footer,
      .p-navSticky, .p-navSticky--all, .uix_stickyBar, .uix_sidebarNav,
      .uix_headerInner--opposite, .notices, .breadcrumb, .thread-preview,
      .message-signature, .blockMessage.blockMessage--none, footer[class^="jsx-"] {
        display: none !important;
      }
      .p-body {
        margin: 0 !important;
        max-width: 100% !important;
        padding: 0 !important;
      }
      .p-body-contentRow {
        margin: 0 !important;
        padding-top: 0 !important;
      }
      .p-body-main {
        max-width: 100% !important;
        flex-basis: 100% !important;
      }
      .p-body-header {
        margin-bottom: 0 !important;
      }
      form.block.js-quickReply {
        position: sticky !important;
        bottom: 0 !important;
        z-index: 100 !important;
        background: #fff !important;
        border-top: 1px solid #ddd !important;
        box-shadow: 0 -2px 10px rgba(0,0,0,0.1) !important;
        padding: 1px !important;
        border-radius: 8px !important;
        margin: 0 !important;
      }
    `;
    doc.head.appendChild(instantStyles);

    // Now add the script that will maintain these styles when DOM changes
    const s = doc.createElement('script');
    s.textContent = `
(() => {
  const hideSel = [
    'header.p-header', '.p-nav-wrapper', '.p-body-sidebar', '.p-footer',
    '.p-navSticky', '.p-navSticky--all', '.uix_stickyBar', '.uix_sidebarNav',
    '.uix_headerInner--opposite', '.notices', '.breadcrumb', '.thread-preview',
    '.message-signature',
    '.blockMessage.blockMessage--none', 'footer[class^="jsx-"]'
  ];

  function hide() {
    hideSel.forEach(sel => document.querySelectorAll(sel).forEach(e => e.style.display = 'none'));
    const b = document.querySelector('.p-body');
    if (b) {
      b.style.margin = '0';
      b.style.maxWidth = '100%';
      b.style.padding = '0';
    }
    const r = document.querySelector('.p-body-contentRow');
    if (r) {
      r.style.margin = '0';
      r.style.paddingTop = '0';
    }
    const m = document.querySelector('.p-body-main');
    if (m) {
      m.style.maxWidth = '100%';
      m.style.flexBasis = '100%';
    }
    const h = document.querySelector('.p-body-header');
    if (h) h.style.marginBottom = '0';
    
    // Make the quick reply form sticky at the bottom
    const quickReplyForm = document.querySelector('form.block.js-quickReply');
    if (quickReplyForm) {
      quickReplyForm.style.position = 'sticky';
      quickReplyForm.style.bottom = '0';
      quickReplyForm.style.zIndex = '100';
      quickReplyForm.style.background = '#fff';
      quickReplyForm.style.borderTop = '1px solid #ddd';
      quickReplyForm.style.boxShadow = '0 -2px 10px rgba(0,0,0,0.1)';
      quickReplyForm.style.padding = '1px';
      quickReplyForm.style.borderRadius = '8px';
      quickReplyForm.style.margin = '0';
    }
  }

  // Apply immediately and set up mutation observer
  hide();
  new MutationObserver(hide).observe(document.body, { childList: true, subtree: true });

  // Signal to the parent that we're ready to be shown
  parent.postMessage({ type: 'ready', threadId: '${threadId}' }, '*');

  let sent = false;

  document.querySelectorAll('form.block-body').forEach(f =>
    f.addEventListener('submit', () => {
      parent.postMessage({ type: 'posted', threadId: '${threadId}', success: true }, '*');
      sent = true;
    })
  );

  const ox = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u, ...a) {
    if (u && u.toString().includes('/add-reply')) {
      this.addEventListener('load', function() {
        if (this.status >= 200 && this.status < 300) {
          try {
            const r = JSON.parse(this.responseText);
            if (r && r.status === 'ok' && !sent) {
              parent.postMessage({ type: 'posted', threadId: '${threadId}', success: true }, '*');
              sent = true;
            }
            else if (r && r.status === 'error' && r.errors.some(e => e.includes('must wait'))) {
              parent.postMessage({ type: 'queued', threadId: '${threadId}' }, '*');
            }
          } catch {}
        }
      });
    }
    return ox.call(this, m, u, ...a);
  };
  
  // Handle ping messages to keep the frame active when hidden
  window.addEventListener('message', function(event) {
    if (event.source === parent && event.data && event.data.type === 'ping') {
      // Reply with a pong to confirm the iframe is still active
      parent.postMessage({ type: 'pong', threadId: '${threadId}' }, '*');
      
      // Keep checking for forms even when hidden
      document.querySelectorAll('form.block-body').forEach(f => {
        if (!f._ignEnhancerHandled) {
          f._ignEnhancerHandled = true;
          f.addEventListener('submit', () => {
            parent.postMessage({ type: 'posted', threadId: '${threadId}', success: true }, '*');
            sent = true;
          });
        }
      });
    }
  });

  // Make sure we're active even if visibility changes
  document.addEventListener('visibilitychange', function() {
    // Force a DOM operation to ensure we're still active
    hide();
  });
})();
    `.trim();
    doc.head.appendChild(s);

    const handler = (e: MessageEvent) => {
      if (e.source !== ifr.contentWindow) return;
      const d = e.data;
      if (d.threadId !== threadId) return;

      const st = EXPANDED_THREADS.get(threadId);
      if (!st) return;

      if (d.type === 'ready') {
        // The iframe content is ready with styles applied
        const loadingEl = document.getElementById(`ign-quick-flood-loading-${threadId}`);
        if (loadingEl) {
          loadingEl.style.opacity = '0';
          setTimeout(() => loadingEl.remove(), 300);
        }

        // Show the iframe content
        ifr.style.opacity = '1';
        ifr.style.visibility = 'visible';
      } else if (d.type === 'posted' && d.success) {
        // Use SVG icon instead of emoji
        st.successIndicator.innerHTML = ICONS.success;
        // Make sure to reset the color to green (in case it was previously orange from waiting state)
        st.successIndicator.style.color = '#4CAF50';
        st.successIndicator.style.display = 'inline-flex';
        st.successIndicator.style.animation = 'success-pulse .5s ease';
        ensureSuccessAnimation();

        // Update status indicator for collapsed view
        st.hasPosted = true;
        if (st.statusIndicator) {
          st.statusIndicator.innerHTML = `Posted ${ICONS.success}`;
          st.statusIndicator.style.color = '#4CAF50';
        }

        // Check if we should auto-collapse
        const shouldAutoCollapse = window.ign_flood_config?.autoCollapseThreadAfterPosting !== false;
        
        if (shouldAutoCollapse) {
          setTimeout(() => updateThreadState(threadId, false), 350);
          // --- CLEANUP AND REMOVE THREAD FROM DOM ---
          setTimeout(() => {
            const iframe = st.container.querySelector('iframe') as HTMLIFrameElement | null;
            if (iframe) {
              iframe._cleanup?.();
              iframe.remove();
            }

            const wrapper = document.getElementById(`ign-quick-flood-wrapper-${threadId}`);
            if (wrapper) wrapper.remove();

            EXPANDED_THREADS.delete(threadId);
          }, 500);
        }
      } else if (d.type === 'queued') {
        // Use SVG icon instead of emoji
        st.successIndicator.innerHTML = ICONS.waiting;
        st.successIndicator.style.color = '#FFA500';
        st.successIndicator.style.display = 'inline-flex';
        st.successIndicator.style.animation = 'queued-pulse .5s ease';
        ensureQueuedAnimation();

        // Update status indicator for collapsed view
        if (st.statusIndicator) {
          st.statusIndicator.innerHTML = `Queued ${ICONS.waiting}`;
          st.statusIndicator.style.color = '#FFA500';
        }

        // Check if we should auto-collapse
        const shouldAutoCollapse = window.ign_flood_config?.autoCollapseThreadAfterPosting !== false;
        
        if (shouldAutoCollapse) {
          setTimeout(() => updateThreadState(threadId, false), 350);
        }
      } else if (d.type === 'pong') {
        // Received a pong response to our keepalive ping
        logger.debug(LOG_SOURCE, 'Received pong from thread', threadId);
      }
    };

    if (ifr._messageHandler) window.removeEventListener('message', ifr._messageHandler);
    ifr._messageHandler = handler;
    window.addEventListener('message', handler);
    ifr._cleanup = () => {
      if (ifr._messageHandler) window.removeEventListener('message', ifr._messageHandler);
    };
    ifr.addEventListener('unload', () => ifr._cleanup?.());
  } catch (e) {
    logger.error(LOG_SOURCE, 'injectCleanupScript', e);
  }

  function ensureSuccessAnimation(): void {
    if (!document.getElementById('ign-quick-flood-success-animation')) {
      const sty = document.createElement('style');
      sty.id = 'ign-quick-flood-success-animation';
      sty.textContent =
        '@keyframes success-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.5); } 100% { transform: scale(1); } }';
      document.head.appendChild(sty);
    }
  }

  function ensureQueuedAnimation(): void {
    if (!document.getElementById('ign-quick-flood-queued-animation')) {
      const sty = document.createElement('style');
      sty.id = 'ign-quick-flood-queued-animation';
      sty.textContent =
        '@keyframes queued-pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.3); opacity: 0.7; } 100% { transform: scale(1); opacity: 1; } }';
      document.head.appendChild(sty);
    }
  }
}

export async function initQuickFlood(): Promise<void> {
  try {
    const cfg = await getSettings();
    
    // Ensure threadFrameHeight is a valid number with proper fallback
    let heightValue = '700';
    if (cfg.threadFrameHeight) {
      const parsedHeight = parseInt(cfg.threadFrameHeight);
      if (!isNaN(parsedHeight) && parsedHeight >= 600 && parsedHeight <= 1200) {
        heightValue = cfg.threadFrameHeight;
      }
    }
    
    const quickFloodConfigs = {
      enabled: cfg.enableQuickFlood === 'yes',
      autoCollapseThreadAfterPosting: cfg.autoCollapseThreadAfterPosting === 'yes',
      threadFrameHeight: heightValue + 'px'
    };
    
    if (!quickFloodConfigs.enabled || !/\/forums\//.test(location.href)) return;
    
    // Debug logging for threadFrameHeight
    console.log('Quick Flood settings:', {
      rawHeight: cfg.threadFrameHeight,
      parsedHeight: heightValue,
      finalHeight: quickFloodConfigs.threadFrameHeight,
      autoCollapse: quickFloodConfigs.autoCollapseThreadAfterPosting
    });
    
    // Make config globally accessible
    (window as any).ign_flood_config = quickFloodConfigs;
    
    if (!document.getElementById('ign-quick-flood-global-styles')) {
      const st = document.createElement('style');
      st.id = 'ign-quick-flood-global-styles';
      st.textContent = `
        .ign-quick-flood-content {
          margin: 10px 0;
          background: #f9f9f9;
          border: 1px solid #ddd;
          border-radius: 4px;
          transition: height 0.3s ease, opacity 0.3s ease, margin 0.3s ease;
          will-change: height, opacity, position;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .ign-quick-flood-content.collapsed {
          border: none;
          margin: 0;
          padding: 0;
        }
        .ign-quick-flood-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          will-change: transform;
          position: absolute;
          right: 5px;
          top: 3px;
        }
        .ign-quick-flood-button:focus {
          outline: none;
          border-color: rgba(33, 150, 243, 0.6) !important;
          box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2) !important;
        }
        .ign-quick-flood-button:hover {
          transform: translateY(-1px);
        }
        .ign-spinner-animate svg {
          animation: ign-spinner-rotation 1s linear infinite;
          stroke: #BF1313;
        }
        @keyframes ign-spinner-rotation {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .ign-spinner-container svg {
          animation: ign-spinner-rotation 1s linear infinite;
          width: 32px;
          height: 32px;
          stroke: #BF1313;
        }
        @keyframes ign-quick-flood-fade-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ign-quick-flood-loading {
          transition: opacity 0.3s ease;
        }`;
      document.head.appendChild(st);
    }
    const ready = () => {
      addFloodButtonsToThreads();
      setupMutationObserver();
      setupHiddenIframeKeepAlive();
    };
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', ready)
      : ready();
    setTimeout(addFloodButtonsToThreads, 1000);
  } catch (e) {
    logger.error(LOG_SOURCE, e);
  }
}

function addFloodButtonsToThreads(): void {
  document.querySelectorAll('.structItem--thread').forEach((item) => {
    if (item.querySelector('.ign-quick-flood-button')) return;
    const link = item.querySelector<HTMLAnchorElement>(
      '.structItem-title a[data-tp-primary], .structItem-title a[data-preview-url]',
    );
    if (!link) return;
    const threadId = extractThreadId(link.href);

    const btn = document.createElement('button');
    btn.className = 'ign-quick-flood-button';
    btn.title = 'Quick View / Flood';
    btn.innerHTML = ICONS.play;
    btn.style.cssText =
      'background:none;border:1px solid rgba(33, 150, 243, 0.2);cursor:pointer;font-size:14px;line-height:1;height:28px;width:28px;padding:0;margin-left:6px;vertical-align:middle;opacity:.8;transition:transform .2s ease,opacity .2s ease,background-color .2s ease,border-color .2s ease;color:#2196F3;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,0.05);';
    btn.onmouseover = () => {
      btn.style.opacity = '1';
      btn.style.transform = 'translateY(-1px)';
      btn.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
      btn.style.borderColor = 'rgba(33, 150, 243, 0.4)';
      btn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
    };
    btn.onmouseout = () => {
      btn.style.opacity = '.8';
      btn.style.transform = 'translateY(0)';
      btn.style.backgroundColor = 'transparent';
      btn.style.borderColor = 'rgba(33, 150, 243, 0.2)';
      btn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
    };
    btn.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      toggleThreadExpansion(threadId, btn, link.href, link.textContent?.trim() || '', item);
    };

    const ok = document.createElement('span');
    ok.id = `ign-quick-flood-success-list-${threadId}`;
    ok.innerHTML = ICONS.success;
    ok.style.cssText =
      'display:none;font-size:14px;color:#4CAF50;margin-left:4px;vertical-align:middle;line-height:1;';

    const wrap = document.createElement('span');
    wrap.className = 'ign-quick-flood-button-container';
    wrap.style.cssText =
      'display:inline-flex;align-items:center;vertical-align:middle;line-height:1;position:relative;float:right;';
    wrap.appendChild(btn);
    wrap.appendChild(ok);
    link.parentElement?.appendChild(wrap);

    const st = EXPANDED_THREADS.get(threadId);
    if (st) {
      st.button = btn;
      st.successIndicator = ok;
      btn.innerHTML = st.isVisible ? ICONS.collapse : ICONS.play;
      btn.style.color = '#2196F3';
    }
  });
}

function extractThreadId(url: string): string {
  const m = url.match(/\.(\d+)(?:\/|$)/);
  return m ? m[1] : crypto.randomUUID();
}

function setupMutationObserver(): void {
  const container = document.querySelector('.structItemContainer');
  if (!container) return;
  const obs = new MutationObserver((m) => {
    if (m.some((x) => x.addedNodes.length)) addFloodButtonsToThreads();
  });
  obs.observe(container, { childList: true, subtree: true });
}

// Keep hidden iframes alive by sending periodic no-op messages
function setupHiddenIframeKeepAlive(): void {
  // Run every 10 seconds
  setInterval(() => {
    try {
      // Ping all collapsed iframes to keep them active
      EXPANDED_THREADS.forEach((state, threadId) => {
        if (!state.isVisible) {
          const iframe = state.container.querySelector('iframe') as HTMLIFrameElement;
          if (iframe && iframe.contentWindow) {
            // Send a no-op ping to keep the iframe active
            iframe.contentWindow.postMessage({ type: 'ping', threadId }, '*');
            logger.debug(LOG_SOURCE, 'Sent keepalive ping to', threadId);
          }
        }
      });
    } catch (e) {
      logger.error(LOG_SOURCE, 'keepalive error', e);
    }
  }, 10000);

  // Also monitor DOM visibility
  document.addEventListener('visibilitychange', () => {
    // When page becomes visible again, check on all our hidden iframes
    if (!document.hidden) {
      EXPANDED_THREADS.forEach((state, threadId) => {
        if (!state.isVisible) {
          const iframe = state.container.querySelector('iframe') as HTMLIFrameElement;
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'ping', threadId }, '*');
          }
        }
      });
    }
  });
}

export const placeholder = '';
