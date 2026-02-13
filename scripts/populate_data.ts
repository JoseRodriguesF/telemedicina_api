
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const pUser = await prisma.usuario.findFirst({
        where: { email: { contains: 'jose.antonio' } },
        include: { paciente: true }
    });

    const mUser = await prisma.usuario.findFirst({
        where: { email: { contains: 'mindtracking' } },
        include: { medico: true }
    });

    if (!pUser?.paciente || !mUser?.medico) {
        console.log('User or Profile not found');
        console.log('Paciente User:', pUser?.email);
        console.log('Medico User:', mUser?.email);
        return;
    }

    const pId = pUser.paciente.id;
    const mId = mUser.medico.id;

    console.log(`Found Paciente ID: ${pId}, Medico ID: ${mId}`);

    // 1. Create Address for Paciente if not exists
    await prisma.endereco.upsert({
        where: { id: pUser.id }, // Note: id here might not be the best but let's just create one
        update: {},
        create: {
            usuario_id: pUser.id,
            endereco: "Rua das Flores",
            numero: "123",
            bairro: "Centro",
            cep: "01001-000",
            cidade: "São Paulo",
            estado: "SP"
        }
    }).catch(e => console.log("Address skip or error", e.message));

    // 2. Create multiple Consultas with different statuses
    const statuses = ['agendada', 'finished', 'solicitada', 'cancelled', 'in_progress'];

    for (const status of statuses) {
        const consulta = await prisma.consulta.create({
            data: {
                pacienteId: pId,
                medicoId: mId,
                status: status as any,
                data_consulta: new Date(),
                hora_inicio: new Date(),
                hora_fim: new Date(new Date().getTime() + 3600000),
                resumo: status === 'finished' ? "Consulta de rotina concluída com sucesso." : null,
                diagnostico: status === 'finished' ? "Saúde geral excelente." : null,
                estrelas: status === 'finished' ? 5 : null,
                avaliacao: status === 'finished' ? "Ótimo atendimento!" : null
            }
        });

        // 3. Create Historia Clinica for some consultas
        if (status === 'finished' || status === 'in_progress') {
            await prisma.historiaClinica.create({
                data: {
                    pacienteId: pId,
                    consultaId: consulta.id,
                    queixaPrincipal: "Dor de cabeça persistente",
                    descricaoSintomas: "Iniciou há 3 dias na região frontal.",
                    status: "finalizado",
                    historicoPessoal: { alergias: ["dipirona"], medicamentos: ["nenhum"] },
                    antecedentesFamiliares: { hipertensao: true },
                    estiloVida: { fumante: false, exercicios: "3x semana" },
                    conteudo: "Paciente relata dor de cabeça persistente iniciada há 3 dias na região frontal. Sem outros sintomas significativos."
                }
            });

            // 4. Create Prescricoes
            await prisma.prescricao.create({
                data: {
                    consultaId: consulta.id,
                    medicamento: "Paracetamol",
                    marca: "Tylenol",
                    dosagem: "750mg",
                    frequencia: "A cada 8 horas",
                    duracao: "3 dias",
                    inclusoConvenio: true
                }
            });
        }
    }

    console.log('Database populated successfully!');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
