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
    // First get all current cookies to remove them
    const currentCookies = await Promise.all([
      browser.cookies.getAll({ domain: IGNBOARDS_DOMAIN }),
      browser.cookies.getAll({ domain: WWW_IGNBOARDS_DOMAIN })
    ]).then(([cookies1, cookies2]) => [...cookies1, ...cookies2]);

    // Clear localStorage first
    window.localStorage.clear();

    // Remove all current cookies sequentially to avoid race conditions
    for (const cookie of currentCookies) {
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

    // Set new cookies sequentially
    const cookieErrors: Error[] = [];
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

    // If we couldn't set any cookies, throw an error
    if (cookieErrors.length === account.cookies.length) {
      throw new Error('Failed to set any cookies');
    }

    // Finally set localStorage
    for (const [key, value] of Object.entries(account.localStorage)) {
      window.localStorage.setItem(key, value);
    }
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