-- AlterTable
ALTER TABLE "consultas" ADD COLUMN     "avaliacao" TEXT,
ADD COLUMN     "estrelas" INTEGER;

-- AlterTable
ALTER TABLE "medicos" ADD COLUMN     "avaliacao" DOUBLE PRECISION DEFAULT 0;
