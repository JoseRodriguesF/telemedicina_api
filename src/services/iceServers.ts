import https from 'https'

export function getIceServersFromEnv(): Array<any> | null {
  // prioridade: JSON completo via env
  const iceJson = process.env.ICE_SERVERS_JSON
  if (iceJson) {
    try {
      const parsed = JSON.parse(iceJson)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch {}
  }

  // fallback: variáveis simples STUN/TURN
  const servers: any[] = []
  const stun = process.env.STUN_URL
  if (stun) servers.push({ urls: stun })

  const turnUrl = process.env.TURN_URL
  const turnUser = process.env.TURN_USER
  const turnPass = process.env.TURN_PASS
  if (turnUrl && turnUser && turnPass) {
    // aceitar lista de URLs separadas por vírgula
    const urls = turnUrl.includes(',') ? turnUrl.split(',').map(s => s.trim()).filter(Boolean) : turnUrl
    servers.push({ urls, username: turnUser, credential: turnPass })
  }

  return servers.length ? servers : null
}

export async function getIceServersFromXirsys(): Promise<any[] | null> {
  const channel = process.env.XIRSYS_CHANNEL
  const username = process.env.XIRSYS_USERNAME
  const secret = process.env.XIRSYS_SECRET
  if (!channel || !username || !secret) return null

  const body = JSON.stringify({ format: 'urls' })

  const options: https.RequestOptions = {
    host: 'global.xirsys.net',
    path: `/_turn/${channel}`,
    method: 'PUT',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${username}:${secret}`).toString('base64'),
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let str = ''
      res.on('data', (chunk) => { str += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(str)
          const ice = json?.v?.iceServers || json?.iceServers || null
          resolve(Array.isArray(ice) ? ice : null)
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.write(body)
    req.end()
  })
}
