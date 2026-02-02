
export interface User {
  nom: string;
  prenom: string;
  matricule: string;
  centre: string;
}

export interface ScannedItem {
  id: string;
  code: string;
  timestamp: string;
  agentMatricule: string; // Lien vers l'agent
  type?: string;
}

export enum View {
  LOGIN = 'login',
  SCAN = 'scan',
  SUMMARY = 'summary'
}
