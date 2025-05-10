import React, { useState, useEffect } from 'react';
import { browser } from 'webextension-polyfill-ts';
import './styles.scss';
import { Settings, BooleanString } from '../lib/types';
import { setSettings as setExtensionSettings } from '@lib/utils/options';
import AccountManager from './AccountManager';
import MessageQueueManager from './MessageQueueManager';
import DebugLogger from './DebugLogger';

const defaultSettings: Settings = {
  closeTabOnPost: 'no',
  timeToClose: '10',
  maxNumberOfVisibleThreadsBeforeHalt: '200',
  showQueuePopover: 'yes',
};

const IGNEnhancerSettings: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  useEffect(() => {
    const restoreOptions = async () => {
      try {
        // Replace browser.storage.local.get with your storage retrieval method
        const result = await browser.storage.local.get(['closeTabOnPost', 'timeToClose', 'maxNumberOfVisibleThreadsBeforeHalt', 'showQueuePopover']);
        if (Object.keys(result).length !== 0) {
          setSettings({
            closeTabOnPost: result.closeTabOnPost || 'no',
            timeToClose: result.timeToClose || '10',
            maxNumberOfVisibleThreadsBeforeHalt: result.maxNumberOfVisibleThreadsBeforeHalt || '200',
            showQueuePopover: result.showQueuePopover || 'yes',
          });
        }
      } catch (error) {
        setSettings(defaultSettings); // Default values on error
      }
    };

    restoreOptions();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSettingChange = (name: keyof Settings, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNormalInteger(settings.timeToClose)) {
      alert('Precisa ser um número inteiro e positivo, animal');
      return;
    }
    setExtensionSettings({
      closeTabOnPost: settings.closeTabOnPost,
      timeToClose: settings.timeToClose || '10',
      maxNumberOfVisibleThreadsBeforeHalt: settings.maxNumberOfVisibleThreadsBeforeHalt || '200',
      showQueuePopover: settings.showQueuePopover,
    }).then(() => window.close());
  };

  const isNormalInteger = (str: string): boolean => {
    const n = Math.floor(Number(str));
    return n !== Infinity && String(n) === str && n >= 0;
  };

  return (
    <div className="container">
      <div className="header">
        <h1>IGN Enhancer 2</h1>
        <p>Configurações do addon</p>
      </div>

      <div className="sections">
        {/* Settings Section */}
        <div className="section">
          <h2>Configurações Gerais</h2>
          <form onSubmit={handleSubmit}>
            <div className="settings">
              <div className="setting">
                <label htmlFor="close-tab-on-post">Fechar aba após postar</label>
                <select
                  id="close-tab-on-post"
                  name="closeTabOnPost"
                  value={settings.closeTabOnPost || 'no'}
                  onChange={handleInputChange}
                >
                  <option value="yes">Sim</option>
                  <option value="no">Não</option>
                </select>
              </div>

              <div className="setting">
                <label htmlFor="time-to-close">Tempo para fechar aba (segundos)</label>
                <input
                  type="number"
                  id="time-to-close"
                  name="timeToClose"
                  value={settings.timeToClose || '2'}
                  onChange={handleInputChange}
                  min="1"
                  max="10"
                />
              </div>

              <div className="setting">
                <label htmlFor="max-number-of-visible-threads-before-halt">
                  Número máximo de tópicos visíveis antes de esconder
                </label>
                <input
                  type="number"
                  id="max-number-of-visible-threads-before-halt"
                  name="maxNumberOfVisibleThreadsBeforeHalt"
                  value={settings.maxNumberOfVisibleThreadsBeforeHalt || '20'}
                  onChange={handleInputChange}
                  min="5"
                  max="100"
                />
              </div>
              
              <div className="setting">
                <label htmlFor="show-queue-popover">Mostrar fila de mensagens nas páginas do fórum?</label>
                <select
                  id="show-queue-popover"
                  name="showQueuePopover"
                  value={settings.showQueuePopover || 'yes'}
                  onChange={handleInputChange}
                >
                  <option value="yes">Sim</option>
                  <option value="no">Não</option>
                </select>
              </div>
              
              <div className="setting-actions">
                <button type="submit" className="save-settings">
                  Salvar Configurações
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Account Manager Section */}
        <AccountManager />
        
        {/* Message Queue Manager Section */}
        <MessageQueueManager />
        
        {/* Debug Logger Section */}
        <DebugLogger />
      </div>
    </div>
  );
};

export default IGNEnhancerSettings;
