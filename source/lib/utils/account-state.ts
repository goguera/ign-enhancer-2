import { browser, type Cookies } from 'webextension-polyfill-ts';
import { AccountState, AccountStates, UserProfile } from '@lib/types';
import { logger } from '@lib/utils/logging';

// Log source identifier
const LOG_SOURCE = 'account-state';

const ACCOUNT_STATES_KEY = 'accountStates';
const IGNBOARDS_DOMAIN = 'ignboards.com';
const WWW_IGNBOARDS_DOMAIN = 'www.ignboards.com';

// Define essential cookies for XenForo
export const ESSENTIAL_COOKIES = [
  'xf_user',      // Primary authentication
  'xf_session',   // Session identifier
  'xf_csrf',      // CSRF protection token
  'xf_dbWriteForced', // Updated with each request
];

/**
 * Fetch the current user's profile from the forum
 */
export async function fetchUserProfile(): Promise<UserProfile | null> {
  try {
    console.log('Fetching user profile...');
    const response = await fetch('https://www.ignboards.com/account/');
    
    if (!response.ok) {
      console.error('Failed to fetch profile page:', response.status, response.statusText);
      return null;
    }
    
    const html = await response.text();
    console.log('Got HTML response, length:', html.length);
    
    // Create a temporary element to parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Try different selectors that might match the elements
    const avatarElement = doc.querySelector('.avatar[data-user-id]');
    const usernameElement = doc.querySelector('.p-navgroup-linkText');
    
    console.log('Found elements:', {
      avatarElement: !!avatarElement,
      usernameElement: !!usernameElement
    });

    if (!avatarElement) {
      console.error('Required elements not found in the page');
      console.log('Page HTML:', html);
      return null;
    }
    
    // Get username from nav or fallback to display name
    const username = usernameElement?.textContent?.trim() || avatarElement.getAttribute('title') || '';
    
    const profile = {
      userId: avatarElement.getAttribute('data-user-id') || '',
      username,
      displayName: avatarElement.getAttribute('title') || username,
      avatarUrl: avatarElement.querySelector('img')?.getAttribute('src') || ''
    };
    
    console.log('Extracted profile:', profile);
    return profile;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    return null;
  }
}

/**
 * Get a specific cookie by name
 */
export async function getCookie(name: string, domain: string = WWW_IGNBOARDS_DOMAIN): Promise<Cookies.Cookie | null> {
  try {
    const cookie = await browser.cookies.get({
      url: `https://${domain}`,
      name: name
    });
    return cookie || null;
  } catch (error) {
    console.error(`Error getting cookie ${name}:`, error);
    return null;
  }
}

/**
 * Get the CSRF token in the format expected for form submissions
 * XenForo expects: timestamp,hash format for _xfToken
 */
export async function getFormattedCsrfToken(): Promise<string | null> {
  // First try to get from browser cookies
  const csrfCookie = await getCookie('xf_csrf');
  
  // If we got it from browser cookies, use it
  if (csrfCookie) {
    const timestamp = Math.floor(Date.now() / 1000);
    return `${timestamp},${csrfCookie.value}`;
  }
  
  // If not found in browser cookies, try to get from the active account's cookies
  const states = await getAccountStates();
  if (states.activeAccountId) {
    const account = states.accounts[states.activeAccountId];
    if (account) {
      // Find the xf_csrf cookie in the account's stored cookies
      const storedCsrfCookie = account.cookies.find(
        cookie => cookie.name === 'xf_csrf'
      );
      
      if (storedCsrfCookie) {
        logger.debug(LOG_SOURCE, 'Using stored CSRF token from account state', {
          accountId: states.activeAccountId
        });
        const timestamp = Math.floor(Date.now() / 1000);
        return `${timestamp},${storedCsrfCookie.value}`;
      }
    }
  }
  
  // Not found in either location
  logger.warning(LOG_SOURCE, 'CSRF token not found in browser or account cookies');
  return null;
}

