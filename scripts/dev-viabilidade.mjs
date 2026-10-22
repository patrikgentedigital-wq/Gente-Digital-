import { spawn } from 'node:child_process';
const port=process.argv.includes('--port')?process.argv[process.argv.indexOf('--port')+1]:'3020';
if(!/^\d+$/.test(port)||Number(port)<1024||Number(port)>65535)throw new Error('PORT_INVALID');
// Ambiente de validação separado: nunca reutiliza as credenciais reais do .env.
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',port],{
  stdio:'inherit',windowsHide:true,env:{...process.env,
    NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder_key',
    SUPABASE_SERVICE_ROLE_KEY:'placeholder_key',VIABILITY_DEMO_ENABLED:'true',
    VIABILITY_AUDIT_DIRECTORY:'.data/viabilidade-demo',NEXT_DIST_DIR:'.next-viabilidade',
    DISABLE_HMR:'true',NEXT_TELEMETRY_DISABLED:'1'
  }
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill());
child.on('exit',code=>{process.exitCode=code??0});
