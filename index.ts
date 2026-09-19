import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"GET,OPTIONS","Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"};
const reply=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='GET')return reply({ok:false,error:'method_not_allowed'},405);
 try{
  const bearer=req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);if(!bearer)return reply({ok:false,error:'unauthorized'},401);
  const url=Deno.env.get('SUPABASE_URL');const key=Deno.env.get('SUPABASE_PUBLISHABLE_KEY')??Deno.env.get('SUPABASE_ANON_KEY');
  if(!url||!key)return reply({ok:false,error:'server_configuration'},500);
  const auth=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await auth.auth.getUser(bearer[1]);if(error||!data.user)return reply({ok:false,error:'unauthorized'},401);
  const allowed=new Set((Deno.env.get('CLOUD_LITE_ALLOWED_UIDS')??'').split(',').map(s=>s.trim()).filter(Boolean));if(!allowed.has(data.user.id))return reply({ok:false,error:'forbidden'},403);
  const params=new URL(req.url).searchParams;const action=params.get('action');if(!action)return reply({ok:true,message:'Cloud Lite authentication successful'});
  if(!['products-preview','products-search'].includes(action))return reply({ok:false,error:'unknown_action'},400);
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!secret)return reply({ok:false,error:'server_configuration'},500);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  if(action==='products-preview'){
   const {count,error:ce}=await admin.from('products').select('id',{count:'exact',head:true});if(ce)return reply({ok:false,error:'database_read_failed'},500);
   const {data:products,error:pe}=await admin.from('products').select('id,name,article,quantity').order('id',{ascending:true}).limit(5);if(pe)return reply({ok:false,error:'database_read_failed'},500);
   return reply({ok:true,count:count??0,products:products??[]});
  }
  const offset=Number(params.get('offset')??0),limit=Number(params.get('limit')??50),q=(params.get('q')??'').trim();
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100||q.length>100)return reply({ok:false,error:'invalid_parameters'},400);
  let query=admin.from('products').select('id,name,article,quantity',{count:'exact'});
  if(q){const escaped=q.replace(/[\\%_]/g,'\\$&').replace(/[(),.]/g,' ');query=query.or(`name.ilike.%${escaped}%,article.ilike.%${escaped}%`)}
  const {data:products,count,error:pe}=await query.order('id',{ascending:true}).range(offset,offset+limit-1);
  if(pe)return reply({ok:false,error:'database_read_failed'},500);
  return reply({ok:true,count:count??0,products:products??[]});
 }catch{return reply({ok:false,error:'internal_error'},500)}
});
