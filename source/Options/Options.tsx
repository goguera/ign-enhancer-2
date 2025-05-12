import * as React from 'react';
import { useState, useEffect } from 'react';
import './styles.scss';
import { Settings } from '../lib/types';
import {
  setSettings as setExtensionSettings,
  getSettings,
  defaultSettings,
  setConfig,
} from '@lib/utils/options';
import AccountManager from './AccountManager';
import DebugLogger from './DebugLogger';
import AboutTab from './AboutTab';

const isDevelopment = process.env.NODE_ENV === 'development';

// Tab types
type TabType = 'general' | 'quickFlood' | 'accounts' | 'debug' | 'about';

const IGNEnhancerSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Load settings on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await getSettings();
        console.log('Loaded settings:', savedSettings);
        setSettings(savedSettings);
      } catch (error) {
        setErrorMessage('Falha ao carregar configurações');
        console.error(error);
      }
    };

    loadSettings();
  }, []);

  // Switch to general tab if user is on debug tab and disables logging
  useEffect(() => {
    if (activeTab === 'debug' && settings.enableLogs !== 'yes') {
      setActiveTab('general');
    }
  }, [settings.enableLogs, activeTab]);

  // Handle saving settings with debounce
  const saveSettings = async () => {
    setSaveStatus('saving');

    try {
      // Special validation for number fields before saving
      const adjustedSettings = { ...settings };
      
      // Ensure threadFrameHeight is valid
      if (adjustedSettings.threadFrameHeight) {
        const heightValue = parseInt(adjustedSettings.threadFrameHeight);
        if (isNaN(heightValue) || heightValue < 600 || heightValue > 1200) {
          adjustedSettings.threadFrameHeight = '600'; // Reset to default if invalid
        } else {
          adjustedSettings.threadFrameHeight = String(heightValue); // Ensure it's a string
        }
      } else {
        adjustedSettings.threadFrameHeight = '600'; // Use default if missing
      }
      
      console.log('Saving settings:', adjustedSettings);
      await setExtensionSettings(adjustedSettings);
      setSaveStatus('saved');
      // Reset after showing saved message
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setErrorMessage('Falha ao salvar configurações');
      console.error(error);
      setSaveStatus('idle');
    }
  };

  // Special function to save thread height
  const saveThreadHeight = async (height: string) => {
    console.log(`Explicitly saving threadFrameHeight: ${height}`);
    try {
      // Convert to number and validate
      const numHeight = parseInt(height);
      if (!isNaN(numHeight) && numHeight >= 600 && numHeight <= 1200) {
        // Save directly with setConfig to ensure it's saved
        await setExtensionSettings({ threadFrameHeight: String(numHeight) });
        console.log(`Thread height saved successfully: ${numHeight}`);
        
        // Update local state
        setSettings(prev => ({ 
          ...prev, 
          threadFrameHeight: String(numHeight) 
        }));
        
        // Show saved status
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        console.error(`Invalid thread height: ${height}`);
      }
    } catch (error) {
      console.error('Error saving thread height:', error);
      setErrorMessage('Falha ao salvar altura do frame');
    }
  };

  // Handle toggle changes
  const handleToggleChange = (key: keyof Settings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: prev[key] === 'yes' ? 'no' : 'yes',
    }));
    setSaveStatus('idle');
    setTimeout(saveSettings, 500);
  };

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Update UI immediately
    setSettings(prev => ({ ...prev, [name]: value }));
    
    // Handle thread height separately
    if (name === 'threadFrameHeight') {
      console.log('Thread height input change:', value);
      
      // Don't attempt to save incomplete or invalid input
      if (value === '' || isNaN(parseInt(value))) {
        return;
      }
      
      // For valid numeric values, schedule a save
      const numValue = parseInt(value);
      if (numValue >= 600 && numValue <= 1200) {
        setSaveStatus('saving');
        // Use a longer delay for thread height to allow for typing
        setTimeout(() => saveThreadHeight(value), 1000);
      }
    } else {
      // For all other settings, use the normal save mechanism
      setSaveStatus('idle');
      setTimeout(saveSettings, 500);
    }
  };

  // Render save status indicator
  const renderSaveStatus = () => {
    if (saveStatus === 'idle') return null;
    if (saveStatus === 'saving') return <span className="save-status saving">Salvando...</span>;
    return <span className="save-status saved">Configurações salvas!</span>;
  };

  // Change tab with state management
  const changeTab = (tab: TabType) => {
    // Redirect to general tab if debug tab is selected but logging is disabled
    if (tab === 'debug' && settings.enableLogs !== 'yes') {
      tab = 'general';
    }

    // Scroll to top when changing tabs
    const tabContent = document.querySelector('.tab-content');
    if (tabContent) {
      const activePane = tabContent.querySelector('.tab-pane.active');
      if (activePane) {
        activePane.scrollTop = 0;
      }
    }
    setActiveTab(tab);
  };

  return (
    <div className="container">
      <header className="header">
        <div className="logo-container">
          <img src="assets/icons/logo.png" alt="IGN Logo" className="logo" />
          <h1>
            <span>IGN</span> Enhancer
          </h1>
        </div>
        <p>Personalize sua experiência de navegação no IGN</p>
      </header>

      <div className="settings-section">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => changeTab('general')}
            aria-selected={activeTab === 'general'}
          >
            Geral
          </button>
          <button
            className={`tab ${activeTab === 'quickFlood' ? 'active' : ''}`}
            onClick={() => changeTab('quickFlood')}
            aria-selected={activeTab === 'quickFlood'}
          >
            Quick Flood
          </button>
          <button
            className={`tab ${activeTab === 'accounts' ? 'active' : ''}`}
            onClick={() => changeTab('accounts')}
            aria-selected={activeTab === 'accounts'}
          >
            Contas
          </button>
          {settings.enableLogs === 'yes' && (
            <button
              className={`tab ${activeTab === 'debug' ? 'active' : ''}`}
              onClick={() => changeTab('debug')}
              aria-selected={activeTab === 'debug'}
            >
              Debug
            </button>
          )}
          <button
            className={`tab ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => changeTab('about')}
            aria-selected={activeTab === 'about'}
          >
            Sobre
          </button>
        </div>

        <div className="tab-content">
          <div className={`tab-pane ${activeTab === 'general' ? 'active' : ''}`}>
            <h2>Configurações Gerais</h2>

            <div className="setting-group">
              <div className="setting-card">
                <div className="setting-card-header">
                  <h3>Fechar aba após postar</h3>
                </div>
                <div className="setting-card-content">
                  <div
                    className="setting-item checkbox-item"
                    onClick={() => handleToggleChange('closeTabOnPost')}
                  >
                    <div className="setting-label">
                      <label htmlFor="closeTabOnPost">Ativo</label>
                      <span className="setting-description">
                        Fechar a aba automaticamente após postar
                      </span>
                    </div>
                    <div className="setting-control">
                      <label className="toggle">
                        <input
                          type="checkbox"
                          id="closeTabOnPost"
                          checked={settings.closeTabOnPost === 'yes'}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleToggleChange('closeTabOnPost');
                          }}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>

                  {settings.closeTabOnPost === 'yes' && (
                    <div className="setting-item setting-dependent">
                      <div className="setting-label">
                        <label htmlFor="timeToClose">Tempo para fechar (segundos)</label>
                        <span className="setting-description">
                          Segundos para esperar antes de fechar a aba
                        </span>
                      </div>
                      <div className="setting-control">
                        <input
                          type="number"
                          id="timeToClose"
                          name="timeToClose"
                          min="1"
                          max="30"
                          value={settings.timeToClose}
                          onChange={handleInputChange}
                          className="number-input"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isDevelopment && (
              <div className="setting-group">
                <div
                  className="setting-card advanced-card"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                >
                  <div className="setting-card-header">
                    <h3>Opções Avançadas</h3>
                    <div className="expand-icon">{showAdvancedOptions ? '▼' : '▶'}</div>
                  </div>

                  {showAdvancedOptions && (
                    <div className="setting-card-content">
                      <div
                        className="setting-item checkbox-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleChange('enableLogs');
                        }}
                      >
                        <div className="setting-label">
                          <label htmlFor="enableLogs">Habilitar Logs de Depuração</label>
                          <span className="setting-description">
                            Ativar o registro de logs para depuração (pode impactar a performance)
                          </span>
                        </div>
                        <div className="setting-control">
                          <label className="toggle">
                            <input
                              type="checkbox"
                              id="enableLogs"
                              checked={settings.enableLogs === 'yes'}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleToggleChange('enableLogs');
                              }}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={`tab-pane ${activeTab === 'quickFlood' ? 'active' : ''}`}>
            <h2>Configurações do Quick Flood</h2>

            <div className="setting-group">
              <div className="setting-card">
                <div className="setting-card-header">
                  <h3>Ativar Quick Flood</h3>
                </div>
                <div className="setting-card-content">
                  <div
                    className="setting-item checkbox-item"
                    onClick={() => handleToggleChange('enableQuickFlood')}
                  >
                    <div className="setting-label">
                      <label htmlFor="enableQuickFlood">Ativo</label>
                      <span className="setting-description">
                        Ativar funcionalidade de postagem rápida
                      </span>
                    </div>
                    <div className="setting-control">
                      <label className="toggle">
                        <input
                          type="checkbox"
                          id="enableQuickFlood"
                          checked={settings.enableQuickFlood === 'yes'}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleToggleChange('enableQuickFlood');
                          }}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {settings.enableQuickFlood === 'yes' && (
              <>
                <div className="setting-group">
                  <div className="setting-card">
                    <div className="setting-card-header">
                      <h3>Comportamento após postar</h3>
                    </div>
                    <div className="setting-card-content">
                      <div
                        className="setting-item checkbox-item"
                        onClick={() => handleToggleChange('autoCollapseThreadAfterPosting')}
                      >
                        <div className="setting-label">
                          <label htmlFor="autoCollapseThreadAfterPosting">Colapsar tópico</label>
                          <span className="setting-description">
                            Colapsar automaticamente o tópico após enviar resposta
                          </span>
                        </div>
                        <div className="setting-control">
                          <label className="toggle">
                            <input
                              type="checkbox"
                              id="autoCollapseThreadAfterPosting"
                              checked={settings.autoCollapseThreadAfterPosting === 'yes'}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleToggleChange('autoCollapseThreadAfterPosting');
                              }}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                        </div>
                      </div>

                      <div
                        className="setting-item checkbox-item"
                        onClick={() => handleToggleChange('autoOpenNextThreadAfterPosting')}
                      >
                        <div className="setting-label">
                          <label htmlFor="autoOpenNextThreadAfterPosting">
                            Expandir próximo tópico
                          </label>
                          <span className="setting-description">
                            Expandir automaticamente o próximo tópico da lista após enviar resposta
                          </span>
                        </div>
                        <div className="setting-control">
                          <label className="toggle">
                            <input
                              type="checkbox"
                              id="autoOpenNextThreadAfterPosting"
                              checked={settings.autoOpenNextThreadAfterPosting === 'yes'}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleToggleChange('autoOpenNextThreadAfterPosting');
                              }}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="setting-group">
                  <div className="setting-card">
                    <div className="setting-card-header">
                      <h3>Aparência</h3>
                    </div>
                    <div className="setting-card-content">
                      <div className="setting-item">
                        <div className="setting-label">
                          <label htmlFor="threadFrameHeight">
                            Altura do frame da thread (pixels)
                          </label>
                          <span className="setting-description">
                            Ajustar a altura do frame onde as threads são exibidas
                          </span>
                        </div>
                        <div className="setting-control">
                          <div className="input-with-suffix">
                            <input
                              type="number"
                              id="threadFrameHeight"
                              name="threadFrameHeight"
                              min="600"
                              max="1200"
                              value={settings.threadFrameHeight}
                              onChange={handleInputChange}
                              onFocus={(e) => e.target.select()}
                              onBlur={(e) => {
                                // Validate and correct value on blur
                                const numValue = parseInt(e.target.value);
                                if (isNaN(numValue) || numValue < 600) {
                                  // Reset to minimum and save
                                  saveThreadHeight('600');
                                } else if (numValue > 1200) {
                                  // Cap at maximum and save
                                  saveThreadHeight('1200');
                                } else {
                                  // Save valid value
                                  saveThreadHeight(String(numValue));
                                }
                              }}
                              className="number-input"
                            />
                            <span className="input-suffix">px</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={`tab-pane accounts-tab ${activeTab === 'accounts' ? 'active' : ''}`}>
            <h2>Gerenciador de Contas</h2>
            <AccountManager />
          </div>

          {settings.enableLogs === 'yes' && (
            <div className={`tab-pane debug-tab ${activeTab === 'debug' ? 'active' : ''}`}>
              <h2>Logs de Depuração</h2>
              <DebugLogger />
            </div>
          )}

          <div className={`tab-pane about-tab ${activeTab === 'about' ? 'active' : ''}`}>
            <h2>Sobre o IGN Enhancer</h2>
            <AboutTab />
          </div>
        </div>

        <div className="status-bar">
          {errorMessage && <div className="error-message">{errorMessage}</div>}
          {renderSaveStatus()}
        </div>
      </div>
    </div>
  );
};

export default IGNEnhancerSettings;
