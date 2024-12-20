import { useState, useEffect } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer"
import { Plus, Minus, Dices, ChevronRight, Sword } from "lucide-react"
import { auth, db, doc, getDoc, onSnapshot, updateDoc, deleteDoc, collection, onAuthStateChanged, writeBatch } from "@/lib/firebase" // Ajoutez writeBatch ici
import { Dialog, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

type Character = {
  id: string
  name: string
  avatar: string
  pv: number
  init: number
  initDetails?: string
  type: string // Ajoutez cette ligne
  currentInit?: number // Ajoutez cette ligne
}

type AttackReport = {
  cible_nom: string
  attaque_result: number
  arme_utilisée: string
  réussite: boolean
  type: string
  degat_result: number
  attaquant: string
  cible: string
  reportId: string
}

export function GMDashboard() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [selectedAttack, setSelectedAttack] = useState<AttackReport | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isOtherDrawerOpen, setIsOtherDrawerOpen] = useState(false)
  const [hpChange, setHpChange] = useState(0)
  const [damageChange, setDamageChange] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [attackReports, setAttackReports] = useState<AttackReport[]>([])
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null)
  const [isRollingInitiative, setIsRollingInitiative] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null) // Ajoutez cette ligne

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid)
      } else {
        setUserId(null)
      }
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const fetchRoomId = async () => {
      if (!userId) return
      try {
        const userDoc = await getDoc(doc(db, `users/${userId}`))
        if (userDoc.exists()) {
          const data = userDoc.data()
          setRoomId(data.room_id)
        }
      } catch (error) {
        console.error("Erreur lors de la récupération du roomId :", error)
      }
    }
    fetchRoomId()
  }, [userId])

  useEffect(() => {
    const fetchCharactersAndSettings = async () => {
      if (!roomId) return

      try {
        const settingsDoc = await getDoc(doc(db, `cartes/${roomId}/settings/general`))
        let activePlayerId: string | null = null

        if (settingsDoc.exists()) {
          const data = settingsDoc.data()
          activePlayerId = data.tour_joueur || null
        }

        const charactersRef = collection(db, `cartes/${roomId}/characters`)

        onSnapshot(charactersRef, (snapshot) => {
          const charactersData = snapshot.docs.map((doc) => {
            const data = doc.data()
            return {
              id: doc.id,
              name: data.Nomperso || "absente",
              avatar: data.imageURL || `/placeholder.svg?height=40&width=40&text=${data.Nomperso ? data.Nomperso[0] : "?"}`,
              pv: data.PV ?? "absente",
              init: data.INIT ?? "absente",
              initDetails: data.initDetails || "absente", // Ajoutez cette ligne
              type: data.type || "pnj",
              currentInit: data.currentInit || 0 // Ajoutez cette ligne
            }
          })

          const sortedCharacters = charactersData.sort((a, b) => (b.currentInit ?? 0) - (a.currentInit ?? 0))

          if (activePlayerId) {
            const activePlayerIndex = sortedCharacters.findIndex((char) => char.id === activePlayerId)
            if (activePlayerIndex > 0) {
              const [activeCharacter] = sortedCharacters.splice(activePlayerIndex, 1)
              sortedCharacters.unshift(activeCharacter)
            }
          }

          setCharacters(sortedCharacters)
        })
      } catch (error) {
        console.error("Erreur lors du chargement des personnages et des paramètres :", error)
      }
    }

    fetchCharactersAndSettings()
  }, [roomId])

  useEffect(() => {
    const fetchAttackReports = async () => {
      if (!roomId || characters.length === 0) return

      const firstCharacterId = characters[0]?.id
      if (!firstCharacterId) return

      const rapportRef = collection(db, `cartes/${roomId}/combat/${firstCharacterId}/rapport`)
      
      const unsubscribe = onSnapshot(rapportRef, (snapshot) => {
        const reportsData = snapshot.docs.map((doc) => {
          const data = doc.data()
          return {
            cible_nom: data.cible_nom || "Inconnu",
            attaque_result: data.attaque_result || 0,
            arme_utilisée: data.arme_utilisée || "Inconnu",
            réussite: data.réussite || false,
            type: data.type || "N/A",
            degat_result: data.degat_result || 0,
            attaquant: data.attaquant || "",
            cible: data.cible || "",
            reportId: doc.id // Store report ID to delete reports later
          }
        })

        setAttackReports(reportsData)
      })

      return () => unsubscribe()
    }

    fetchAttackReports()
  }, [roomId, characters])

  const applyDamage = async (targetId: string, damage: number) => {
    const targetCharacter = characters.find(char => char.id === targetId)
    if (!targetCharacter || !roomId) return

    try {
      const newPv = Math.max(0, targetCharacter.pv - damage)
      const characterRef = doc(db, `cartes/${roomId}/characters/${targetId}`)
      await updateDoc(characterRef, { PV: newPv })
      
      setCharacters(prevChars =>
        prevChars.map(char => char.id === targetId ? { ...char, pv: newPv } : char)
      )
    } catch (error) {
      console.error("Erreur lors de l'application des dégâts :", error)
    }
  }

  const rerollInitiative = async () => {
    if (isRollingInitiative) return
    setIsRollingInitiative(true)
    const updatedCharacters = characters.map(char => {
      const diceRoll = Math.floor(Math.random() * 20) + 1
      const initValue = parseInt(char.init as unknown as string, 10) // Convertir en entier
      const totalInit = initValue + diceRoll
      return {
        ...char,
        currentInit: totalInit,
        initDetails: `${initValue}+${diceRoll}=${totalInit}`
      }
    })
    const sortedCharacters = updatedCharacters.sort((a, b) => (b.currentInit ?? 0) - (a.currentInit ?? 0))
    setCharacters(sortedCharacters)

    if (roomId) {
      try {
        const batch = writeBatch(db) // Utilisez writeBatch ici
        sortedCharacters.forEach(char => {
          const characterRef = doc(db, `cartes/${roomId}/characters/${char.id}`)
          batch.update(characterRef, { currentInit: char.currentInit, initDetails: char.initDetails })
        })
        await batch.commit()

        // Mettre à jour le personnage actif
        const newActiveCharacterId = sortedCharacters[0].id
        const settingsRef = doc(db, `cartes/${roomId}/settings/general`)
        await updateDoc(settingsRef, { tour_joueur: newActiveCharacterId })
      } catch (error) {
        console.error("Erreur lors de la mise à jour des initiatives :", error)
      }
    }
    setIsRollingInitiative(false)
  }

  const confirmDeleteCharacter = (character: Character) => {
    setCharacterToDelete(character)
    setIsConfirmDialogOpen(true)
  }

  const handleDeleteCharacter = async () => {
    if (!characterToDelete || !roomId) return

    const firstCharacterId = characterToDelete.id
    const combatRef = collection(db, `cartes/${roomId}/combat/${firstCharacterId}/rapport`)

    // Delete each report for the current character
    const reportsToDelete = attackReports.filter(report => report.attaquant === firstCharacterId)
    for (const report of reportsToDelete) {
      const reportRef = doc(combatRef, report.reportId)
      await deleteDoc(reportRef)
    }

    setCharacters(prevChars => {
      const [first, ...rest] = prevChars
      return [...rest, first]
    })

    // Update `tour_joueur` with the new active character's ID
    try {
      const newActiveCharacterId = characters[1].id // Le prochain personnage après réorganisation
      const settingsRef = doc(db, `cartes/${roomId}/settings/general`)
      await updateDoc(settingsRef, { tour_joueur: newActiveCharacterId })
    } catch (error) {
      console.error("Erreur lors de la mise à jour de tour_joueur :", error)
    }

    setIsConfirmDialogOpen(false)
    setCharacterToDelete(null)
  }

  const nextCharacter = async () => {
    if (!roomId || characters.length === 0) return
  
    const firstCharacter = characters[0]
    const combatRef = collection(db, `cartes/${roomId}/combat/${firstCharacter.id}/rapport`)
  
    // Delete each report for the current character
    const reportsToDelete = attackReports.filter(report => report.attaquant === firstCharacter.id)
    for (const report of reportsToDelete) {
      const reportRef = doc(combatRef, report.reportId)
      await deleteDoc(reportRef)
    }
  
    const newCharacters = [...characters.slice(1), firstCharacter]
    setCharacters(newCharacters)
  
    // Update `tour_joueur` with the new active character's ID
    try {
      const newActiveCharacterId = newCharacters[0].id
      const settingsRef = doc(db, `cartes/${roomId}/settings/general`)
      await updateDoc(settingsRef, { tour_joueur: newActiveCharacterId })
    } catch (error) {
      console.error("Erreur lors de la mise à jour de tour_joueur :", error)
    }
  }

  const openDrawer = (character: Character) => {
    setSelectedCharacter(character)
    setIsDrawerOpen(true)
    setHpChange(0)
  }

  const openOtherDrawer = (attack: AttackReport) => {
    setSelectedAttack(attack)
    setIsOtherDrawerOpen(true)
    setDamageChange(attack.degat_result)
    setSelectedTarget(attack.cible) // Ajoutez cette ligne
  }

  const updateCharacterHP = async () => {
    if (selectedCharacter && roomId) {
      try {
        const newPv = Math.max(0, selectedCharacter.pv + hpChange)
        const characterRef = doc(db, `cartes/${roomId}/characters/${selectedCharacter.id}`)
        await updateDoc(characterRef, { PV: newPv })
        setCharacters(prevChars =>
          prevChars.map(char => char.id === selectedCharacter.id ? { ...char, pv: newPv } : char)
        )
      } catch (error) {
        console.error("Erreur lors de la mise à jour des PV :", error)
      } finally {
        setIsDrawerOpen(false)
      }
    }
  }

  const applyManualDamage = async () => {
    if (selectedAttack && selectedTarget && roomId) { // Modifiez cette ligne
      await applyDamage(selectedTarget, damageChange) // Modifiez cette ligne
      setIsOtherDrawerOpen(false)
    }
  }

  const renderAttackReport = (report: AttackReport) => (
    <div key={report.reportId} className="mb-4 border-b pb-4">
      <p className="text-sm text-muted-foreground mt-2">
        <strong>Attaque:</strong> {report.attaque_result} | <strong>Dégâts:</strong> {report.degat_result}
      </p>
      <p className="text-sm text-muted-foreground">
        <strong>Arme:</strong> {report.arme_utilisée}
      </p>
      
      <div className="flex space-x-2 mt-2">
        <Button size="sm" onClick={() => openOtherDrawer(report)}>
        <Sword />Infliger les dégats 
        </Button>
      </div>
    </div>
  )

  const renderCharacterCard = (character: Character | undefined, index: number) => {
    if (!character) return null

    const characterReports = attackReports.filter(report => report.attaquant === character.id)

    return (
      <Card 
        key={character.id}
        className={`w-full ${index === 0 ? 'bg-primary/10' : 'hover:bg-secondary/50 cursor-pointer transition-colors'}`}
      >
        <CardContent className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {character.avatar ? (
              <img src={character.avatar} alt={character.name || "Inconnu"} className="h-12 w-12 rounded-full" />
            ) : (
              <Avatar className="h-12 w-12">
                <AvatarFallback>{character.name ? character.name[0] : "?"}</AvatarFallback>
              </Avatar>
            )}
            <div>
              <h2 className="text-xl font-semibold flex items-center mb-2">
                {character.name || "Inconnu"}
                {index === 0 && <Sword className="ml-2 h-4 w-4 text-primary" />}
              </h2>
              <p className="text-sm text-muted-foreground mb-2">
                PV: {character.pv ?? "absente"} | INIT: {character.initDetails ?? "absente"}
              </p>
              {characterReports.map(report => renderAttackReport(report))}
            </div>
          </div>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); openDrawer(character); }}>
            Ajuster PV
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="p-4">
      <div className="flex justify-between mb-4">
        <Button onClick={rerollInitiative} disabled={isRollingInitiative}>
          <Dices className="mr-2 h-4 w-4" />
          Relancer l'initiative
        </Button>
        <Button onClick={nextCharacter}>
          <ChevronRight className="mr-2 h-4 w-4" />
          Suivant
        </Button>
      </div>
      
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Personnage actif</h2>
        {renderCharacterCard(characters[0], 0)}
      </div>
      
      {characters.length > 1 && (
        <>
          <h2 className="text-lg font-semibold mb-2">Autres personnages</h2>
          <ScrollArea className="h-full pr-4">
            <div className="space-y-4">
              {characters.slice(1).map((character, index) => renderCharacterCard(character, index + 1))}
            </div>
          </ScrollArea>
        </>
      )}

      <Drawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        <DrawerContent  className="max-w-7xl p-6 mx-auto">
          <DrawerHeader>
            <DrawerTitle>Ajuster les PV de {selectedCharacter?.name || "Inconnu"}</DrawerTitle>
            <DrawerDescription>Modifiez les points de vie du personnage</DrawerDescription>
          </DrawerHeader>
          <div className="p-4 flex items-center justify-center space-x-4">
            <Button variant="outline" size="icon" onClick={() => setHpChange(prev => prev - 1)}>
              <Minus className="h-4 w-4" />
            </Button>
            <div className="text-4xl font-bold">{hpChange}</div>
            <Button variant="outline" size="icon" onClick={() => setHpChange(prev => prev + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <DrawerFooter>
            <Button onClick={updateCharacterHP}>Confirmer</Button>
            <DrawerClose asChild>
              <Button variant="outline">Annuler</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={isOtherDrawerOpen} onClose={() => setIsOtherDrawerOpen(false)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Ajuster les Dégâts</DrawerTitle>
          </DrawerHeader>
          <div className="p-4">
            <label htmlFor="target-select" className="block text-sm font-medium text-gray-700">
              Choisir la cible
            </label>
            <Select value={selectedTarget || ""} onValueChange={setSelectedTarget}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir une cible" />
              </SelectTrigger>
              <SelectContent>
                {characters.map((character) => (
                  <SelectItem key={character.id} value={character.id}>
                    {character.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="p-4 flex items-center justify-center space-x-4">
            <Button variant="outline" size="icon" onClick={() => setDamageChange(prev => Math.max(0, prev - 1))}>
              <Minus className="h-4 w-4" />
            </Button>
            <div className="text-4xl font-bold">{damageChange}</div>
            <Button variant="outline" size="icon" onClick={() => setDamageChange(prev => prev + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <DrawerFooter>
            <Button onClick={applyManualDamage}>Appliquer les dégâts</Button>
            <DrawerClose asChild>
              <Button variant="outline">Annuler</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmation de suppression</DialogTitle>
              <DialogDescription>
                Êtes-vous sûr de vouloir supprimer le personnage {characterToDelete?.name} ?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={handleDeleteCharacter}>Confirmer</Button>
              <DialogClose asChild>
                <Button variant="outline">Annuler</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div>
  )
}

export default GMDashboard