/**
 * Check if the current session is valid
 */
export async function isSessionValid(): Promise<boolean> {
  // Check if we have all essential cookies
  for (const cookieName of ESSENTIAL_COOKIES) {
    const cookie = await getCookie(cookieName);
    if (!cookie) {
      console.log(`Session invalid: Missing cookie ${cookieName}`);
      return false;
    }
  }
  
  // Verify by fetching profile
  const profile = await fetchUserProfile();
  return !!profile;
}

/**
 * Update cookies after an API response
 */
export async function updateCookiesFromResponse(response: Response): Promise<void> {
  // Check for Set-Cookie headers and update cookies in storage
  const cookieHeader = response.headers.get('set-cookie');
  if (!cookieHeader) return;
  
  // Since we can't directly access Set-Cookie headers due to browser restrictions,
  // we'll rely on the browser to update cookies, but we need to refresh our stored cookies
  
  // For the active account, update its cookie storage
  const states = await getAccountStates();
  if (!states.activeAccountId) return;
  
  // Store the current session to update cookies in storage
  await storeCurrentSession();
}

/**
 * Clear the current session by removing auth cookies
 */
export async function clearCurrentSession(): Promise<void> {
  // Clear authentication cookies from both domains
  const currentCookies = [
    ...(await browser.cookies.getAll({ domain: IGNBOARDS_DOMAIN })),
    ...(await browser.cookies.getAll({ domain: WWW_IGNBOARDS_DOMAIN }))
  ];

  // Filter for ALL essential cookies, not just xf_user and xf_session
  const authCookies = currentCookies.filter(cookie => 
    ESSENTIAL_COOKIES.includes(cookie.name)
  );

  for (const cookie of authCookies) {
    try {
      await browser.cookies.remove({
        url: `https://${cookie.domain}${cookie.path}`,
        name: cookie.name
      });
    } catch (error) {
      console.error('Error removing cookie:', error);
    }
  }

  // Clear localStorage
  window.localStorage.clear();
}

export async function createPendingAccount(name: string): Promise<void> {
  const states = await getAccountStates();
  
  // If there's already a pending account, delete it
  if (states.pendingAccountId) {
    delete states.accounts[states.pendingAccountId];
  }

  // Create a new pending account
  const pendingAccount: AccountState = {
    id: Date.now().toString(),
    name,
    cookies: [],
    localStorage: {},
    timestamp: Date.now(),
    status: 'pending'
  };

  states.accounts[pendingAccount.id] = pendingAccount;
  states.pendingAccountId = pendingAccount.id;

  await browser.storage.local.set({ [ACCOUNT_STATES_KEY]: states });
}

export async function startResyncing(accountId: string): Promise<void> {
  const states = await getAccountStates();
  const account = states.accounts[accountId];
  
  if (!account) {
    throw new Error('Account not found');
  }

  // Mark the account as resyncing
  account.isResyncing = true;
  await browser.storage.local.set({ [ACCOUNT_STATES_KEY]: states });
}

export async function getCurrentAccountState(): Promise<AccountState> {
  const [cookies1, cookies2] = await Promise.all([
    browser.cookies.getAll({ domain: IGNBOARDS_DOMAIN }),
    browser.cookies.getAll({ domain: WWW_IGNBOARDS_DOMAIN })
  ]);

  const cookies = [...cookies1, ...cookies2];
  const localStorage = { ...window.localStorage };
  const timestamp = Date.now();

  // Fetch user profile data first
  const profile = await fetchUserProfile();
  if (!profile) {
    throw new Error('Não foi possível obter os dados do perfil');
  }

  // Use userId as the unique identifier
  const id = profile.userId;
  const name = profile.displayName;

  return {
    id,
    name,
    cookies,
    localStorage,
    timestamp,
    status: 'pending',
    profile
  };
}

