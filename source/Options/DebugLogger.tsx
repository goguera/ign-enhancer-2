import React, { useState, useEffect, useRef } from 'react';
import { LogEntry, LogLevel, getLogs, clearLogs, exportLogs } from '@lib/utils/logging';
import Toast, { ToastType } from './Toast';

const LOG_LEVEL_COLORS = {
  [LogLevel.DEBUG]: '#6c757d',
  [LogLevel.INFO]: '#0275d8',
  [LogLevel.WARNING]: '#f0ad4e',
  [LogLevel.ERROR]: '#d9534f',
};

const DebugLogger: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [filter, setFilter] = useState({
    search: '',
    level: 'error',
    source: 'all',
  });
  const [sources, setSources] = useState<string[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const refreshIntervalRef = useRef<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLogs();

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    applyFilters();
  }, [logs, filter]);

  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = window.setInterval(fetchLogs, 5000);
    } else if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const logs = await getLogs();
      setLogs(logs);

      // Extract unique sources for filtering
      const sources = Array.from(new Set(logs.map((log) => log.source)));
      setSources(sources);
    } catch (error) {
      showToast('Erro ao carregar logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...logs];

    // Filter by search term
    if (filter.search) {
      const searchTerm = filter.search.toLowerCase();
      filtered = filtered.filter(
        (log) =>
          log.message.toLowerCase().includes(searchTerm) ||
          log.source.toLowerCase().includes(searchTerm) ||
          (log.data && JSON.stringify(log.data).toLowerCase().includes(searchTerm))
      );
    }

    // Filter by log level
    if (filter.level !== 'all') {
      filtered = filtered.filter((log) => log.level === filter.level);
    }

    // Filter by source
    if (filter.source !== 'all') {
      filtered = filtered.filter((log) => log.source === filter.source);
    }

    setFilteredLogs(filtered);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilter((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleClearLogs = async () => {
    if (confirm('Tem certeza que deseja apagar todos os logs?')) {
      setLoading(true);
      try {
        await clearLogs();
        await fetchLogs();
        showToast('Logs apagados com sucesso', 'success');
      } catch (error) {
        showToast('Erro ao apagar logs', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleExportLogs = () => {
    try {
      const jsonString = exportLogs(logs);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `ign-enhancer-logs-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('Logs exportados com sucesso', 'success');
    } catch (error) {
      showToast('Erro ao exportar logs', 'error');
    }
  };

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatData = (data: any) => {
    if (!data) return null;
    
    try {
      return <pre>{JSON.stringify(data, null, 2)}</pre>;
    } catch (error) {
      return <span>Erro ao formatar dados: {String(error)}</span>;
    }
  };

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="debug-logger">      
      <div className="debug-controls">
        <div className="filter-controls">
          <div className="search-control">
            <input
              type="text"
              name="search"
              placeholder="Pesquisar logs..."
              value={filter.search}
              onChange={handleFilterChange}
              className="search-input"
            />
          </div>
          
          <div className="select-filters">
            <select
              name="level"
              value={filter.level}
              onChange={handleFilterChange}
              className="level-select"
            >
              <option value="all">Todos os níveis</option>
              <option value={LogLevel.DEBUG}>Debug</option>
              <option value={LogLevel.INFO}>Info</option>
              <option value={LogLevel.WARNING}>Warning</option>
              <option value={LogLevel.ERROR}>Error</option>
            </select>
            
            <select
              name="source"
              value={filter.source}
              onChange={handleFilterChange}
              className="source-select"
            >
              <option value="all">Todas as fontes</option>
              {sources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="action-controls">
          <div className="auto-refresh">
            <label>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto Refresh
            </label>
          </div>
          
          <div className="buttons">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="refresh-button"
            >
              Atualizar
            </button>
            <button
              onClick={handleClearLogs}
              disabled={loading || logs.length === 0}
              className="clear-button"
            >
              Limpar Logs
            </button>
            <button
              onClick={handleExportLogs}
              disabled={loading || logs.length === 0}
              className="export-button"
            >
              Exportar Logs
            </button>
            <button
              onClick={scrollToBottom}
              className="scroll-bottom-button"
            >
              Rolar para o final
            </button>
          </div>
        </div>
      </div>

      <div className="logs-container">
        {filteredLogs.length === 0 ? (
          <div className="no-logs">
            {logs.length === 0
              ? 'Nenhum log encontrado. As ações de depuração serão registradas aqui.'
              : 'Nenhum log corresponde aos filtros selecionados.'}
          </div>
        ) : (
          <div className="logs-list">
            {filteredLogs.map((log, index) => (
              <div key={`${log.timestamp}-${index}`} className={`log-entry log-level-${log.level}`}>
                <div className="log-header">
                  <span 
                    className="log-level" 
                    style={{ color: LOG_LEVEL_COLORS[log.level] }}
                  >
                    {log.level.toUpperCase()}
                  </span>
                  <span className="log-source">{log.source}</span>
                  <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
                </div>
                <div className="log-message">{log.message}</div>
                {log.data && (
                  <div className="log-data">
                    {formatData(log.data)}
                  </div>
                )}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
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
        .debug-logger {
          margin-top: 0;
          background: #fff;
          border-radius: 6px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 15px;
        }
        
        h3 {
          margin-top: 0;
          margin-bottom: 12px;
          border-bottom: 1px solid #eee;
          padding-bottom: 8px;
          font-size: 16px;
        }
        
        .debug-controls {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 15px;
        }
        
        .filter-controls {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .search-input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        .select-filters {
          display: flex;
          gap: 10px;
        }
        
        .level-select, .source-select {
          flex: 1;
          padding: 6px 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        .action-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .auto-refresh {
          display: flex;
          align-items: center;
          user-select: none;
        }
        
        .buttons {
          display: flex;
          gap: 8px;
        }
        
        button {
          padding: 6px 10px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
        }
        
        button:hover:not(:disabled) {
          background: #f5f5f5;
        }
        
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .clear-button {
          background-color: #f8d7da;
          border-color: #f5c6cb;
          color: #721c24;
        }
        
        .clear-button:hover:not(:disabled) {
          background-color: #f5c6cb;
        }
        
        .export-button {
          background-color: #d1ecf1;
          border-color: #bee5eb;
          color: #0c5460;
        }
        
        .export-button:hover:not(:disabled) {
          background-color: #bee5eb;
        }
        
        .refresh-button {
          background-color: #fff3cd;
          border-color: #ffeeba;
          color: #856404;
        }
        
        .refresh-button:hover:not(:disabled) {
          background-color: #ffeeba;
        }
        
        .logs-container {
          border: 1px solid #eee;
          border-radius: 4px;
          max-height: 500px;
          overflow-y: auto;
        }
        
        .no-logs {
          padding: 20px;
          text-align: center;
          color: #666;
        }
        
        .logs-list {
          padding: 5px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        
        .log-entry {
          border: 1px solid #eee;
          border-radius: 4px;
          padding: 8px;
          font-size: 12px;
          background: #fafafa;
        }
        
        .log-level-error {
          border-left: 3px solid ${LOG_LEVEL_COLORS[LogLevel.ERROR]};
        }
        
        .log-level-warning {
          border-left: 3px solid ${LOG_LEVEL_COLORS[LogLevel.WARNING]};
        }
        
        .log-level-info {
          border-left: 3px solid ${LOG_LEVEL_COLORS[LogLevel.INFO]};
        }
        
        .log-level-debug {
          border-left: 3px solid ${LOG_LEVEL_COLORS[LogLevel.DEBUG]};
        }
        
        .log-header {
          display: flex;
          gap: 10px;
          margin-bottom: 5px;
          font-size: 11px;
        }
        
        .log-level {
          font-weight: 600;
        }
        
        .log-source {
          font-weight: 600;
          color: #555;
        }
        
        .log-timestamp {
          color: #777;
          margin-left: auto;
        }
        
        .log-message {
          margin-bottom: 5px;
          word-break: break-word;
        }
        
        .log-data {
          background: #f0f0f0;
          border-radius: 3px;
          padding: 5px;
          overflow-x: auto;
          margin-top: 5px;
        }
        
        .log-data pre {
          margin: 0;
          white-space: pre-wrap;
          font-size: 11px;
          font-family: monospace;
        }
      `}</style>
    </div>
  );
};

export default DebugLogger; 