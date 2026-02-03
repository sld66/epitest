
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
  onImportData?: (agents: User[], items: ScannedItem[]) => void;
}

const STORAGE_KEY_RECIPIENTS = 'epi_recipients_list';

const ScannerView: React.FC<ScannerViewProps> = ({ agents, items, onScan, onRemove, onReset, onAddAgent, onImportData }) => {
  const [isScanning, setIsScanning] = useState(true);
  const [scannerReady, setScannerReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [lastAction, setLastAction] = useState<{ type: 'agent' | 'item' | 'sync', name?: string, code?: string } | null>(null);
  
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInputCode, setManualInputCode] = useState('');
  const [showSyncModal, setShowSyncModal] = useState(false);

  const [selectedAgentMatricule, setSelectedAgentMatricule] = useState<string>(agents[0]?.matricule || '');
  
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
    const scanner = new Html5Qrcode(scannerContainerId, { 
      verbose: false,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    });
    scannerRef.current = scanner;

    const start = async () => {
      try {
        const config = { 
          fps: 20, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        };
        
        await scanner.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => handleSuccessfulScan(decodedText),
          () => {} 
        );
        
        setScannerReady(true);
        
        const track = scanner.getRunningTrack();
        if (track) {
          const capabilities = track.getCapabilities() as any;
          if (capabilities.torch) {
            setHasFlash(true);
          }
        }
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

  const toggleFlash = async () => {
    if (scannerRef.current && hasFlash) {
      const track = scannerRef.current.getRunningTrack();
      if (track) {
        const newState = !flashOn;
        await track.applyConstraints({
          advanced: [{ torch: newState } as any]
        });
        setFlashOn(newState);
      }
    }
  };

  const handleSuccessfulScan = (code: string) => {
    if (isLockedRef.current) return;
    isLockedRef.current = true;
    
    const cleanedCode = code.trim().toUpperCase();

    // 1. SYNC Check
    try {
      if (cleanedCode.startsWith('{"SYNC"')) {
        const syncData = JSON.parse(code);
        if (syncData.sync && syncData.agents && onImportData) {
          onImportData(syncData.agents, syncData.items || []);
          setLastAction({ type: 'sync', name: 'Mission synchronisée' });
          if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]);
          unlockScanner(1500);
          return;
        }
      }
    } catch(e) {}

    // 2. AGENT Check (Badge)
    const foundAgent = agents.find(a => a.matricule.trim().toUpperCase() === cleanedCode);

    if (foundAgent) {
      // Priorité au changement d'agent
      setSelectedAgentMatricule(foundAgent.matricule);
      setLastAction({ type: 'agent', name: `${foundAgent.prenom} ${foundAgent.nom}` });
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      
      // Unlock faster for agents (800ms) to allow immediate item scan
      unlockScanner(800);
      return;
    } 

    // 3. ITEM Check (Equipment)
    if (!selectedAgentMatricule) {
      alert("Veuillez d'abord sélectionner un agent ou scanner un badge agent.");
      isLockedRef.current = false;
      return;
    }
    
    onScan(code.trim(), selectedAgentMatricule);
    const agent = agents.find(a => a.matricule === selectedAgentMatricule);
    setLastAction({ type: 'item', code: code.trim(), name: agent?.nom });
    if (navigator.vibrate) navigator.vibrate(150);
    
    unlockScanner(1200);
  };

  const unlockScanner = (timeout: number) => {
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
    }, timeout);
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

  const syncPayload = JSON.stringify({
    sync: true,
    agents: agents,
    items: items,
    timestamp: Date.now()
  });

  const selectedAgent = agents.find(a => a.matricule === selectedAgentMatricule);

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">
      {/* List Section at the top (Horizontal Scroll) */}
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

      {/* Persistent Selection UI */}
      <div className={`px-4 py-3 flex justify-between items-center transition-all ${selectedAgent ? 'bg-blue-600 text-white' : 'bg-red-500 text-white'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${selectedAgent ? 'bg-blue-200' : 'bg-red-200'}`}></div>
          <span className="text-[11px] font-black uppercase tracking-wider">
            {selectedAgent ? `EN COURS : ${selectedAgent.prenom} ${selectedAgent.nom}` : 'AUCUN AGENT SÉLECTIONNÉ'}
          </span>
        </div>
        <div className="flex items-center gap-3">
           <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded">{items.filter(i => i.agentMatricule === selectedAgentMatricule).length} EPI</span>
           <button 
            onClick={() => setShowSyncModal(true)}
            className="bg-white text-blue-600 px-2 py-1 rounded text-[9px] font-black hover:bg-blue-50 transition-colors"
          >
            SYNC
          </button>
        </div>
      </div>

      {/* Camera Section */}
      <div className="p-4 shrink-0">
        <div className="relative aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-white">
          <div id={scannerContainerId} className="w-full h-full"></div>
          
          {!scannerReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gray-900/80 z-10">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-sm font-medium">Lancement caméra...</p>
            </div>
          )}

          {hasFlash && scannerReady && (
            <button 
              onClick={toggleFlash}
              className={`absolute top-4 right-4 z-30 p-3 rounded-full transition-all ${flashOn ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-200' : 'bg-black/40 text-white border border-white/20'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {lastAction && (
            <div className={`absolute inset-0 flex flex-col items-center justify-center text-white animate-in fade-in zoom-in duration-200 z-20 text-center px-4 ${lastAction.type === 'agent' ? 'bg-blue-600/90' : lastAction.type === 'sync' ? 'bg-purple-600/90' : 'bg-green-600/90'}`}>
              <div className="bg-white text-inherit rounded-full p-4 mb-2 shadow-2xl mx-auto" style={{ color: lastAction.type === 'agent' ? '#2563eb' : lastAction.type === 'sync' ? '#9333ea' : '#16a34a' }}>
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   {lastAction.type === 'sync' ? (
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                   ) : (
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                   )}
                 </svg>
              </div>
              <p className="text-xl font-black tracking-widest uppercase">
                {lastAction.type === 'agent' ? 'NOUVEAU BÉNÉFICIAIRE' : lastAction.type === 'sync' ? 'SYNCHRONISÉ' : 'OBJET ENREGISTRÉ'}
              </p>
              <p className="text-sm font-bold opacity-90 mt-1">{lastAction.name}</p>
              {lastAction.code && <p className="mt-2 font-mono text-[10px] bg-black/20 px-2 py-1 rounded">{lastAction.code}</p>}
            </div>
          )}
          
          <div className="absolute inset-0 pointer-events-none border-[40px] border-black/30">
             <div className="w-full h-full border-2 border-white/50 rounded-2xl relative">
                <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-blue-500 -mt-1 -ml-1"></div>
                <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-blue-500 -mt-1 -mr-1"></div>
                <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-blue-500 -mb-1 -ml-1"></div>
                <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-blue-500 -mb-1 -mr-1"></div>
             </div>
          </div>
        </div>

        <div className="mt-4">
          {showManualInput ? (
            <div className="flex gap-2 animate-in slide-in-from-top duration-200">
              <input 
                autoFocus
                type="text" 
                placeholder="Scanner/Saisir Matricule ou Code..." 
                className="flex-grow bg-white border-2 border-blue-500 px-4 py-3 rounded-2xl text-sm font-mono focus:ring-0 outline-none shadow-inner"
                value={manualInputCode}
                onChange={e => setManualInputCode(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && submitManualInput()}
              />
              <button onClick={submitManualInput} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg">OK</button>
              <button onClick={() => { setShowManualInput(false); setManualInputCode(''); }} className="bg-gray-200 text-gray-600 px-4 rounded-2xl font-bold">×</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setIsScanning(!isScanning)}
                className={`py-3 rounded-2xl font-black transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 ${
                  isScanning ? 'bg-orange-500 text-white' : 'bg-green-600 text-white'
                }`}
              >
                {isScanning ? (
                  <><div className="w-2 h-2 bg-white rounded-full animate-pulse"></div> PAUSE</>
                ) : (
                  '▶ REPRENDRE'
                )}
              </button>
              <button 
                onClick={() => setShowManualInput(true)}
                className="bg-white text-gray-700 py-3 rounded-2xl font-bold border border-gray-200 active:scale-95 shadow-sm flex items-center justify-center gap-2"
              >
                ⌨️ SAISIE MANUELLE
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic List Section */}
      <div className="flex-grow flex flex-col px-4 pb-4 overflow-hidden">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Distribution en cours</h3>
          <span className="text-[10px] font-bold text-gray-400">{items.length} TOTAL</span>
        </div>
        
        <div className="flex-grow overflow-y-auto space-y-4 pr-1 custom-scrollbar">
          {agents.map(agent => {
            const agentItems = items.filter(i => i.agentMatricule === agent.matricule);
            if (agentItems.length === 0) return null;
            const isSelected = selectedAgentMatricule === agent.matricule;
            
            return (
              <div key={agent.matricule} className={`transition-all duration-300 ${isSelected ? 'scale-[1.02] z-10' : 'opacity-60'}`}>
                <div className={`flex justify-between items-center px-3 py-2 rounded-t-xl border-x border-t ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-100 border-gray-200 text-gray-700'}`}>
                   <span className="text-xs font-black uppercase">{agent.prenom} {agent.nom}</span>
                   <span className={`text-[10px] font-mono ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>{agent.matricule}</span>
                </div>
                <div className={`bg-white border-x border-b border-gray-100 rounded-b-xl overflow-hidden ${isSelected ? 'ring-2 ring-blue-600 ring-offset-0' : ''}`}>
                  {agentItems.map((item, idx) => (
                    <div key={item.id} className={`p-3 flex justify-between items-center text-xs ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                      <span className="font-mono font-bold text-gray-700">{item.code}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] text-gray-400">{item.timestamp}</span>
                        <button onClick={() => onRemove(item.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1">
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
            <div className="h-40 flex flex-col items-center justify-center text-gray-300 border-4 border-dashed border-gray-50 rounded-[2.5rem] gap-3 px-8 text-center">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                </svg>
              </div>
              <p className="text-[11px] font-black uppercase tracking-widest leading-relaxed">Prêt pour le scan<br/>Badge Agent ou Code EPI</p>
            </div>
          )}
        </div>

        {/* Recipients Footer */}
        <div className="mt-4 pt-4 border-t border-gray-100 shrink-0">
          <div className="flex gap-2 mb-2">
            <input 
              type="email" placeholder="Email destinataire..."
              className="flex-grow px-4 py-3 text-xs rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={emailInput} onChange={e => setEmailInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && addRecipient()}
            />
            <button onClick={addRecipient} className="bg-blue-600 text-white px-5 rounded-xl font-black">+</button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto no-scrollbar py-1">
            {recipients.map(e => (
              <span key={e} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-[9px] font-black flex items-center gap-2 border border-blue-100 shadow-sm animate-in fade-in zoom-in">
                {e} <button onClick={() => setRecipients(recipients.filter(r => r !== e))} className="text-blue-300 hover:text-blue-600 font-black">×</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 bg-white border-t border-gray-100 shadow-xl z-20 shrink-0">
        <button 
          onClick={generateReport}
          disabled={analyzing || items.length === 0 || recipients.length === 0}
          className={`w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] ${
            items.length === 0 || recipients.length === 0 
              ? 'bg-gray-100 text-gray-400 border border-gray-200' 
              : 'bg-green-600 text-white hover:bg-green-700 shadow-2xl shadow-green-100'
          }`}
        >
          {analyzing ? (
            <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>
               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
               </svg>
               <span>ENVOYER RAPPORT SDIS 66</span>
            </>
          )}
        </button>
      </div>

      {/* Sync Modal */}
      {showSyncModal && (
        <div className="absolute inset-0 z-[60] bg-blue-900/95 p-8 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
          <button onClick={() => setShowSyncModal(false)} className="absolute top-6 right-6 text-white text-3xl font-light">×</button>
          <div className="bg-white p-8 rounded-[3rem] shadow-2xl flex flex-col items-center w-full max-w-xs text-center">
             <div className="bg-blue-100 text-blue-600 p-4 rounded-full mb-6">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
               </svg>
             </div>
             <h4 className="text-xl font-black text-gray-800 mb-2 uppercase tracking-tight">Synchronisation</h4>
             <p className="text-xs font-bold text-gray-400 mb-6 uppercase tracking-widest leading-relaxed">Faites scanner ce code par l'autre téléphone pour transférer la mission</p>
             
             <div className="bg-gray-100 p-4 rounded-2xl border-2 border-dashed border-gray-200">
               <div className="text-[7px] font-mono break-all text-gray-400 opacity-60">
                 {syncPayload}
               </div>
             </div>
             
             <div className="mt-6 flex flex-col gap-1">
               <span className="text-xs font-black text-blue-600">{agents.length} AGENTS</span>
               <span className="text-[10px] font-bold text-gray-300">{items.length} SCANS EN MÉMOIRE</span>
             </div>
          </div>
          <button 
            onClick={() => setShowSyncModal(false)}
            className="mt-8 bg-white/20 hover:bg-white/30 text-white px-10 py-4 rounded-2xl font-black transition-all"
          >
            FERMER
          </button>
        </div>
      )}

      {/* Add Agent Modal */}
      {showAddAgentModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[3.5rem] p-10 animate-in slide-in-from-bottom duration-300 shadow-2xl max-h-[85%] overflow-y-auto">
            <div className="flex justify-between items-center mb-10">
              <div className="flex flex-col">
                <h2 className="text-2xl font-black text-gray-800 tracking-tight">NOUVEL AGENT</h2>
                <div className="h-1.5 w-12 bg-blue-600 rounded-full mt-1"></div>
              </div>
              <button onClick={() => setShowAddAgentModal(false)} className="bg-gray-100 text-gray-500 w-12 h-12 rounded-full flex items-center justify-center text-2xl font-light">×</button>
            </div>
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-5">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">Prénom</label>
                  <input className="bg-gray-50 p-4 rounded-2xl border border-gray-100 font-bold outline-none focus:ring-2 focus:ring-blue-600 transition-all" placeholder="Jean" value={newAgentData.prenom} onChange={e => setNewAgentData({...newAgentData, prenom: e.target.value})} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">Nom</label>
                  <input className="bg-gray-50 p-4 rounded-2xl border border-gray-100 font-bold outline-none focus:ring-2 focus:ring-blue-600 transition-all" placeholder="DUPONT" value={newAgentData.nom} onChange={e => setNewAgentData({...newAgentData, nom: e.target.value})} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">Matricule</label>
                  <input className="w-full bg-gray-50 p-4 rounded-2xl border border-gray-100 font-mono font-black outline-none focus:ring-2 focus:ring-blue-600 transition-all" placeholder="660000" value={newAgentData.matricule} onChange={e => setNewAgentData({...newAgentData, matricule: e.target.value.toUpperCase()})} />
              </div>
              <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">Centre</label>
                  <select className="w-full bg-gray-50 p-4 rounded-2xl border border-gray-100 font-bold outline-none focus:ring-2 focus:ring-blue-600 transition-all" value={newAgentData.centre} onChange={e => setNewAgentData({...newAgentData, centre: e.target.value})}>
                    {CENTRES_PO.map(centre => <option key={centre} value={centre}>{centre}</option>)}
                  </select>
              </div>
              <button onClick={handleAddAgent} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black text-lg shadow-2xl shadow-blue-100 active:scale-95 transition-all">INSCRIRE L'AGENT</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScannerView;
