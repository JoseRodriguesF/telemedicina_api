import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding administrative and clinical data...')

  // Create some users
  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@matriarca.com.br' },
    update: {},
    create: {
      email: 'admin@matriarca.com.br',
      senha_hash: '$2b$10$YourHashHere', // Note: Use real hashed pass if login needed, or just for stats
      tipo_usuario: 'admin',
      registroFull: true,
    },
  })

  // Create Doctors
  const doctor1 = await prisma.medico.upsert({
    where: { cpf: '12345678901' },
    update: {},
    create: {
      nome_completo: 'Dr. Roberto Silva',
      cpf: '12345678901',
      crm: '123456',
      crm_uf: 'SP',
      especialidade: 'Cardiologia',
      data_nascimento: new Date('1980-05-15'),
      verificacao: 'verificado',
      usuario: {
        create: {
          email: 'roberto@medico.com',
          tipo_usuario: 'medico',
          registroFull: true
        }
      }
    }
  })

  const doctor2 = await prisma.medico.upsert({
    where: { cpf: '98765432109' },
    update: {},
    create: {
      nome_completo: 'Dra. Maria Oliveira',
      cpf: '98765432109',
      crm: '654321',
      crm_uf: 'RJ',
      especialidade: 'Pediatria',
      data_nascimento: new Date('1985-08-20'),
      verificacao: 'verificado',
      usuario: {
        create: {
          email: 'maria@medico.com',
          tipo_usuario: 'medico',
          registroFull: true
        }
      }
    }
  })

  // Create Patients
  const patient1 = await prisma.paciente.upsert({
    where: { cpf: '11122233344' },
    update: {},
    create: {
      nome_completo: 'João dos Santos',
      cpf: '11122233344',
      data_nascimento: new Date('1990-01-01'),
      sexo: 'Masculino',
      estado_civil: 'Solteiro',
      telefone: '11999999999',
      usuario: {
        create: {
          email: 'joao@paciente.com',
          tipo_usuario: 'paciente',
          registroFull: true
        }
      }
    }
  })

  // Create Consultations (Stats)
  await prisma.consulta.createMany({
    data: [
      {
        pacienteId: patient1.id,
        medicoId: doctor1.id,
        status: 'finished',
        data_consulta: new Date(),
        hora_inicio: new Date(new Date().setUTCHours(10, 0, 0, 0)),
        cid: 'I10',
        diagnostico: 'Hipertensão Essencial'
      },
      {
        pacienteId: patient1.id,
        medicoId: doctor2.id,
        status: 'finished',
        data_consulta: new Date(),
        hora_inicio: new Date(new Date().setUTCHours(14, 0, 0, 0)),
        cid: 'J00',
        diagnostico: 'Nasofaringite aguda'
      },
      {
        pacienteId: patient1.id,
        medicoId: doctor1.id,
        status: 'scheduled',
        data_consulta: new Date(new Date().setDate(new Date().getDate() + 1)),
        hora_inicio: new Date(new Date().setUTCHours(9, 0, 0, 0)),
      }
    ]
  })

  // Create Audit Logs
  await prisma.trilhaAuditoria.createMany({
    data: [
      { usuarioId: admin.id, acao: 'LOGIN', recurso: 'AUTH', detalhes: 'Admin logged in', ip: '127.0.0.1' },
      { usuarioId: admin.id, acao: 'APPROVE_MEDICO', recurso: 'medico', recursoId: doctor1.id, detalhes: 'Dr. Roberto verificado', ip: '127.0.0.1' },
      { usuarioId: admin.id, acao: 'ACCESS_STATS', recurso: 'ADMIN_DASHBOARD', detalhes: 'Dashboard viewed', ip: '127.0.0.1' }
    ]
  })

  console.log('Seed completed successfully.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
