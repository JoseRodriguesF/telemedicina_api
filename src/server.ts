//atribui as ferramentas do framework fastify no objeto Fastify
import Fastify from 'fastify';

//configura o log no servidor que mostra todas as requisições feitas no console
const server = Fastify({ logger: true });

//cria função que quando chamada inicializa o servidor na porta 3000, e adiciona tratamento de erro caso não seja possível iniciar o servidor
const start = async () => {
  try {
    await server.listen({ port: 3000 });
    console.log('Servidor rodando na porta 3000');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
//chamada da função
start();
