
import React from 'react';
import { User } from '../types';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
  showLogout: boolean;
}

const Header: React.FC<HeaderProps> = ({ user, onLogout, showLogout }) => {
  return (
    <header className="bg-blue-700 text-white p-5 shadow-lg flex justify-between items-center shrink-0">
      <div className="flex items-center gap-3">
        <div className="bg-white/20 p-2 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <h1 className="text-xl font-bold tracking-tight">Suivi EPI Pro</h1>
      </div>
      
      {showLogout && (
        <button 
          onClick={onLogout}
          className="text-xs bg-red-500/20 hover:bg-red-500/40 px-3 py-1 rounded-full border border-red-400/30 transition-colors"
        >
          Déconnexion
        </button>
      )}
    </header>
  );
};

export default Header;
