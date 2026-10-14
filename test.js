const assert=require('node:assert/strict');
const {handler,toolCall}=require('./lambda/handler');
async function send(payload,method='POST',path='/mcp',ip='127.0.0.1'){return handler({rawPath:path,requestContext:{http:{method,sourceIp:ip}},body:JSON.stringify(payload)})}
(async()=>{
 let init=await send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26'}});assert.equal(JSON.parse(init.body).result.protocolVersion,'2025-03-26');console.log('initialize:',init.body);
 let list=await send({jsonrpc:'2.0',id:2,method:'tools/list'});let names=JSON.parse(list.body).result.tools.map(t=>t.name);assert.equal(names.length,6);console.log('tools/list:',names.join(', '));
 let note=await send({jsonrpc:'2.0',method:'notifications/initialized'});assert.equal(note.statusCode,202);
 let search=await send({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'search_products',arguments:{query:'mug',limit:1}}});let result=JSON.parse(search.body).result;assert.equal(result.isError,false,JSON.stringify(result));let hits=JSON.parse(result.content[0].text);assert(hits.total>0);console.log('search_products:',JSON.stringify({query:hits.query,total:hits.total,first:hits.products[0].title,handle:hits.products[0].handle}));
 let gift=await toolCall('gift_guide',{occasion:'thank you'});assert(gift.picks.length>0);console.log('gift_guide:',gift.picks.length,'picks');
 let cart=await toolCall('build_cart_link',{items:[{variant_id:hits.products[0].variants.find(v=>v.available).id,quantity:1}],gift_note:'Thanks'});assert(cart.url.includes('attributes%5Bgift_from%5D=agent'));console.log('cart:',cart.url);
 assert.equal((await send({},'GET','/health')).statusCode,200);
 let descriptor=await send({},'GET','/.well-known/mcp.json');assert.equal(descriptor.statusCode,200);assert.equal(descriptor.headers['content-type'],'application/json');assert.equal(JSON.parse(descriptor.body).name,'is-agentic');
 let feed=await send({},'GET','/.well-known/ai-catalog.json');assert.equal(feed.statusCode,200);assert.equal(feed.headers['content-type'],'application/json');assert(JSON.parse(feed.body).products);
 assert.equal((await handler({rawPath:'/.well-known/ai-catalog.json',requestContext:{http:{method:'GET'}},queryStringParameters:{page:'x'}})).statusCode,400);
 assert.equal((await send({},'GET','/mcp')).statusCode,405);
 assert.equal((await send({},'OPTIONS','/mcp')).statusCode,204);
 for(let i=0;i<60;i++)await send({jsonrpc:'2.0',id:1,method:'ping'},'POST','/mcp','rate-test');assert.equal((await send({jsonrpc:'2.0',id:1,method:'ping'},'POST','/mcp','rate-test')).statusCode,429);
 console.log('health, JSON MIME proxies, method, CORS, rate limit: passed');
})().catch(e=>{console.error(e);process.exitCode=1});
