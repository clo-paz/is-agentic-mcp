const http = require('node:http');
const fs = require('node:fs');
const {handler} = require('../lambda/handler');
const server = http.createServer(async (req,res)=>{
  const body = await new Promise(resolve=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>resolve(b))});
  try {
    const result=await handler({rawPath:new URL(req.url,'http://localhost').pathname,body,requestContext:{http:{method:req.method,sourceIp:req.socket.remoteAddress}}});
    res.writeHead(result.statusCode,result.headers);res.end(result.body);
  } catch(e){res.writeHead(500);res.end(e.message)}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/mcp`;
  const log=[];
  async function call(body){
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2025-03-26'},body:JSON.stringify(body)});
    const text=await response.text();
    log.push({request:body,status:response.status,response:text?JSON.parse(text):null});
    if(response.status!==200&&response.status!==202)throw Error(`HTTP ${response.status}`);
    return log.at(-1).response;
  }
  const init=await call({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'local-http-client',version:'1.0'}}});
  if(init.result?.protocolVersion!=='2025-03-26')throw Error('Initialization failed');
  await call({jsonrpc:'2.0',method:'notifications/initialized'});
  const list=await call({jsonrpc:'2.0',id:2,method:'tools/list'});
  if(list.result?.tools?.length!==6)throw Error('Tool listing failed');
  const search=await call({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'search_products',arguments:{query:'mug',limit:1}}});
  if(search.result?.isError||!JSON.parse(search.result.content[0].text).products.length)throw Error('Search failed');
  const filename=process.env.MCP_CLIENT_LOG||'tests/local-client-responses.json';
  fs.writeFileSync(filename,JSON.stringify({transport:'HTTP JSON-RPC, local Lambda adapter',timestamp:new Date().toISOString(),exchanges:log},null,2)+'\n');
  console.log(`HTTP MCP client: initialize, initialized notification, six tools, mug search passed; responses: ${filename}`);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
