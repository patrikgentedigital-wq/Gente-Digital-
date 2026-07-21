const axios = require('axios');
const domain = process.env.IXC_DOMAIN;
const token = process.env.IXC_TOKEN;

if (!domain || !token) {
  console.error("IXC_DOMAIN e IXC_TOKEN devem estar configurados nas variáveis de ambiente.");
  process.exit(1);
}


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