export async function saveAccountState(state: AccountState): Promise<void> {
  const states = await getAccountStates();
  
  // If this was a resync, clear the resyncing flag
  if (states.accounts[state.id]?.isResyncing) {
    state.isResyncing = false;
  }

  // If there's another account with the same userId but different id, remove it
  const duplicateAccount = Object.values(states.accounts).find(
    account => account.profile?.userId === state.profile?.userId && account.id !== state.id
  );
  if (duplicateAccount) {
    delete states.accounts[duplicateAccount.id];
    // If the duplicate was active, transfer active status to the new one
    if (states.activeAccountId === duplicateAccount.id) {
      states.activeAccountId = state.id;
    }
  }
  
  states.accounts[state.id] = state;
  states.activeAccountId = state.id; // Mark as active when saving
  await browser.storage.local.set({ [ACCOUNT_STATES_KEY]: states });
}

export async function getAccountStates(): Promise<AccountStates> {
  const result = await browser.storage.local.get(ACCOUNT_STATES_KEY);
  return result[ACCOUNT_STATES_KEY] || { accounts: {} };
}

export async function switchToAccountState(accountId: string): Promise<void> {
  const states = await getAccountStates();
  const account = states.accounts[accountId];

  if (!account) {
    throw new Error('Account not found');
  }

  try {
    // First get all current auth cookies to remove them
    const currentCookies = await Promise.all([
      browser.cookies.getAll({ domain: IGNBOARDS_DOMAIN }),
      browser.cookies.getAll({ domain: WWW_IGNBOARDS_DOMAIN })
    ]).then(([cookies1, cookies2]) => [...cookies1, ...cookies2]);

    // Filter for ALL essential cookies, not just xf_user and xf_session
    const authCookies = currentCookies.filter(cookie => 
      ESSENTIAL_COOKIES.includes(cookie.name)
    );

    // Clear localStorage first
    window.localStorage.clear();

    // Remove all current auth cookies sequentially to avoid race conditions
    for (const cookie of authCookies) {
      try {
        await browser.cookies.remove({
          url: `https://${cookie.domain}${cookie.path}`,
          name: cookie.name
        });
      } catch (error) {
        console.error('Error removing cookie:', error);
        // Continue with other cookies even if one fails
      }
    }

    // Set new auth cookies sequentially
    const cookieErrors: Error[] = [];
    // Filter cookies to set all essential cookies from the account
    const cookiesToSet = account.cookies.filter(cookie => 
      ESSENTIAL_COOKIES.includes(cookie.name)
    );

    for (const cookie of cookiesToSet) {
      try {
        // Prepare cookie data
        const cookieData: Cookies.SetDetailsType = {
          url: `https://${cookie.domain}${cookie.path}`,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite as Cookies.SameSiteStatus,
          storeId: cookie.storeId,
          expirationDate: cookie.expirationDate
        };

        await browser.cookies.set(cookieData);
      } catch (error) {
        console.error('Error setting cookie:', error);
        cookieErrors.push(error as Error);
      }
    }

    // Always set the push notice dismiss cookie
    try {
      await browser.cookies.set({
        url: `https://${WWW_IGNBOARDS_DOMAIN}`,
        name: 'xf_push_notice_dismiss',
        value: '1',
        domain: WWW_IGNBOARDS_DOMAIN,
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'lax' as Cookies.SameSiteStatus
      });
    } catch (error) {
      console.error('Error setting push notice dismiss cookie:', error);
    }

    // If we couldn't set any essential cookies, throw an error
    if (cookieErrors.length === cookiesToSet.length && cookiesToSet.length > 0) {
      throw new Error('Failed to set any authentication cookies');
    }

    // Finally set localStorage
    for (const [key, value] of Object.entries(account.localStorage)) {
      window.localStorage.setItem(key, value);
    }
    
    // Update active account ID in states
    states.activeAccountId = accountId;
    await browser.storage.local.set({ [ACCOUNT_STATES_KEY]: states });
  } catch (error) {
    // If anything fails, clear everything to prevent partial state
    await clearCurrentSession();
    throw error;
  }
}

