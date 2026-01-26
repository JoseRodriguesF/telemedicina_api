-- CreateEnum
CREATE TYPE "tipo_usuario_enum" AS ENUM ('medico', 'paciente', 'admin');

-- CreateEnum
CREATE TYPE "status_verificacao_enum" AS ENUM ('analise', 'verificado', 'recusado');

-- CreateEnum
CREATE TYPE "consulta_status_enum" AS ENUM ('scheduled', 'agendada', 'in_progress', 'finished', 'solicitada');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "senha_hash" VARCHAR(255),
    "google_id" VARCHAR(255),
    "registro_full" BOOLEAN NOT NULL DEFAULT false,
    "tipo_usuario" "tipo_usuario_enum" NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacientes" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "nome_completo" VARCHAR(255) NOT NULL,
    "data_nascimento" DATE NOT NULL,
    "cpf" VARCHAR(14) NOT NULL,
    "sexo" VARCHAR(20) NOT NULL,
    "estado_civil" VARCHAR(50) NOT NULL,
    "telefone" VARCHAR(11) NOT NULL,
    "responsavel_legal" VARCHAR(255),
    "telefone_responsavel" VARCHAR(20),

    CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicos" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "nome_completo" VARCHAR(255) NOT NULL,
    "data_nascimento" DATE NOT NULL,
    "cpf" VARCHAR(14) NOT NULL,
    "sexo" VARCHAR(20),
    "crm" VARCHAR(50) NOT NULL,
    "diploma_url" VARCHAR(255),
    "especializacao_url" VARCHAR(255),
    "assinatura_digital_url" VARCHAR(255),
    "seguro_responsabilidade_url" VARCHAR(255),
    "verificacao" "status_verificacao_enum" NOT NULL DEFAULT 'analise',

    CONSTRAINT "medicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enderecos" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "endereco" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "complemento" TEXT,

    CONSTRAINT "enderecos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultas" (
    "id" SERIAL NOT NULL,
    "medico_id" INTEGER,
    "paciente_id" INTEGER NOT NULL,
    "status" "consulta_status_enum" NOT NULL,
    "data_consulta" DATE,
    "hora_inicio" TIME,
    "hora_fim" TIME,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resumo" TEXT,
    "repouso" TEXT,
    "destino_final" TEXT,
    "diagnostico" TEXT,

    CONSTRAINT "consultas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historiaClinica" (
    "id" SERIAL NOT NULL,
    "paciente_id" INTEGER NOT NULL,
    "consulta_id" INTEGER,
    "queixa_principal" TEXT NOT NULL,
    "descricao_sintomas" TEXT,
    "historico_pessoal" JSONB DEFAULT '{}',
    "antecedentes_familiares" JSONB DEFAULT '{}',
    "estilo_vida" JSONB DEFAULT '{}',
    "historico_vacinacao" TEXT,
    "observacoes_gerais" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'rascunho',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "historiaClinica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_google_id_key" ON "usuarios"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "pacientes_usuario_id_key" ON "pacientes"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "pacientes_cpf_key" ON "pacientes"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "medicos_usuario_id_key" ON "medicos"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "medicos_cpf_key" ON "medicos"("cpf");

-- CreateIndex
CREATE INDEX "idx_consultas_medico_id" ON "consultas"("medico_id");

-- CreateIndex
CREATE INDEX "idx_consultas_paciente_id" ON "consultas"("paciente_id");

-- CreateIndex
CREATE INDEX "idx_consultas_medico_paciente" ON "consultas"("medico_id", "paciente_id");

-- CreateIndex
CREATE INDEX "idx_historiaclinica_paciente_id" ON "historiaClinica"("paciente_id");

-- CreateIndex
CREATE INDEX "idx_historiaclinica_consulta_id" ON "historiaClinica"("consulta_id");

-- CreateIndex
CREATE INDEX "idx_historiaclinica_status" ON "historiaClinica"("status");

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "medicos" ADD CONSTRAINT "medicos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "enderecos" ADD CONSTRAINT "enderecos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_medico_id_fkey" FOREIGN KEY ("medico_id") REFERENCES "medicos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historiaClinica" ADD CONSTRAINT "historiaClinica_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historiaClinica" ADD CONSTRAINT "historiaClinica_consulta_id_fkey" FOREIGN KEY ("consulta_id") REFERENCES "consultas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
