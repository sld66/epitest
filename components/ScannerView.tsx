
import React, { useState, useEffect, useRef } from 'react';
import { User, ScannedItem } from '../types';
import { Html5Qrcode } from 'html5-qrcode';
import { GoogleGenAI } from '@google/genai';

interface ScannerViewProps {
  agents: User[];
  items: ScannedItem[];
  onScan: (code: string, agentMatricule: string) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
  onAddAgent: (agent: User) => void;
}

const STORAGE_KEY_RECIPIENTS = 'epi_recipients_list';

const ScannerView: React.FC<ScannerViewProps> = ({ agents, items, onScan, onRemove, onReset, onAddAgent }) => {
  const [isScanning, setIsScanning] = useState(true);
  const [scannerReady, setScannerReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [justScanned, setJustScanned] = useState(false);
  
  // Selection of beneficiary agent
  const [selectedAgentMatricule, setSelectedAgentMatricule] = useState<string>(agents[0]?.matricule || '');
  
  // UI for adding agent
  const [showAddAgentModal, setShowAddAgentModal] = useState(false);
  const [newAgentData, setNewAgentData] = useState<User>({ nom: '', prenom: '', matricule: '', centre: agents[0]?.centre || 'Nord' });

  const [recipients, setRecipients] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_RECIPIENTS);
    return saved ? JSON.parse(saved) : [];
  });
  const [emailInput, setEmailInput] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isLockedRef = useRef(false);
  const scannerContainerId = 'qr-reader';

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_RECIPIENTS, JSON.stringify(recipients));
  }, [recipients]);

  useEffect(() => {
    const scanner = new Html5Qrcode(scannerContainerId);
    scannerRef.current = scanner;

    const start = async () => {
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            handleSuccessfulScan(decodedText);
          },
          () => {} 
        );
        setScannerReady(true);
      } catch (err) {
        console.error("Camera error", err);
      }
    };

    start();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleSuccessfulScan = (code: string) => {
    if (isLockedRef.current || !selectedAgentMatricule) return;
    
    isLockedRef.current = true;
    onScan(code, selectedAgentMatricule);
    
    setJustScanned(true);
    if (navigator.vibrate) navigator.vibrate(150);

    if (scannerRef.current) {
      scannerRef.current.pause();
      setIsScanning(false);
    }

    setTimeout(() => {
      setJustScanned(false);
      isLockedRef.current = false;
      if (scannerRef.current) {
        scannerRef.current.resume();
        setIsScanning(true);
      }
    }, 1500);
  };

  const handleAddAgent = () => {
    if (!newAgentData.nom || !newAgentData.matricule) {
      alert("Nom et matricule requis.");
      return;
    }
    onAddAgent(newAgentData);
    setSelectedAgentMatricule(newAgentData.matricule);
    setShowAddAgentModal(false);
    setNewAgentData({ nom: '', prenom: '', matricule: '', centre: agents[0]?.centre || 'Nord' });
  };

  const addRecipient = () => {
    const email = emailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && emailRegex.test(email) && !recipients.includes(email)) {
      setRecipients([...recipients, email]);
      setEmailInput('');
    }
  };

  const generateReport = async () => {
    if (items.length === 0 || recipients.length === 0) return;

    setAnalyzing(true);
    let summary = "Rapport généré.";
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Génère un résumé court pour une distribution d'EPI. 
        Agents impliqués: ${agents.map(a => a.nom).join(', ')}.
        Objets scannés: ${items.length}.
        Détails par agent: ${agents.map(a => {
          const agentItems = items.filter(i => i.agentMatricule === a.matricule);
          return `${a.nom}: ${agentItems.map(i => i.code).join(', ')}`;
        }).join(' | ')}.
        Sois formel.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      summary = response.text || summary;
    } catch (error) {
      console.error("AI Error:", error);
    } finally {
      setAnalyzing(false);
    }

    const dateStr = new Date().toLocaleDateString('fr-FR');
    const subject = `Rapport EPI - Distribution du ${dateStr}`;
    let body = `RAPPORT DE DISTRIBUTION EPI - ${dateStr}\n`;
    body += `=========================================\n\n`;
    body += `ANALYSE GLOBALE:\n${summary}\n\n`;
    
    agents.forEach(agent => {
      const agentItems = items.filter(i => i.agentMatricule === agent.matricule);
      if (agentItems.length > 0) {
        body += `AGENT: ${agent.prenom} ${agent.nom} (${agent.matricule})\n`;
        body += `CENTRE: ${agent.centre}\n`;
        body += `EQUIPEMENTS DISTRIBUÉS:\n`;
        agentItems.forEach(item => {
          body += ` - [${item.timestamp}] Code: ${item.code}\n`;
        });
        body += `-----------------------------------------\n`;
      }
    });

    body += `\nGénéré via Suivi EPI Pro.`;
    window.location.href = `mailto:${recipients.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const selectedAgent = agents.find(a => a.matricule === selectedAgentMatricule);

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">
      {/* Agent Selector Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0 flex items-center gap-3 overflow-x-auto no-scrollbar shadow-sm">
        <button 
          onClick={() => setShowAddAgentModal(true)}
          className="flex-shrink-0 w-10 h-10 rounded-full border-2 border-dashed border-blue-400 text-blue-500 flex items-center justify-center font-bold text-xl hover:bg-blue-50 transition-colors"
        >
          +
        </button>
        <div className="h-6 w-px bg-gray-200 flex-shrink-0 mx-1"></div>
        {agents.map((agent) => (
          <button
            key={agent.matricule}
            onClick={() => setSelectedAgentMatricule(agent.matricule)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
              selectedAgentMatricule === agent.matricule
                ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105'
                : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
            }`}
          >
            {agent.prenom.charAt(0)}. {agent.nom}
          </button>
        ))}
      </div>

      {/* Current Selection Info */}
      <div className="bg-blue-50 px-4 py-2 flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-blue-500">
        <span>Scanner pour : {selectedAgent ? `${selectedAgent.prenom} ${selectedAgent.nom}` : 'Sélectionnez un agent'}</span>
        <span>{items.filter(i => i.agentMatricule === selectedAgentMatricule).length} scan(s)</span>
      </div>

      {/* Camera Section */}
      <div className="p-4 shrink-0">
        <div className="relative aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-white">
          <div id={scannerContainerId} className="w-full h-full"></div>
          
          {!scannerReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gray-900/80 z-10">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-sm font-medium">Caméra en cours...</p>
            </div>
          )}

          {justScanned && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-green-600/85 animate-in fade-in zoom-in duration-200 z-20">
              <div className="bg-white text-green-600 rounded-full p-4 mb-2 shadow-2xl">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-2xl font-black tracking-widest uppercase">Lié à {selectedAgent?.nom}</p>
            </div>
          )}
          
          <div className="absolute inset-0 pointer-events-none border-[30px] border-black/20">
             <div className="w-full h-full border-2 border-white/40 rounded-2xl relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 -mt-1 -ml-1"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 -mt-1 -mr-1"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 -mb-1 -ml-1"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 -mb-1 -mr-1"></div>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <button 
            onClick={() => setIsScanning(!isScanning)}
            className={`py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95 ${
              isScanning ? 'bg-orange-500 text-white' : 'bg-green-600 text-white'
            }`}
          >
            {isScanning ? '⏸ Pause' : '▶ Reprendre'}
          </button>
          <button 
            onClick={() => handleSuccessfulScan(`EPI-${Math.floor(Math.random() * 90000) + 10000}`)}
            className="bg-gray-100 text-gray-700 py-3 rounded-2xl font-bold border border-gray-200 active:scale-95"
          >
            ⚡ Test Rapide
          </button>
        </div>
      </div>

      {/* List Section */}
      <div className="flex-grow flex flex-col px-4 pb-4 overflow-hidden">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Historique par agent</h3>
        <div className="flex-grow overflow-y-auto space-y-4 pr-1 custom-scrollbar">
          {agents.map(agent => {
            const agentItems = items.filter(i => i.agentMatricule === agent.matricule);
            if (agentItems.length === 0) return null;
            return (
              <div key={agent.matricule} className="animate-in slide-in-from-bottom duration-300">
                <div className="flex justify-between items-center mb-1 bg-gray-200/50 px-2 py-1 rounded">
                   <span className="text-[10px] font-bold text-gray-600">{agent.prenom} {agent.nom}</span>
                   <span className="text-[10px] font-mono text-gray-400">{agent.matricule}</span>
                </div>
                <div className="space-y-1">
                  {agentItems.map(item => (
                    <div key={item.id} className="bg-white p-2 rounded-lg border border-gray-100 flex justify-between items-center text-xs shadow-sm">
                      <span className="font-mono font-bold text-gray-700">{item.code}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-400">{item.timestamp}</span>
                        <button onClick={() => onRemove(item.id)} className="text-gray-300 hover:text-red-500 p-1">×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="h-20 flex items-center justify-center text-gray-300 text-[10px] font-bold uppercase tracking-widest border-2 border-dashed border-gray-100 rounded-2xl">
              Aucun scan effectué
            </div>
          )}
        </div>

        {/* Recipients Footer */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex gap-2 mb-2">
            <input 
              type="email" placeholder="Email destinataire..."
              className="flex-grow px-3 py-2 text-xs rounded-xl border border-gray-200 outline-none"
              value={emailInput} onChange={e => setEmailInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && addRecipient()}
            />
            <button onClick={addRecipient} className="bg-blue-600 text-white px-3 rounded-xl">+</button>
          </div>
          <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
            {recipients.map(e => (
              <span key={e} className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-[9px] font-bold flex items-center gap-1 border border-blue-100">
                {e} <button onClick={() => setRecipients(recipients.filter(r => r !== e))}>×</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 bg-white border-t border-gray-100 shadow-lg">
        <button 
          onClick={generateReport}
          disabled={analyzing || items.length === 0 || recipients.length === 0}
          className={`w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all ${
            items.length === 0 || recipients.length === 0 ? 'bg-gray-100 text-gray-400' : 'bg-green-600 text-white shadow-green-100 shadow-xl'
          }`}
        >
          {analyzing ? 'Traitement IA...' : 'Finaliser Rapport'}
        </button>
      </div>

      {/* Add Agent Modal */}
      {showAddAgentModal && (
        <div className="absolute inset-0 z-50 bg-black/60 flex flex-col justify-end animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[40px] p-8 animate-in slide-in-from-bottom duration-300 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Ajouter un Agent</h2>
              <button onClick={() => setShowAddAgentModal(false)} className="text-gray-400 text-2xl">×</button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input 
                  className="bg-gray-50 p-4 rounded-2xl border-none focus:ring-2 focus:ring-blue-500" 
                  placeholder="Prénom" value={newAgentData.prenom} 
                  onChange={e => setNewAgentData({...newAgentData, prenom: e.target.value})}
                />
                <input 
                  className="bg-gray-50 p-4 rounded-2xl border-none focus:ring-2 focus:ring-blue-500" 
                  placeholder="Nom" value={newAgentData.nom} 
                  onChange={e => setNewAgentData({...newAgentData, nom: e.target.value})}
                />
              </div>
              <input 
                className="w-full bg-gray-50 p-4 rounded-2xl border-none focus:ring-2 focus:ring-blue-500 font-mono" 
                placeholder="Matricule" value={newAgentData.matricule} 
                onChange={e => setNewAgentData({...newAgentData, matricule: e.target.value.toUpperCase()})}
              />
              <button 
                onClick={handleAddAgent}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-blue-100"
              >
                Confirmer l'ajout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScannerView;
