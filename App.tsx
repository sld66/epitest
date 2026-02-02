
import React, { useState, useEffect } from 'react';
import { User, ScannedItem, View } from './types';
import Login from './components/Login';
import ScannerView from './components/ScannerView';
import Header from './components/Header';

const STORAGE_KEY_AGENTS = 'epi_agents_list';

const App: React.FC = () => {
  const [agents, setAgents] = useState<User[]>([]);
  const [currentView, setCurrentView] = useState<View>(View.LOGIN);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);

  // Initialize data from local storage
  useEffect(() => {
    const savedAgents = localStorage.getItem(STORAGE_KEY_AGENTS);
    if (savedAgents) {
      setAgents(JSON.parse(savedAgents));
    }
  }, []);

  const handleStartMission = (selectedAgents: User[]) => {
    setAgents(selectedAgents);
    localStorage.setItem(STORAGE_KEY_AGENTS, JSON.stringify(selectedAgents));
    setCurrentView(View.SCAN);
  };

  const handleAddAgentInline = (newAgent: User) => {
    const updatedAgents = [...agents, newAgent];
    setAgents(updatedAgents);
    localStorage.setItem(STORAGE_KEY_AGENTS, JSON.stringify(updatedAgents));
  };

  const handleLogout = () => {
    if (window.confirm("Finir la mission ? Les données de scan seront réinitialisées.")) {
      setAgents([]);
      setScannedItems([]);
      localStorage.removeItem(STORAGE_KEY_AGENTS);
      setCurrentView(View.LOGIN);
    }
  };

  const addScannedItem = (code: string, agentMatricule: string) => {
    const newItem: ScannedItem = {
      id: Math.random().toString(36).substr(2, 9),
      code,
      agentMatricule,
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    setScannedItems(prev => [newItem, ...prev]);
  };

  const removeScannedItem = (id: string) => {
    setScannedItems(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-white shadow-xl relative">
      <Header 
        user={agents.length > 0 ? agents[0] : null} 
        onLogout={handleLogout} 
        showLogout={currentView === View.SCAN} 
      />
      
      <main className="flex-grow overflow-hidden flex flex-col">
        {currentView === View.LOGIN && (
          <Login onStartMission={handleStartMission} initialAgents={agents} />
        )}
        
        {currentView === View.SCAN && agents.length > 0 && (
          <ScannerView 
            agents={agents}
            items={scannedItems}
            onScan={addScannedItem}
            onRemove={removeScannedItem}
            onReset={() => setScannedItems([])}
            onAddAgent={handleAddAgentInline}
          />
        )}
      </main>
    </div>
  );
};

export default App;
