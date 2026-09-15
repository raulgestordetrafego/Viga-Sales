import React, { useState, useEffect } from 'react';
import { LeadStatus } from '../types';
import { XIcon } from './icons';

interface ActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (details: { valorVenda?: number; motivoPerda?: string }) => void;
    status: LeadStatus | null;
}

const ActionModal: React.FC<ActionModalProps> = ({ isOpen, onClose, onSave, status }) => {
    const [inputValue, setInputValue] = useState('');

    useEffect(() => {
        if (isOpen) {
            setInputValue('');
        }
    }, [isOpen]);
    
    if (!isOpen || !status) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (status === LeadStatus.Venda) {
            onSave({ valorVenda: parseFloat(inputValue) });
        } else if (status === LeadStatus.Perdido) {
            onSave({ motivoPerda: inputValue });
        }
    };

    const isVenda = status === LeadStatus.Venda;
    const title = isVenda ? 'Registrar Venda' : 'Marcar como Perdido';
    const label = isVenda ? 'Valor da Venda (R$)' : 'Motivo da Perda';
    const inputType = isVenda ? 'number' : 'text';
    const placeholder = isVenda ? 'Ex: 5500.00' : 'Ex: Preço, Concorrência...';


    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-5 border-b flex justify-between items-center">
                    <h2 className="text-lg font-bold">{title}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <label htmlFor="action-input" className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                        <input
                            id="action-input"
                            type={inputType}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            required
                            {...(isVenda && { min: "0.01", step: "0.01" })}
                            className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500"
                            placeholder={placeholder}
                        />
                    </div>
                    <div className="p-4 bg-slate-50 rounded-b-lg flex justify-end space-x-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">Cancelar</button>
                        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-orange-500 border border-transparent rounded-md hover:bg-orange-700">Confirmar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ActionModal;