import React, { useState, useEffect } from 'react';
import { browser } from 'webextension-polyfill-ts';
import './styles.scss';

type Settings = {
  closeTabOnPost: string;
  timeToClose: string;
};

const IGNEnhancerSettings: React.FC = () => {
  const [settings, setSettings] = useState<Settings>({
    closeTabOnPost: 'no',
    timeToClose: '10',
  });

  useEffect(() => {
    const restoreOptions = async () => {
      try {
        // Replace browser.storage.local.get with your storage retrieval method
        const result = await browser.storage.local.get(['closeTabOnPost', 'timeToClose']);
        if (Object.keys(result).length !== 0) {
          setSettings({
            closeTabOnPost: result.closeTabOnPost || 'no',
            timeToClose: result.timeToClose || '10',
          });
        }
      } catch (error) {
        setSettings({ closeTabOnPost: 'yes', timeToClose: '55' }); // Default values on error
      }
    };

    restoreOptions();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
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
    browser.storage.local
      .set({
        closeTabOnPost: settings.closeTabOnPost,
        timeToClose: settings.timeToClose || '10',
      })
      .then(() => window.close());
  };

  const isNormalInteger = (str: string): boolean => {
    const n = Math.floor(Number(str));
    return n !== Infinity && String(n) === str && n >= 0;
  };

  return (
    <div style={{ height: '300px', width: '800px' }}>
      <form onSubmit={handleSubmit}>
        <h3>IGN Enhancer - Settings</h3>
        <table>
          <tbody>
            <tr>
              <td>Fechar aba ao enviar um post?</td>
              <td>
                <label>
                  Sim
                  <input
                    type="radio"
                    id="yes"
                    name="closeTabOnPost"
                    value="yes"
                    checked={settings.closeTabOnPost === 'yes'}
                    onChange={handleInputChange}
                  />
                </label>
                <label>
                  Não
                  <input
                    type="radio"
                    id="no"
                    name="closeTabOnPost"
                    value="no"
                    checked={settings.closeTabOnPost === 'no'}
                    onChange={handleInputChange}
                  />
                </label>
              </td>
            </tr>
            <tr>
              <td>
                <label htmlFor="timelimit">
                  Tempo em segundos até a aba fechar depois do post ser enviado:
                </label>
              </td>
              <td>
                <input
                  name="timeToClose"
                  id="timelimit"
                  value={settings.timeToClose}
                  onChange={handleInputChange}
                />
              </td>
            </tr>
          </tbody>
        </table>
        <button type="submit">SALVAR</button>
      </form>
    </div>
  );
};

export default IGNEnhancerSettings;
