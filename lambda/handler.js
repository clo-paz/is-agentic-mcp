const BASE='https://is-agentic.shop', cache=new Map(), buckets=new Map();
const names=['search_products','get_product','list_collections','get_collection','gift_guide','build_cart_link'];
const schemas={
 search_products:{query:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},
 get_product:{handle:{type:'string'}},list_collections:{},
 get_collection:{handle:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},
 gift_guide:{occasion:{type:'string'}},
 build_cart_link:{items:{type:'array',minItems:1,maxItems:20,items:{type:'object',properties:{variant_id:{type:'integer'},quantity:{type:'integer',minimum:1,maximum:99}},required:['variant_id','quantity']}},gift_note:{type:'string'}}
};
const descriptions=['Search public catalog products.','Get product variants, prices, availability and images.','List public collections.','Get products in a collection.','Suggest available gifts for an occasion.','Build a cart handoff link only; does not create an order.'];
const tools=names.map((name,i)=>({name,description:descriptions[i],inputSchema:{type:'object',properties:schemas[name],required:({search_products:['query'],get_product:['handle'],get_collection:['handle'],gift_guide:['occasion'],build_cart_link:['items']})[name]||[],additionalProperties:false}}));
async function get(path){
 if(!(/^\/products\.json\?limit=250&page=[1-9][0-9]*$/.test(path)||path==='/collections.json'||/^\/products\/[a-z0-9][a-z0-9-]{0,100}\.json$/.test(path)||/^\/collections\/[a-z0-9][a-z0-9-]{0,100}\/products\.json\?limit=250&page=[1-9][0-9]*$/.test(path)||/^\/\.well-known\/(mcp|ai-catalog)\.json(\?page=[1-9][0-9]{0,2})?$/.test(path)))throw Error('Upstream path not allowed');
 let cached=cache.get(path);if(cached&&cached.exp>Date.now())return cached.data;
 const options={redirect:'manual',headers:{'User-Agent':'IsAgenticMCP/1.0','Accept':path.startsWith('/.well-known/')?'text/html':'application/json'},signal:AbortSignal.timeout(8000)};
 let response=await fetch(BASE+path,options);
 if(path.startsWith('/.well-known/')&&[301,302,307,308].includes(response.status)){
   let target=new URL(response.headers.get('location')||'',BASE);
   let expected=path.startsWith('/.well-known/mcp.json')?'/pages/mcp-json':'/pages/ai-catalog-json';
   if(target.origin!==BASE||target.pathname!==expected||(!/^$|^\?page=[1-9][0-9]{0,2}$/.test(target.search)))throw Error('Store redirect rejected');
   response=await fetch(target.href,options);
 }
 if(!response.ok)throw Error(`Store HTTP ${response.status}`);
 if(Number(response.headers.get('content-length'))>5000000)throw Error('Store response too large');
 let raw=await response.text();if(raw.length>5000000)throw Error('Store response too large');
 let data=JSON.parse(raw);cache.set(path,{exp:Date.now()+300000,data});return data;
}
async function pagedProducts(path){let products=[];for(let page=1;page<=100;page++){let part=(await get(path(page))).products;if(!Array.isArray(part))throw Error('Invalid store response');products.push(...part);if(part.length<250)return products}throw Error('Store pagination limit exceeded')}
const catalog=()=>pagedProducts(page=>`/products.json?limit=250&page=${page}`);
const plain=s=>(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const product=p=>({title:p.title,handle:p.handle,url:`${BASE}/products/${p.handle}`,description:plain(p.body_html),type:p.product_type,series:(p.tags||[]).find(t=>t.startsWith('series-'))||null,variants:(p.variants||[]).map(v=>({id:v.id,title:v.title,price_usd:v.price,available:v.available})),images:(p.images||[]).map(i=>({src:i.src,alt:i.alt||null}))});
function handle(v){if(typeof v!=='string'||!(/^[a-z0-9][a-z0-9-]{0,100}$/.test(v)))throw Error('Invalid handle');return v}
function limit(v=10){if(!Number.isInteger(v)||v<1||v>50)throw Error('limit must be 1 to 50');return v}
async function toolCall(name,a={}){
 switch(name){
 case 'search_products':{if(typeof a.query!=='string'||!a.query.trim()||a.query.length>100)throw Error('Invalid query');let terms=a.query.toLowerCase().split(/\s+/),matches=(await catalog()).filter(p=>terms.every(t=>(p.title+' '+plain(p.body_html)+' '+(p.product_type||'')+' '+(p.tags||[]).join(' ')).toLowerCase().includes(t)));let rank=p=>terms.reduce((n,t)=>n+Number(p.title.toLowerCase().includes(t))*4+Number((p.product_type||'').toLowerCase().includes(t))*2,0);matches.sort((a,b)=>rank(b)-rank(a)||a.title.localeCompare(b.title));return {query:a.query,total:matches.length,products:matches.slice(0,limit(a.limit)).map(product)}}
 case 'get_product':return product((await get(`/products/${handle(a.handle)}.json`)).product);
 case 'list_collections':return (await get('/collections.json')).collections.map(c=>({title:c.title,handle:c.handle,url:`${BASE}/collections/${c.handle}`,products_count:c.products_count}));
 case 'get_collection':{let h=handle(a.handle),n=limit(a.limit);if(!(await get('/collections.json')).collections.some(c=>c.handle===h))throw Error('Unknown collection');let items=await pagedProducts(page=>`/collections/${h}/products.json?limit=250&page=${page}`);return {handle:h,total:items.length,products:items.slice(0,n).map(product)}}
 case 'gift_guide':{if(typeof a.occasion!=='string'||!a.occasion.trim()||a.occasion.length>100)throw Error('Invalid occasion');let words=a.occasion.toLowerCase().split(/\s+/);let items=await pagedProducts(page=>`/collections/for-your-human/products.json?limit=250&page=${page}`);let score=p=>words.reduce((n,w)=>n+Number((p.title+' '+plain(p.body_html)).toLowerCase().includes(w)),0);let picks=items.filter(p=>(p.variants||[]).some(v=>v.available)).sort((a,b)=>score(b)-score(a)||a.title.localeCompare(b.title)).slice(0,5);return {occasion:a.occasion,picks:picks.map(p=>({product:product(p),reason:`A ${p.product_type||'gift'} for ${a.occasion.trim()}, with an available variant.`}))}}
 case 'build_cart_link':{if(!Array.isArray(a.items)||a.items.length<1||a.items.length>20||typeof(a.gift_note??'')!=='string'||(a.gift_note||'').length>500)throw Error('Invalid items or note');let valid=new Set((await catalog()).flatMap(p=>(p.variants||[]).filter(v=>v.available).map(v=>v.id)));let pairs=a.items.map(i=>{if(!i||!Number.isSafeInteger(i.variant_id)||!valid.has(i.variant_id)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>99)throw Error('Unknown/unavailable variant or invalid quantity');return `${i.variant_id}:${i.quantity}`});let q=new URLSearchParams({'attributes[gift_from]':'agent'});if(a.gift_note)q.set('note',a.gift_note);return {url:`${BASE}/cart/${pairs.join(',')}?${q}`,checkout_required:true,order_created:false}}
 default:throw Error('Unknown tool')
 }
}
const headers={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type,Accept,Mcp-Session-Id,MCP-Protocol-Version'};
const res=(statusCode,body=null,extra={})=>({statusCode,headers:{...headers,...extra},body:body===null?'':JSON.stringify(body)});
async function rpc(req){
 if(!req||typeof req!=='object'||Array.isArray(req)||req.jsonrpc!=='2.0'||typeof req.method!=='string'||(Object.hasOwn(req,'id')&&!(typeof req.id==='string'||typeof req.id==='number')))return {jsonrpc:'2.0',id:req?.id??null,error:{code:-32600,message:'Invalid Request'}};
 if(!Object.hasOwn(req,'id'))return null;
 let id=req.id,result;
 switch(req.method){
 case 'initialize':result={protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'is-agentic-mcp',version:'1.0.0'}};break;
 case 'ping':result={};break;
 case 'tools/list':result={tools};break;
 case 'tools/call':try{if(!req.params||typeof req.params.name!=='string'||(req.params.arguments!==undefined&&(typeof req.params.arguments!=='object'||req.params.arguments===null||Array.isArray(req.params.arguments))))throw Error('Invalid tool parameters');result={content:[{type:'text',text:JSON.stringify(await toolCall(req.params.name,req.params.arguments||{}))}],isError:false}}catch(e){result={content:[{type:'text',text:e.message}],isError:true}}break;
 default:return {jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}};
 }
 return {jsonrpc:'2.0',id,result};
}
exports.handler=async event=>{
 let method=event.requestContext?.http?.method||'GET',path=event.rawPath||'/';
 if(method==='OPTIONS')return res(204);
 if(method==='GET'&&(path==='/'||path==='/health'))return res(200,path==='/'?{name:'Is Agentic MCP',endpoint:'/mcp',read_only:true}:{ok:true});
 if(method==='GET'&&(path==='/.well-known/mcp.json'||path==='/.well-known/ai-catalog.json')){let page=event.queryStringParameters?.page;if(page!==undefined&&path.endsWith('ai-catalog.json')&&!/^[1-9][0-9]{0,2}$/.test(page))return res(400,{error:'Invalid page'});let upstream=path+(page&&path.endsWith('ai-catalog.json')?`?page=${page}`:'');try{return res(200,await get(upstream))}catch(e){return res(502,{error:'Store descriptor unavailable'})}}
 if(path!=='/mcp')return res(404,{error:'Not found'});
 if(method!=='POST')return res(405,{error:'Method not allowed'},{allow:'POST'});
 // Function URL HTTP v2 sourceIp is set by AWS. Never trust X-Forwarded-For.
 let ip=event.requestContext?.http?.sourceIp||'unknown',now=Date.now(),bucket=buckets.get(ip)||{tokens:60,last:now};
 bucket.tokens=Math.min(60,bucket.tokens+Math.max(0,now-bucket.last)/1000);bucket.last=now;
 if(bucket.tokens<1){buckets.set(ip,bucket);return res(429,{error:'Rate limit exceeded'},{'retry-after':'1'})}
 bucket.tokens--;buckets.set(ip,bucket);
 let req;try{req=JSON.parse(event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):event.body||'{}')}catch{return res(400,{jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})}
 let answer=await rpc(req);return answer===null?res(202):res(200,answer);
};
exports.toolCall=toolCall;
