import React from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal confirm-dialog">
        <h4>{title}</h4>
        <p className="confirm-message">{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel} className='cancel'>
            Cancelar
          </button>
          <button onClick={onConfirm} className="confirm">
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog; 