export async function deleteAccountState(accountId: string): Promise<void> {
  const states = await getAccountStates();
  
  if (states.pendingAccountId === accountId) {
    states.pendingAccountId = undefined;
  }
  
  delete states.accounts[accountId];
  
  if (states.activeAccountId === accountId) {
    states.activeAccountId = undefined;
  }
  
  await browser.storage.local.set({ [ACCOUNT_STATES_KEY]: states });
}

export async function checkCurrentUser(): Promise<{ profile: UserProfile | null; existingAccount: AccountState | null }> {
  const profile = await fetchUserProfile();
  
  if (!profile) {
    return { profile: null, existingAccount: null };
  }
  
  // Find if this user already exists in our accounts
  const states = await getAccountStates();
  const existingAccount = Object.values(states.accounts).find(
    account => account.profile?.userId === profile.userId
  );
  
  return { profile, existingAccount: existingAccount || null };
}

export async function syncCurrentUser(): Promise<void> {
  const { profile, existingAccount } = await checkCurrentUser();
  
  if (!profile) {
    throw new Error('Nenhum usuário logado');
  }
  
  const states = await getAccountStates();
  
  // Get current state with cookies and localStorage
  const currentState = await getCurrentAccountState();
  currentState.status = 'synced';

  // Always use the current state but preserve the existing account's id if it exists
  if (existingAccount) {
    currentState.id = existingAccount.id;
  }

  states.accounts[currentState.id] = currentState;
  states.activeAccountId = currentState.id;
  await browser.storage.local.set({ [ACCOUNT_STATES_KEY]: states });
}

export async function exportAccountData(): Promise<string> {
  const states = await getAccountStates();
  return JSON.stringify(states, null, 2);
}

export async function importAccountData(jsonData: string): Promise<void> {
  try {
    const data = JSON.parse(jsonData) as AccountStates;
    
    // Validate the data structure
    if (!data || typeof data !== 'object' || !('accounts' in data)) {
      throw new Error('Formato de dados inválido');
    }

    // Validate each account
    for (const account of Object.values(data.accounts)) {
      if (!account.id || !account.name || !Array.isArray(account.cookies) || 
          typeof account.localStorage !== 'object' || !account.timestamp) {
        throw new Error('Estrutura de conta inválida');
      }
    }

    // If validation passes, save the data
    await browser.storage.local.set({ [ACCOUNT_STATES_KEY]: data });
  } catch (error) {
    throw new Error('Erro ao importar dados: ' + error);
  }
}

export async function storeCurrentSession(): Promise<void> {
  const states = await getAccountStates();
  
  // Check if there's an active account
  if (!states.activeAccountId) {
    console.log('No active account to store - skipping session storage');
    return; // Just return without error if there's no active account
  }

  const account = states.accounts[states.activeAccountId];
  if (!account) {
    throw new Error('Active account not found in storage');
  }

  // Get current cookies
  const cookies1 = await browser.cookies.getAll({ domain: IGNBOARDS_DOMAIN });
  const cookies2 = await browser.cookies.getAll({ domain: WWW_IGNBOARDS_DOMAIN });
  const cookies = [...cookies1, ...cookies2];

  // Get current localStorage
  const localStorage = { ...window.localStorage };

  // Update the account state
  account.cookies = cookies;
  account.localStorage = localStorage;
  account.timestamp = Date.now();

  // Save the updated state
  await browser.storage.local.set({ [ACCOUNT_STATES_KEY]: states });
}

/**
 * Helper function to create a new API request that includes proper auth
 * This can be used in your message posting module
 */
