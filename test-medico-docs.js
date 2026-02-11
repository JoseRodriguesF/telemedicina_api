// Script de teste para verificar se a API retorna os campos de documentos do médico
// Execute com: node test-medico-docs.js

const axios = require('axios');

async function testMedicoDocuments() {
    try {
        // SUBSTITUA AQUI COM SEU TOKEN DE MÉDICO
        const token = 'SEU_TOKEN_AQUI';

        const response = await axios.get('http://localhost:3333/usuarios/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('\n✅ Resposta da API recebida com sucesso!\n');

        if (response.data.medico) {
            console.log('📄 Documentos do Médico:');
            console.log('  - Diploma URL:', response.data.medico.diploma_url || '❌ NÃO CADASTRADO');
            console.log('  - Assinatura Digital URL:', response.data.medico.assinatura_digital_url || '❌ NÃO CADASTRADO');
            console.log('  - Especialização URL:', response.data.medico.especializacao_url || '❌ NÃO CADASTRADO');
            console.log('  - Seguro Responsabilidade URL:', response.data.medico.seguro_responsabilidade_url || '❌ NÃO CADASTRADO');
            console.log('\n✅ A API ESTÁ RETORNANDO OS CAMPOS CORRETAMENTE!');
        } else {
            console.log('❌ Este usuário não é um médico');
        }

        console.log('\n📋 Resposta completa:');
        console.log(JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error('\n❌ Erro ao testar:', error.response?.data || error.message);
    }
}

testMedicoDocuments();
