import React, { useState, useEffect } from 'react';
import { browser } from 'webextension-polyfill-ts';
import { AccountStates } from '@lib/types';
import { getAccountStates } from '@lib/utils/account-state';
import Toast, { ToastType } from './Toast';

interface QueuedMessage {
  id: string;
  accountId: string;
  threadUrl: string;
  message: string;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  retryCount: number;
  retryAfter?: number;
}

interface ToastState {
  message: string;
  type: ToastType;
}

const MessageQueueManager: React.FC = () => {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [accounts, setAccounts] = useState<AccountStates>({ accounts: {} });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadQueuedMessages();
    loadAccounts();

    // Set up auto-refresh
    const intervalId = autoRefresh ? setInterval(loadQueuedMessages, 5000) : undefined;
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh]);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  const loadQueuedMessages = async () => {
    try {
      const response = await browser.runtime.sendMessage({
        command: 'getQueuedMessages'
      });

      if (response.success && Array.isArray(response.messages)) {
        setQueuedMessages(response.messages);
      } else {
        console.error('Failed to get queued messages:', response);
      }
    } catch (error) {
      console.error('Error fetching queued messages:', error);
    }
  };

  const loadAccounts = async () => {
    try {
      const states = await getAccountStates();
      setAccounts(states);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const handleRemoveMessage = async (messageId: string) => {
    setLoading(true);
    try {
      const response = await browser.runtime.sendMessage({
        command: 'removeQueuedMessage',
        messageId
      });

      if (response.success) {
        await loadQueuedMessages();
        showToast('Mensagem removida com sucesso', 'success');
      } else {
        showToast('Falha ao remover mensagem', 'error');
      }
    } catch (error) {
      console.error('Error removing message:', error);
      showToast(`Erro ao remover mensagem: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClearCompletedMessages = async () => {
    setLoading(true);
    try {
      const response = await browser.runtime.sendMessage({
        command: 'clearCompletedMessages',
        olderThanHours: 2 // Clear messages older than 2 hours
      });

      if (response.success) {
        await loadQueuedMessages();
        showToast('Mensagens concluídas removidas com sucesso', 'success');
      } else {
        showToast('Falha ao limpar mensagens concluídas', 'error');
      }
    } catch (error) {
      console.error('Error clearing completed messages:', error);
      showToast(`Erro ao limpar mensagens: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const getAccountName = (accountId: string) => {
    const account = accounts.accounts[accountId];
    return account ? (account.profile?.displayName || account.name) : 'Conta Desconhecida';
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatStatus = (message: QueuedMessage) => {
    if (message.status === 'pending') {
      if (message.retryAfter) {
        const waitUntil = new Date(message.timestamp + (message.retryAfter * 1000));
        const now = new Date();
        
        if (waitUntil > now) {
          const seconds = Math.round((waitUntil.getTime() - now.getTime()) / 1000);
          return `Aguardando (${seconds}s)`;
        } else {
          return 'Pendente';
        }
      }
      return 'Pendente';
    } else if (message.status === 'processing') {
      return 'Processando...';
    } else if (message.status === 'completed') {
      return 'Concluído';
    } else if (message.status === 'error') {
      return `Erro (${message.retryCount} tentativas)`;
    }
    return message.status;
  };

  const formatUrl = (url: string) => {
    // Extract thread title from URL
    const match = url.match(/\/([^\/]+\.\d+)$/);
    return match ? match[1].replace(/\.\d+$/, '').replace(/-/g, ' ') : url;
  };

  const getStatusClass = (status: string) => {
    if (status.includes('Pendente')) return 'pending';
    if (status.includes('Processando')) return 'processing';
    if (status.includes('Concluído')) return 'completed';
    if (status.includes('Aguardando')) return 'waiting';
    if (status.includes('Erro')) return 'error';
    return '';
  };

  const truncateMessage = (message: string, maxLength = 100) => {
    // Strip HTML tags
    const plainText = message.replace(/<[^>]+>/g, '');
    
    if (plainText.length <= maxLength) return plainText;
    return plainText.substring(0, maxLength) + '...';
  };

  return (
    <div className="message-queue-manager">
      <h3>Fila de Mensagens</h3>
      
      <div className="queue-controls">
        <button 
          onClick={loadQueuedMessages}
          disabled={loading}
          className="refresh-button"
        >
          Atualizar
        </button>
        <label className="auto-refresh">
          <input 
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Atualização Automática
        </label>
        <button 
          onClick={handleClearCompletedMessages}
          disabled={loading || !queuedMessages.some(m => m.status === 'completed')}
          className="clear-completed"
        >
          Limpar Concluídas
        </button>
      </div>

      <div className="queue-list">
        {queuedMessages.length === 0 ? (
          <div className="no-messages">
            Nenhuma mensagem na fila.
          </div>
        ) : (
          <>
            <div className="queue-header">
              <div className="status-col">Status</div>
              <div className="account-col">Conta</div>
              <div className="thread-col">Tópico</div>
              <div className="message-col">Mensagem</div>
              <div className="time-col">Horário</div>
              <div className="actions-col">Ações</div>
            </div>
            {queuedMessages
              .sort((a, b) => {
                // Sort by status (pending/processing first, then by timestamp)
                const statusOrder = {
                  'processing': 0,
                  'pending': 1,
                  'completed': 2,
                  'error': 3
                };
                
                const statusA = statusOrder[a.status as keyof typeof statusOrder] || 99;
                const statusB = statusOrder[b.status as keyof typeof statusOrder] || 99;
                
                if (statusA !== statusB) return statusA - statusB;
                
                // Then by timestamp (newest first)
                return b.timestamp - a.timestamp;
              })
              .map(message => (
                <div key={message.id} className={`queue-item ${message.status}`}>
                  <div className={`status-col ${getStatusClass(formatStatus(message))}`}>
                    {formatStatus(message)}
                    {message.error && (
                      <div className="error-tooltip">
                        <span className="error-icon">⚠️</span>
                        <span className="tooltip-text">{message.error}</span>
                      </div>
                    )}
                  </div>
                  <div className="account-col">{getAccountName(message.accountId)}</div>
                  <div className="thread-col">
                    <a href={message.threadUrl} target="_blank" rel="noopener noreferrer">
                      {formatUrl(message.threadUrl)}
                    </a>
                  </div>
                  <div className="message-col">{truncateMessage(message.message)}</div>
                  <div className="time-col">{formatTime(message.timestamp)}</div>
                  <div className="actions-col">
                    <button
                      onClick={() => handleRemoveMessage(message.id)}
                      disabled={loading}
                      className="remove-button"
                      title="Remover da fila"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
          </>
        )}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <style>{`
        .message-queue-manager {
          margin-top: 30px;
          background: #fff;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 20px;
        }
        
        h3 {
          margin-top: 0;
          margin-bottom: 15px;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
        }
        
        .queue-controls {
          display: flex;
          gap: 15px;
          margin-bottom: 20px;
        }
        
        .auto-refresh {
          display: flex;
          align-items: center;
          gap: 5px;
          user-select: none;
        }
        
        .queue-list {
          border: 1px solid #eee;
          border-radius: 4px;
          overflow: hidden;
        }
        
        .queue-header {
          display: grid;
          grid-template-columns: 120px 150px 1fr 1.5fr 180px 60px;
          background: #f5f5f5;
          padding: 10px;
          font-weight: bold;
          border-bottom: 1px solid #ddd;
        }
        
        .queue-item {
          display: grid;
          grid-template-columns: 120px 150px 1fr 1.5fr 180px 60px;
          border-bottom: 1px solid #eee;
          padding: 10px;
        }
        
        .queue-item:last-child {
          border-bottom: none;
        }
        
        .queue-item.completed {
          background-color: #f9fff9;
        }
        
        .queue-item.error {
          background-color: #fff9f9;
        }
        
        .queue-item.processing {
          background-color: #f9f9ff;
        }
        
        .status-col {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        
        .status-col.pending {
          color: #f59f00;
        }
        
        .status-col.processing {
          color: #339af0;
        }
        
        .status-col.completed {
          color: #2f9e44;
        }
        
        .status-col.waiting {
          color: #e67700;
        }
        
        .status-col.error {
          color: #e03131;
        }
        
        .error-tooltip {
          position: relative;
          display: inline-block;
        }
        
        .error-icon {
          cursor: pointer;
        }
        
        .tooltip-text {
          visibility: hidden;
          width: 250px;
          background-color: #555;
          color: #fff;
          text-align: center;
          border-radius: 6px;
          padding: 8px;
          position: absolute;
          z-index: 1;
          bottom: 125%;
          left: 50%;
          margin-left: -125px;
          opacity: 0;
          transition: opacity 0.3s;
          font-size: 0.9em;
          font-weight: normal;
        }
        
        .error-tooltip:hover .tooltip-text {
          visibility: visible;
          opacity: 1;
        }
        
        .no-messages {
          padding: 30px;
          text-align: center;
          color: #777;
        }
        
        button {
          padding: 8px 12px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 4px;
          cursor: pointer;
        }
        
        button:hover:not(:disabled) {
          background: #f5f5f5;
        }
        
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .remove-button {
          padding: 2px 5px;
          background: none;
          border: none;
          font-size: 1.2em;
        }
        
        .remove-button:hover:not(:disabled) {
          transform: scale(1.1);
        }
      `}</style>
    </div>
  );
};

export default MessageQueueManager; 