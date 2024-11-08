"use client";

import React, { useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  onAuthStateChanged,
  doc,
  getDoc,
  collection,
  getDocs,
  onSnapshot,
  updateDoc
} from '@/lib/firebase';
import { Heart, Shield } from 'lucide-react';
import InventoryManagement from '@/components/Inventaire';
import CompetencesDisplay from "@/components/competencesD";
import CharacterImage from '@/components/CharacterImage';

interface Character {
  id: string;
  Nomperso: string;
  niveau?: number;
  Profile?: string;
  Race?: string;
  Taille?: number;
  Poids?: number;
  imageURL?: string;
  PV?: number;
  PV_Max?: number;
  Defense?: number;
  Contact?: number;
  Magie?: number;
  Distance?: number;
  INIT?: number;
  FOR?: number;
  DEX?: number;
  CON?: number;
  SAG?: number;
  INT?: number;
  CHA?: number;
  type?: string;
}

interface Bonuses {
  [key: string]: number;
  CHA: number;
  CON: number;
  Contact: number;
  DEX: number;
  Defense: number;
  Distance: number;
  FOR: number;
  INIT: number;
  INT: number;
  Magie: number;
  PV: number;
  SAG: number;
}

export default function Component() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<Partial<Character>>({});
  const [showLevelUpModal, setShowLevelUpModal] = useState<boolean>(false);
  const [rollResult, setRollResult] = useState<number | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [bonuses, setBonuses] = useState<Bonuses | null>(null);
  const [isRaceModalOpen, setIsRaceModalOpen] = useState(false);
