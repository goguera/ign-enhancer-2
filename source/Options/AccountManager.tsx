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
  createPendingAccount,
  startResyncing,
  fetchUserProfile,
} from '@lib/utils/account-state';
import Toast, { ToastType } from './Toast';

interface ToastState {
  message: string;
  type: ToastType;
}

const AccountManager: React.FC = () => {
  const [accounts, setAccounts] = useState<AccountStates>({ accounts: {} });
  const [loading, setLoading] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  const loadAccounts = async () => {
    const states = await getAccountStates();
    setAccounts(states);
  };

  const handleStartNewSession = () => {
    setNewAccountName('');
    setShowNameInput(true);
  };

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newAccountName.trim()) {
      return;
    }

    setShowNameInput(false);
    setLoading(true);
    
    try {
      // Clear current session data
      await clearCurrentSession();
      
      // Create a pending account with the name
      await createPendingAccount(newAccountName);

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
      showToast('Erro ao iniciar nova sessão: ' + error, 'error');
      setLoading(false);
    }
  };

  const handleResync = async (accountId: string) => {
    setLoading(true);
    try {
      // Start resyncing process
      await startResyncing(accountId);
      
      // Clear current session
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
      showToast('Erro ao iniciar resincronização: ' + error, 'error');
      setLoading(false);
    }
  };

  const handleSwitchAccount = async (accountId: string) => {
    setLoading(true);
    try {
      await switchToAccountState(accountId);
      await loadAccounts();
      showToast('Conta trocada com sucesso! A página será recarregada.', 'success');
    //   setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      showToast('Erro ao trocar de conta: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('Tem certeza que deseja deletar esta conta?')) {
      return;
    }

    setLoading(true);
    try {
      await deleteAccountState(accountId);
      await loadAccounts();
      showToast('Conta deletada com sucesso!', 'success');
    } catch (error) {
      showToast('Erro ao deletar conta: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResyncProfile = async () => {
    if (!accounts.activeAccountId) {
      showToast('Nenhuma conta ativa no momento', 'error');
      return;
    }

    setLoading(true);
    try {
      const profile = await fetchUserProfile();
      if (!profile) {
        throw new Error('Não foi possível obter os dados do perfil');
      }

      const states = await getAccountStates();
      const account = states.accounts[accounts.activeAccountId];
      if (!account) {
        throw new Error('Conta ativa não encontrada');
      }

      account.profile = profile;
      await saveAccountState(account);
      await loadAccounts();
      showToast('Dados do perfil atualizados com sucesso!', 'success');
    } catch (error) {
      showToast('Erro ao atualizar dados do perfil: ' + error, 'error');
    } finally {
      setLoading(false);
    }
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
          Nova Sessão
        </button>
        {accounts.activeAccountId && (
          <button
            onClick={handleResyncProfile}
            disabled={loading}
            className="resync-profile"
          >
            Atualizar Dados do Perfil
          </button>
        )}
      </div>

      {showNameInput && (
        <div className="modal-overlay">
          <div className="modal">
            <h4>Nova Conta</h4>
            <form onSubmit={handleNameSubmit}>
              <input
                type="text"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                placeholder="Nome para identificar a conta"
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" onClick={() => setShowNameInput(false)}>
                  Cancelar
                </button>
                <button type="submit" className="save-account">
                  Continuar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="accounts-list">
        <h4>Contas Salvas</h4>
        {Object.entries(accounts.accounts).map(([id, account]) => (
          <div key={id} className={`account-item ${account.status === 'pending' || account.isResyncing ? 'pending' : ''}`}>
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
                  {accounts.activeAccountId === id && ' (Ativa)'}
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
                  disabled={loading}
                >
                  Ativar
                </button>
              )}
              {account.status === 'synced' && !account.isResyncing && (
                <button
                  onClick={() => handleResync(id)}
                  disabled={loading}
                  className="resync"
                >
                  Resincronizar
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
    </div>
  );
};

export default AccountManager; 