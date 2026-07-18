const axios = require('axios');
const domain = 'ixc.gentedigital.com.br';
const token = '85:b8f803056841572d25dbc6bbd6a99bb8f544da3d26d5c33c76d8cf1ec6afdbfb';

async function test() {
  try {
    const res = await axios({
      method: 'GET',
      url: `https://${domain}/webservice/v1/cliente`,
      headers: {
        'Authorization': `Basic ${Buffer.from(token).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      data: {
        qtype: 'razao',
        query: 'LUCAS ESTEVÃO DOS SANTOS MORAES',
        oper: 'L',
        page: '1',
        rp: '5'
      }
    });
    console.log("SUCCESS!", res.data);
  } catch (err) {
    console.error("ERROR!", err.response ? err.response.data : err.message);
  }
}
test();
