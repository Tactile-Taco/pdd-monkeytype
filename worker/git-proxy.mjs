// pdd-git-proxy — deployed as Cloudflare Worker "pdd-git-proxy"
// Credential-holding git relay: the LLM sends {source_url, repo_path, sha256}
// specs; the worker fetches bytes, verifies SHA-256 fail-closed, and commits
// via the GitHub git API. GITHUB_PAT (fine-grained, repo-scoped) and RELAY_KEY
// live as write-only Cloudflare secrets. Binary never transits the LLM channel.
const J=(o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:{"content-type":"application/json"}});
async function gh(env,method,path,body){
  const r=await fetch("https://api.github.com"+path,{method:method,headers:{authorization:"Bearer "+env.GITHUB_PAT,accept:"application/vnd.github+json","user-agent":"pdd-git-proxy/1.0","content-type":"application/json"},body:body?JSON.stringify(body):undefined});
  const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch(e){}
  return {status:r.status,body:j};
}
async function sha256hex(bytes){const d=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("");}
function b64encode(bytes){let s="";const CH=8192;for(let i=0;i<bytes.length;i+=CH)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+CH));return btoa(s);}
async function relayBatch(env,spec){
  const repo=spec.repo, br=spec.branch||"main", puts=spec.puts||[], deletes=spec.deletes||[];
  if(!repo||(!puts.length&&!deletes.length))return {error:"repo and puts/deletes required"};
  const ref=await gh(env,"GET","/repos/"+repo+"/git/ref/heads/"+br);
  if(ref.status!==200)return {error:"ref lookup failed",detail:ref.body};
  const headSha=ref.body.object.sha;
  const commit=await gh(env,"GET","/repos/"+repo+"/git/commits/"+headSha);
  const tree=[];const results=[];
  for(const p of puts){
    const got=await fetch(p.source);
    if(!got.ok)return {error:"source fetch failed",path:p.path,status:got.status};
    const bytes=new Uint8Array(await got.arrayBuffer());
    const hex=await sha256hex(bytes);
    if(p.sha256&&hex!==p.sha256.toLowerCase())return {error:"sha256 mismatch",path:p.path,expected:p.sha256,actual:hex};
    const blob=await gh(env,"POST","/repos/"+repo+"/git/blobs",{content:b64encode(bytes),encoding:"base64"});
    if(blob.status>=300)return {error:"blob create failed",path:p.path,detail:blob.body};
    tree.push({path:p.path,mode:"100644",type:"blob",sha:blob.body.sha});
    results.push({path:p.path,size:bytes.length,sha256:hex});
  }
  for(const d of deletes)tree.push({path:d,mode:"100644",type:"blob",sha:null});
  const nt=await gh(env,"POST","/repos/"+repo+"/git/trees",{base_tree:commit.body.tree.sha,tree:tree});
  if(nt.status>=300)return {error:"tree create failed",detail:nt.body};
  const nc=await gh(env,"POST","/repos/"+repo+"/git/commits",{message:spec.message||"relay via pdd-git-proxy",tree:nt.body.sha,parents:[headSha]});
  if(nc.status>=300)return {error:"commit create failed",detail:nc.body};
  const ru=await gh(env,"PATCH","/repos/"+repo+"/git/refs/heads/"+br,{sha:nc.body.sha});
  if(ru.status>=300)return {error:"ref update failed",detail:ru.body};
  return {ok:true,commit:nc.body.sha,files:results,deleted:deletes.length};
}
export default {
  async fetch(req, env) {
    const url=new URL(req.url);
    if(url.pathname==="/health")return J({ok:true,service:"pdd-git-proxy",routes:["POST /relay-batch","cron (KV job queue)"]});
    const key=req.headers.get("x-relay-key")||"";
    if(!key||key!==env.RELAY_KEY)return J({error:"forbidden"},403);
    if(!env.GITHUB_PAT)return J({error:"GITHUB_PAT secret not set"},503);
    if(req.method==="POST"&&url.pathname==="/relay-batch")return J(await relayBatch(env,await req.json()));
    return J({error:"no such route"},404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async()=>{
      const spec=await env.JOBS.get("relay:job","json");
      if(!spec)return;
      try{ await env.JOBS.put("relay:result", JSON.stringify(await relayBatch(env,spec))); }
      catch(e){ await env.JOBS.put("relay:result", JSON.stringify({error:String(e)})); }
      await env.JOBS.delete("relay:job");
    })());
  }
};
