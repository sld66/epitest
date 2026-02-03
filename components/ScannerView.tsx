
import React, { useState, useEffect, useRef } from 'react';
import { User, ScannedItem } from '../types';
import { Html5Qrcode } from 'html5-qrcode';
import { GoogleGenAI } from '@google/genai';
import { CENTRES_PO } from './Login';

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
  const [lastAction, setLastAction] = useState<{ type: 'agent' | 'item', name?: string, code?: string } | null>(null);
  
  // Manual input state
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInputCode, setManualInputCode] = useState('');

  // Selection of beneficiary agent
  const [selectedAgentMatricule, setSelectedAgentMatricule] = useState<string>(agents[0]?.matricule || '');
  
  // UI for adding agent
  const [showAddAgentModal, setShowAddAgentModal] = useState(false);
  const [newAgentData, setNewAgentData] = useState<User>({ 
    nom: '', 
    prenom: '', 
    matricule: '', 
    centre: agents[0]?.centre || 'Perpignan Nord' 
  });

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
    if (isLockedRef.current) return;
    isLockedRef.current = true;

    // Check if the scanned code is an agent's matricule
    const foundAgent = agents.find(a => a.matricule === code || a.matricule.toUpperCase() === code.toUpperCase());

    if (foundAgent) {
      // It's an agent! Switch focus
      setSelectedAgentMatricule(foundAgent.matricule);
      setLastAction({ type: 'agent', name: `${foundAgent.prenom} ${foundAgent.nom}` });
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } else {
      // It's an item! Assign to selected agent if possible
      if (!selectedAgentMatricule) {
        alert("Veuillez d'abord sélectionner un agent ou scanner un badge agent.");
        isLockedRef.current = false;
        return;
      }
      onScan(code, selectedAgentMatricule);
      const agent = agents.find(a => a.matricule === selectedAgentMatricule);
      setLastAction({ type: 'item', code, name: agent?.nom });
      if (navigator.vibrate) navigator.vibrate(150);
    }

    if (scannerRef.current) {
      scannerRef.current.pause();
      setIsScanning(false);
    }

    setTimeout(() => {
      setLastAction(null);
      isLockedRef.current = false;
      if (scannerRef.current) {
        scannerRef.current.resume();
        setIsScanning(true);
      }
    }, 1500);
  };

  const submitManualInput = () => {
    if (!manualInputCode.trim()) return;
    handleSuccessfulScan(manualInputCode.trim());
    setManualInputCode('');
    setShowManualInput(false);
  };

  const handleAddAgent = () => {
    if (!newAgentData.nom || !newAgentData.matricule) {
      alert("Nom et matricule requis.");
      return;
    }
    onAddAgent(newAgentData);
    setSelectedAgentMatricule(newAgentData.matricule);
    setShowAddAgentModal(false);
    setNewAgentData({ 
      nom: '', 
      prenom: '', 
      matricule: '', 
      centre: agents[0]?.centre || 'Perpignan Nord' 
    });
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
      const prompt = `Génère un résumé court pour une distribution d'EPI au sein du SDIS 66. 
        Agents impliqués: ${agents.map(a => a.nom).join(', ')}.
        Objets scannés: ${items.length}.
        Détails par agent: ${agents.map(a => {
          const agentItems = items.filter(i => i.agentMatricule === a.matricule);
          return `${a.nom} (CIS ${a.centre}): ${agentItems.map(i => i.code).join(', ')}`;
        }).join(' | ')}.
        Sois formel et utilise la terminologie pompier appropriée.`;

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
    const subject = `Rapport EPI SDIS 66 - Distribution du ${dateStr}`;
    let body = `RAPPORT DE DISTRIBUTION EPI - SDIS 66 - ${dateStr}\n`;
    body += `=========================================\n\n`;
    body += `ANALYSE GLOBALE:\n${summary}\n\n`;
    
    agents.forEach(agent => {
      const agentItems = items.filter(i => i.agentMatricule === agent.matricule);
      if (agentItems.length > 0) {
        body += `AGENT: ${agent.prenom} ${agent.nom} (${agent.matricule})\n`;
        body += `CENTRE CIS: ${agent.centre}\n`;
        body += `EQUIPEMENTS DISTRIBUÉS:\n`;
        agentItems.forEach(item => {
          body += ` - [${item.timestamp}] Code: ${item.code}\n`;
        });
        body += `-----------------------------------------\n`;
      }
    });

    body += `\nGénéré via Suivi EPI Pro (SDIS 66).`;
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
      <div className={`px-4 py-2 flex justify-between items-center text-[10px] font-black uppercase tracking-widest transition-colors ${selectedAgent ? 'bg-blue-50 text-blue-500' : 'bg-red-50 text-red-500'}`}>
        <span>Bénéficiaire : {selectedAgent ? `${selectedAgent.prenom} ${selectedAgent.nom} (CIS ${selectedAgent.centre})` : '⚠️ SCANNEZ UN BADGE AGENT'}</span>
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

          {lastAction && (
            <div className={`absolute inset-0 flex flex-col items-center justify-center text-white animate-in fade-in zoom-in duration-200 z-20 text-center px-4 ${lastAction.type === 'agent' ? 'bg-blue-600/90' : 'bg-green-600/90'}`}>
              <div className="bg-white text-inherit rounded-full p-4 mb-2 shadow-2xl mx-auto" style={{ color: lastAction.type === 'agent' ? '#2563eb' : '#16a34a' }}>
                {lastAction.type === 'agent' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <p className="text-xl font-black tracking-widest uppercase">
                {lastAction.type === 'agent' ? 'AGENT SÉLECTIONNÉ' : 'EPI ENREGISTRÉ'}
              </p>
              <p className="text-xs font-bold opacity-90 mt-1">
                {lastAction.type === 'agent' ? lastAction.name : `Affecté à ${lastAction.name}`}
              </p>
              {lastAction.code && <p className="mt-2 text-[10px] font-mono bg-black/20 px-2 py-0.5 rounded">{lastAction.code}</p>}
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

        <div className="mt-4 flex flex-col gap-3">
          {showManualInput ? (
            <div className="flex gap-2 animate-in slide-in-from-top duration-200">
              <input 
                autoFocus
                type="text" 
                placeholder="Entrez le code manuellement..." 
                className="flex-grow bg-white border border-blue-200 px-4 py-3 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                value={manualInputCode}
                onChange={e => setManualInputCode(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && submitManualInput()}
              />
              <button 
                onClick={submitManualInput}
                className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg"
              >
                Valider
              </button>
              <button 
                onClick={() => { setShowManualInput(false); setManualInputCode(''); }}
                className="bg-gray-100 text-gray-500 px-4 rounded-2xl font-bold"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setIsScanning(!isScanning)}
                className={`py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95 ${
                  isScanning ? 'bg-orange-500 text-white shadow-orange-100' : 'bg-green-600 text-white shadow-green-100'
                }`}
              >
                {isScanning ? '⏸ Pause' : '▶ Reprendre'}
              </button>
              <button 
                onClick={() => setShowManualInput(true)}
                className="bg-white text-gray-700 py-3 rounded-2xl font-bold border border-gray-200 active:scale-95 shadow-sm flex items-center justify-center gap-2"
              >
                ⌨️ Saisie Manuelle
              </button>
            </div>
          )}
        </div>
      </div>

      {/* List Section */}
      <div className="flex-grow flex flex-col px-4 pb-4 overflow-hidden">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Inventaire par agent</h3>
        <div className="flex-grow overflow-y-auto space-y-4 pr-1 custom-scrollbar">
          {agents.map(agent => {
            const agentItems = items.filter(i => i.agentMatricule === agent.matricule);
            if (agentItems.length === 0) return null;
            return (
              <div key={agent.matricule} className={`animate-in slide-in-from-bottom duration-300 ${selectedAgentMatricule === agent.matricule ? 'ring-2 ring-blue-400 ring-offset-2 rounded-2xl p-1' : ''}`}>
                <div className={`flex justify-between items-center mb-1 px-2 py-1.5 rounded-lg border ${selectedAgentMatricule === agent.matricule ? 'bg-blue-100 border-blue-200' : 'bg-blue-50/50 border-blue-100/50'}`}>
                   <span className="text-[10px] font-bold text-blue-900">{agent.prenom} {agent.nom} (CIS {agent.centre})</span>
                   <span className="text-[10px] font-mono text-blue-400">{agent.matricule}</span>
                </div>
                <div className="space-y-1 mt-1 px-1">
                  {agentItems.map(item => (
                    <div key={item.id} className="bg-white p-2.5 rounded-xl border border-gray-100 flex justify-between items-center text-xs shadow-sm">
                      <span className="font-mono font-bold text-gray-700">{item.code}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-400 font-medium">{item.timestamp}</span>
                        <button onClick={() => onRemove(item.id)} className="text-gray-300 hover:text-red-500 p-1 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="h-24 flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-100 rounded-[2rem] gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <p className="text-[10px] font-bold uppercase tracking-widest text-center px-6">Scanner un badge agent ou un équipement</p>
            </div>
          )}
        </div>

        {/* Recipients Footer */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex gap-2 mb-2">
            <input 
              type="email" placeholder="Email destinataire (ex: officier@sdis66.fr)..."
              className="flex-grow px-4 py-2.5 text-xs rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-all"
              value={emailInput} onChange={e => setEmailInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && addRecipient()}
            />
            <button onClick={addRecipient} className="bg-blue-600 text-white px-4 rounded-xl font-bold">+</button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto custom-scrollbar p-1">
            {recipients.map(e => (
              <span key={e} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-[9px] font-bold flex items-center gap-2 border border-blue-100 shadow-sm">
                {e} <button onClick={() => setRecipients(recipients.filter(r => r !== e))} className="text-blue-300 hover:text-blue-600">×</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 bg-white border-t border-gray-100 shadow-xl z-20">
        <button 
          onClick={generateReport}
          disabled={analyzing || items.length === 0 || recipients.length === 0}
          className={`w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-95 ${
            items.length === 0 || recipients.length === 0 
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' 
              : 'bg-green-600 text-white shadow-green-100 shadow-2xl hover:bg-green-700'
          }`}
        >
          {analyzing ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Analyse IA...</span>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Envoyer Rapport SDIS 66</span>
            </>
          )}
        </button>
      </div>

      {/* Add Agent Modal */}
      {showAddAgentModal && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[3rem] p-8 animate-in slide-in-from-bottom duration-300 shadow-2xl max-h-[80%] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-8">
              <div className="flex flex-col">
                <h2 className="text-2xl font-black text-gray-800">Nouvel Agent</h2>
                <p className="text-xs font-bold text-blue-500 uppercase">SDIS 66 - Pyrénées-Orientales</p>
              </div>
              <button onClick={() => setShowAddAgentModal(false)} className="bg-gray-100 text-gray-500 w-10 h-10 rounded-full flex items-center justify-center font-bold text-xl">×</button>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">Prénom</label>
                  <input 
                    className="bg-gray-50 p-4 rounded-2xl border border-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                    placeholder="Ex: Jean" value={newAgentData.prenom} 
                    onChange={e => setNewAgentData({...newAgentData, prenom: e.target.value})}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">Nom</label>
                  <input 
                    className="bg-gray-50 p-4 rounded-2xl border border-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                    placeholder="Ex: DUPONT" value={newAgentData.nom} 
                    onChange={e => setNewAgentData({...newAgentData, nom: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">N° Matricule</label>
                <input 
                  className="w-full bg-gray-50 p-4 rounded-2xl border border-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono" 
                  placeholder="Ex: 660123" value={newAgentData.matricule} 
                  onChange={e => setNewAgentData({...newAgentData, matricule: e.target.value.toUpperCase()})}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">Affectation CIS</label>
                <select 
                  className="w-full bg-gray-50 p-4 rounded-2xl border border-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={newAgentData.centre}
                  onChange={e => setNewAgentData({...newAgentData, centre: e.target.value})}
                >
                  {CENTRES_PO.map(centre => (
                    <option key={centre} value={centre}>{centre}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={handleAddAgent}
                className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl shadow-blue-100 active:scale-[0.98] transition-all"
              >
                Inscrire l'agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScannerView;
