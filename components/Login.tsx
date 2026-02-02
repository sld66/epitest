
import React, { useState } from 'react';
import { User } from '../types';

interface LoginProps {
  onStartMission: (agents: User[]) => void;
  initialAgents: User[];
}

const Login: React.FC<LoginProps> = ({ onStartMission, initialAgents }) => {
  const [agents, setAgents] = useState<User[]>(initialAgents);
  const [formData, setFormData] = useState<User>({
    nom: '',
    prenom: '',
    matricule: '',
    centre: 'Nord'
  });

  const addAgent = () => {
    if (!formData.nom || !formData.matricule) {
      alert("Veuillez remplir au moins le nom et le matricule de l'agent.");
      return;
    }
    setAgents([...agents, { ...formData }]);
    setFormData({
      nom: '',
      prenom: '',
      matricule: '',
      centre: formData.centre // garder le même centre par défaut
    });
  };

  const removeAgent = (index: number) => {
    setAgents(agents.filter((_, i) => i !== index));
  };

  const handleStart = () => {
    if (agents.length === 0) {
      alert("Ajoutez au moins un agent pour démarrer la mission.");
      return;
    }
    onStartMission(agents);
  };

  return (
    <div className="p-6 h-full flex flex-col overflow-y-auto animate-in fade-in duration-500 custom-scrollbar">
      <div className="mb-6 text-center shrink-0">
        <h2 className="text-2xl font-bold text-gray-800">Équipe de Mission</h2>
        <p className="text-gray-500 text-sm mt-1">Identifiez les agents participant à la distribution</p>
      </div>

      {/* Agents List */}
      <div className="mb-6 space-y-2">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
          Agents inscrits ({agents.length})
        </h3>
        {agents.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-sm">
            Aucun agent ajouté pour le moment.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {agents.map((agent, index) => (
              <div key={index} className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex justify-between items-center animate-in slide-in-from-right duration-200">
                <div>
                  <div className="font-bold text-blue-900 text-sm">{agent.prenom} {agent.nom}</div>
                  <div className="text-[10px] text-blue-600 font-mono">{agent.matricule} • {agent.centre}</div>
                </div>
                <button 
                  onClick={() => removeAgent(index)}
                  className="text-blue-300 hover:text-red-500 p-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Agent Form */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-6">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Ajouter un agent</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input 
              type="text" 
              className="px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50 text-sm"
              placeholder="Prénom"
              value={formData.prenom}
              onChange={e => setFormData({...formData, prenom: e.target.value})}
            />
            <input 
              type="text" 
              className="px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50 text-sm"
              placeholder="Nom"
              value={formData.nom}
              onChange={e => setFormData({...formData, nom: e.target.value})}
            />
          </div>
          <input 
            type="text" 
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50 text-sm font-mono uppercase"
            placeholder="Matricule (ex: M-1234)"
            value={formData.matricule}
            onChange={e => setFormData({...formData, matricule: e.target.value})}
          />
          <select 
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50 text-sm"
            value={formData.centre}
            onChange={e => setFormData({...formData, centre: e.target.value})}
          >
            <option value="Nord">Centre Nord</option>
            <option value="Sud">Centre Sud</option>
            <option value="Est">Centre Est</option>
            <option value="Ouest">Centre Ouest</option>
          </select>
          <button 
            type="button"
            onClick={addAgent}
            className="w-full bg-blue-100 text-blue-700 font-bold py-3 rounded-xl hover:bg-blue-200 transition-all flex items-center justify-center gap-2"
          >
            <span>+</span> Ajouter cet agent
          </button>
        </div>
      </div>

      <button 
        onClick={handleStart}
        disabled={agents.length === 0}
        className={`w-full py-4 rounded-xl font-black text-lg shadow-xl transition-all active:scale-[0.98] mt-auto sticky bottom-0 ${
          agents.length === 0 
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' 
          : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        Démarrer la Mission {agents.length > 0 && `(${agents.length})`}
      </button>
    </div>
  );
};

export default Login;
