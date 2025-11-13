//atribui as ferramentas do framework fastify no objeto Fastify
import Fastify from 'fastify';
import prisma from './config/database';
import dotenv from 'dotenv';

//carrega as variáveis de ambiente do arquivo .env
dotenv.config();
//configura o log no servidor que mostra todas as requisições feitas no console
const server = Fastify({ logger: true });

//cria função que quando chamada inicializa o servidor na porta 3000, e adiciona tratamento de erro caso não seja possível iniciar o servidor
const start = async () => {
  try {
    //Aguarda a inicialização do servidor na porta 3000
    await server.listen({ 
      port: process.env.PORT ? parseInt(process.env.PORT): 3000,
      host: '0.0.0.0' //para funcionar no docker
     });
    console.log('✅ Servidor rodando na porta 3000 ✅');
    //aguarda a conexão com o banco de dados
    await prisma.$connect();
    console.log('✅ Conectado ao banco de dados ✅');
  } catch (err) {
    console.error('❌ Falha ao conectar ao banco de dados ou ao iniciar o servidor:');
    server.log.error(err);
    process.exit(1);
  }
};
//chamada da função
start();
