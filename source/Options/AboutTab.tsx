import * as React from 'react';

const AboutTab: React.FC = () => {
  const handleCheckUpdates = () => {
    // Placeholder for checking updates functionality
    console.log('Checking for updates...');
    // This would typically connect to a version check API
  };

  const handleReportIssue = () => {
    // Placeholder for report issue functionality
    console.log('Reporting an issue...');
    // This would typically open an issue form or link to GitHub issues
    window.open('https://github.com/yourusername/ign-enhancer-2/issues', '_blank');
  };

  return (
    <div className="about-content">
      <div className="version-info">
        <span className="version-label">Versão:</span>
        <span className="version-number">2.0.0</span>
      </div>
      
      <p>O IGN Enhancer é uma extensão de navegador que melhora sua experiência de navegação no IGN com recursos e melhorias personalizados.</p>
      
      <div className="feature-list">
        <h3>Principais Recursos:</h3>
        <ul>
          <li>Fechamento automático de abas após postar</li>
          <li>Funcionalidade Quick Flood</li>
          <li>Gerenciamento de contas</li>
          <li>Experiência de navegação aprimorada</li>
        </ul>
      </div>
      
      <div className="credits">
        <h3>Criado Por:</h3>
        <p>Equipe IGN Enhancer</p>
      </div>
      
      <div className="buttons">
        <button className="btn primary" onClick={handleCheckUpdates}>
          Verificar Atualizações
        </button>
        <button className="btn secondary" onClick={handleReportIssue}>
          Reportar um Problema
        </button>
      </div>
    </div>
  );
};

export default AboutTab; 