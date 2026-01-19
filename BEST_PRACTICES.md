# 📘 Guia de Boas Práticas - Telemedicina API

Este documento define os padrões e boas práticas para desenvolvimento neste projeto.

## 🎯 Princípios Fundamentais

### **1. DRY (Don't Repeat Yourself)**
❌ **Evite repetir código**
```typescript
// ❌ ERRADO - Código duplicado
export async function endpoint1(req, reply) {
  let iceServers = getIceServersFromEnv()
  if (!iceServers) iceServers = await getIceServersFromXirsys()
  // ...
}

export async function endpoint2(req, reply) {
  let iceServers = getIceServersFromEnv()
  if (!iceServers) iceServers = await getIceServersFromXirsys()
  // ...
}
```

✅ **Use helpers**
```typescript
// ✅ CORRETO - Helper reutilizável
const iceServers = await getIceServersWithFallback()
```

### **2. Type Safety First**
❌ **Evite `any`**
```typescript
// ❌ ERRADO
const user: any = req.user
```

✅ **Use tipos específicos**
```typescript
// ✅ CORRETO
const user = req.user as AuthenticatedUser
```

### **3. Validação Consistente**
❌ **Validações inline**
```typescript
// ❌ ERRADO
const id = Number(req.params.id)
if (isNaN(id)) return reply.code(400).send({ error: 'invalid_id' })
```

✅ **Use helpers de validação**
```typescript
// ✅ CORRETO
const validation = validateNumericId(req.params.id, 'consulta_id')
if (!validation.valid) return reply.code(400).send(validation.error!)
```

## 📁 Estrutura de Arquivos

### **Controllers** (`src/controllers/`)
- Um controller por domínio (consultas, pronto socorro, etc)
- Funções assíncronas exportadas
- Use helpers para lógica comum
- Mantenha endpoints simples e legíveis

```typescript
export async function nomeEndpoint(req: RequestType, reply: FastifyReply) {
  // 1. Autenticação
  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })
  
  // 2. Validação de entrada
  const validation = validateNumericId(req.params.id)
  if (!validation.valid) return reply.code(400).send(validation.error!)
  
  // 3. Autorização
  if (user.tipo_usuario !== 'medico') {
    return reply.code(403).send({ error: 'forbidden' })
  }
  
  // 4. Lógica de negócio
  const result = await someService()
  
  // 5. Resposta
  return reply.send(result)
}
```

### **Services** (`src/services/`)
- Lógica de negócio complexa
- Operações no banco de dados
- Integrações com APIs externas
- Retornar objetos do tipo `ServiceResult<T>`

```typescript
export async function myService(): Promise<ServiceResult<Data>> {
  try {
    const data = await prisma.table.findMany()
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: 'error_message' }
  }
}
```

### **Helpers** (`src/utils/controllerHelpers.ts`)
- Funções utilitárias reutilizáveis
- Validações comuns
- Transformações de dados
- **SEMPRE** adicione aqui código que se repete 2+ vezes

### **Types** (`src/types/shared.ts`)
- Interfaces compartilhadas
- Tipos de request/response
- Enums e constantes
- **SEMPRE** defina tipos antes de usar `any`

## 🔐 Autenticação e Autorização

### **Padrão de Autenticação:**
```typescript
const user = req.user as AuthenticatedUser
if (!user) return reply.code(401).send({ error: 'unauthorized' })
```

### **Padrão de Autorização:**
```typescript
// Verificar tipo de usuário
if (user.tipo_usuario !== 'medico') {
  return reply.code(403).send({ error: 'forbidden' })
}

// Verificar ownership
const { pacienteId } = await resolveUserProfiles(user.id)
if (!pacienteId || pacienteId !== targetPacienteId) {
  return reply.code(403).send({ error: 'forbidden' })
}
```

## 📊 Queries no Banco de Dados

### **Use Select Específico:**
❌ **Evite buscar tudo**
```typescript
// ❌ ERRADO - Busca todos os campos (incluindo senha_hash)
const user = await prisma.usuario.findUnique({ where: { id } })
```

✅ **Selecione apenas o necessário**
```typescript
// ✅ CORRETO
const user = await prisma.usuario.findUnique({ 
  where: { id },
  select: {
    id: true,
    email: true,
    tipo_usuario: true
  }
})
```