export async function createAuthorizedRequest(
  url: string, 
  method: string = 'GET', 
  body?: FormData | URLSearchParams | string | null
): Promise<Request> {
  // Get CSRF token for form data
  const csrfToken = await getFormattedCsrfToken();
  
  // Create headers
  const headers = new Headers({
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
  });
  
  // If this is a POST request with form data, we need to add the CSRF token
  if (method === 'POST' && body instanceof FormData) {
    if (csrfToken) {
      // Add CSRF token to form data
      body.append('_xfToken', csrfToken);
      logger.debug(LOG_SOURCE, 'Added CSRF token to request', {
        url,
        method,
        tokenPresent: true
      });
    } else {
      // Log a warning but continue with the request
      logger.warning(LOG_SOURCE, 'No CSRF token available for POST request', {
        url,
        method
      });
    }
  }

  // Create and return the request object
  return new Request(url, {
    method,
    headers,
    body,
    credentials: 'include', // Include cookies
    mode: 'cors',
  });
}

/**
 * Extract the correct CSRF token from a page's HTML content
 * XenForo includes the correct token in a hidden input field or meta tag
 */
async function extractCsrfToken(html: string): Promise<string | null> {
  try {
    // Try to find the token in a hidden input field (most common)
    const inputMatch = html.match(/<input[^>]*name="_xfToken"[^>]*value="([^"]+)"/i);
    if (inputMatch && inputMatch[1]) {
      logger.debug(LOG_SOURCE, `Found CSRF token in input field`, { token: inputMatch[1] });
      return inputMatch[1];
    }
    
    // Try to find it in XF.config JavaScript object
    const jsConfigMatch = html.match(/XF\.config\.csrf\s*=\s*['"]([^'"]+)['"]/i);
    if (jsConfigMatch && jsConfigMatch[1]) {
      const timestamp = Math.floor(Date.now() / 1000);
      logger.debug(LOG_SOURCE, `Found CSRF token in XF.config`, { token: `${timestamp},${jsConfigMatch[1]}` });
      return `${timestamp},${jsConfigMatch[1]}`;
    }
    
    // Try to find it in a meta tag
    const metaMatch = html.match(/<meta[^>]*name="_xfToken"[^>]*content="([^"]+)"/i);
    if (metaMatch && metaMatch[1]) {
      logger.debug(LOG_SOURCE, `Found CSRF token in meta tag`, { token: metaMatch[1] });
      return metaMatch[1];
    }
    
    logger.warning(LOG_SOURCE, `Could not find CSRF token in page HTML`);
    return null;
  } catch (error) {
    logger.error(LOG_SOURCE, `Error extracting CSRF token`, { error: String(error) });
    return null;
  }
}

/**
 * Send a forum post using stored account cookies without switching the browser's active session
 * This is more reliable than switching accounts and is used for background posting
 */
