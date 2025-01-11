import React, { useState, useEffect } from 'react';
import { browser } from 'webextension-polyfill-ts';
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
    const states = await getAccountStates();
    setAccounts(states);
  };

  const checkCurrentUserStatus = async () => {
    const { profile, existingAccount } = await checkCurrentUser();
    setCurrentUser({
      loggedIn: !!profile,
      synced: !!existingAccount && existingAccount.id === accounts.activeAccountId
    });
  };

  const handleSyncCurrentUser = async () => {
    setLoading(true);
    try {
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
      // Clear current session data
      await clearCurrentSession();

      // Open login page in popup window
      const window = await browser.windows.create({
        url: 'https://www.ignboards.com/login',
        type: 'popup',
        width: 1024,
        height: 768
      });

      // Listen for window close
      browser.windows.onRemoved.addListener(async function handleWindowClose(windowId) {
        if (windowId === window.id) {
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
          await startResyncing(accountId);
          await clearCurrentSession();

          const window = await browser.windows.create({
            url: 'https://www.ignboards.com/login',
            type: 'popup',
            width: 1024,
            height: 768
          });

          browser.windows.onRemoved.addListener(async function handleWindowClose(windowId) {
            if (windowId === window.id) {
              try {
                const state = await getCurrentAccountState();
                state.status = 'synced';
                await saveAccountState(state);
                await loadAccounts();
                showToast('Conta resetada com sucesso!', 'success');
              } catch (error) {
                showToast('Erro ao salvar o estado da conta: ' + error, 'error');
              } finally {
                browser.windows.onRemoved.removeListener(handleWindowClose);
                setLoading(false);
              }
            }
          });

          await loadAccounts();
        } catch (error) {
          showToast('Erro ao resetar conta: ' + error, 'error');
          setLoading(false);
        }
        hideConfirm();
      }
    );
  };

  const handleSwitchAccount = async (accountId: string) => {
    // Prevent concurrent switches by checking if we're already switching
    if (activatingAccountId) {
      return;
    }

    // Store the previous active account ID in case we need to revert
    const previousAccountId = accounts.activeAccountId;

    // Optimistically update the UI
    setActivatingAccountId(accountId);
    setAccounts(prev => ({
      ...prev,
      activeAccountId: accountId
    }));

    try {
      // First swap the credentials in the backend
      await switchToAccountState(accountId);
      
      // Then check who's actually logged in and verify it matches
      const { profile } = await checkCurrentUser();
      
      if (!profile) {
        throw new Error('Failed to verify logged in user after switch');
      }

      // Verify that the logged in user matches the account we're switching to
      const targetAccount = accounts.accounts[accountId];
      if (targetAccount.profile?.userId !== profile.userId) {
        throw new Error('Logged in user does not match target account');
      }
      
      // Update UI state
      setCurrentUser({
        loggedIn: true,
        synced: true
      });
      
      showToast('Conta trocada com sucesso!', 'success');
    } catch (error) {
      showToast('Erro ao trocar de conta: ' + error, 'error');
      
      // On error, clear the session and revert UI state
      await clearCurrentSession();
      
      setCurrentUser({
        loggedIn: false,
        synced: false
      });
      
      // Revert the active account to the previous one
      setAccounts(prev => ({
        ...prev,
        activeAccountId: previousAccountId
      }));
      
      // Reload accounts to ensure we're in sync with storage
      await loadAccounts();
    } finally {
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
          await deleteAccountState(accountId);
          await loadAccounts();
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
        await importAccountData(jsonData);
        await loadAccounts();
        showToast('Backup restaurado com sucesso!', 'success');
        window.location.reload();
      } catch (error) {
        showToast('Erro ao restaurar backup: ' + error, 'error');
      }
    };
    reader.readAsText(file);
    
    // Clear the input so the same file can be selected again
    event.target.value = '';
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
          Nova Conta
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
        </div>
      </div>

      <div className="accounts-list">
        <h4>Contas Salvas</h4>
        {Object.entries(accounts.accounts).map(([id, account]) => (
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
        ))}
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