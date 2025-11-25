const prisma = require('../dist/config/database').default || require('../src/config/database').default;

async function main(){
  try{
    const users = await prisma.usuario.findMany({ select: { id: true, email: true, tipo_usuario: true } });
    console.log('Usuarios:', users);
    process.exit(0);
  }catch(e){
    console.error(e);
    process.exit(1);
  }
}

main();