### **Use Promise.all para Queries Paralelas:**
```typescript
// ✅ CORRETO - Queries em paralelo
const [paciente, medico] = await Promise.all([
  prisma.paciente.findUnique({ where: { usuario_id: id } }),
  prisma.medico.findUnique({ where: { usuario_id: id } })
])
```

## 🎨 Nomenclatura

### **Variáveis e Funções:**
- `camelCase` para variáveis e funções
- Nomes descritivos
- Evite abreviações

```typescript
// ✅ BOM
const userProfile = await resolveUserProfiles(userId)
const consultaId = validation.numericId

// ❌ RUIM  
const up = await resolve(id)
const cId = val.num
```

### **Tipos e Interfaces:**
- `PascalCase` para tipos e interfaces
- Sufixo descritivo quando apropriado

```typescript
// ✅ BOM
interface AgendarConsultaBody { ... }
type RequestWithUserId = FastifyRequest<{ ... }>

// ❌ RUIM
interface body { ... }
type req = FastifyRequest<{ ... }>
```

## 📝 Validação de Dados

### **IDs Numéricos:**
```typescript
const validation = validateNumericId(req.params.id, 'field_name')
if (!validation.valid) return reply.code(400).send(validation.error!)
const id = validation.numericId!
```

### **Datas:**
```typescript
const dateValidation = validateDate(req.body.data_consulta)
if (!dateValidation.valid) return reply.code(400).send(dateValidation.error!)
```

### **Campos Obrigatórios:**
```typescript
if (!pacienteId || Number.isNaN(pacienteId)) {
  return reply.code(400).send({ error: 'invalid_paciente_id' })
}
```

## 🔄 Resolução de Perfis de Usuário

Sempre use o helper quando precisar resolver `userId` → `pacienteId`/`medicoId`:

```typescript
const { pacienteId, medicoId, hasPaciente, hasMedico } = await resolveUserProfiles(userId)

if (!pacienteId && !medicoId) {
  return reply.send([]) // Usuário não tem perfil
}

// Construir condições para query
const orConditions = buildUserProfileConditions(pacienteId, medicoId)
```

## 🌐 ICE Servers

Use sempre o helper:

```typescript
const iceServers = await getIceServersWithFallback()
return reply.send({ roomId, iceServers })
```

## ❌ Erros HTTP

### **Códigos Padrão:**
- `400` - Bad Request (validação falhou)
- `401` - Unauthorized (não autenticado)
- `403` - Forbidden (sem permissão)
- `404` - Not Found (recurso não encontrado)
- `409` - Conflict (conflito de estado)
- `500` - Internal Server Error

### **Formato de Resposta de Erro:**
```typescript
return reply.code(400).send({
  error: 'error_code',
  message: 'Human readable message',
  details: 'Optional details'
})
```

## 🧪 Testes (Futuro)

Ao adicionar testes no futuro, siga:
- Testes unitários para helpers e services
- Testes de integração para endpoints
- Mocks para banco de dados
- Coverage mínimo de 80%

## 📦 Dependências

### **Adicionando Novas Dependências:**
1. Verifique se já existe uma lib interna
2. Prefira libs mantidas e populares
3. Documente o uso no README
4. Adicione types (@types/package) quando necessário

## 🚀 Antes de Fazer Push

**Checklist:**
- [ ] `npm run build` passa sem erros
- [ ] Código segue os padrões deste guia
- [ ] Não há `console.log` no código (use logger do Fastify)
- [ ] Não há `any` types desnecessários
- [ ] Código está formatado consistentemente
- [ ] Helpers foram utilizados quando aplicável

## 💡 Dicas de Performance

### **1. Cache quando apropriado:**
```typescript
// Para dados que mudam raramente
const medicosCache = new Map()
```

### **2. Evite N+1 queries:**
```typescript
// ❌ ERRADO - N+1 query
for (const consulta of consultas) {
  const medico = await prisma.medico.findUnique({ where: { id: consulta.medicoId } })
}

// ✅ CORRETO - Use include
const consultas = await prisma.consulta.findMany({
  include: { medico: true }
})
```

### **3. Use índices do banco:**
Verifique se campos usados em WHERE/JOIN têm índices no schema Prisma.

## 🎓 Recursos de Aprendizado

- [Fastify Documentation](https://www.fastify.io/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Clean Code Principles](https://github.com/ryanmcdermott/clean-code-javascript)

---

**Última Atualização:** 2026-01-18  
**Mantido por:** Equipe de Desenvolvimento
