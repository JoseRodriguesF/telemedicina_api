import { Server, IncomingMessage } from 'http'
import WebSocket, { WebSocketServer, RawData } from 'ws'
import jwt from 'jsonwebtoken'
import { Rooms } from './utils/rooms'
import { getConsultaById } from './services/consultasService'
import prisma from './config/database'

type ClientInfo = {
  userId: string | number
  role?: 'medico' | 'paciente'
  roomId: string
}

const clients = new Map<WebSocket, ClientInfo>()

function verifyToken(token?: string): { id: number } | null {
  if (!token) return null
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number }
    return decoded
  } catch {
    return null
  }
}

export function initSignalServer(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/signal' })

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const roomId = url.searchParams.get('roomId') || ''
    const token = url.searchParams.get('token') || ''
    const decoded = verifyToken(token)
    if (!decoded) {
      ws.close(4001, 'invalid_token')
      return
    }

    const room = Rooms.get(roomId)
    if (!room) {
      ws.close(4004, 'room_not_found')
      return
    }

    // autorização: se a sala estiver vinculada a uma consulta, somente médico/paciente daquela consulta
    if (room.consultaId) {
      const consulta = await getConsultaById(room.consultaId)
      if (!consulta) {
        ws.close(4004, 'room_consulta_not_found')
        return
      }
      // decoded.id é usuario.id; precisamos mapear para medico.id ou paciente.id
      const usuarioId = decoded.id
      // tentar mapear como medico
      const medico = await prisma.medico.findUnique({ where: { usuario_id: usuarioId } })
      // tentar mapear como paciente
      const paciente = await prisma.paciente.findUnique({ where: { usuario_id: usuarioId } })

      const isMedicoDaConsulta = !!medico && consulta.medicoId === medico.id
      const isPacienteDaConsulta = !!paciente && consulta.pacienteId === paciente.id

      if (!isMedicoDaConsulta && !isPacienteDaConsulta) {
        ws.close(4003, 'forbidden')
        return
      }
    }

    // default client info; will be finalized on join message
    clients.set(ws, { userId: decoded.id, roomId })

    ws.on('message', (data: RawData) => {
      let msg: any
      try { msg = JSON.parse(data.toString()) } catch { return }

      const info = clients.get(ws)
      if (!info) return

      switch (msg.type) {
        case 'join': {
          const res = Rooms.addParticipant(info.roomId, { userId: info.userId, role: msg.role })
          if (!res.ok) {
            ws.send(JSON.stringify({ type: 'error', error: res.reason }))
            ws.close(4009, res.reason)
            return
          }
          clients.set(ws, { ...info, role: msg.role })
          const participantsList = Rooms.listParticipants(info.roomId)
          ws.send(JSON.stringify({
            type: 'joined',
            roomId: info.roomId,
            participants: participantsList.map(p => ({ userId: p.userId, role: p.role }))
          }))
          // notify others
          broadcastToRoom(info.roomId, ws, { type: 'peer-joined', userId: info.userId, role: msg.role })
          // log when medico and paciente are both connected to the same room
          const participants = Rooms.listParticipants(info.roomId)
          const roles = participants.map(p => p.role)
          // Consider both connected if we have exactly 2 participants,
          // even if roles were not provided by the clients.
          const bothConnected = participants.length === 2
          if (bothConnected) {
            const payload = {
              level: 30,
              route: '/signal/join',
              msg: roles.includes('medico') && roles.includes('paciente')
                ? 'medico_and_paciente_connected_same_room'
                : 'two_participants_connected_same_room',
              roomId: info.roomId,
              participants: participants.map(p => ({ userId: p.userId, role: p.role }))
            }
            try { console.log(JSON.stringify(payload)) } catch { /* noop */ }
            // also notify both peers
            broadcastToRoom(info.roomId, null, { type: 'ready', roomId: info.roomId })
          }
          break
        }
        case 'offer':
        case 'answer':
        case 'ice-candidate':
        case 'chat': {
          // relay to the other participant
          relayToPeer(info.roomId, ws, msg)
          break
        }
        case 'leave': {
          ws.close(1000, 'leave')
          break
        }
        case 'end': {
          broadcastToRoom(info.roomId, ws, { type: 'end' })
          Rooms.end(info.roomId)
          ws.close(1000, 'end')
          break
        }
      }
    })

    ws.on('close', () => {
      const info = clients.get(ws)
      if (!info) return
      clients.delete(ws)
      Rooms.removeParticipant(info.roomId, info.userId)
      broadcastToRoom(info.roomId, ws, { type: 'peer-left', userId: info.userId })
    })
  })

  function broadcastToRoom(roomId: string, exclude: WebSocket | null, payload: any) {
    for (const [sock, info] of clients.entries()) {
      if (info.roomId === roomId && sock !== exclude && sock.readyState === WebSocket.OPEN) {
        sock.send(JSON.stringify(payload))
      }
    }
  }

  function relayToPeer(roomId: string, from: WebSocket, payload: any) {
    for (const [sock, info] of clients.entries()) {
      if (info.roomId === roomId && sock !== from && sock.readyState === WebSocket.OPEN) {
        sock.send(JSON.stringify(payload))
      }
    }
  }

  return wss
}