export async function sendForumPostWithStoredCookies(
  accountId: string,
  threadUrl: string,
  message: string
): Promise<Response> {
  logger.info(LOG_SOURCE, `Sending forum post with stored cookies to ${threadUrl}`, {
    accountId,
    messageLength: message.length,
    threadUrl
  });
  
  try {
    // Get the account state
    const states = await getAccountStates();
    const account = states.accounts[accountId];
    
    if (!account) {
      const error = `Account ${accountId} not found`;
      logger.error(LOG_SOURCE, error);
      throw new Error(error);
    }
    
    logger.debug(LOG_SOURCE, `Found account for posting`, { 
      accountId, 
      accountName: account.name,
      cookiesCount: account.cookies.length
    });
    
    // Extract cookies needed for authentication
    const csrfCookie = account.cookies.find(c => c.name === 'xf_csrf');
    const lastDateCookie = account.cookies.find(c => c.name === 'xf_dbWriteForced');
    
    if (!csrfCookie) {
      const error = 'CSRF cookie not found in stored account';
      logger.error(LOG_SOURCE, error, {
        accountId,
        availableCookies: account.cookies.map(c => c.name)
      });
      throw new Error(error);
    }
    
    // Create the request URL
    const requestUrl = `${threadUrl}/add-reply`;
    
    // Extract domain from the request URL for setting the Origin header
    const url = new URL(requestUrl);
    const origin = url.origin;
    const referer = threadUrl;
    
    // Directly build the Cookie header value from the account's cookies
    // This is more reliable than relying on credentials: 'include'
    const cookieHeader = account.cookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
    
    logger.debug(LOG_SOURCE, `Built cookie header for request`, {
      cookieCount: account.cookies.length,
      headerLength: cookieHeader.length
    });
    
    // 1. First, fetch the page to get the correct CSRF token
    logger.info(LOG_SOURCE, `Fetching page to extract CSRF token`);
    const pageResponse = await fetch(threadUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Referer': origin,
        'Origin': origin
      }
    });
    
    if (!pageResponse.ok) {
      const error = `Failed to fetch page: ${pageResponse.status} ${pageResponse.statusText}`;
      logger.error(LOG_SOURCE, error);
      throw new Error(error);
    }
    
    const pageHtml = await pageResponse.text();
    
    // 2. Extract the CSRF token from the page HTML
    const csrfToken = await extractCsrfToken(pageHtml);
    
    if (!csrfToken) {
      // Fall back to our manually constructed token if we can't extract it
      const timestamp = Math.floor(Date.now() / 1000);
      const fallbackToken = `${timestamp},${csrfCookie.value}`;
      logger.warning(LOG_SOURCE, `Using fallback CSRF token`, { token: fallbackToken });
      
      // Try to find the last_date in the HTML as an additional precaution
      const lastDateMatch = pageHtml.match(/name="last_date"[^>]*value="([^"]+)"/i);
      const lastDateValue = lastDateMatch ? lastDateMatch[1] : (lastDateCookie ? lastDateCookie.value : null);
      
      // 3. Now make the POST request with our constructed token
      return makePostRequest(
        requestUrl,
        message,
        fallbackToken,
        cookieHeader,
        origin,
        referer,
        lastDateValue,
        accountId
      );
    }
    
    logger.info(LOG_SOURCE, `Successfully extracted CSRF token from page`);
    
    // Try to find the last_date in the HTML
    const lastDateMatch = pageHtml.match(/name="last_date"[^>]*value="([^"]+)"/i);
    const lastDateValue = lastDateMatch ? lastDateMatch[1] : (lastDateCookie ? lastDateCookie.value : null);
    
    // 3. Now make the POST request with the extracted token
    return makePostRequest(
      requestUrl,
      message,
      csrfToken,
      cookieHeader,
      origin,
      referer,
      lastDateValue,
      accountId
    );
  } catch (error) {
    // Re-throw specific error types
    if (error && typeof error === 'object' && 'type' in error) {
      throw error;
    }
    
    // Handle generic errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(LOG_SOURCE, `Error sending forum post with stored cookies:`, { 
      error: errorMessage,
      errorObject: error,
      accountId
    });
    console.error('Error sending forum post with stored cookies:', error);
    throw error;
  }
}

/**
 * Helper function to make the actual POST request
 */
