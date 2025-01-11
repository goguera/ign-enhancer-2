import React, { useState, useEffect } from 'react';
import { browser } from 'webextension-polyfill-ts';
import { getCurrentAccountState, saveAccountState } from '@lib/utils/account-state';
import './styles.scss';

const Login: React.FC = () => {
  const [accountName, setAccountName] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'initial' | 'logged-in'>('initial');

  const handleSaveState = async () => {
    if (!accountName.trim()) {
      alert('Por favor, digite um nome para a conta');
      return;
    }

    setLoading(true);
    try {
      const state = await getCurrentAccountState();
      state.name = accountName;
      await saveAccountState(state);
      setStatus('logged-in');
      alert('Estado da conta salvo com sucesso! Você pode fechar esta janela.');
      window.close();
    } catch (error) {
      alert('Erro ao salvar o estado da conta: ' + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <h2>Criar Novo Estado de Conta</h2>
      
      <div className="instructions">
        <p>1. Faça login na sua conta IGN normalmente nesta janela</p>
        <p>2. Após fazer login, digite um nome para identificar esta conta</p>
        <p>3. Clique em "Salvar Estado" para guardar as credenciais</p>
      </div>

      <div className="login-form">
        <input
          type="text"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="Nome para identificar a conta"
          disabled={loading}
        />
        <button 
          onClick={handleSaveState}
          disabled={loading}
        >
          Salvar Estado
        </button>
      </div>

      {status === 'logged-in' && (
        <div className="success-message">
          Estado salvo com sucesso! Você pode fechar esta janela.
        </div>
      )}
    </div>
  );
};

export default Login; 