const [selectedRaceAbilities, setSelectedRaceAbilities] = useState<string[]>([]);

  

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        console.log("Aucun utilisateur connecté");
        setLoading(false);
        setError("Veuillez vous connecter pour voir les personnages");
        return;
      }

      console.log("Utilisateur connecté:", user.uid);
      
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (!userDoc.exists()) {
          console.log("Document utilisateur non trouvé");
          setError("Données utilisateur non trouvées");
          setLoading(false);
          return;
        }

        const userData = userDoc.data();
        const roomIdValue = String(userData?.room_id);
        setRoomId(roomIdValue);

        const charactersCollection = collection(db, `cartes/${roomIdValue}/characters`);
        const charactersSnapshot = await getDocs(charactersCollection);
        const characterPromises = charactersSnapshot.docs.map(async (characterDoc) => {
          const characterData = characterDoc.data() as Omit<Character, 'id'>; // Explicitly omit 'id' to avoid duplication
          return {
            id: characterDoc.id, // Adds the id explicitly from Firestore
            ...characterData
          };
        });
        
        

        const charactersData = await Promise.all(characterPromises);
        const playerCharacters = charactersData.filter(char => char.type === "joueurs");
        
        setCharacters(playerCharacters);
        if (playerCharacters.length > 0) {
          setSelectedCharacter(playerCharacters[0]);
          listenToBonuses(roomIdValue, playerCharacters[0].Nomperso);
        }
      } catch (error) {
        console.error("Erreur lors de la récupération des données:", error);
        setError("Erreur lors du chargement des données: " + (error as Error).message);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const getModifier = (value: number): number => {
    return Math.floor((value - 10) / 2);
  };

  const handleEdit = () => {
    if (!selectedCharacter) return;
    setEditForm({
      PV: selectedCharacter.PV || 0,
      PV_Max: selectedCharacter.PV_Max || 0,
      Defense: selectedCharacter.Defense || 0,
      Contact: selectedCharacter.Contact || 0,
      Magie: selectedCharacter.Magie || 0,
      Distance: selectedCharacter.Distance || 0,
      INIT: selectedCharacter.INIT || 0,
      FOR: selectedCharacter.FOR || 0,
      DEX: selectedCharacter.DEX || 0,
      CON: selectedCharacter.CON || 0,
      SAG: selectedCharacter.SAG || 0,
      INT: selectedCharacter.INT || 0,
      CHA: selectedCharacter.CHA || 0,
    });
    setIsEditing(true);
  };

  interface RaceAbilitiesModalProps {
    abilities: string[];
    onClose: () => void;
  }
  
  const RaceAbilitiesModal: React.FC<RaceAbilitiesModalProps> = ({ abilities, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#2a2a2a] p-6 rounded-lg border border-[#3a3a3a] max-w-md w-full text-center">
        <h2 className="text-xl font-bold text-[#c0a080] mb-4">Capacités Raciales</h2>
        <div className="space-y-4">
          {abilities.map((ability, index) => (
            <p key={index} className="text-[#d4d4d4]">{ability}</p>
          ))}
        </div>
        <button
          onClick={onClose}
          className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-300 text-sm font-bold mt-4"
        >
          Fermer
        </button>
      </div>
    </div>
  );


  

  const handleRaceClick = async (race: string) => {
    console.log(race);
    if (!race) {
      setSelectedRaceAbilities(["Race non spécifiée."]);
      setIsRaceModalOpen(true);
      return;
    }
  
    try {
      const response = await fetch('/tabs/capacites.json');
      if (!response.ok) {
        throw new Error("Erreur lors du chargement des capacités.");
      }
  
      const abilitiesData: Record<string, string[]> = await response.json();
      const abilities = abilitiesData[race.toLowerCase()] 
          ? Object.values(abilitiesData[race.toLowerCase()]) 
          : ["Aucune capacité raciale trouvée."];
      
      setSelectedRaceAbilities(abilities);
      
      setIsRaceModalOpen(true);
    } catch (error) {
      console.error("Erreur lors du chargement des capacités:", error);
      setSelectedRaceAbilities(["Erreur lors du chargement des capacités."]);
      setIsRaceModalOpen(true);
    }
  };

  

  const handleSave = async () => {
    if (!selectedCharacter) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
      const roomId = String(userDoc.data()?.room_id);
      
      await updateDoc(doc(db, `cartes/${roomId}/characters`, selectedCharacter.id), {
        ...editForm
      });

      const updatedCharacter = { ...selectedCharacter, ...editForm };
      setSelectedCharacter(updatedCharacter);
      setCharacters(characters.map(char => 
        char.id === selectedCharacter.id ? updatedCharacter : char
      ));
      
      setIsEditing(false);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      alert("Erreur lors de la sauvegarde des modifications");
    }
  };

  const openLevelUpModal = () => {
    setShowLevelUpModal(true);
    setRollResult(null);
  };

  const handleRollDie = () => {
    if (!selectedCharacter) return;
    const roll = Math.floor(Math.random() * 8) + 1;
    const conModifier = getModifier(selectedCharacter.CON || 0);
    setRollResult(roll + conModifier);
  };

  const listenToBonuses = (roomId: string, nomperso: string) => {
    const bonusesRef = collection(db, `Bonus/${roomId}/${nomperso}`);
    
    onSnapshot(bonusesRef, (snapshot) => {
      const totalBonuses: Bonuses = {
        CHA: 0, CON: 0, Contact: 0, DEX: 0, Defense: 0, Distance: 0,
        FOR: 0, INIT: 0, INT: 0, Magie: 0, PV: 0, SAG: 0,
      };

      snapshot.forEach((doc) => {
        const bonusData = doc.data();
        if (bonusData.active) {
          for (let stat in totalBonuses) {
            if (bonusData[stat] !== undefined) {
              totalBonuses[stat] += parseInt(bonusData[stat] || 0);
            }
          }
        }
      });

      setBonuses(totalBonuses);
    });
  };

  const getDisplayValue = (stat: keyof Character): number => {
    const baseValue = selectedCharacter ? parseInt(selectedCharacter[stat] as any || "0") : 0;
    const bonusValue = bonuses ? bonuses[stat] || 0 : 0; // Remove parseInt
    return baseValue + bonusValue;
  };
  

  const confirmLevelUp = async () => {
    if (rollResult == null || !selectedCharacter) {
      alert("Veuillez lancer le dé avant de valider.");
      return;
    }

    const newPV_Max = (selectedCharacter.PV_Max || 0) + rollResult;
    const updatedCharacter = {
      ...selectedCharacter,
      PV_Max: newPV_Max,
      PV: newPV_Max, 
    };

    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
      const roomId = String(userDoc.data()?.room_id);

      await updateDoc(doc(db, `cartes/${roomId}/characters`, selectedCharacter.id), {
        PV_Max: newPV_Max,
        PV: newPV_Max,
      });

      setSelectedCharacter(updatedCharacter);
      setCharacters(characters.map(char => 
        char.id === selectedCharacter.id ? updatedCharacter : char
      ));
      
      alert(`Niveau augmenté ! PV Max augmenté de ${rollResult} à ${newPV_Max}.`);
      setShowLevelUpModal(false);
    } catch (error) {
      console.error("Erreur lors de l'augmentation de niveau:", error);
      alert("Erreur lors de l'augmentation de niveau");
    }
  };

  
  const closeLevelUpModal = () => {
    setShowLevelUpModal(false);
  };

  if (loading) {
    return <div className="min-h-screen bg-[#1c1c1c] text-[#d4d4d4] p-4 flex items-center justify-center">
      Chargement...
    </div>;
  }

  if (error) {
    return <div className="min-h-screen bg-[#1c1c1c] text-[#d4d4d4] p-4 flex items-center justify-center">
      <div className="bg-red-500/10 text-red-500 p-4 rounded-lg">
        {error}
      </div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-[#1c1c1c] text-[#d4d4d4] p-4">
      <div className="max-w-4xl mx-auto bg-[#242424] rounded-lg shadow-2xl p-6 space-y-6">
        
        <div className="flex justify-center space-x-2 overflow-x-auto">
          {characters.map((character) => (
            <button
              key={character.id}
              onClick={() => {
                setSelectedCharacter(character);
                listenToBonuses(roomId!, character.Nomperso);
              }}
              className={`px-4 py-2 ${
                selectedCharacter?.id === character.id 
                  ? 'bg-[#d4b48f]' 
                  : 'bg-[#c0a080]'
              } text-[#1c1c1c] rounded-lg hover:bg-[#d4b48f] transition whitespace-nowrap text-sm font-bold`}
            >
              {character.Nomperso}
            </button>
          ))}
        </div>

        {selectedCharacter && !isEditing && (
          <>
            <div className="flex flex-col md:flex-row space-y-6 md:space-y-0 md:space-x-6">
              <div className="flex-shrink-0">
                <CharacterImage 
                  imageUrl={selectedCharacter.imageURL} 
                  altText={selectedCharacter.Nomperso} 
                  characterId={selectedCharacter.id} 
                />
              </div>

              <div className="flex-grow space-y-4">
                <div className="bg-[#2a2a2a] p-4 rounded-lg border border-[#3a3a3a]">
                  <h2 className="text-2xl font-bold text-[#c0a0a0] mb-2">{selectedCharacter.Nomperso}</h2>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Niveau: <span className="text-[#a0a0a0]">{selectedCharacter.niveau}</span></div>
                    <div>Initiative: <span className="text-[#a0a0a0]">{getDisplayValue("INIT")}</span></div>
                    <div>Profil: <span className="text-[#a0a0a0]">{selectedCharacter.Profile}</span></div>
                    <div>Taille: <span className="text-[#a0a0a0]">{selectedCharacter.Taille} cm</span></div>
                    <div>
  Race: 
  <span 
    className="text-[#a0a0a0] underline cursor-pointer" 
    onClick={() => handleRaceClick(selectedCharacter.Race || "")}
  >
    {selectedCharacter.Race}
  </span>
</div>

                    <div>Poids: <span className="text-[#a0a0a0]">{selectedCharacter.Poids} Kg</span></div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { name: 'FOR', value: getDisplayValue("FOR") },
                    { name: 'DEX', value: getDisplayValue("DEX") },
                    { name: 'CON', value: getDisplayValue("CON") },
                    { name: 'INT', value: getDisplayValue("INT") },
                    { name: 'SAG', value: getDisplayValue("SAG") },
                    { name: 'CHA', value: getDisplayValue("CHA") },
                  ].map((ability) => (
                    <div key={ability.name} className="bg-[#2a2a2a] p-2 rounded-lg border border-[#3a3a3a]">
                      <div className="text-[#c0a0a0] font-semibold">{ability.name}</div>
                      <div className={`text-2xl font-bold ${getModifier(ability.value) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {getModifier(ability.value) >= 0 ? '+' : ''}{getModifier(ability.value)}
                      </div>
                      <div className="text-sm text-[#a0a0a0]">{ability.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#2a2a2a] p-4 rounded-lg border border-[#3a3a3a] flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Heart className="text-red-500" size={24} />
                <span className="text-2xl font-bold text-[#d4d4d4]">
                  {getDisplayValue("PV")} / {getDisplayValue("PV_Max")}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Shield className="text-blue-500" size={24} />
                <span className="text-2xl font-bold text-[#d4d4d4]">{getDisplayValue("Defense")}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[
                { name: 'Contact', value: getDisplayValue("Contact") },
                { name: 'Distance', value: getDisplayValue("Distance") },
                { name: 'Magie', value: getDisplayValue("Magie") }
              ].map((stat) => (
                <div key={stat.name} className="bg-[#2a2a2a] p-4 rounded-lg border border-[#3a3a3a] text-center">
                  <h3 className="text-lg font-semibold text-[#c0a0a0] mb-1">{stat.name}</h3>
                  <span className="text-2xl font-bold text-[#d4d4d4]">{stat.value}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-center mt-6 space-x-4">
              <button
                onClick={handleEdit}
                className="bg-[#c0a080] text-[#1c1c1c] px-6 py-2 rounded-lg hover:bg-[#d4b48f] transition duration-300 text-sm font-bold"
              >
                Modifier
              </button>
              <button
                onClick={openLevelUpModal}
                className="bg-[#5c6bc0] text-white px-6 py-2 rounded-lg hover:bg-[#7986cb] transition duration-300 text-sm font-bold"
              >
                Monter de Niveau
              </button>
            </div>
          </>
        )}

        {selectedCharacter && (
          <>
            <InventoryManagement playerName={selectedCharacter.Nomperso} roomId={roomId!} />
            <CompetencesDisplay roomId={roomId!} characterId={selectedCharacter.id} />
          </>
        )}

        {isEditing && (
          <div className="bg-[#2a2a2a] p-6 rounded-lg border border-[#3a3a3a]">
            <h2 className="text-xl font-bold text-[#c0a0a0] mb-4">
  Modifier {selectedCharacter?.Nomperso || "Personnage"}
</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="space-y-2">
                <label className="text-sm">PV</label>
                <input
                  type="number"
                  value={editForm.PV || ''}
                  onChange={(e) => setEditForm({...editForm, PV: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">PV Maximum</label>
                <input
                  type="number"
                  value={editForm.PV_Max || ''}
                  onChange={(e) => setEditForm({...editForm, PV_Max: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Défense</label>
                <input
                  type="number"
                  value={editForm.Defense || ''}
                  onChange={(e) => setEditForm({...editForm, Defense: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Contact</label>
                <input
                  type="number"
                  value={editForm.Contact || ''}
                  onChange={(e) => setEditForm({...editForm, Contact: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Magie</label>
                <input
                  type="number"
                  value={editForm.Magie || ''}
                  onChange={(e) => setEditForm({...editForm, Magie: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Distance</label>
                <input
                  type="number"
                  value={editForm.Distance || ''}
                  onChange={(e) => setEditForm({...editForm, Distance: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Initiative</label>
                <input
                  type="number"
                  value={editForm.INIT || ''}
                  onChange={(e) => setEditForm({...editForm, INIT: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'].map((stat) => (
                <div key={stat} className="space-y-2">
                  <label className="text-sm">{stat}</label>
                  <input
                    type="number"
                    value={editForm[stat as keyof Character] || ''}
                    onChange={(e) => setEditForm({...editForm, [stat]: parseInt(e.target.value)})}
                    className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setIsEditing(false)}
                className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition duration-300 text-sm font-bold"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                className="bg-[#c0a080] text-[#1c1c1c] px-6 py-2 rounded-lg hover:bg-[#d4b48f] transition duration-300 text-sm font-bold"
              >
                Sauvegarder
              </button>
            </div>
          </div>
        )}
          {isRaceModalOpen && (
    <RaceAbilitiesModal 
      abilities={selectedRaceAbilities} 
      onClose={() => setIsRaceModalOpen(false)} 
    />
  )}



        {showLevelUpModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#2a2a2a] p-6 rounded-lg border border-[#3a3a3a] max-w-md w-full text-center">
              <h2 className="text-xl font-bold text-[#c0a0a0] mb-4">Monter de Niveau</h2>
              <p className="text-[#d4d4d4] mb-4">Lancez un dé à 8 faces pour augmenter les PV Max.</p>
              <button
                onClick={handleRollDie}
                className="bg-[#c0a080] text-[#1c1c1c] px-4 py-2 rounded-lg mb-4 hover:bg-[#d4b48f] transition duration-300 text-sm font-bold"
              >
                Lancer le Dé
              </button>
              {rollResult !== null && (
                <div className="text-2xl font-bold text-green-500 mb-4">
                  Résultat: +{rollResult}
                </div>
              )}
              <div className="flex justify-center space-x-4">
                <button
                  onClick={confirmLevelUp}
                  className="bg-[#5c6bc0] text-white px-4 py-2 rounded-lg hover:bg-[#7986cb] transition duration-300 text-sm font-bold"
                >
                  Valider
                </button>
                <button
                  onClick={closeLevelUpModal}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-300 text-sm font-bold"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
