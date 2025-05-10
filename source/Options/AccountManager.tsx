import React, { useState, useEffect } from 'react';
import { browser, Cookies } from 'webextension-polyfill-ts';
import { AccountState, AccountStates } from '@lib/types';
import {
  getCurrentAccountState,
  saveAccountState,
  getAccountStates,
  switchToAccountState,
  deleteAccountState,
  clearCurrentSession,
  startResyncing,
  checkCurrentUser,
  syncCurrentUser,
  exportAccountData,
  importAccountData,
  storeCurrentSession,
  clearBrowserData,
  ESSENTIAL_COOKIES
} from '@lib/utils/account-state';
import Toast, { ToastType } from './Toast';
import ConfirmDialog from './ConfirmDialog';

interface ToastState {
  message: string;
  type: ToastType;
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

// Session check interval in milliseconds (check every 5 minutes)
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000;

const AccountManager: React.FC = () => {
  const [accounts, setAccounts] = useState<AccountStates>({ accounts: {} });
  const [loading, setLoading] = useState(false);
  const [activatingAccountId, setActivatingAccountId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [currentUser, setCurrentUser] = useState<{ loggedIn: boolean; synced: boolean }>({ 
    loggedIn: false, 
    synced: false 
  });

  useEffect(() => {
    loadAccounts();
    checkCurrentUserStatus();

    // Set up periodic session checks
    const intervalId = setInterval(() => {
      checkCurrentUserStatus();
    }, SESSION_CHECK_INTERVAL);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirm({
      isOpen: true,
      title,
      message,
      onConfirm,
    });
  };

  const hideConfirm = () => {
    setConfirm(prev => ({ ...prev, isOpen: false }));
  };

  const loadAccounts = async () => {
    try {
      const states = await getAccountStates();
      setAccounts(states);
    } catch (error) {
      console.error('Failed to load accounts:', error);
      showToast('Erro ao carregar contas: ' + error, 'error');
    }
  };

  const checkCurrentUserStatus = async () => {
    try {
      const { profile, existingAccount } = await checkCurrentUser();
      
      // If we're not logged in but there's an active account, attempt to restore it
      if (!profile && accounts.activeAccountId) {
        const activeAccount = accounts.accounts[accounts.activeAccountId];
        
        if (activeAccount) {
          // Attempt auto-recovery after extension reload or permissions reset
          console.log('No active user detected with active account set - attempting recovery');
          await attemptAccountRecovery(accounts.activeAccountId);
          return; // Don't update UI state yet, wait for recovery attempt
        }
      }
      
      setCurrentUser({
        loggedIn: !!profile,
        synced: !!existingAccount && existingAccount.id === accounts.activeAccountId
      });

      // If we have a profile but it doesn't match the active account,
      // update the active account accordingly
      if (profile && existingAccount && existingAccount.id !== accounts.activeAccountId) {
        setAccounts(prev => ({
          ...prev,
          activeAccountId: existingAccount.id
        }));
      }
    } catch (error) {
      console.error('Failed to check current user status:', error);
      // Don't show toast here to avoid spamming the user during periodic checks
    }
  };

  // New function to attempt account recovery after extension reload
  const attemptAccountRecovery = async (accountId: string) => {
    try {
      console.log(`Attempting to recover account ${accountId}`);
      setLoading(true);
      
      // Attempt to reapply the cookies from storage
      await switchToAccountState(accountId);
      
      // Allow time for cookies to be set
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Verify if the recovery was successful
      const { profile } = await checkCurrentUser();
      
      if (profile) {
        console.log('Account recovery successful');
        setCurrentUser({
          loggedIn: true,
          synced: true
        });
        showToast('Sessão recuperada com sucesso', 'success');
      } else {
        console.log('Account recovery failed - need to relogin');
        setCurrentUser({
          loggedIn: false,
          synced: false
        });
        showToast('Sessão expirada - faça login novamente', 'warning');
      }
    } catch (error) {
      console.error('Account recovery failed:', error);
      setCurrentUser({
        loggedIn: false,
        synced: false
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncCurrentUser = async () => {
    setLoading(true);
    try {
      try {
        await storeCurrentSession(); // Store current session first
      } catch (error) {
        console.error('Failed to store current session:', error);
        // Continue with sync even if store fails
      }
      
      await syncCurrentUser();
      await loadAccounts();
      await checkCurrentUserStatus();
      showToast('Usuário atual sincronizado com sucesso!', 'success');
    } catch (error) {
      showToast('Erro ao sincronizar usuário atual: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStartNewSession = async () => {
    setLoading(true);
    try {
      // Try to store current session before clearing, but don't fail if it doesn't exist
      try {
        await storeCurrentSession();
      } catch (error) {
        console.error('Failed to store current session:', error);
        // Continue with creating a new session even if store fails
      }
      
      // Clear current session data
      await clearCurrentSession();

      // Open login page in popup window
      const window = await browser.windows.create({
        url: 'https://www.ignboards.com/login',
        type: 'popup',
        width: 1024,
        height: 768
      });

      // Set a timeout to check if the login was successful
      // This serves as a backup in case the user closes the popup without logging in
      const timeoutId = setTimeout(async () => {
        try {
          const { profile } = await checkCurrentUser();
          if (profile) {
            // User logged in successfully - save the state
            const state = await getCurrentAccountState();
            state.status = 'synced';
            await saveAccountState(state);
            await loadAccounts();
            await checkCurrentUserStatus();
            showToast('Conta criada com sucesso!', 'success');
          }
        } catch (error) {
          console.error('Error in login timeout check:', error);
        } finally {
          setLoading(false);
        }
      }, 60000);

      // Listen for window close
      browser.windows.onRemoved.addListener(async function handleWindowClose(windowId) {
        if (windowId === window.id) {
          clearTimeout(timeoutId);
          try {
            // Get current state and save it
            const state = await getCurrentAccountState();
            state.status = 'synced';
            await saveAccountState(state);
            await loadAccounts();
            await checkCurrentUserStatus();
            showToast('Conta criada com sucesso!', 'success');
          } catch (error) {
            showToast('Erro ao salvar o estado da conta: ' + error, 'error');
          } finally {
            browser.windows.onRemoved.removeListener(handleWindowClose);
            setLoading(false);
          }
        }
      });
    } catch (error) {
      showToast('Erro ao iniciar nova sessão: ' + error, 'error');
      setLoading(false);
    }
  };

  const handleCompletePendingSync = async (accountId: string) => {
    setLoading(true);
    try {
      const state = await getCurrentAccountState();
      state.status = 'synced';
      await saveAccountState(state);
      await loadAccounts();
      await checkCurrentUserStatus();
      showToast('Sincronização concluída com sucesso!', 'success');
    } catch (error) {
      showToast('Erro ao concluir sincronização: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResync = async (accountId: string) => {
    showConfirm(
      'Resetar Conta',
      'Isso irá limpar todos os dados da conta e você precisará fazer login novamente. Deseja continuar?',
      async () => {
        setLoading(true);
        try {
          // Try to store current session first, but don't fail if it doesn't exist
          try {
            await storeCurrentSession();
          } catch (error) {
            console.error('Failed to store current session:', error);
            // Continue with resync even if store fails
          }
          
          await startResyncing(accountId);
          await clearCurrentSession();

          const window = await browser.windows.create({
            url: 'https://www.ignboards.com/login',
            type: 'popup',
            width: 1024,
            height: 768
          });

          // Set a timeout similar to handleStartNewSession
          const timeoutId = setTimeout(async () => {
            try {
              const { profile } = await checkCurrentUser();
              if (profile) {
                const state = await getCurrentAccountState();
                state.status = 'synced';
                await saveAccountState(state);
                await loadAccounts();
                await checkCurrentUserStatus();
                showToast('Conta resetada com sucesso!', 'success');
              }
            } catch (error) {
              console.error('Error in resync timeout check:', error);
            } finally {
              setLoading(false);
            }
          }, 60000);

          browser.windows.onRemoved.addListener(async function handleWindowClose(windowId) {
            if (windowId === window.id) {
              clearTimeout(timeoutId);
              try {
                const state = await getCurrentAccountState();
                state.status = 'synced';
                await saveAccountState(state);
                await loadAccounts();
                await checkCurrentUserStatus();
                showToast('Conta resetada com sucesso!', 'success');
              } catch (error) {
                showToast('Erro ao salvar o estado da conta: ' + error, 'error');
              } finally {
                browser.windows.onRemoved.removeListener(handleWindowClose);
                setLoading(false);
              }
            }
          });
        } catch (error) {
          showToast('Erro ao resetar conta: ' + error, 'error');
          setLoading(false);
        }
        hideConfirm();
      }
    );
  };

  const handleSwitchAccount = async (accountId: string) => {
    // Prevent concurrent switches by checking if we're already switching or loading
    if (activatingAccountId || loading) {
      return;
    }
    
    // Store the current session state before switching
    try {
      await storeCurrentSession();
    } catch (error) {
      console.error('Failed to store current session:', error);
      // Continue with the account switch even if store fails
    }

    // Store the previous active account ID and session data for recovery
    const previousAccountId = accounts.activeAccountId;
    // Backup the current cookies just in case we need to recover
    let previousCookies: Cookies.Cookie[] = [];
    try {
      const allCookies = await Promise.all([
        browser.cookies.getAll({ domain: 'ignboards.com' }),
        browser.cookies.getAll({ domain: 'www.ignboards.com' })
      ]);
      previousCookies = [...allCookies[0], ...allCookies[1]];
    } catch (error) {
      console.error('Failed to backup cookies:', error);
    }

    // Update UI state to indicate switching is in progress
    setActivatingAccountId(accountId);
    setLoading(true);

    let switchSuccessful = false;
    try {
      // First swap the credentials in the backend
      await switchToAccountState(accountId);
      
      // Longer delay to allow cookies to properly set (increased from 1000ms to 1500ms)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Try multiple times to verify login
      let profile = null;
      let tryCount = 0;
      const maxTries = 2;
      
      while (!profile && tryCount < maxTries) {
        tryCount++;
        console.log(`Verifying login, attempt ${tryCount}`);
        
        // Then check who's actually logged in and verify it matches
        const userCheck = await checkCurrentUser();
        profile = userCheck.profile;
        
        if (!profile && tryCount < maxTries) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (!profile) {
        throw new Error('Failed to verify logged in user after switch');
      }

      // Verify that the logged in user matches the account we're switching to
      const targetAccount = accounts.accounts[accountId];
      if (targetAccount.profile?.userId !== profile.userId) {
        throw new Error('Logged in user does not match target account');
      }
      
      // Update account state in storage
      setAccounts(prev => ({
        ...prev,
        activeAccountId: accountId
      }));
      
      // Update UI state
      setCurrentUser({
        loggedIn: true,
        synced: true
      });
      
      showToast('Conta trocada com sucesso!', 'success');
      switchSuccessful = true;
    } catch (error) {
      console.error('Account switch failed:', error);
      showToast('Erro ao trocar de conta: ' + error, 'error');
      
      // Attempt to recover by switching back to the previous account
      if (previousAccountId) {
        try {
          console.log('Attempting to recover to previous account:', previousAccountId);
          
          // Clear all current cookies first to avoid conflicts
          await clearCurrentSession();
          
          // If we have previous cookies, restore them directly
          if (previousCookies.length > 0) {
            const essentialCookies = previousCookies.filter(cookie => 
              ESSENTIAL_COOKIES.includes(cookie.name)
            );
            
            if (essentialCookies.length > 0) {
              for (const cookie of essentialCookies) {
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
                } catch (cookieError) {
                  console.error('Error restoring cookie:', cookieError);
                }
              }
              
              // Allow time for cookies to be set
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Verify the recovery worked
              const { profile } = await checkCurrentUser();
              if (profile) {
                // Recovery successful, update UI
                setAccounts(prev => ({
                  ...prev,
                  activeAccountId: previousAccountId
                }));
                
                setCurrentUser({
                  loggedIn: true,
                  synced: true
                });
                
                showToast('Recuperado para a conta anterior', 'warning');
              } else {
                // Direct cookie recovery failed, try account state switch
                await switchToAccountState(previousAccountId);
                
                // Allow more time for cookies to be set
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Verify one more time
                const { profile } = await checkCurrentUser();
                if (profile) {
                  setAccounts(prev => ({
                    ...prev,
                    activeAccountId: previousAccountId
                  }));
                  
                  setCurrentUser({
                    loggedIn: true,
                    synced: true
                  });
                  
                  showToast('Recuperado para a conta anterior', 'warning');
                } else {
                  throw new Error('Recovery failed - could not restore previous session');
                }
              }
            } else {
              throw new Error('No essential cookies found for recovery');
            }
          } else {
            // Try normal account state switch as fallback
            await switchToAccountState(previousAccountId);
            
            // Check if recovery was successful
            const { profile } = await checkCurrentUser();
            if (profile) {
              // Recovery successful, update UI
              setAccounts(prev => ({
                ...prev,
                activeAccountId: previousAccountId
              }));
              
              setCurrentUser({
                loggedIn: true,
                synced: true
              });
              
              showToast('Recuperado para a conta anterior', 'warning');
            } else {
              throw new Error('Recovery failed - could not restore previous session');
            }
          }
        } catch (recoveryError) {
          console.error('Recovery failed:', recoveryError);
          // Complete failure - clear session and show error
          await clearCurrentSession();
          setCurrentUser({
            loggedIn: false,
            synced: false
          });
          showToast('Erro na recuperação: ' + recoveryError, 'error');
        }
      } else {
        // No previous account to recover to, just clear the session
        await clearCurrentSession();
        setCurrentUser({
          loggedIn: false,
          synced: false
        });
      }
    } finally {
      // If the switch wasn't successful, ensure UI reflects the current state
      if (!switchSuccessful) {
        // Reload accounts to ensure we're in sync with storage
        await loadAccounts();
        // Double check current user status
        await checkCurrentUserStatus();
      }
      
      setActivatingAccountId(null);
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    showConfirm(
      'Deletar Conta',
      'Tem certeza que deseja deletar esta conta?',
      async () => {
        setLoading(true);
        try {
          // If we're deleting the active account, store the session first
          if (accountId === accounts.activeAccountId) {
            await storeCurrentSession();
          }
          
          await deleteAccountState(accountId);
          await loadAccounts();
          await checkCurrentUserStatus();
          showToast('Conta deletada com sucesso!', 'success');
        } catch (error) {
          showToast('Erro ao deletar conta: ' + error, 'error');
        } finally {
          setLoading(false);
          hideConfirm();
        }
      }
    );
  };

  const isAccountInErrorState = (accountId: string) => {
    return accounts.activeAccountId === accountId && !currentUser.loggedIn;
  };

  const isAccountActivating = (accountId: string) => {
    return accountId === activatingAccountId;
  };

  const handleExportData = async () => {
    try {
      // Store current session before exporting
      await storeCurrentSession();
      
      const data = await exportAccountData();
      
      // Create blob and download link
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ign-enhancer-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('Backup exportado com sucesso!', 'success');
    } catch (error) {
      showToast('Erro ao exportar backup: ' + error, 'error');
    }
  };

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const jsonData = e.target?.result as string;
        
        // Try to store current session before importing, but don't fail if it doesn't exist
        try {
          await storeCurrentSession();
        } catch (error) {
          console.error('Failed to store current session:', error);
          // Continue with import even if store fails
        }
        
        await importAccountData(jsonData);
        await loadAccounts();
        await checkCurrentUserStatus();
        showToast('Backup restaurado com sucesso!', 'success');
      } catch (error) {
        showToast('Erro ao restaurar backup: ' + error, 'error');
      }
    };
    reader.readAsText(file);
    
    // Clear the input so the same file can be selected again
    event.target.value = '';
  };

  const handleClearBrowserData = () => {
    showConfirm(
      'Limpar Dados do Navegador',
      'Isso irá limpar apenas os cookies e dados do site IGN Boards no navegador, sem alterar as contas salvas na extensão. Esta ação é útil para resolver problemas de login. Deseja continuar?',
      async () => {
        setLoading(true);
        try {
          await clearBrowserData();
          // Update UI state to reflect no logged in user
          setCurrentUser({ loggedIn: false, synced: false });
          showToast('Dados do navegador relacionados ao IGN foram apagados com sucesso!', 'success');
        } catch (error) {
          showToast('Erro ao apagar dados do navegador: ' + error, 'error');
        } finally {
          setLoading(false);
          hideConfirm();
        }
      }
    );
  };

  return (
    <div className="account-manager">
      <h3>Gerenciador de Contas</h3>
      
      <div className="account-actions-bar">
        <button 
          onClick={handleStartNewSession}
          disabled={loading}
          className="create-account"
        >
          Adicionar Conta
        </button>
        <button
          onClick={handleSyncCurrentUser}
          disabled={loading}
          className={`sync-current-user ${!currentUser.loggedIn ? 'not-logged-in' : ''}`}
        >
          {currentUser.loggedIn ? (
            currentUser.synced ? 'Atualizar Sessão Atual' : 'Sincronizar Sessão Atual'
          ) : (
            <>
              <span className="status-icon">⚠️</span>
              Não Logado
            </>
          )}
        </button>
        <div className="backup-actions">
          <button
            onClick={handleExportData}
            disabled={loading}
            className="backup"
          >
            Exportar Contas
          </button>
          <label className="restore">
            <input
              type="file"
              accept=".json"
              onChange={handleImportData}
              disabled={loading}
              style={{ display: 'none' }}
            />
            <span>Restaurar Contas</span>
          </label>
          <button
            onClick={handleClearBrowserData}
            disabled={loading}
            className="clear-browser-data"
            title="Limpa cookies e dados do navegador relacionados ao IGN Boards, sem apagar contas salvas na extensão"
          >
            Limpar Dados do Navegador
          </button>
        </div>
      </div>

      <div className="accounts-list">
        <h4>Contas Salvas</h4>
        {Object.entries(accounts.accounts).length === 0 ? (
          <div className="no-accounts">
            Nenhuma conta salva. Clique em "Nova Conta" para adicionar uma.
          </div>
        ) : (
          Object.entries(accounts.accounts).map(([id, account]) => (
            <div 
              key={id} 
              className={`account-item ${
                account.status === 'pending' || account.isResyncing ? 'pending' : ''
              } ${
                isAccountInErrorState(id) ? 'error' : accounts.activeAccountId === id ? 'active' : ''
              } ${
                isAccountActivating(id) ? 'activating' : ''
              }`}
            >
              <div className="account-info">
                {account.profile?.avatarUrl && (
                  <img 
                    src={account.profile.avatarUrl} 
                    alt={account.profile.displayName}
                    className="account-avatar"
                  />
                )}
                <div className="account-details">
                  <span className="account-name">
                    {account.profile?.displayName || account.name}
                    {accounts.activeAccountId === id && (
                      <span className={`active-badge ${!currentUser.loggedIn ? 'error' : ''}`}>
                        {isAccountActivating(id) ? 'Ativando...' : !currentUser.loggedIn ? 'Erro' : 'Ativa'}
                      </span>
                    )}
                    {account.status === 'pending' && ' (Pendente)'}
                    {account.isResyncing && ' (Resincronizando)'}
                  </span>
                  {account.profile && (
                    <span className="account-username">@{account.profile.username}</span>
                  )}
                  <span className="account-timestamp">
                    {new Date(account.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="account-actions">
                {accounts.activeAccountId !== id && account.status === 'synced' && !account.isResyncing && (
                  <button
                    onClick={() => handleSwitchAccount(id)}
                    disabled={loading || !!activatingAccountId}
                    className={isAccountActivating(id) ? 'activating' : ''}
                  >
                    {isAccountActivating(id) ? 'Ativando...' : 'Ativar'}
                  </button>
                )}
                {account.status === 'synced' && !account.isResyncing && (
                  <button
                    onClick={() => handleResync(id)}
                    disabled={loading}
                    className="resync"
                  >
                    Resetar
                  </button>
                )}
                {(account.status === 'pending' || account.isResyncing) && (
                  <button
                    onClick={() => handleCompletePendingSync(id)}
                    disabled={loading}
                    className="complete-sync"
                  >
                    Concluir Sincronização
                  </button>
                )}
                <button
                  onClick={() => handleDeleteAccount(id)}
                  disabled={loading}
                  className="delete"
                >
                  Deletar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <ConfirmDialog
        isOpen={confirm.isOpen}
        title={confirm.title}
        message={confirm.message}
        onConfirm={confirm.onConfirm}
        onCancel={hideConfirm}
      />
    </div>
  );
};

export default AccountManager; 