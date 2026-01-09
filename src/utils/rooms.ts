type Participant = {
  userId: string | number
  role?: 'medico' | 'paciente'
}

type RoomState = {
  consultaId: number | null
  participants: Participant[]
  createdAt: number
}

const rooms = new Map<string, RoomState>()

function generateRoomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export const Rooms = {
  createOrGet(consultaId: number): { roomId: string; created: boolean } {
    // try to find existing room for consulta
    for (const [rid, state] of rooms.entries()) {
      if (state.consultaId === consultaId) {
        return { roomId: rid, created: false }
      }
    }
    const roomId = generateRoomId()
    rooms.set(roomId, { consultaId, participants: [], createdAt: Date.now() })
    return { roomId, created: true }
  },

  // Create a room not tied to any consulta
  createStandalone(): { roomId: string } {
    const roomId = generateRoomId()
    rooms.set(roomId, { consultaId: null, participants: [], createdAt: Date.now() })
    return { roomId }
  },

  get(roomId: string): RoomState | undefined {
    return rooms.get(roomId)
  },

  findRoomIdByConsulta(consultaId: number): string | undefined {
    for (const [rid, state] of rooms.entries()) {
      if (state.consultaId === consultaId) return rid
    }
    return undefined
  },

  addParticipant(roomId: string, participant: Participant): { ok: boolean; reason?: string } {
    const state = rooms.get(roomId)
    if (!state) return { ok: false, reason: 'room_not_found' }
    // if participant with same userId exists, replace (reconnection)
    const existingIndex = state.participants.findIndex(p => p.userId === participant.userId)
    if (existingIndex >= 0) {
      state.participants[existingIndex] = participant
      return { ok: true }
    }
    if (state.participants.length >= 2) return { ok: false, reason: 'room_full' }
    state.participants.push(participant)
    return { ok: true }
  },

  listParticipants(roomId: string): Participant[] {
    return rooms.get(roomId)?.participants ?? []
  },

  removeParticipant(roomId: string, userId: string | number): { ok: boolean; reason?: string } {
    const state = rooms.get(roomId)
    if (!state) return { ok: false, reason: 'room_not_found' }
    const index = state.participants.findIndex(p => p.userId === userId)
    if (index >= 0) {
      state.participants.splice(index, 1)
      return { ok: true }
    }
    return { ok: false, reason: 'participant_not_found' }
  },

  end(roomId: string): void {
    rooms.delete(roomId)
  }
}
