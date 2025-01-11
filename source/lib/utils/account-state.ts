import { browser, type Cookies } from 'webextension-polyfill-ts';
import { AccountState, AccountStates, UserProfile } from '@lib/types';

const ACCOUNT_STATES_KEY = 'accountStates';
const IGNBOARDS_DOMAIN = 'ignboards.com';
const WWW_IGNBOARDS_DOMAIN = 'www.ignboards.com';

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

export async function clearCurrentSession(): Promise<void> {
  // Clear cookies from both domains
  const currentCookies = [
    ...(await browser.cookies.getAll({ domain: IGNBOARDS_DOMAIN })),
    ...(await browser.cookies.getAll({ domain: WWW_IGNBOARDS_DOMAIN }))
  ];

  for (const cookie of currentCookies) {
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

  // If there's already a pending account, delete it
  if (states.pendingAccountId) {
    delete states.accounts[states.pendingAccountId];
  }

  // Mark the account as resyncing
  account.isResyncing = true;
  states.pendingAccountId = accountId;

  await browser.storage.local.set({ [ACCOUNT_STATES_KEY]: states });
}

export async function getCurrentAccountState(): Promise<AccountState> {
  const [cookies1, cookies2] = await Promise.all([
    browser.cookies.getAll({ domain: IGNBOARDS_DOMAIN }),
    browser.cookies.getAll({ domain: WWW_IGNBOARDS_DOMAIN })
  ]);

  const cookies = [...cookies1, ...cookies2];
  const localStorage = { ...window.localStorage };
  const timestamp = new Date().toISOString();
  const id = crypto.randomUUID();

  // Get account states to check for pending/resyncing
  const states = await getAccountStates();
  const name = states.pendingAccountId ? 
    states.accounts[states.pendingAccountId]?.name :
    'Nova Conta';

  // Fetch user profile data
  const profile = await fetchUserProfile() || undefined;

  return {
    id,
    name,
    cookies,
    localStorage,
    timestamp: Number(timestamp),
    status: 'pending',
    profile
  };
}

export async function saveAccountState(state: AccountState): Promise<void> {
  const states = await getAccountStates();
  
  // If this was a pending account, clear the pendingAccountId
  if (states.pendingAccountId === state.id) {
    states.pendingAccountId = undefined;
  }

  // If this was a resync, clear the resyncing flag
  if (states.accounts[state.id]?.isResyncing) {
    state.isResyncing = false;
  }
  
  states.accounts[state.id] = state;
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

  // Clear current cookies
  const [currentCookies1, currentCookies2] = await Promise.all([
    browser.cookies.getAll({ domain: IGNBOARDS_DOMAIN }),
    browser.cookies.getAll({ domain: WWW_IGNBOARDS_DOMAIN })
  ]);

  for (const cookie of [...currentCookies1, ...currentCookies2]) {
    try {
      await browser.cookies.remove({
        url: `https://${cookie.domain}${cookie.path}`,
        name: cookie.name,
      });
    } catch (error) {
      console.error('Error removing cookie:', error);
    }
  }

  // Clear localStorage
  window.localStorage.clear();

  // Set new cookies
  for (const cookie of account.cookies) {
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
    }
  }

  // Set localStorage
  for (const [key, value] of Object.entries(account.localStorage)) {
    window.localStorage.setItem(key, value);
  }

  // Update active account
  states.activeAccountId = accountId;
  await browser.storage.local.set({ accountStates: states });
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