async function makePostRequest(
  requestUrl: string,
  message: string,
  csrfToken: string,
  cookieHeader: string,
  origin: string,
  referer: string,
  lastDate: string | null,
  accountId: string
): Promise<Response> {
  logger.info(LOG_SOURCE, `Making POST request to ${requestUrl}`);
  
  // Create FormData for the request
  const formData = new FormData();
  formData.append('_xfToken', csrfToken);
  formData.append('message_html', `<p>${message}</p>`);
  formData.append('attachment_hash', '');
  formData.append('_xfResponseType', 'json');
  
  // Add last_date if available
  if (lastDate) {
    formData.append('last_date', lastDate);
    logger.debug(LOG_SOURCE, `Added last_date to request`, { lastDate });
  }
  
  // Add other form fields that appear in a normal request
  formData.append('last_known_date', '0');
  formData.append('load_extra', '1');
  formData.append('_xfRequestUri', new URL(referer).pathname);
  formData.append('_xfWithData', '1');
  formData.append('_xfToken', csrfToken); // Yes, it's duplicated in real requests
  
  // Make the request with explicit headers including cookies
  const response = await fetch(requestUrl, {
    method: 'POST',
    body: formData,
    headers: {
      // Explicitly set the Cookie header with all needed cookies
      'Cookie': cookieHeader,
      // These headers are crucial to make the request appear as if it's coming from the site
      'Origin': origin,
      'Referer': referer,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01'
    }
  });
  
  // Log response details
  logger.network(
    LOG_SOURCE, 
    'POST',
    requestUrl,
    { messageLength: message.length, accountId },
    { 
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    }
  );
  
  // Clone response for processing
  const responseClone = response.clone();
  const responseData = await responseClone.json().catch(() => ({}));
  
  // Process response
  if (response.ok) {
    logger.debug(LOG_SOURCE, `Response data`, responseData);
    
    if (responseData.status === 'error' && 
        responseData.errors && 
        responseData.errors.length > 0) {
      
      const errorMsg = responseData.errors[0];
      
      // Special case for cookie errors (which could happen if the cookies were removed)
      if (errorMsg.includes('Cookie') || errorMsg.includes('cookie')) {
        logger.error(LOG_SOURCE, `Cookie error response`, {
          error: errorMsg
        });
        
        throw {
          type: 'auth',
          message: `Cookie error: ${errorMsg}. Try resyncing the account.`
        };
      }
      // Handle anti-flood protection
      else if (errorMsg.includes('wait')) {
        const waitTimeMatch = errorMsg.match(/(\d+) seconds/);
        const waitTime = waitTimeMatch ? parseInt(waitTimeMatch[1], 10) : 30;
        
        logger.warning(LOG_SOURCE, `Anti-flood protection triggered`, {
          waitTime,
          error: errorMsg
        });
        
        throw {
          type: 'antiflood',
          retryAfter: waitTime,
          message: errorMsg
        };
      } 
      // Handle security error
      else if (errorMsg.includes('security') || errorMsg.includes('csrf')) {
        logger.error(LOG_SOURCE, `Security error response`, {
          error: errorMsg,
          csrfProvided: !!csrfToken
        });
        
        throw {
          type: 'security',
          message: errorMsg
        };
      } 
      // Handle other errors
      else {
        logger.error(LOG_SOURCE, `Forum returned error response`, {
          errors: responseData.errors
        });
        
        throw new Error(`Forum error: ${responseData.errors.join(', ')}`);
      }
    } else if (responseData.status === 'ok') {
      logger.info(LOG_SOURCE, `Post successfully sent`, {
        threadUrl: referer,
        messageLength: message.length,
        accountId
      });
    }
  } else {
    logger.error(LOG_SOURCE, `HTTP error response`, {
      status: response.status,
      statusText: response.statusText
    });
    
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }
  
  return response;
}

/**
 * Clear browser data related to IGN but preserve extension data.
 * This is useful for troubleshooting without losing account configurations.
 */
export async function clearBrowserData(): Promise<void> {
  try {
    console.log('Clearing browser data related to IGN...');
    
    // Clear all cookies from both domains
    const allCookies = [
      ...(await browser.cookies.getAll({ domain: IGNBOARDS_DOMAIN })),
      ...(await browser.cookies.getAll({ domain: WWW_IGNBOARDS_DOMAIN }))
    ];
    
    for (const cookie of allCookies) {
      try {
        await browser.cookies.remove({
          url: `https://${cookie.domain}${cookie.path}`,
          name: cookie.name
        });
      } catch (error) {
        console.error('Error removing cookie:', error);
      }
    }
    
    // Clear localStorage
    window.localStorage.clear();
    
    console.log('IGN browser data cleared successfully');
  } catch (error) {
    console.error('Error clearing browser data:', error);
    throw error;
  }
} 

